"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client. Only uses the public URL + publishable (anon) key; every
 * query is subject to Row Level Security.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
  );
}
