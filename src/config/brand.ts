/**
 * Central branding. Change the product name, tagline and copy here — nothing
 * else in the codebase hard-codes the brand.
 */
/** The product name. Change it here and everything follows. */
const NAME = "Arovenna";

export const brand = {
  name: NAME,
  /** Default name for a user's assistant until they choose their own (Settings → Your AI). Names users chose are kept. */
  assistantName: NAME,
  /**
   * The sender name in SMS texts and the SMS consent wording. These texts are
   * registered with the carrier (Twilio campaign) under the previous name, so
   * they keep it until that registration is updated — then change this to NAME.
   */
  smsBrandName: "Jarvis",
  tagline: "Your AI should know your life.",
  /** The product category, used on the landing page and in metadata. */
  category: "AI accountability partner",
  /** The core promise, phrased in different ways across the landing page. */
  promise: "Turn the things you want to do into the things you actually do.",
  subheadline: "Your AI accountability partner — it knows your goals and your schedule, and helps you follow through.",
  description:
    `${NAME} is your AI accountability partner. Tell it what you're trying to accomplish — it plans around your calendar, goals and energy, checks in, and helps you turn the things you want to do into the things you actually do.`,
  /** The canonical public address (metadata, canonical links, social cards). */
  siteUrl: "https://www.arovenna.com",
  /** Monitored support mailbox (confirmed active by the owner). Also used for privacy requests. */
  supportEmail: "Support@arovenna.com",
  /**
   * Legal details used by the policy pages (/privacy, /terms, /subscriptions,
   * /cookies, /accessibility, /privacy-requests). Still to confirm before
   * launch: the operating entity's registered legal name and address, and the
   * governing-law jurisdiction. Values left null are omitted from the pages
   * rather than invented.
   */
  legal: {
    /** The operator's name as shown in the policies. Replace with the registered legal entity once confirmed. */
    entityName: NAME,
    /** Registered business address, or null until confirmed. */
    postalAddress: null as string | null,
    privacyEmail: "Support@arovenna.com",
    governingLaw: null as string | null,
    minimumAge: 13,
    lastUpdated: "October 12, 2026",
  },
} as const;

export type Brand = typeof brand;
