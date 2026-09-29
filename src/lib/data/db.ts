import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Either a user-session client (RLS applies) or the service-role client.
 * Data functions always filter by user_id explicitly so they are safe with
 * both.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = SupabaseClient<any, "public", any>;

export class DataError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "DataError";
  }
}

export function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new DataError(`Failed to load ${what}`, result.error);
  return result.data as T;
}
