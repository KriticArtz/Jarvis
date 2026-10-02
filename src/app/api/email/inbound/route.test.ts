import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { computeWebhookSignature } from "@/lib/email/webhook-signature";

const handle = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/inbound", () => ({ handleInboundEmail: handle }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const { POST } = await import("./route");
const SECRET = `whsec_${Buffer.from("route-test-secret").toString("base64")}`;

function request(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/email/inbound", { method: "POST", body, headers });
}
function signed(body: string, id = "msg_1") {
  const ts = String(Math.floor(Date.now() / 1000));
  return { "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${computeWebhookSignature(SECRET, id, ts, body)}` };
}

describe("POST /api/email/inbound", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    handle.mockReset();
  });

  it("is unavailable until the webhook secret is configured", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    expect((await POST(request("{}"))).status).toBe(503);
  });

  it("rejects unsigned or forged requests before reading anything", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
    const body = JSON.stringify({ type: "email.received", data: { email_id: "em_1", to: [], from: "a@b.com" } });
    expect((await POST(request(body))).status).toBe(401);
    const headers = signed(body);
    expect((await POST(request(body.replace("em_1", "em_2"), headers))).status).toBe(401);
    expect(handle).not.toHaveBeenCalled();
  });

  it("acknowledges and ignores other signed events", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "em_1" } });
    const res = await POST(request(body, signed(body)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect(handle).not.toHaveBeenCalled();
  });
});
