#!/usr/bin/env node
/**
 * A stand-in for Google's OAuth and Calendar APIs — for automated tests only.
 * The app talks to it through the test-only GOOGLE_API_TEST_BASE_URL (ignored
 * on a Vercel production deployment; see src/lib/env.ts), so tests run the
 * REAL connect flow: the app's start route builds the authorize URL, the mock
 * "consents" and redirects back with a code, and the app's callback exchanges
 * it. The mock enforces what Google enforces: client credentials, the PKCE
 * verifier, the exact redirect URI, single-use codes and valid tokens.
 *
 *   node scripts/mock-google.mjs [--port 4012]
 *   GOOGLE_CLIENT_ID=test-client GOOGLE_CLIENT_SECRET=test-secret \
 *   GOOGLE_API_TEST_BASE_URL=http://127.0.0.1:4012 npm start
 *
 * Test controls (not part of Google's APIs):
 *   POST /__consent {email?, decision?: "allow"|"deny"|"no_scope", scope?}
 *        how the next consent screen answers, and for which Google account
 *   POST /__events  {email, events: GoogleEvent[]}   that account's calendar
 *   POST /__fail    {email, list?: "rate_limited"|"api_disabled"|"unauthorized"|null, revoke?: true}
 *        make that account's next calendar reads fail this way; revoke kills its grants
 *   POST /__expire  {email}   expire that account's access tokens (forces a refresh)
 *   GET  /__state             counts of token, refresh and revoke calls
 *   POST /__reset
 */
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

