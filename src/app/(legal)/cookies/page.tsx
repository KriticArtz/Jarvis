import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { CookiePreferences } from "@/components/legal/cookie-preferences";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: `The cookies and browser storage ${brand.name} uses, and how to control them.`,
  alternates: { canonical: "/cookies" },
};

/*
 * This list must match what the site actually sets. Checked against the code:
 * Supabase auth cookies (src/lib/supabase/*), the Google connect state cookie
 * (src/app/api/integrations/google/start), and the homepage appearance key
 * (src/components/marketing/landing/appearance-toggle.tsx). No analytics,
 * advertising or third-party scripts are loaded, so no consent banner is
 * shown. Adding any such tool requires a consent mechanism first.
 */
const ITEMS = [
  {
    name: "sb-…-auth-token (may be split into …-auth-token.0, .1)",
    type: "Cookie",
    purpose: "Keeps you signed in, including in the demo.",
    duration: "Until you log out, or it expires",
    kind: "Strictly necessary",
  },
  {
    name: "sb-…-auth-token-code-verifier",
    type: "Cookie",
    purpose: "Secures sign-up confirmation and password-reset links you request.",
    duration: "Until the link is used",
    kind: "Strictly necessary",
  },
  {
    name: "jarvis_oauth_google",
    type: "Cookie (encrypted)",
    purpose: "Protects the Google Calendar connection step against forgery. Only set when you connect.",
    duration: "10 minutes, deleted after use",
    kind: "Strictly necessary",
  },
  {
    name: "landing-appearance",
    type: "Browser storage",
    purpose: "Remembers the light or dark appearance you picked on our homepage. Only set when you pick one.",
    duration: "Until you remove it",
    kind: "Preference you set",
  },
] as const;

export default function CookiesPage() {
  const { legal } = brand;
  return (
    <>
      <h1 className="text-[32px] font-bold leading-tight sm:text-[36px]">Cookie Policy</h1>
      <p className="text-muted">Last updated: {legal.lastUpdated}</p>

      <p>
        Cookies and browser storage are small pieces of information a website saves in your browser. {brand.name} uses only what it needs to
        sign you in and keep the service secure, and one setting you choose yourself.
      </p>
      <p>
        <strong>We do not use analytics, advertising or tracking cookies, and we do not load third-party trackers.</strong> Because of that,
        we do not show a cookie banner: there is nothing optional to accept. If this ever changes, we will ask for your consent before
        setting any non-essential cookie, and update this page.
      </p>

      <h2>What we use</h2>
      <div
        tabIndex={0}
        role="region"
        aria-label="Cookie and storage table (scrolls sideways on small screens)"
        className="mt-4 overflow-x-auto rounded-2xl border border-hairline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
      >
        <table className="w-full min-w-[560px] text-left text-[14.5px]">
          <caption className="sr-only">Cookies and browser storage used by {brand.name}</caption>
          <thead className="bg-surface-2">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Purpose
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                How long
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Category
              </th>
            </tr>
          </thead>
          <tbody>
            {ITEMS.map((item) => (
              <tr key={item.name} className="border-t border-hairline align-top">
                <th scope="row" className="px-4 py-3 font-mono text-[13px] font-normal [overflow-wrap:anywhere]">
                  {item.name}
                  <span className="mt-1 block font-sans text-[13px] text-muted">{item.type}</span>
                </th>
                <td className="px-4 py-3">{item.purpose}</td>
                <td className="px-4 py-3">{item.duration}</td>
                <td className="px-4 py-3">{item.kind}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Fonts and icons are served from our own website, so loading our pages does not send requests to font or icon providers. When you
        connect Google Calendar, you visit Google&apos;s own sign-in pages, which set Google&apos;s cookies under{" "}
        <a href="https://policies.google.com/technologies/cookies">Google&apos;s cookie policy</a>.
      </p>

      <h2 id="preferences">Cookie preferences</h2>
      <p>
        Strictly necessary cookies can&apos;t be switched off in {brand.name}, because signing in doesn&apos;t work without them; you can
        delete them by logging out or clearing your browser&apos;s data. The appearance setting is only stored if you choose an appearance,
        and you can remove it here:
      </p>
      <CookiePreferences />

      <h2>More information</h2>
      <p>
        See our <Link href="/privacy">Privacy Policy</Link>, or contact <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>
    </>
  );
}
