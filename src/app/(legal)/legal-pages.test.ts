import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";
import { LEGAL_PAGES, LegalLinks } from "@/components/legal/legal-links";
import { LANDING_APPEARANCE_KEY } from "@/components/marketing/landing/appearance-toggle";
import { OAUTH_COOKIE } from "@/lib/integrations/oauth-state";
import { isPublicPath } from "@/lib/routes";
import { ACTION_TOOLS } from "@/lib/assistant/actions/registry";
import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";
import SubscriptionsPage from "./subscriptions/page";
import CookiesPage from "./cookies/page";
import AccessibilityPage from "./accessibility/page";
import PrivacyRequestsPage from "./privacy-requests/page";

const PAGES: Record<(typeof LEGAL_PAGES)[number]["href"], ComponentType> = {
  "/privacy": PrivacyPage,
  "/terms": TermsPage,
  "/subscriptions": SubscriptionsPage,
  "/cookies": CookiesPage,
  "/accessibility": AccessibilityPage,
  "/privacy-requests": PrivacyRequestsPage,
};

const html = (page: ComponentType) => renderToStaticMarkup(createElement(page));
/** Visible text, roughly: tags removed, entities for quotes decoded. */
const text = (page: ComponentType) =>
  html(page)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&ldquo;|&rdquo;|“|”/g, '"')
    .replace(/\s+/g, " ");

describe("brand contact details", () => {
  it("uses the confirmed support mailbox, not placeholders", () => {
    expect(brand.supportEmail).toBe("Support@arovenna.com");
    expect(brand.legal.privacyEmail).toBe("Support@arovenna.com");
    expect(JSON.stringify(brand)).not.toMatch(/example\.(com|org|net)/i);
  });
});

