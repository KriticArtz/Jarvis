import { describe, expect, it } from "vitest";
import { claimsSuccess, toolOutputForModel } from "./agent-rules";

describe("claimsSuccess", () => {
  it("detects replies that say the change was made", () => {
    for (const t of ["Done! Moved your workout to tomorrow.", "I've marked it complete.", "All set — logged 45 minutes.", "Saved that for you."]) {
      expect(claimsSuccess(t), t).toBe(true);
    }
  });
  it("does not flag honest failure replies", () => {
    for (const t of ["I couldn't find that task. Want me to list today's tasks?", "I wasn't able to move it.", "That didn't go through.", "Want me to move it to tomorrow?"]) {
      expect(claimsSuccess(t), t).toBe(false);
    }
  });
});

describe("toolOutputForModel", () => {
  it("tells the model a failure did not happen", () => {
    const out = toolOutputForModel({ status: "failed", error: "not_found", message: "I couldn't find that task." });
    expect(out).toMatchObject({ status: "failed", error: "not_found" });
    expect(String(out.instruction)).toMatch(/did NOT happen/);
  });
  it("passes the confirmation id and says it is not done yet", () => {
    const out = toolOutputForModel({ status: "needs_confirmation", message: "Delete “Run”", confirmationId: "abc" });
    expect(out.confirmation_id).toBe("abc");
    expect(String(out.instruction)).toMatch(/NOT done yet/);
  });
});
