import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import { isHttpsRequest, sessionCookieOptions } from "./cookie-options";

/**
 * Supabase client bound to the current request's user session. All queries
 * run under Row Level Security as that user. Create one per request.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const https = isHttpsRequest((await headers()).get("x-forwarded-proto"));

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookieOptions: sessionCookieOptions(https),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes sessions, so this is safe to ignore.
        }
      },
    },
  });
}
