import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/routes";
import { DELETE_CONFIRMATION, DELETED_DATA, validateDeletionRequest } from "./deletion";

describe("account deletion rules", () => {
  it("requires the exact confirmation phrase", () => {
    expect(validateDeletionRequest({ confirmation: "delete", password: "x", requiresPassword: true })).toMatch(/Type DELETE/);
    expect(validateDeletionRequest({ confirmation: "", password: "x", requiresPassword: true })).toMatch(/Type DELETE/);
    expect(validateDeletionRequest({ confirmation: ` ${DELETE_CONFIRMATION} `, password: "x", requiresPassword: true })).toBeNull();
  });

  it("requires the password for email accounts", () => {
    expect(validateDeletionRequest({ confirmation: "DELETE", password: "", requiresPassword: true })).toMatch(/password/);
    expect(validateDeletionRequest({ confirmation: "DELETE", password: "", requiresPassword: false })).toBeNull();
  });

  it("tells the user everything that gets deleted", () => {
    expect(DELETED_DATA.join(" ")).toMatch(/conversations/i);
    expect(DELETED_DATA.join(" ")).toMatch(/phone number/i);
  });
});

describe("legal pages", () => {
  it("are public, while app pages stay protected", () => {
    for (const p of ["/privacy", "/terms", "/account-deleted"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/settings", "/dashboard"]) expect(isPublicPath(p)).toBe(false);
  });
});
