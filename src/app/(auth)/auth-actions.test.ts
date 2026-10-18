import { renderToStaticMarkup } from "react-dom/server";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  getClaims: vi.fn(),
  signOut: vi.fn(),
}));
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth }) }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { requestPasswordReset, resendConfirmation, signIn, signUp } = await import("./actions");
const { default: ForgotPasswordPage } = await import("./forgot-password/page");

const EMAIL = "Someone@Example.com";
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const resend = (email = EMAIL) => resendConfirmation({}, form({ email }));
const NEUTRAL = /If that email is waiting to be confirmed, we've sent a new link\. Check your inbox and spam folder\./;

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.getClaims.mockResolvedValue({ data: null });
  requestHeaders.current = new Headers({ host: "preview.example.test", "x-forwarded-proto": "https" });
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.arovenna.com");
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe("resendConfirmation", () => {
  it("resends a signup confirmation with the same callback URL signUp uses", async () => {
    auth.resend.mockResolvedValue({ data: {}, error: null });
    auth.signUp.mockResolvedValue({ data: { session: null, user: null }, error: null });

    await resend();
    await signUp({}, form({ email: EMAIL, password: "password123" }));

    const expected = "https://www.arovenna.com/auth/callback?next=/onboarding";
    expect(auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "someone@example.com",
      options: { emailRedirectTo: expected },
    });
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe(expected);
  });

  it("builds the redirect from the request host when NEXT_PUBLIC_APP_URL is unset (same helper as signUp)", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    auth.resend.mockResolvedValue({ data: {}, error: null });
    await resend();
    expect(auth.resend.mock.calls[0][0].options.emailRedirectTo).toBe("https://preview.example.test/auth/callback?next=/onboarding");
  });

  it("validates and normalizes the email like the other auth actions", async () => {
    expect(await resend("not-an-email")).toEqual({ error: "Enter a valid email address" });
    expect(await resend("")).toEqual({ error: "Enter a valid email address" });
    expect(auth.resend).not.toHaveBeenCalled();

    auth.resend.mockResolvedValue({ data: {}, error: null });
    await resend("MiXeD@Example.COM");
    expect(auth.resend.mock.calls[0][0].email).toBe("mixed@example.com");
  });

  it("confirms success with a message that mentions the spam folder", async () => {
    auth.resend.mockResolvedValue({ data: {}, error: null });
    const result = await resend();
    expect(result.message).toMatch(NEUTRAL);
    expect(result.error).toBeUndefined();
  });

  it("gives the same reply whether or not an account exists or is already confirmed", async () => {
    const outcomes = [
      { data: {}, error: null }, // unconfirmed account: email sent
      { data: {}, error: new AuthApiError("User not found", 404, "user_not_found") },
      { data: {}, error: new AuthApiError("Email already confirmed", 422, "email_address_invalid") },
      // supabase-js reports Supabase's 500 send failure as a retryable fetch error.
      { data: {}, error: new AuthRetryableFetchError("Error sending confirmation email", 500) },
    ];
    const replies = [];
    for (const outcome of outcomes) {
      auth.resend.mockResolvedValueOnce(outcome);
      replies.push(await resend());
    }
    for (const reply of replies) expect(reply).toEqual(replies[0]);
    expect(replies[0].message).toMatch(NEUTRAL);
  });

  it("reports rate limiting with a wait message", async () => {
    for (const error of [
      new AuthApiError("For security purposes, you can only request this after 52 seconds.", 429, "over_email_send_rate_limit"),
      new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit"),
    ]) {
      auth.resend.mockResolvedValueOnce({ data: {}, error });
      const result = await resend();
      expect(result.message).toBeUndefined();
      expect(result.error).toBe("Too many requests. Please wait a minute before asking for another email.");
    }
  });

  it("reports an unreachable auth service without exposing the raw error", async () => {
    for (const error of [new AuthRetryableFetchError("fetch failed: ECONNREFUSED 10.0.0.1:443", 0), new AuthRetryableFetchError("Service Unavailable", 503)]) {
      auth.resend.mockResolvedValueOnce({ data: {}, error });
      const result = await resend();
      expect(result.error).toMatch(/couldn't reach the sign-in service/);
      expect(JSON.stringify(result)).not.toMatch(/ECONNREFUSED|10\.0\.0\.1|Service Unavailable/);
    }
  });

  it("logs the provider error for diagnostics without the email address", async () => {
    auth.resend.mockResolvedValue({ data: {}, error: new AuthApiError(`Error sending email to ${EMAIL}`, 500, "unexpected_failure") });
    await resend();
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("resendConfirmation");
    expect(logged).toContain("unexpected_failure");
    expect(logged.toLowerCase()).not.toContain("someone@example.com");
  });
});

describe("signUp and signIn messaging", () => {
  it("tells a new user to check their inbox and spam folder", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: null }, error: null });
    const result = await signUp({}, form({ email: EMAIL, password: "password123" }));
    expect(result.message).toMatch(/Check your inbox/);
    expect(result.message).toMatch(/spam folder/);
  });

  it("flags an unconfirmed email on login so the form can offer a resend", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: new AuthApiError("Email not confirmed", 400, "email_not_confirmed") });
    const result = await signIn({}, form({ email: EMAIL, password: "password123" }));
    expect(result).toMatchObject({ unconfirmed: true, email: EMAIL });
    expect(result.error).toMatch(/confirm your email/);
  });

  it("does not flag wrong credentials as unconfirmed", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials") });
    const result = await signIn({}, form({ email: EMAIL, password: "password123" }));
    expect(result.unconfirmed).toBe(false);
  });
});

describe("requestPasswordReset", () => {
  it("sends the recovery link to the callback and always gives the same reply", async () => {
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const ok = await requestPasswordReset({}, form({ email: EMAIL }));
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("someone@example.com", {
      redirectTo: "https://www.arovenna.com/auth/callback?next=/reset-password",
    });

    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: new AuthApiError("Error sending recovery email", 500, "unexpected_failure") });
    const failed = await requestPasswordReset({}, form({ email: EMAIL }));
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: new AuthApiError("Rate limit", 429, "over_email_send_rate_limit") });
    const limited = await requestPasswordReset({}, form({ email: EMAIL }));

    expect(failed).toEqual(ok);
    expect(limited).toEqual(ok);
    expect(ok.message).toMatch(/If an account exists for that email/);
    expect(ok.message).toMatch(/spam folder/);
  });

  it("logs the failure server-side without the email address", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: new AuthApiError(`Error sending recovery email to ${EMAIL}`, 500, "unexpected_failure") });
    await requestPasswordReset({}, form({ email: EMAIL }));
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).toContain("resetPasswordForEmail");
    expect(logged).toContain("unexpected_failure");
    expect(logged.toLowerCase()).not.toContain("someone@example.com");
  });
});

describe("/forgot-password", () => {
  const render = async (params: Record<string, string>) =>
    renderToStaticMarkup(await ForgotPasswordPage({ params: Promise.resolve({}), searchParams: Promise.resolve(params) } as never));

  it("explains an expired or invalid recovery link and offers a new one", async () => {
    const html = await render({ error: "link_expired" });
    expect(html).toContain("That password reset link is invalid or has expired.");
    expect(html).toContain("send you a new one");
    expect(html).toContain("Send reset link");
  });

  it("shows no error for unknown or missing codes", async () => {
    for (const params of [{}, { error: "something_else" }] as Record<string, string>[]) {
      const html = await render(params);
      expect(html).not.toContain('role="alert"');
    }
  });
});
