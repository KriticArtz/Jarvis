import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dispatch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/dispatch", () => ({ runEmailDispatch: dispatch }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { GET } = await import("./route");

const SECRET = "test-cron-secret-0123456789";
const call = (auth?: string) => GET(new NextRequest("https://www.arovenna.com/api/cron/email", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  dispatch.mockReset().mockResolvedValue({ usersChecked: 1, due: 1, sent: 0, test: 1, failed: 0, skipped: 0, duplicate: 0 });
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("EMAIL_SCHEDULE_ENABLED", "true");
  vi.stubEnv("EMAIL_MODE", "test");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("/api/cron/email", () => {
  it("rejects calls without the exact cron secret", async () => {
    for (const auth of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, SECRET]) {
      const res = await call(auth);
      expect(res.status).toBe(401);
    }
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(`Bearer ${SECRET}`)).status).toBe(401);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing unless EMAIL_SCHEDULE_ENABLED is exactly true", async () => {
    for (const value of ["", "false", "1", "yes"]) {
      vi.stubEnv("EMAIL_SCHEDULE_ENABLED", value);
      const res = await call(`Bearer ${SECRET}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ skipped: "EMAIL_SCHEDULE_ENABLED is not true" });
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing when email is disabled", async () => {
    vi.stubEnv("EMAIL_MODE", "disabled");
    expect(await (await call(`Bearer ${SECRET}`)).json()).toEqual({ skipped: "EMAIL_MODE=disabled" });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("runs the dispatcher and reports the mode (test mode never sends)", async () => {
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "test", usersChecked: 1, test: 1 });
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("reports a dispatcher failure without leaking details", async () => {
    dispatch.mockRejectedValue(new Error("db exploded: secret detail"));
    const res = await call(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
});
