import { z } from "zod";

/**
 * Helpers for the strict JSON schemas sent to OpenAI. Strict mode requires
 * every property to be listed in `required` and no extra properties;
 * optional values are expressed as nullable.
 */
type Json = Record<string, unknown>;

export const J = {
  string: (description: string, extra: Json = {}): Json => ({ type: "string", description, ...extra }),
  number: (description: string): Json => ({ type: "number", description }),
  integer: (description: string): Json => ({ type: "integer", description }),
  boolean: (description: string): Json => ({ type: "boolean", description }),
  enumOf: (values: readonly string[], description: string): Json => ({ type: "string", enum: [...values], description }),
  nullable: (schema: Json): Json => ({ anyOf: [schema, { type: "null" }] }),
  object: (properties: Record<string, Json>): Json => ({
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  }),
};

// Shared Zod building blocks (server-side authority).
export const zId = z.uuid("That doesn't look like a valid id.");
export const zDateInput = z
  .string()
  .trim()
  .regex(/^(today|tomorrow|yesterday|\d{4}-\d{2}-\d{2})$/i, "Use today, tomorrow or YYYY-MM-DD");
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24h HH:MM");
export const zTitle = z.string().trim().min(1).max(200);
export const zNullableText = (max: number) => z.string().trim().max(max).nullable();
