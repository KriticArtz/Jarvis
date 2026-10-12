import { describe, expect, it } from "vitest";
import { isHttpsRequest, sessionCookieOptions } from "./cookie-options";

describe("Supabase session cookie options", () => {
  it("adds Secure only for HTTPS requests and otherwise keeps the library defaults", () => {
    expect(sessionCookieOptions(true)).toEqual({ secure: true });
    expect(sessionCookieOptions(false)).toBeUndefined();
  });

  it("never turns HttpOnly on or changes the lifetime, path or SameSite (library defaults stay in charge)", () => {
    const opts = sessionCookieOptions(true) ?? {};
    expect(Object.keys(opts)).toEqual(["secure"]);
  });

  it("reads the original protocol from x-forwarded-proto, then the URL", () => {
    expect(isHttpsRequest("https", "http:")).toBe(true); // TLS terminated in front of the app (Vercel)
    expect(isHttpsRequest("https, http", undefined)).toBe(true);
    expect(isHttpsRequest(" HTTPS ", undefined)).toBe(true);
    expect(isHttpsRequest("http", "https:")).toBe(false);
    expect(isHttpsRequest(null, "https:")).toBe(true);
    expect(isHttpsRequest(undefined, "http:")).toBe(false);
    expect(isHttpsRequest("", undefined)).toBe(false);
  });
});
