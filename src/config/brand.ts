/**
 * Central branding. Change the product name, tagline and copy here — nothing
 * else in the codebase hard-codes the brand.
 */
/** The product name — temporary. Change it here and everything follows. */
const NAME = "Jarvis";

export const brand = {
  name: NAME,
  /** Default name for a user's assistant until they choose their own (Settings → Your AI). */
  assistantName: NAME,
  tagline: "Your AI should know your life.",
  /** The product category, used on the landing page and in metadata. */
  category: "AI accountability partner",
  /** The core promise, phrased in different ways across the landing page. */
  promise: "Turn the things you want to do into the things you actually do.",
  subheadline: "Your AI accountability partner — it knows your goals and your schedule, and helps you follow through.",
  description:
    `${NAME} is your AI accountability partner. Tell it what you're trying to accomplish — it plans around your calendar, goals and energy, checks in, and helps you turn the things you want to do into the things you actually do.`,
  supportEmail: "support@example.com",
  /**
   * Legal details used by /privacy and /terms. REPLACE before launch:
   * the operating company's legal name, a monitored privacy contact, and the
   * governing-law jurisdiction (leave null to omit that clause).
   */
  legal: {
    entityName: NAME,
    privacyEmail: "privacy@example.com",
    governingLaw: null as string | null,
    minimumAge: 13,
    lastUpdated: "September 29, 2026",
  },
} as const;

export type Brand = typeof brand;
