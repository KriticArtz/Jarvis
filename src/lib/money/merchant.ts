/**
 * Merchant normalization (pure): "SQ *BLUE BOTTLE #123 OAKLAND" and
 * "Blue Bottle Coffee" should group together; "NETFLIX.COM 866-579" is
 * "netflix". Used for grouping, recurring detection and display.
 */

const PREFIXES = /^(?:sq|tst|pp|paypal|sp|py|ckc|pos|ach|dd|debit|purchase|recurring|checkcard|chkcard|card|visa|mc|pmt)\s*\*\s*|^(?:pos|ach|debit|purchase|recurring|checkcard)\s+/;
const NOISE = /\b(?:inc|llc|ltd|corp|co|company|bill|billing|payment|pymt|autopay|auto pay|subscription|subscr|recurring|online|us|usa|www|com|net|org|io|help|ca|ny|tx|fl)\b/g;

/** Stable grouping key, e.g. "netflix", "blue bottle". Never empty. */
export function merchantKey(name: string, merchantName?: string | null): string {
  let s = (merchantName?.trim() || name).toLowerCase();
  s = s.replace(/https?:\/\//g, " ").replace(/\.(?:com|net|org|co|io|tv)\b/g, " ");
  for (let i = 0; i < 3; i++) s = s.replace(PREFIXES, "");
  s = s
    .replace(/#\s*\d+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z&+ ]+/g, " ")
    .replace(NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const key = s.split(" ").slice(0, 3).join(" ").slice(0, 120);
  return key || "unknown";
}

/** What to show: the provider's clean merchant name when there is one, else a tidied description. */
export function merchantDisplay(name: string, merchantName?: string | null): string {
  if (merchantName?.trim()) return merchantName.trim().slice(0, 200);
  const key = merchantKey(name);
  if (key === "unknown") return name.trim().slice(0, 200) || "Unknown";
  return key.replace(/\b[a-z]/g, (c) => c.toUpperCase()).slice(0, 200);
}

/** Only well-formed http(s) URLs reported by the provider are kept (never constructed). */
export function safeWebsite(url: string | null | undefined): string | null {
  if (!url) return null;
  const raw = url.trim();
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname)) return null;
    return `${u.protocol}//${u.hostname}${u.pathname === "/" ? "" : u.pathname}`.slice(0, 300);
  } catch {
    return null;
  }
}
