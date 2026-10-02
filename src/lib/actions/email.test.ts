import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as null | { userId: string; isDemo: boolean; supabase: unknown } }));
const checkIn = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.current }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/email/check-in", () => ({ sendAccountabilityCheckIn: checkIn }));

const { sendTestCheckIn, setEmailAccountability } = await import("./email");

function sessionFor(userId: string, isDemo = false) {
  const eq = vi.fn(async () => ({ error: null }));
  update.mockReturnValue({ eq });
  return { userId, isDemo, supabase: { from: () => ({ update }) }, eq };
}

describe("email server actions", () => {
  beforeEach(() => {
    checkIn.mockReset();
    update.mockReset();
    session.current = null;
  });

  it("reject signed-out callers without touching anything", async () => {
    expect(await setEmailAccountability(true)).toMatchObject({ ok: false });
    expect(await sendTestCheckIn()).toMatchObject({ ok: false });
    expect(update).not.toHaveBeenCalled();
    expect(checkIn).not.toHaveBeenCalled();
  });

  it("reject demo accounts", async () => {
    session.current = sessionFor("demo", true);
    expect(await setEmailAccountability(true)).toMatchObject({ ok: false });
    expect(await sendTestCheckIn()).toMatchObject({ ok: false });
    expect(checkIn).not.toHaveBeenCalled();
  });

  it("toggle only the signed-in user's own preference", async () => {
    const s = sessionFor("user-1");
    session.current = s;
    expect(await setEmailAccountability(true)).toMatchObject({ ok: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ email_enabled: true }));
    expect(s.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(await setEmailAccountability(false)).toMatchObject({ ok: true, message: "Email check-ins are off." });
    expect(update).toHaveBeenLastCalledWith({ email_enabled: false });
  });

  it("send the test check-in to the signed-in user only, and never claim success on failure", async () => {
    session.current = sessionFor("user-1");
    checkIn.mockResolvedValueOnce({ status: "test", id: "x" });
    expect(await sendTestCheckIn()).toMatchObject({ ok: true });
    expect(checkIn).toHaveBeenCalledWith(expect.anything(), "user-1", { kind: "test" });
    checkIn.mockResolvedValueOnce({ status: "failed", id: "x", error: "boom" });
    expect(await sendTestCheckIn()).toMatchObject({ ok: false });
    checkIn.mockResolvedValueOnce({ status: "skipped", reason: "Email check-ins are turned off." });
    expect(await sendTestCheckIn()).toEqual({ ok: false, error: "Email check-ins are turned off." });
    checkIn.mockResolvedValueOnce({ status: "duplicate" });
    expect(await sendTestCheckIn()).toMatchObject({ ok: false });
  });
});
