import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { friendlyAuthError, logAuthError } from "./auth-errors";

const GENERIC = "Something went wrong. Please try again.";

// Error responses in the shape Supabase Auth returns them.
const scenarios: Record<string, [number, object, RegExp]> = {
  confirmationEmail: [500, { code: 500, error_code: "unexpected_failure", msg: "Error sending confirmation email" }, /couldn't send the confirmation email/],
  notAuthorized: [400, { code: 400, error_code: "email_address_not_authorized", msg: "Email address not authorized" }, /couldn't send a confirmation email/],
  invalidEmail: [400, { code: 400, error_code: "email_address_invalid", msg: 'Email address "a@example.com" is invalid' }, /can't be used to sign up/],
  signupDisabled: [422, { code: 422, error_code: "signup_disabled", msg: "Signups not allowed for this instance" }, /sign-ups are currently disabled/],
  exists: [422, { code: 422, error_code: "user_already_exists", msg: "User already registered" }, /already exists/],
  weak: [422, { code: 422, error_code: "weak_password", msg: "Password is known to be weak", weak_password: { reasons: ["pwned"] } }, /stronger password/],
};

let server: http.Server;
let url = "";
let current = "";

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    const [status, body] = scenarios[current];
    res.writeHead(status, { "Content-Type": "application/json", "x-supabase-api-version": "2024-01-01" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

describe("friendlyAuthError with real supabase-js signUp errors", () => {
  for (const [name, [, , expected]] of Object.entries(scenarios)) {
    it(`maps ${name} to a specific message`, async () => {
      current = name;
      const sb = createClient(url, "key", { auth: { persistSession: false } });
      const { error } = await sb.auth.signUp({ email: "a@example.com", password: "password123" });
      expect(error).not.toBeNull();
      const text = friendlyAuthError(error!);
      expect(text).toMatch(expected);
      expect(text).not.toBe(GENERIC);
    });
  }

  it("maps an unreachable Supabase URL to a connectivity message", async () => {
    const sb = createClient("http://127.0.0.1:1", "key", { auth: { persistSession: false } });
    const { error } = await sb.auth.signUp({ email: "a@example.com", password: "password123" });
    expect(friendlyAuthError(error!)).toMatch(/couldn't reach/);
  });

  it("still maps login failures", () => {
    expect(friendlyAuthError({ message: "Invalid login credentials", code: "invalid_credentials", status: 400 })).toMatch(/don't match/);
  });

  it("logs the real cause without the email address", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logAuthError("signUp", { message: 'Email address "a@example.com" is invalid', code: "email_address_invalid", status: 400 });
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).toContain("email_address_invalid");
    expect(logged).not.toContain("a@example.com");
    spy.mockRestore();
  });
});
