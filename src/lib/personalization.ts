import { z } from "zod";
import { brand } from "@/config/brand";
import type { AccountabilityStyle, Profile } from "@/lib/types/domain";

/**
 * Per-user personalization: what the user calls their assistant, how it
 * communicates, and the app's theme. Stored on the profile (see migration
 * 20261003000000_personalization.sql). Null columns mean "use the default",
 * so every reader goes through resolvePersonalization().
 */

export const PERSONALITIES = ["supportive", "direct", "motivational", "tough_love", "professional"] as const;
export type Personality = (typeof PERSONALITIES)[number];

export const THEMES = ["ocean", "midnight", "violet", "rose", "emerald", "warm"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_ASSISTANT_NAME: string = brand.assistantName;
export const DEFAULT_PERSONALITY: Personality = "supportive";
export const DEFAULT_THEME: Theme = "ocean";
export const ASSISTANT_NAME_MAX = 24;
export const ASSISTANT_NAME_SUGGESTIONS = ["Jarvis", "Nova", "Atlas", "Friday", "Coach"] as const;

export const PERSONALITY_OPTIONS: { value: Personality; title: string; body: string; example: string }[] = [
  { value: "supportive", title: "Supportive", body: "Encouraging, patient, and positive.", example: "“Nice work yesterday. Want to start with a quick 20 minutes on your course?”" },
  { value: "direct", title: "Direct", body: "Clear, concise, and straightforward.", example: "“Workout's at 6:30. Still happening?”" },
  { value: "motivational", title: "Motivational", body: "High-energy and encouraging.", example: "“Three workouts down — let's make it four today!”" },
  { value: "tough_love", title: "Tough Love", body: "Calls out excuses while remaining respectful.", example: "“That's two skipped study sessions. When exactly are you doing it today?”" },
  { value: "professional", title: "Professional", body: "Calm, structured, and businesslike.", example: "“Today: two priorities, one open block at 7:00 PM. I'd put the report there.”" },
];

export const THEME_OPTIONS: { value: Theme; title: string; from: string; to: string }[] = [
  { value: "ocean", title: "Ocean", from: "#14b3a4", to: "#0a84d6" },
  { value: "midnight", title: "Midnight", from: "#6d8bff", to: "#3a4fd6" },
  { value: "violet", title: "Violet", from: "#a26bff", to: "#6a4cf5" },
  { value: "rose", title: "Rose", from: "#ff7aa2", to: "#e0457b" },
  { value: "emerald", title: "Emerald", from: "#34d399", to: "#0e9f6e" },
  { value: "warm", title: "Warm Light", from: "#f5a524", to: "#e0602a" },
];

/**
 * Assistant name: 1–24 characters of letters, numbers, spaces, apostrophes,
 * hyphens or periods, starting with a letter or number. Deliberately narrow —
 * the name is placed into system prompts, so it cannot carry punctuation-heavy
 * text or markup.
 */
export const assistantNameSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Give your assistant a name.")
      .max(ASSISTANT_NAME_MAX, `Keep it under ${ASSISTANT_NAME_MAX + 1} characters.`)
      .regex(/^[\p{L}\p{N}][\p{L}\p{N}\p{M} '’.-]*$/u, "Use letters, numbers, spaces, apostrophes or hyphens."),
  );
export const personalitySchema = z.enum(PERSONALITIES);
export const themeSchema = z.enum(THEMES);

/** Older 3-option accountability style → closest personality. */
const LEGACY_STYLE: Record<AccountabilityStyle, Personality> = {
  gentle: "supportive",
  balanced: "supportive",
  direct: "direct",
};

export interface Personalization {
  assistantName: string;
  personality: Personality;
  theme: Theme;
}

export type PersonalizationSource = Partial<Pick<Profile, "assistant_name" | "assistant_personality" | "theme" | "accountability_style">>;

/** Safe, validated personalization for any profile (including null or partially selected rows). */
export function resolvePersonalization(profile: PersonalizationSource | null | undefined): Personalization {
  const name = assistantNameSchema.safeParse(profile?.assistant_name ?? "");
  const personality = personalitySchema.safeParse(profile?.assistant_personality);
  const theme = themeSchema.safeParse(profile?.theme);
  const legacy = profile?.accountability_style ? LEGACY_STYLE[profile.accountability_style] : undefined;
  return {
    assistantName: name.success ? name.data : DEFAULT_ASSISTANT_NAME,
    personality: personality.success ? personality.data : (legacy ?? DEFAULT_PERSONALITY),
    theme: theme.success ? theme.data : DEFAULT_THEME,
  };
}

/** The assistant's identity as used by prompts and messages. */
export interface AssistantPersona {
  name: string;
  personality: Personality;
}

export function personaFrom(profile: PersonalizationSource | null | undefined): AssistantPersona {
  const p = resolvePersonalization(profile);
  return { name: p.assistantName, personality: p.personality };
}

export const DEFAULT_PERSONA: AssistantPersona = { name: DEFAULT_ASSISTANT_NAME, personality: DEFAULT_PERSONALITY };

/** Columns to select wherever a persona is needed from a partial profile query. */
export const PERSONA_COLUMNS = "assistant_name, assistant_personality, accountability_style";
