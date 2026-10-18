import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { brand } from "@/config/brand";

vi.mock("@/lib/actions/notifications", () => ({ savePhoneAndConsent: async () => ({ ok: false }) }));

const { SMS_CONSENT_TEXT } = await import("@/lib/notifications/consent");
const { PhoneForm } = await import("./phone-form");

const render = (consented: boolean) => renderToStaticMarkup(createElement(PhoneForm, { phone: null, consented, submitLabel: "Save and finish" }));
const checkbox = (html: string) => html.match(/<input[^>]*name="sms_consent"[^>]*>/)?.[0] ?? "";

describe("SMS consent wording (onboarding's last step and Settings)", () => {
  it("names Arovenna, not Jarvis", () => {
    expect(brand.name).toBe("Arovenna");
    expect(SMS_CONSENT_TEXT).toContain("text messages from Arovenna");
    expect(SMS_CONSENT_TEXT).toContain("Consent is not a condition of using Arovenna.");
    expect(SMS_CONSENT_TEXT).not.toMatch(/jarvis/i);
  });

  it("keeps the required disclosures", () => {
    for (const phrase of ["recurring", "Message frequency varies", "Message and data rates may apply", "Reply STOP to opt out", "HELP for help", "Consent is not a condition"]) {
      expect(SMS_CONSENT_TEXT).toContain(phrase);
    }
  });

  it("shows the consent text next to an optional checkbox that is not preselected", () => {
    const html = render(false);
    expect(html).toContain("text messages from Arovenna");
    expect(html).not.toMatch(/jarvis/i);
    const box = checkbox(html);
    expect(box).toContain('type="checkbox"');
    expect(box).not.toMatch(/\bchecked\b/);
    expect(box).not.toMatch(/\brequired\b/);
  });

  it("reflects an existing consent only when the user already gave it", () => {
    expect(checkbox(render(true))).toMatch(/\bchecked\b/);
  });
});
