import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseServiceKey, supabaseUrl } from "@/lib/env";

/**
 * Service-role client. BYPASSES Row Level Security.
 *
 * Only use from trusted server contexts that have no user session (cron jobs,
 * verified Twilio webhooks, writing notification records) and always scope
 * queries by an explicit, already-authorized user id.
 */
export function createAdminClient() {
  const key = supabaseServiceKey();
  if (!key) return null;
  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
