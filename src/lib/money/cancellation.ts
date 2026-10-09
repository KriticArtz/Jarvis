/**
 * Where a user can cancel or manage a subscription (pure).
 *
 * The app never cancels anything. It only points the user to the place where
 * THEY can — and only to destinations we're confident of:
 *   1. A short, curated list of well-known providers' own account / manage-
 *      subscription pages (maintained by hand; review periodically).
 *   2. Otherwise the merchant's website, when the bank data reported one.
 *   3. Otherwise general instructions — never a made-up URL.
 */

export type CancelHelp =
  | { kind: "official"; label: string; url: string; note: string }
  | { kind: "merchant"; label: string; url: string; note: string }
  | { kind: "instructions"; label: string; note: string };

const OFFICIAL: { match: RegExp; label: string; url: string; note: string }[] = [
  { match: /^netflix\b/, label: "Manage on Netflix", url: "https://www.netflix.com/cancelplan", note: "Netflix's own cancel page. You'll need to sign in." },
  { match: /^spotify\b/, label: "Manage on Spotify", url: "https://www.spotify.com/account/subscription/", note: "Your Spotify plan settings. You'll need to sign in." },
  { match: /^hulu\b/, label: "Manage on Hulu", url: "https://secure.hulu.com/account", note: "Your Hulu account page. You'll need to sign in." },
  { match: /^disney/, label: "Manage on Disney+", url: "https://www.disneyplus.com/account", note: "Your Disney+ account. You'll need to sign in." },
  { match: /^(?:youtube|google youtube)\b/, label: "Manage on YouTube", url: "https://www.youtube.com/paid_memberships", note: "Your YouTube memberships. You'll need to sign in." },
  { match: /^(?:apple|itunes)\b/, label: "Apple subscriptions", url: "https://support.apple.com/en-us/118428", note: "Apple's instructions for cancelling a subscription billed through your Apple Account." },
  { match: /^google (?:play|storage|one)\b/, label: "Google Play subscriptions", url: "https://play.google.com/store/account/subscriptions", note: "Subscriptions billed through Google Play." },
  { match: /^(?:amazon prime|prime video|amzn prime)\b/, label: "Manage Prime", url: "https://www.amazon.com/mc", note: "Your Amazon Prime membership settings." },
  { match: /^adobe\b/, label: "Manage on Adobe", url: "https://account.adobe.com/plans", note: "Your Adobe plans. You'll need to sign in." },
  { match: /^microsoft\b/, label: "Manage on Microsoft", url: "https://account.microsoft.com/services", note: "Your Microsoft services and subscriptions." },
  { match: /^dropbox\b/, label: "Manage on Dropbox", url: "https://www.dropbox.com/account/plan", note: "Your Dropbox plan. You'll need to sign in." },
];

export function cancelHelp(merchantKey: string, merchantWebsite: string | null | undefined, merchantName: string): CancelHelp {
  const official = OFFICIAL.find((o) => o.match.test(merchantKey));
  if (official) return { kind: "official", label: official.label, url: official.url, note: official.note };
  if (merchantWebsite) {
    return {
      kind: "merchant",
      label: "Open merchant",
      url: merchantWebsite,
      note: `${merchantName}'s website (as reported by your bank). Look for account or subscription settings.`,
    };
  }
  return {
    kind: "instructions",
    label: "How to cancel",
    note: `Sign in to your ${merchantName} account and look for subscription or billing settings. If it's billed through an app store, cancel it in your Apple or Google account. You can also contact ${merchantName} directly, or ask your bank about stopping recurring charges.`,
  };
}
