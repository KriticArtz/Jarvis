import { afterEach, describe, expect, it, vi } from "vitest";
import { extractReplyToken, htmlToText, isStopRequest, parseAddress, safeMessageId, stripQuotedReply } from "./parse";
import { computeWebhookSignature, isValidWebhookSignature } from "./webhook-signature";
import { CONFIRM_HINT, cleanSubject, fallbackCheckIn, fromWithName, renderEmail, replySubject, withConfirmationHint } from "./templates";
import { parseResendInbound } from "./providers/resend-webhook";
import { ResendEmailProvider } from "./providers/resend-provider";
import { TestEmailProvider } from "./providers/test-provider";
import { assistantSystemPrompt } from "@/lib/ai/prompts";
import { EMAIL_PROPOSAL_TTL_MINUTES, PROPOSAL_TTL_MINUTES, proposalTtlMinutes } from "@/lib/assistant/actions/confirmation";
import { isPublicPath } from "@/lib/routes";

const TOKEN = "0123456789abcdef0123456789abcdef01234567";

describe("addresses and reply tokens", () => {
  it("parses addresses with or without a display name", () => {
    expect(parseAddress("Derek <Derek@Example.com>")).toBe("derek@example.com");
    expect(parseAddress("derek@example.com")).toBe("derek@example.com");
    expect(parseAddress("not an address")).toBeNull();
    expect(parseAddress(null)).toBeNull();
  });

  it("finds the reply token only in a well-formed reply address", () => {
    expect(extractReplyToken(["someone@else.com", `Jarvis <reply+${TOKEN}@reply.example.com>`])).toBe(TOKEN);
    expect(extractReplyToken([`reply+${TOKEN}@reply.example.com`], "reply.example.com")).toBe(TOKEN);
    expect(extractReplyToken([`reply+${TOKEN}@evil.com`], "reply.example.com")).toBeNull();
    expect(extractReplyToken(["reply+short@reply.example.com"])).toBeNull();
    expect(extractReplyToken([`reply+${TOKEN}x@reply.example.com`])).toBeNull();
    expect(extractReplyToken([])).toBeNull();
  });

  it("only echoes safe Message-IDs (no header injection)", () => {
    expect(safeMessageId("<abc@mail.gmail.com>")).toBe("<abc@mail.gmail.com>");
    expect(safeMessageId("<abc@x>\r\nBcc: victim@example.com")).toBeNull();
    expect(safeMessageId("abc@x")).toBeNull();
  });
});

describe("quoted content", () => {
  it("keeps only the new reply above a Gmail-style quote", () => {
    const text = "Not tonight, I'm wiped.\nMove it to tomorrow morning?\n\nOn Tue, Oct 6, 2026 at 5:45 PM Jarvis <reply+x@reply.example.com>\nwrote:\n> Hey — you planned a run at 6. Still happening?\n";
    expect(stripQuotedReply(text)).toBe("Not tonight, I'm wiped.\nMove it to tomorrow morning?");
  });

  it("handles Outlook headers, '>' lines, signatures and mobile footers", () => {
    expect(stripQuotedReply("Yes\r\n\r\nFrom: Jarvis <x@y.com>\r\nSent: Tuesday\r\nSubject: Still on?")).toBe("Yes");
    expect(stripQuotedReply("Done!\n> quoted\n> more")).toBe("Done!");
    expect(stripQuotedReply("Sure thing\n-- \nDerek\nCEO")).toBe("Sure thing");
    expect(stripQuotedReply("YES\n\nSent from my iPhone")).toBe("YES");
    expect(stripQuotedReply("ok\n-----Original Message-----\nold")).toBe("ok");
    expect(stripQuotedReply("> only quoted")).toBe("");
  });

  it("converts HTML replies and drops quoted blocks", () => {
    const html = `<div>Moving it to <b>Saturday</b> &amp; that's fine.<br>Thanks</div><div class="gmail_quote"><blockquote>old message</blockquote></div>`;
    expect(stripQuotedReply(htmlToText(html))).toBe("Moving it to Saturday & that's fine.\nThanks");
  });

  it("caps the length", () => {
    expect(stripQuotedReply("a".repeat(10_000)).length).toBe(4000);
  });

  it("recognizes STOP requests but not sentences that mention stop", () => {
    expect(isStopRequest("STOP")).toBe(true);
    expect(isStopRequest("unsubscribe.")).toBe(true);
    expect(isStopRequest("Stop reminding me about the gym, I'm done with it for today")).toBe(false);
  });
});

