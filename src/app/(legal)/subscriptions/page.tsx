import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Subscription & Refund Policy",
  description: `How ${brand.name} plans, billing, cancellation and refunds work.`,
  alternates: { canonical: "/subscriptions" },
};

/*
 * No payments are implemented: the app has no checkout, prices, trials or
 * billing provider. This page states that plainly. Before any paid plan
 * launches, the open decisions in docs/launch/legal-launch-readiness.md
 * (prices, billing periods, trials, refund rules, store purchases) must be
 * settled and this page rewritten to match the checkout exactly.
 */
export default function SubscriptionsPage() {
  const { legal } = brand;
  return (
    <>
      <h1 className="text-[32px] font-bold leading-tight sm:text-[36px]">Subscription &amp; Refund Policy</h1>
      <p className="text-muted">Last updated: {legal.lastUpdated}</p>

      <h2>{brand.name} is currently free</h2>
      <p>
        You can create an account and use {brand.name} without paying. We do not currently offer paid plans, we do not run free trials that
        turn into paid subscriptions, and we never ask for payment card details. Nothing in the app will charge you.
      </p>

      <h2>If we introduce paid plans</h2>
      <p>Before anyone can buy a paid plan, we will update this page and show the same information at the point of purchase, including:</p>
      <ul>
        <li>which features stay free and which are paid;</li>
        <li>the price, including taxes where required, and whether billing is monthly or yearly;</li>
        <li>whether and when the plan renews automatically, and how we remind you before a renewal;</li>
        <li>how to cancel, which will be as easy as signing up;</li>
        <li>our refund rules, and any rights you have under local law, such as a right to withdraw;</li>
        <li>
          for purchases made through the Apple App Store or Google Play, that billing, cancellation and refunds are handled by that store
          under its own rules.
        </li>
      </ul>
      <p>
        We will not move features you already use for free behind a paywall, or start charging you, without telling you in advance and
        getting your agreement.
      </p>

      <h2>Questions</h2>
      <p>
        Contact <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>. See also our <Link href="/terms">Terms of Service</Link>.
      </p>
    </>
  );
}
