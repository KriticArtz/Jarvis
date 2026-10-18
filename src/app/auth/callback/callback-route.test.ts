import { NextRequest } from "next/server";
import { AuthApiError, AuthPKCECodeVerifierMissingError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));

const { GET } = await import("./route");

const ORIGIN = "https://www.arovenna.com";
const TOKEN = "pkce_9f2c0e7b1d4a6c8e3f5b7d9a1c3e5f7b9d1a3c5e7f9b1d3a5c7e9f1b";
const expired = () => ({ data: {}, error: new AuthApiError("Email link is invalid or has expired", 403, "otp_expired") });

async function callback(query: string) {
  const res = await GET(new NextRequest(`${ORIGIN}/auth/callback?${query}`));
  const location = new URL(res.headers.get("location")!);
  return { status: res.status, location, path: location.pathname + location.search };
}

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  auth.exchangeCodeForSession.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.verifyOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorLog.mockRestore());

describe("/auth/callback: successful links", () => {
  it("token_hash recovery link signs in and opens /reset-password", async () => {
    const r = await callback(`token_hash=${TOKEN}&type=recovery`);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: TOKEN });
    expect(r.status).toBe(307);
    expect(r.path).toBe("/reset-password");
  });

  it("token_hash signup confirmation goes to its next path", async () => {
    expect((await callback(`token_hash=${TOKEN}&type=email&next=/onboarding`)).path).toBe("/onboarding");
    expect((await callback(`token_hash=${TOKEN}&type=signup&next=/onboarding`)).path).toBe("/onboarding");
  });

  it("PKCE code links still work", async () => {
    expect((await callback("code=abc&next=/onboarding")).path).toBe("/onboarding");
    expect((await callback("code=abc&next=/reset-password")).path).toBe("/reset-password");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });
});

describe("/auth/callback: expired or invalid recovery links", () => {
  it("sends an expired token_hash recovery link to /forgot-password with an explanation code", async () => {
    auth.verifyOtp.mockResolvedValue(expired());
    const r = await callback(`token_hash=${TOKEN}&type=recovery`);
    expect(r.location.origin).toBe(ORIGIN);
    expect(r.path).toBe("/forgot-password?error=link_expired");
  });

  it("sends a failed PKCE recovery exchange (e.g. opened in another browser) to /forgot-password", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: new AuthPKCECodeVerifierMissingError() });
    expect((await callback("code=abc&next=/reset-password")).path).toBe("/forgot-password?error=link_expired");
  });

  it("sends a recovery link with no code or token (e.g. Supabase's own error redirect) to /forgot-password", async () => {
    expect((await callback("next=/reset-password&error=access_denied&error_code=otp_expired")).path).toBe("/forgot-password?error=link_expired");
    expect((await callback("type=recovery")).path).toBe("/forgot-password?error=link_expired");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("logs the Supabase error code but never the token or link", async () => {
    auth.verifyOtp.mockResolvedValue(expired());
    await callback(`token_hash=${TOKEN}&type=recovery`);
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("otp_expired");
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain("/auth/callback");
  });
});

describe("/auth/callback: other failures", () => {
  it("keeps sending failed signup confirmations to /login", async () => {
    auth.verifyOtp.mockResolvedValue(expired());
    expect((await callback(`token_hash=${TOKEN}&type=email&next=/onboarding`)).path).toBe("/login?error=auth_callback");
    expect((await callback("")).path).toBe("/login?error=auth_callback");
  });
});

describe("/auth/callback: safe redirect validation", () => {
  it.each(["//evil.example", "https://evil.example", "/\\evil.example", "evil.example", "javascript:alert(1)"])(
    "ignores next=%s and stays on the site",
    async (next) => {
      const r = await callback(`token_hash=${TOKEN}&type=email&next=${encodeURIComponent(next)}`);
      expect(r.location.origin).toBe(ORIGIN);
      expect(r.path).toBe("/dashboard");
    },
  );

  it("never redirects a failure off-site either", async () => {
    auth.verifyOtp.mockResolvedValue(expired());
    const r = await callback(`token_hash=${TOKEN}&type=recovery&next=${encodeURIComponent("//evil.example")}`);
    expect(r.location.origin).toBe(ORIGIN);
    expect(r.path).toBe("/forgot-password?error=link_expired");
  });
});
