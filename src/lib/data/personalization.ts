import { z } from "zod";
import type { DB } from "@/lib/data/db";
import { appearanceSchema, assistantNameSchema, personalitySchema, resolvePersonalization, themeSchema, type Personalization } from "@/lib/personalization";

/** A partial update — only the provided fields change. Unknown keys are rejected. */
export const personalizationUpdateSchema = z
  .object({
    assistant_name: assistantNameSchema.optional(),
    assistant_personality: personalitySchema.optional(),
    theme: themeSchema.optional(),
    appearance: appearanceSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

export type PersonalizationUpdate = z.infer<typeof personalizationUpdateSchema>;

export type PersonalizationResult =
  | { ok: true; personalization: Personalization }
  | { ok: false; reason: "invalid"; fieldErrors: Record<string, string> }
  | { ok: false; reason: "server_error" };

/**
 * Validate and store the signed-in user's personalization. `userId` must come
 * from the authenticated session; the update is scoped to that row both by
 * the explicit filter and by RLS.
 */
export async function updatePersonalization(db: DB, userId: string, input: unknown): Promise<PersonalizationResult> {
  const parsed = personalizationUpdateSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { ok: false, reason: "invalid", fieldErrors };
  }
  const { data, error } = await db
    .from("profiles")
    .update(parsed.data)
    .eq("id", userId)
    .select("assistant_name, assistant_personality, theme, appearance, accountability_style")
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "server_error" };
  return { ok: true, personalization: resolvePersonalization(data) };
}

/** The user's personalization with defaults applied (safe for missing rows). */
export async function getPersonalization(db: DB, userId: string): Promise<Personalization> {
  const { data } = await db
    .from("profiles")
    .select("assistant_name, assistant_personality, theme, appearance, accountability_style")
    .eq("id", userId)
    .maybeSingle();
  return resolvePersonalization(data);
}