export const CLIENT_ID = "test-client";
export const CLIENT_SECRET = "test-secret";
const EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function createMockGoogle() {
  const s = {
    consent: { email: "person@example.com", decision: "allow", scope: EVENTS_SCOPE },
    codes: new Map(), // code -> {challenge, redirectUri, email, scope, used}
    access: new Map(), // token -> {email, expired}
    refresh: new Map(), // token -> email
    calendars: new Map(), // email -> events[]
    fail: new Map(), // email -> list failure mode
    calls: { authorize: 0, exchange: 0, refresh: 0, revoke: 0, list: 0 },
    revoked: [],
  };
  const token = (prefix) => `${prefix}-${randomBytes(12).toString("hex")}`;
  const grant = (email, scope) => {
    const access = token("at");
    const refresh = token("rt");
    s.access.set(access, { email, expired: false });
    s.refresh.set(refresh, email);
    return { access_token: access, refresh_token: refresh, expires_in: 3599, scope, token_type: "Bearer" };
  };

  async function body(req) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString("utf8");
    if ((req.headers["content-type"] ?? "").includes("application/json")) return raw ? JSON.parse(raw) : {};
    return Object.fromEntries(new URLSearchParams(raw));
  }
  const send = (res, status, obj, headers = {}) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(obj));
  };

  async function handle(req, res) {
    const url = new URL(req.url, "http://mock");
    const p = url.pathname;

    // --- test controls
    if (p === "/__reset") {
      s.codes.clear(); s.access.clear(); s.refresh.clear(); s.calendars.clear(); s.fail.clear(); s.revoked = [];
      s.consent = { email: "person@example.com", decision: "allow", scope: EVENTS_SCOPE };
      for (const k of Object.keys(s.calls)) s.calls[k] = 0;
      return send(res, 200, {});
    }
    if (p === "/__consent") { s.consent = { ...s.consent, ...(await body(req)) }; return send(res, 200, s.consent); }
    if (p === "/__events") { const b = await body(req); s.calendars.set(b.email, b.events ?? []); return send(res, 200, {}); }
    if (p === "/__fail") {
      const b = await body(req);
      if (b.list === null) s.fail.delete(b.email); else if (b.list) s.fail.set(b.email, b.list);
      if (b.revoke) {
        for (const [t, v] of s.access) if (v.email === b.email) s.access.delete(t);
        for (const [t, e] of s.refresh) if (e === b.email) s.refresh.delete(t);
      }
      return send(res, 200, {});
    }
    if (p === "/__expire") { const b = await body(req); for (const v of s.access.values()) if (v.email === b.email) v.expired = true; return send(res, 200, {}); }
    if (p === "/__state") return send(res, 200, { calls: s.calls, revoked: s.revoked.length, consent: s.consent });

    // --- OAuth consent screen: answers at once, the way the next /__consent said
    if (p === "/o/oauth2/v2/auth") {
      s.calls.authorize++;
      const q = url.searchParams;
      const redirect = new URL(q.get("redirect_uri"));
      redirect.searchParams.set("state", q.get("state") ?? "");
      if (q.get("client_id") !== CLIENT_ID || q.get("code_challenge_method") !== "S256" || !q.get("code_challenge")) {
        redirect.searchParams.set("error", "invalid_request");
      } else if (s.consent.decision === "deny") {
        redirect.searchParams.set("error", "access_denied");
      } else {
        const code = token("code");
        s.codes.set(code, {
          challenge: q.get("code_challenge"),
          redirectUri: q.get("redirect_uri"),
          email: s.consent.email,
          scope: s.consent.decision === "no_scope" ? "openid" : s.consent.scope ?? q.get("scope"),
          used: false,
        });
        redirect.searchParams.set("code", code);
        redirect.searchParams.set("scope", s.consent.scope ?? q.get("scope"));
      }
      res.writeHead(302, { Location: redirect.toString() });
      return res.end();
    }

    if (p === "/token" && req.method === "POST") {
      const b = await body(req);
      if (b.client_id !== CLIENT_ID || b.client_secret !== CLIENT_SECRET) return send(res, 401, { error: "invalid_client" });
      if (b.grant_type === "authorization_code") {
        s.calls.exchange++;
        const c = s.codes.get(b.code);
        if (!c || c.used) return send(res, 400, { error: "invalid_grant", error_description: "Malformed auth code." });
        c.used = true;
        if (c.redirectUri !== b.redirect_uri) return send(res, 400, { error: "redirect_uri_mismatch" });
        if (createHash("sha256").update(b.code_verifier ?? "").digest("base64url") !== c.challenge) return send(res, 400, { error: "invalid_grant", error_description: "Invalid code verifier." });
        return send(res, 200, grant(c.email, c.scope));
      }
      if (b.grant_type === "refresh_token") {
        s.calls.refresh++;
        const email = s.refresh.get(b.refresh_token);
        if (!email) return send(res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        const access = token("at");
        s.access.set(access, { email, expired: false });
        return send(res, 200, { access_token: access, expires_in: 3599, scope: EVENTS_SCOPE, token_type: "Bearer" });
      }
      return send(res, 400, { error: "unsupported_grant_type" });
    }

    if (p === "/revoke" && req.method === "POST") {
      const b = await body(req);
      s.calls.revoke++;
      s.revoked.push(b.token);
      const email = s.refresh.get(b.token) ?? s.access.get(b.token)?.email;
      if (email) {
        for (const [t, v] of s.access) if (v.email === email) s.access.delete(t);
        for (const [t, e] of s.refresh) if (e === email) s.refresh.delete(t);
      }
      return send(res, 200, {});
    }

    const list = /^\/calendar\/v3\/calendars\/([^/]+)\/events$/.exec(p);
    if (list && req.method === "GET") {
      s.calls.list++;
      const auth = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      const who = s.access.get(auth);
      if (!who || who.expired) return send(res, 401, { error: { code: 401, status: "UNAUTHENTICATED", errors: [{ reason: "authError" }] } });
      const mode = s.fail.get(who.email);
      if (mode === "rate_limited") return send(res, 403, { error: { code: 403, errors: [{ reason: "rateLimitExceeded" }] } });
      if (mode === "api_disabled") return send(res, 403, { error: { code: 403, status: "PERMISSION_DENIED", errors: [{ reason: "accessNotConfigured" }], details: [{ reason: "SERVICE_DISABLED" }] } });
      if (mode === "unauthorized") return send(res, 401, { error: { code: 401 } });
      const min = Date.parse(url.searchParams.get("timeMin") ?? "1970-01-01");
      const max = Date.parse(url.searchParams.get("timeMax") ?? "9999-01-01");
      const items = (s.calendars.get(who.email) ?? []).filter((e) => {
        const start = Date.parse(e.start?.dateTime ?? `${e.start?.date}T00:00:00Z`);
        return e.status === "cancelled" || (start >= min && start < max);
      });
      return send(res, 200, { summary: who.email, timeZone: "UTC", items });
    }

    return send(res, 404, { error: { code: 404, message: `mock-google: no route for ${req.method} ${p}` } });
  }

  let server = null;
  return {
    state: s,
    async listen(port = 0) {
      server = http.createServer((req, res) => handle(req, res).catch((e) => send(res, 500, { error: String(e) })));
      await new Promise((r) => server.listen(port, "127.0.0.1", r));
      return `http://127.0.0.1:${server.address().port}`;
    },
    close: () => new Promise((r) => (server ? server.close(() => r()) : r())),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const i = process.argv.indexOf("--port");
  const mock = createMockGoogle();
  const url = await mock.listen(i > 0 ? Number(process.argv[i + 1]) : 4012);
  console.log(`Mock Google OAuth + Calendar listening at ${url}`);
}
