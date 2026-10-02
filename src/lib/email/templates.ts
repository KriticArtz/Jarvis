import { brand } from "@/config/brand";

/**
 * Email copy and rendering (pure; unit-tested). Emails read like a short note
 * from the user's assistant, not a newsletter: a personal message, an
 * invitation to reply, and a one-line footer with the way to turn them off.
 */

export const CONFIRM_HINT = "Reply YES to confirm or NO to cancel.";

/** Make sure a reply that proposes a change tells the user how to answer it. */
export function withConfirmationHint(reply: string, hasPendingProposal: boolean): string {
  if (!hasPendingProposal || /reply\s+yes\b/i.test(reply)) return reply;
  return `${reply.trimEnd()}\n\n${CONFIRM_HINT}`;
}

export function replyAddress(token: string, domain: string): string {
  return `reply+${token}@${domain}`;
}

/** Strip header-breaking characters and cap the length. */
export function cleanSubject(subject: string): string {
  const s = subject.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 120);
  return s || "Checking in";
}

export function replySubject(subject: string | null | undefined): string {
  const s = cleanSubject(subject ?? "");
  return /^re:/i.test(s) ? s : `Re: ${s}`.slice(0, 120);
}

/**
 * "Jarvis <jarvis@mail.example.com>" + "Ava" → "Ava <jarvis@mail.example.com>".
 * Only the display name changes; the verified sending address is kept.
 */
export function fromWithName(from: string, name: string): string {
  const addr = /<([^<>]+)>/.exec(from)?.[1] ?? from.trim();
  const display = name.replace(/[<>"\\,;:@\r\n]/g, "").trim().slice(0, 40) || brand.name;
  return `${display} <${addr}>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface RenderedEmail {
  text: string;
  html: string;
}

/** Plain text first; the HTML part is the same words with light styling. */
export function renderEmail(opts: { assistantName: string; body: string; unsubscribeUrl: string }): RenderedEmail {
  const body = opts.body.replace(/\r\n?/g, "\n").trim();
  const footer = `You're getting this because you turned on email check-ins in ${brand.name}. Turn them off: ${opts.unsubscribeUrl}`;
  const text = `${body}\n\n— ${opts.assistantName}\n\n${footer}\n`;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#ffffff">
<div style="max-width:560px;margin:0 auto;font:16px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">
${paragraphs}<p style="margin:0 0 28px">— ${escapeHtml(opts.assistantName)}</p>
<p style="margin:0;font-size:12px;line-height:1.5;color:#86868b">You're getting this because you turned on email check-ins in ${escapeHtml(brand.name)}. <a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#86868b">Turn them off</a>.</p>
</div></body></html>`;
  return { text, html };
}

export interface CheckInDraft {
  subject: string;
  body: string;
}

function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/**
 * Deterministic check-in used when AI isn't configured or fails: the next
 * open timed task today, else the first open task, else a light day check.
 */
export function fallbackCheckIn(tasks: { title: string; start: string | null; status: string }[], nowTime: string): CheckInDraft {
  const open = tasks.filter((t) => t.status === "pending");
  const timed = open.filter((t) => t.start).sort((a, b) => a.start!.localeCompare(b.start!));
  const next = timed.find((t) => t.start! >= nowTime) ?? timed[0] ?? open[0];
  const close = "Just reply to this email. If the plan changed, that's okay — we'll figure out what works now.";
  if (!next) {
    return { subject: "How's today going?", body: `Hey — quick check-in. How's today going, and what's the one thing you want to get done next?\n\n${close}` };
  }
  if (next.start) {
    const evening = next.start >= "17:00";
    return {
      subject: evening ? "Still on for tonight?" : `Still on for ${clock(next.start)}?`,
      body: `Hey — you planned “${next.title}” at ${clock(next.start)}. Still happening?\n\n${close}`,
    };
  }
  return { subject: "Still on for today?", body: `Hey — “${next.title}” is still open for today. Still happening?\n\n${close}` };
}
