/**
 * Central branding. Change the product name, tagline and copy here — nothing
 * else in the codebase hard-codes the brand.
 */
export const brand = {
  name: "LifePilot",
  assistantName: "LifePilot",
  tagline: "Your AI accountability partner.",
  subheadline: "Set your goals. Plan your time. Stay accountable.",
  description:
    "LifePilot helps you turn the things you want to do into things you actually do. Set your goals, build your day, and get proactive accountability from an AI assistant that remembers what you're working toward.",
  supportEmail: "support@example.com",
  /**
   * Legal details used by /privacy and /terms. REPLACE before launch:
   * the operating company's legal name, a monitored privacy contact, and the
   * governing-law jurisdiction (leave null to omit that clause).
   */
  legal: {
    entityName: "LifePilot",
    privacyEmail: "privacy@example.com",
    governingLaw: null as string | null,
    minimumAge: 13,
    lastUpdated: "September 29, 2026",
  },
} as const;

export type Brand = typeof brand;
