/**
 * Pure helpers for inbound email (unit-tested). Everything here treats the
 * email as untrusted input: it only extracts, never decides who the user is.
 */

/** "Jarvis <a@b.com>" / "a@b.com" → "a@b.com" (lower-cased), or null. */
export function parseAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const inner = /<([^<>\s]+)>/.exec(raw)?.[1] ?? raw.trim();
  const addr = inner.trim().toLowerCase();
  return /^[^\s@<>"]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(addr) ? addr : null;
}

/** Reply tokens are 40 lower-case hex chars (random, see newReplyToken). */
const TOKEN = /^[a-z0-9._-]+\+([0-9a-f]{40})$/;

/**
 * Find the reply token in the recipient list (reply+<token>@reply-domain).
 * When `domain` is given, only addresses at that domain count.
 */
export function extractReplyToken(recipients: (string | null | undefined)[], domain?: string): string | null {
  for (const r of recipients) {
    const addr = parseAddress(r);
    if (!addr) continue;
    const at = addr.lastIndexOf("@");
    if (domain && addr.slice(at + 1) !== domain.toLowerCase()) continue;
    const m = TOKEN.exec(addr.slice(0, at));
    if (m) return m[1];
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Minimal HTML → text for replies that arrive without a text part. Quoted blocks are dropped. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*<\/blockquote>/gi, "") // quoted history
    .replace(/<div[^>]*class="[^"]*(gmail_quote|yahoo_quoted|moz-cite-prefix)[^"]*"[\s\S]*$/i, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1)) || 32) : m));
}

/** Lines that start the quoted original or a signature; everything from there on is dropped. */
const CUT_LINE = [
  /^-{2,}\s*(original message|forwarded message)\s*-{2,}/i,
  /^_{5,}\s*$/,
  /^from:\s.+/i, // Outlook-style header block
  /^sent from my\s/i,
  /^get outlook for\s/i,
  /^--\s?$/, // signature delimiter
  /^(le|am|el|il|op)\s.+(a écrit|schrieb|escribió|ha scritto|schreef)\s?:\s*$/i,
];
/** "On Tue, Oct 6, 2026 at 5:45 PM Jarvis <...> wrote:" — may wrap over 2–3 lines. */
const ON_WROTE = /^on\s[\s\S]{0,300}?wrote:\s*$/im;

/**
 * Keep only what the user just wrote: drop the quoted original, ">" lines,
 * signatures and mobile footers. Result is trimmed and capped.
 */
export function stripQuotedReply(text: string, max = 4000): string {
  let body = text.replace(/\r\n?/g, "\n");
  const onWrote = ON_WROTE.exec(body);
  if (onWrote) body = body.slice(0, onWrote.index);
  const kept: string[] = [];
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (CUT_LINE.some((re) => re.test(t))) break;
    if (t.startsWith(">")) continue;
    kept.push(line.trimEnd());
  }
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

/** "stop" / "unsubscribe" as the whole reply turns email check-ins off. */
export function isStopRequest(body: string): boolean {
  const first = body.trim().split("\n")[0]?.trim().toLowerCase().replace(/[.!]+$/, "") ?? "";
  return ["stop", "unsubscribe", "stop emails", "stop emailing me", "opt out"].includes(first) && body.trim().split("\n").length <= 2;
}

/** A Message-ID safe to echo in In-Reply-To / References (no header injection). */
export function safeMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  const v = id.trim();
  return /^<[^<>\s\r\n]{3,250}>$/.test(v) ? v : null;
}
