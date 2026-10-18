import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { brand } from "@/config/brand";
import { SMS_CONSENT_TEXT } from "@/lib/notifications/consent";
import { consentConfirmationMessage, helpMessage, stopConfirmationMessage } from "@/lib/notifications/templates";

const ROOT = path.resolve(__dirname, "../..");

/**
 * The previous product name may only survive as a technical identifier that
 * customers don't read as branding and that would break something if renamed:
 * the OAuth state cookie, mobile build env var names, the Expo slug/scheme,
 * default store identifiers, and a device storage key.
 */
const ALLOWED = [
  /jarvis_oauth_google/,
  /\bJARVIS_[A-Z_]+/,
  /EXPO_PUBLIC_JARVIS_API_URL/,
  /(slug|scheme): "jarvis"/,
  /com\.jarvis\.app/,
  /"jarvis\.health\.lastSync"/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__snapshots__" || name === "node_modules" ? [] : sourceFiles(full);
    // Test fixtures may use "Jarvis" as a user-chosen assistant name or a sample email sender.
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("brand name: Arovenna everywhere customers can see it", () => {
  it("has no leftover Jarvis branding in web or mobile source, except technical identifiers", () => {
    const files = [...sourceFiles(path.join(ROOT, "src")), ...sourceFiles(path.join(ROOT, "mobile/src")), path.join(ROOT, "mobile/App.tsx"), path.join(ROOT, "mobile/app.config.ts")];
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .map((line, i) => ({ line, at: `${path.relative(ROOT, file)}:${i + 1}` }))
        .filter(({ line }) => /jarvis/i.test(ALLOWED.reduce((l, re) => l.replace(new RegExp(re, "g"), ""), line))),
    );
    expect(offenders.map((o) => `${o.at}: ${o.line.trim()}`)).toEqual([]);
  });

  it("SMS sender name, consent wording and SMS templates say Arovenna", () => {
    expect(brand.smsBrandName).toBe("Arovenna");
    expect(SMS_CONSENT_TEXT).toContain("text messages from Arovenna");
    expect(consentConfirmationMessage()).toMatch(/^Arovenna: /);
    expect(helpMessage()).toMatch(/^Arovenna accountability texts\./);
    expect(stopConfirmationMessage()).toMatch(/^Arovenna: /);
    for (const text of [SMS_CONSENT_TEXT, consentConfirmationMessage(), helpMessage(), stopConfirmationMessage()]) {
      expect(text).not.toMatch(/jarvis/i);
    }
  });

  it("keeps the required SMS disclosures in the confirmation and help texts", () => {
    expect(consentConfirmationMessage()).toContain("Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.");
    expect(helpMessage()).toContain("Reply STOP to opt out.");
    expect(helpMessage()).toContain(brand.supportEmail);
  });

  it("names the mobile app Arovenna", () => {
    const config = readFileSync(path.join(ROOT, "mobile/app.config.ts"), "utf8");
    expect(config).toContain('name: "Arovenna"');
    expect(config).toMatch(/"Arovenna reads your steps/);
  });
});