describe.each(Object.entries(PAGES))("policy page %s", (href, Page) => {
  it("is public, has one h1 and a last-updated date", () => {
    expect(isPublicPath(href)).toBe(true);
    const markup = html(Page);
    expect(markup.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(text(Page)).toContain(`Last updated: ${brand.legal.lastUpdated}`);
  });

  it("has no placeholders or drafting notes", () => {
    const t = text(Page);
    expect(t).not.toMatch(/example\.com|\[confirm|TODO|TBD|lorem ipsum|XX/i);
    expect(t).not.toContain("undefined");
    expect(t).not.toContain("null");
  });

  it("is linked from the footer", () => {
    expect(renderToStaticMarkup(createElement(LegalLinks))).toContain(`href="${href}"`);
  });

  it("only links to pages that exist", () => {
    const internal = [...html(Page).matchAll(/href="(\/[^"#]*)/g)].map((m) => m[1]);
    for (const path of internal) expect(["/", "/demo", ...Object.keys(PAGES)]).toContain(path);
  });
});

describe("footer", () => {
  it("offers cookie preferences and support", () => {
    const markup = renderToStaticMarkup(createElement(LegalLinks));
    expect(markup).toContain('href="/cookies#preferences"');
    expect(markup).toContain(`href="mailto:${brand.supportEmail}"`);
    expect(markup).toContain('aria-label="Legal and support"');
  });
});

describe("privacy policy content", () => {
  const t = text(PrivacyPage);

  it("discloses Google Calendar access, storage and Limited Use", () => {
    expect(t).toContain("View and edit events on all your calendars");
    expect(t).toContain("primary calendar");
    expect(t).toContain("Limited Use");
    expect(html(PrivacyPage)).toContain('href="https://developers.google.com/terms/api-services-user-data-policy"');
    expect(t).toContain("myaccount.google.com/permissions");
    expect(t).toMatch(/do not use it to develop, improve or train generalized AI/);
  });

  it("does not overstate retention, revocation or what is kept from event details", () => {
    // Pruning of past events only happens during a full sync (sync.ts); revocation is best effort (disconnectGoogleCalendar).
    expect(t).toContain("only when a full sync runs");
    expect(t).not.toMatch(/past events for up to 35 days/);
    expect(t).toContain("even if that request to Google fails");
    expect(t).not.toMatch(/we revoke Arovenna's access at Google/);
    expect(t).toMatch(/saved in your conversation history/);
    expect(t).not.toMatch(/and we do not keep them/);
  });

  it("does not present the OpenAI storage setting as a guarantee that nothing is retained", () => {
    expect(t).toContain("doesn't by itself stop OpenAI from keeping data");
    expect(t).not.toMatch(/storage turned off, so conversation history is kept in our database rather than by OpenAI/);
  });

  it("names the sender our texts actually use (Arovenna)", () => {
    expect(brand.smsBrandName).toBe("Arovenna");
    expect(t).toContain('sent under the name "Arovenna"');
    expect(t).not.toMatch(/jarvis/i);
  });

  it("explains Calendar disconnection separately from account deletion", () => {
    expect(t).toContain("Disconnecting Google Calendar does not delete your Arovenna account");
    expect(html(PrivacyPage)).toContain('id="google-calendar"');
    expect(html(PrivacyPage)).toContain('id="retention"');
  });

  it("names every processor the code uses", () => {
    for (const p of ["Supabase", "Vercel", "OpenAI", "Twilio", "Resend", "Google"]) expect(t).toContain(p);
  });

  it("states the contact address and minimum age", () => {
    expect(t).toContain(brand.legal.privacyEmail);
    expect(t).toContain(`at least ${brand.legal.minimumAge}`);
  });
});

describe("terms", () => {
  it("says which assistant changes need approval and which happen straight away (matches tool risk levels)", () => {
    const t = text(TermsPage);
    expect(t).not.toMatch(/only changes your calendar, tasks or plans when you approve/);
    expect(t).toContain("without a separate approval step");
  });

  it("names the SMS sender and the real support contact", () => {
    const t = text(TermsPage);
    expect(t).toContain('sent under the name "Arovenna"');
    expect(t).not.toMatch(/jarvis/i);
    expect(t).toContain("Support@arovenna.com");
    expect(t).not.toMatch(/example\.com/);
  });

  it("matches the assistant's actual approval rules (update both if a tool's risk changes)", () => {
    const byRisk = (risk: string) => ACTION_TOOLS.filter((d) => d.risk === risk && !d.needsConfirmation).map((d) => d.name).sort();
    // Terms: "asks for your approval before it changes your calendar, replans your day, … deletes a goal or a saved note, or cancels a task"
    expect(byRisk("confirm")).toEqual(
      ["cancel_task", "create_calendar_event", "delete_calendar_event", "delete_goal", "delete_memory", "replan_today", "reschedule_calendar_event", "update_calendar_event"].sort(),
    );
    // Terms: "changes a goal's target or deadline" — update_goal asks only for those fields.
    const conditional = ACTION_TOOLS.filter((d) => d.needsConfirmation).map((d) => d.name);
    expect(conditional).toEqual(["update_goal"]);
    // Terms: "Other changes … happen straight away without a separate approval step"
    expect(byRisk("direct")).toEqual(["complete_task", "create_goal", "create_task", "record_progress", "reschedule_task", "save_memory", "set_goal_status", "update_memory"].sort());
  });

  it("omits governing law until it is confirmed", () => {
    expect(brand.legal.governingLaw).toBeNull();
    expect(text(TermsPage)).not.toContain("Governing law");
  });
});

describe("subscription policy", () => {
  it("states the service is free and invents no prices, trials or refund windows", () => {
    const t = text(SubscriptionsPage);
    expect(t).toContain("is currently free");
    expect(t).not.toMatch(/[$€£]\s?\d|\d+\s?(day|days)\b|per month|per year/i);
  });
});

describe("cookie policy", () => {
  it("lists the cookie and storage names the code actually sets", () => {
    const t = text(CookiesPage);
    expect(t).toContain(OAUTH_COOKIE);
    expect(t).toContain(LANDING_APPEARANCE_KEY);
    expect(t).toContain("auth-token");
    // Names @supabase/auth-js uses for PKCE verifiers (observed in the browser after sign-up).
    expect(t).toContain("auth-token-code-verifier");
    expect(t).toContain("auth-token-flows-code-verifier");
    expect(t).toContain("auth-token-flow-…-code-verifier");
    expect(html(CookiesPage)).toContain('id="preferences"');
  });
});

describe("accessibility statement", () => {
  it("does not claim conformance", () => {
    const t = text(AccessibilityPage);
    expect(t).toContain("WCAG 2.2");
    expect(t).toMatch(/do not claim that it fully conforms/);
    expect(t).not.toMatch(/\bis (fully )?(WCAG )?compliant\b|\bfully accessible\b/i);
  });
});