describe("webhook signature (Svix)", () => {
  const secret = `whsec_${Buffer.from("test-secret-key-0123456789").toString("base64")}`;
  const body = JSON.stringify({ type: "email.received", data: { email_id: "em_1" } });
  const now = new Date("2026-10-06T12:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const sig = `v1,${computeWebhookSignature(secret, "msg_1", ts, body)}`;

  it("accepts a valid signature (also among several)", () => {
    expect(isValidWebhookSignature(secret, { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(true);
    expect(isValidWebhookSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,bogus ${sig}` }, body, now)).toBe(true);
  });

  it("rejects tampering, wrong secrets, missing headers and stale timestamps", () => {
    expect(isValidWebhookSignature(secret, { id: "msg_1", timestamp: ts, signature: sig }, body.replace("em_1", "em_2"), now)).toBe(false);
    expect(isValidWebhookSignature(secret, { id: "msg_2", timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(isValidWebhookSignature(`whsec_${Buffer.from("other").toString("base64")}`, { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(isValidWebhookSignature(secret, { id: "msg_1", timestamp: ts, signature: null }, body, now)).toBe(false);
    expect(isValidWebhookSignature(undefined, { id: "msg_1", timestamp: ts, signature: sig }, body, now)).toBe(false);
    expect(isValidWebhookSignature(secret, { id: "msg_1", timestamp: ts, signature: sig.replace("v1,", "v2,") }, body, now)).toBe(false);
    const later = new Date(now.getTime() + 6 * 60_000);
    expect(isValidWebhookSignature(secret, { id: "msg_1", timestamp: ts, signature: sig }, body, later)).toBe(false);
  });
});

describe("Resend webhook payload", () => {
  it("maps email.received and ignores other events or malformed data", () => {
    const parsed = parseResendInbound({
      type: "email.received",
      data: { email_id: "em_1", from: "Derek <d@example.com>", to: [`reply+${TOKEN}@r.example.com`], cc: [], subject: "Re: Still on?", message_id: "<m@x>" },
    });
    expect(parsed).toEqual({ provider: "resend", emailId: "em_1", from: "Derek <d@example.com>", to: [`reply+${TOKEN}@r.example.com`], cc: [], subject: "Re: Still on?", messageId: "<m@x>" });
    expect(parseResendInbound({ type: "email.sent", data: { email_id: "em_1" } })).toBeNull();
    expect(parseResendInbound({ type: "email.received", data: {} })).toBeNull();
    expect(parseResendInbound(null)).toBeNull();
  });
});

describe("templates", () => {
  it("renders a short personal email with a disable link, escaping HTML", () => {
    const out = renderEmail({ assistantName: "Ava", body: "Hey — still on for <tonight>?\n\nJust reply.", unsubscribeUrl: "https://app.example.com/api/email/unsubscribe?t=abc" });
    expect(out.text).toContain("— Ava");
    expect(out.text).toContain("Turn them off: https://app.example.com/api/email/unsubscribe?t=abc");
    expect(out.html).toContain("&lt;tonight&gt;");
    expect(out.html).not.toContain("<tonight>");
    expect(out.html).toContain('href="https://app.example.com/api/email/unsubscribe?t=abc"');
  });

  it("uses the assistant's name on the verified sender address", () => {
    expect(fromWithName("Jarvis <jarvis@mail.example.com>", "Ava")).toBe("Ava <jarvis@mail.example.com>");
    expect(fromWithName("jarvis@mail.example.com", 'Bad"<x@y>\r\nBcc:')).toBe("BadxyBcc <jarvis@mail.example.com>");
  });

  it("cleans subjects and builds reply subjects", () => {
    expect(cleanSubject("Still on\r\nBcc: x")).toBe("Still on Bcc: x");
    expect(cleanSubject("   ")).toBe("Checking in");
    expect(replySubject("Still on for tonight?")).toBe("Re: Still on for tonight?");
    expect(replySubject("RE: Still on")).toBe("RE: Still on");
  });

  it("adds the YES/NO instruction only when a change awaits confirmation", () => {
    expect(withConfirmationHint("Want me to delete it?", true)).toBe(`Want me to delete it?\n\n${CONFIRM_HINT}`);
    expect(withConfirmationHint("Reply YES to confirm or NO to cancel.", true)).toBe("Reply YES to confirm or NO to cancel.");
    expect(withConfirmationHint("Done — moved it.", false)).toBe("Done — moved it.");
  });

  it("falls back to a check-in about the next planned task", () => {
    const evening = fallbackCheckIn([{ title: "Project work", start: "19:30", status: "pending" }], "17:00");
    expect(evening.subject).toBe("Still on for tonight?");
    expect(evening.body).toContain("you planned “Project work” at 7:30 PM. Still happening?");
    expect(evening.body).toContain("Just reply to this email.");
    expect(fallbackCheckIn([{ title: "Run", start: "07:00", status: "pending" }], "06:00").subject).toBe("Still on for 7 AM?");
    expect(fallbackCheckIn([{ title: "Done", start: "07:00", status: "done" }], "06:00").subject).toBe("How's today going?");
  });
});

describe("providers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("test provider never touches the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const p = new TestEmailProvider();
    const res = await p.send({ from: "a <a@x.com>", to: "b@x.com", replyTo: "r@x.com", subject: "s", text: "t", html: "h", headers: {}, idempotencyKey: "k" });
    expect(res.ok).toBe(true);
    expect(p.delivers).toBe(false);
    expect(p.sent).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Resend provider reports failures as failures, never success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ name: "validation_error" }), { status: 422 })));
    const p = new ResendEmailProvider("re_test");
    const res = await p.send({ from: "a <a@x.com>", to: "b@x.com", replyTo: "r@x.com", subject: "s", text: "t", html: "h", headers: {}, idempotencyKey: "k" });
    expect(res).toMatchObject({ ok: false, retryable: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    expect(await p.send({ from: "a <a@x.com>", to: "b@x.com", replyTo: "r@x.com", subject: "s", text: "t", html: "h", headers: {}, idempotencyKey: "k" })).toMatchObject({ ok: false, retryable: true });
  });

  it("Resend provider sends with the idempotency key and returns the id", async () => {
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ id: "re_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const res = await new ResendEmailProvider("re_test").send({ from: "a <a@x.com>", to: "b@x.com", replyTo: "r@x.com", subject: "s", text: "t", html: "h", headers: { "In-Reply-To": "<m@x>" }, idempotencyKey: "row-1" });
    expect(res).toEqual({ ok: true, providerMessageId: "re_123" });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("row-1");
    expect(JSON.parse(String(init.body))).toMatchObject({ to: ["b@x.com"], reply_to: "r@x.com", headers: { "In-Reply-To": "<m@x>" } });
  });
});

describe("assistant wiring", () => {
  it("tells the model it's on email and how confirmations work there", () => {
    const prompt = assistantSystemPrompt({ name: "Jarvis", personality: "supportive" }, "email", { tools: true });
    expect(prompt).toContain("You are writing by email");
    expect(prompt).toContain("Reply YES to confirm or NO to cancel");
    expect(assistantSystemPrompt({ name: "Jarvis", personality: "supportive" }, "sms", { tools: true })).not.toContain("by email");
  });

  it("gives email proposals a longer window, same rules otherwise", () => {
    expect(proposalTtlMinutes("app")).toBe(PROPOSAL_TTL_MINUTES);
    expect(proposalTtlMinutes("sms")).toBe(PROPOSAL_TTL_MINUTES);
    expect(proposalTtlMinutes("email")).toBe(EMAIL_PROPOSAL_TTL_MINUTES);
  });

  it("exposes only the webhook and unsubscribe endpoints without a session", () => {
    expect(isPublicPath("/api/email/inbound")).toBe(true);
    expect(isPublicPath("/api/email/unsubscribe")).toBe(true);
    expect(isPublicPath("/api/email")).toBe(false);
    expect(isPublicPath("/api/email/send")).toBe(false);
  });
});
