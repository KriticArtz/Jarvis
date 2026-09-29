import { afterEach, describe, expect, it, vi } from "vitest";
import { phoneVerificationMode, requirePhoneVerification } from "@/lib/env";
import { canReceiveSms } from "@/lib/notifications/scheduler";
import { codeMatches, evaluateCode, generateCode, hashCode, type VerificationRecord } from "./codes";
import { TestVerificationProvider } from "./provider";

const SECRET = "test-secret";
const USER = "user-1";
const PHONE = "+15551234567";

function record(overrides: Partial<VerificationRecord> = {}): VerificationRecord {
  return {
    phone: PHONE,
    code_hash: hashCode(SECRET, USER, PHONE, "123456"),
    attempts: 0,
    max_attempts: 5,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    verified_at: null,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("verification codes", () => {
  it("generates zero-padded 6-digit codes", () => {
    expect(generateCode(() => 42)).toBe("000042");
    expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("binds the hash to the user and the phone number", () => {
    const h = hashCode(SECRET, USER, PHONE, "123456");
    expect(h).not.toContain("123456");
    expect(codeMatches(SECRET, USER, PHONE, "123456", h)).toBe(true);
    expect(codeMatches(SECRET, "user-2", PHONE, "123456", h)).toBe(false);
    expect(codeMatches(SECRET, USER, "+15550000000", "123456", h)).toBe(false);
    expect(codeMatches("other-secret", USER, PHONE, "123456", h)).toBe(false);
  });

  it("evaluates every outcome", () => {
    const base = { currentPhone: PHONE, secret: SECRET, userId: USER };
    expect(evaluateCode({ ...base, record: record(), code: "123456" })).toBe("verified");
    expect(evaluateCode({ ...base, record: record(), code: " 123456 " })).toBe("verified");
    expect(evaluateCode({ ...base, record: record(), code: "654321" })).toBe("invalid_code");
    expect(evaluateCode({ ...base, record: record(), code: "abc" })).toBe("invalid_code");
    expect(evaluateCode({ ...base, record: record({ expires_at: new Date(Date.now() - 1).toISOString() }), code: "123456" })).toBe("expired");
    expect(evaluateCode({ ...base, record: record({ attempts: 5 }), code: "123456" })).toBe("too_many_attempts");
    expect(evaluateCode({ ...base, currentPhone: "+15550000000", record: record(), code: "123456" })).toBe("phone_changed");
    expect(evaluateCode({ ...base, record: record({ verified_at: new Date().toISOString() }), code: "123456" })).toBe("already_verified");
    expect(evaluateCode({ ...base, record: null, code: "123456" })).toBe("not_found");
  });

  it("test provider returns the code so it can be shown in development", async () => {
    const res = await new TestVerificationProvider(() => "111222").start(PHONE);
    expect(res).toEqual({ code: "111222", providerRef: null, devCode: "111222" });
  });
});

describe("verification configuration", () => {
  it("is off by default and never runs test mode in production", () => {
    expect(phoneVerificationMode()).toBe("off");
    vi.stubEnv("PHONE_VERIFICATION_MODE", "test");
    vi.stubEnv("NODE_ENV", "development");
    expect(phoneVerificationMode()).toBe("test");
    vi.stubEnv("NODE_ENV", "production");
    expect(phoneVerificationMode()).toBe("off");
  });

  it("does not require verification unless REQUIRE_PHONE_VERIFICATION=true", () => {
    expect(requirePhoneVerification()).toBe(false);
    vi.stubEnv("REQUIRE_PHONE_VERIFICATION", "true");
    expect(requirePhoneVerification()).toBe(true);
  });

  it("blocks SMS to unverified numbers only when verification is required", () => {
    const prefs = { sms_enabled: true, sms_consent_at: "2026-09-01T00:00:00Z", sms_opted_out_at: null };
    const unverified = { phone: PHONE, phone_verified_at: null };
    const verified = { phone: PHONE, phone_verified_at: "2026-09-02T00:00:00Z" };
    expect(canReceiveSms(unverified, prefs)).toBe(true); // current behavior preserved
    expect(canReceiveSms(unverified, prefs, { requireVerified: true })).toBe(false);
    expect(canReceiveSms(verified, prefs, { requireVerified: true })).toBe(true);
    expect(canReceiveSms(verified, { ...prefs, sms_consent_at: null }, { requireVerified: true })).toBe(false);
  });
});
