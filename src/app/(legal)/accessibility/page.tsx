import type { Metadata } from "next";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description: `${brand.name}'s accessibility goals, known limitations, and how to report a barrier.`,
  alternates: { canonical: "/accessibility" },
};

/*
 * Keep this honest: we target WCAG 2.2 AA and test for it, but no
 * independent audit has been done, so the page must not claim conformance.
 */
export default function AccessibilityPage() {
  const { legal } = brand;
  const contact = <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>;
  return (
    <>
      <h1 className="text-[32px] font-bold leading-tight sm:text-[36px]">Accessibility Statement</h1>
      <p className="text-muted">Last updated: {legal.lastUpdated}</p>

      <p>
        We want everyone to be able to use {brand.name}. Our goal is for the website and web app to meet the Web Content Accessibility
        Guidelines (WCAG) 2.2 at level AA.
      </p>

      <h2>Where we are</h2>
      <p>
        {brand.name} has <strong>not</strong> yet been independently audited, so we do not claim that it fully conforms to WCAG 2.2 AA. What
        we do today:
      </p>
      <ul>
        <li>automated accessibility checks on our main pages, in light and dark appearance;</li>
        <li>keyboard-only checks of key journeys, with visible focus indicators;</li>
        <li>labels for form fields and icon-only buttons, and text alternatives for meaningful images;</li>
        <li>respect for your device&apos;s reduced-motion setting, and text that can be zoomed to 200%;</li>
        <li>light and dark appearance, and several color themes.</li>
      </ul>

      <h2>Known limitations</h2>
      <ul>
        <li>
          Some illustrations on the homepage are animated examples. They are marked as illustrations, but screen-reader users may get less
          detail from them than sighted users.
        </li>
        <li>The companion mobile app has not yet been tested with VoiceOver or TalkBack.</li>
        <li>
          Pages provided by others, such as Google&apos;s sign-in and permission screens, are outside our control.
        </li>
      </ul>

      <h2>Report a barrier</h2>
      <p>
        If something is hard or impossible to use, please tell us at {contact}. Include the page, what you were trying to do, and the device,
        browser and any assistive technology you use. We will reply and, where we can, offer another way to get what you need while we fix
        it.
      </p>
    </>
  );
}
