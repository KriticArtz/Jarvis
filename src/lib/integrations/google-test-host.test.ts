import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GOOGLE_API_TEST_BASE_URL may only redirect Google traffic (client secret,
 * codes, tokens) to a mock on this machine, and never on Vercel production.
 */
const CFG = { clientId: "cid.apps.googleusercontent.com", clientSecret: "SUPER-SECRET-VALUE" };
const AUTH = { redirectUri: "http://127.0.0.1:3100/api/integrations/google/callback", state: "s", codeChallenge: "c" };

async function load(override: string | undefined, vercelEnv?: string) {
  vi.resetModules();
  vi.stubEnv("GOOGLE_API_TEST_BASE_URL", override ?? "");
  vi.stubEnv("VERCEL_ENV", vercelEnv ?? "");
  const env = await import("@/lib/env");
  const google = await import("./calendar/google");
  return { base: env.googleTestBaseUrl(), authorizeUrl: google.buildAuthorizeUrl(CFG, AUTH) };
}

describe("Google API test-host override", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    warn.mockRestore();
  });

  it.each([
    ["http://127.0.0.1:4012", "http://127.0.0.1:4012"],
    ["http://localhost:4012/", "http://localhost:4012"],
    ["http://[::1]:4012", "http://[::1]:4012"],
    ["https://127.0.0.1:4012", "https://127.0.0.1:4012"],
  ])("accepts the loopback URL %s outside production", async (value, expected) => {
    const { base, authorizeUrl } = await load(value, "preview");
    expect(base).toBe(expected);
    expect(authorizeUrl.startsWith(`${expected}/o/oauth2/v2/auth?`)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.example.com",
    "https://127.0.0.1.evil.example",
    "http://localhost.evil.example:4012",
    "http://10.0.0.5:4012",
    "http://127.0.0.2:4012",
    "http://169.254.169.254",
    "ftp://127.0.0.1:4012",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "not a url",
    "127.0.0.1:4012",
  ])("rejects %s and keeps the real Google endpoints", async (value) => {
    const { base, authorizeUrl } = await load(value);
    expect(base).toBeUndefined();
    expect(authorizeUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
  });

  it("is ignored on Vercel production, even for a loopback URL", async () => {
    const { base, authorizeUrl } = await load("http://127.0.0.1:4012", "production");
    expect(base).toBeUndefined();
    expect(authorizeUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
  });

  it("uses the real Google endpoints when no override is set, without warning", async () => {
    const { base, authorizeUrl } = await load(undefined);
    expect(base).toBeUndefined();
    expect(authorizeUrl.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns once about a rejected override without logging its value", async () => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_API_TEST_BASE_URL", "https://attacker.example.net/collect");
    vi.stubEnv("VERCEL_ENV", "preview");
    const env = await import("@/lib/env");
    expect(env.googleTestBaseUrl()).toBeUndefined();
    expect(env.googleTestBaseUrl()).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("GOOGLE_API_TEST_BASE_URL ignored");
    expect(logged).not.toContain("attacker");
  });

  it("sends token requests (with the client secret) only to Google when the override is rejected", async () => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_API_TEST_BASE_URL", "https://attacker.example.net");
    vi.stubEnv("VERCEL_ENV", "preview");
    const { exchangeCode } = await import("./calendar/google");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    await exchangeCode(CFG, { code: "c", codeVerifier: "v", redirectUri: AUTH.redirectUri }, fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toBe("https://oauth2.googleapis.com/token");
  });
});
