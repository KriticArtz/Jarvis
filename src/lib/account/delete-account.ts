import "server-only";
import type { DB } from "@/lib/data/db";
import { logError, logInfo } from "@/lib/observability/log";
import { disconnectGoogleCalendar } from "@/lib/integrations/calendar/sync";

/**
 * Permanently delete a user. Deleting the auth user cascades to every
 * user-owned table (enforced by foreign keys with ON DELETE CASCADE and
 * verified by supabase/tests/rls_test.sql). `admin` must be the service-role
 * client — never exposed to the browser.
 */
export async function deleteUserAndData(admin: DB, userId: string): Promise<{ ok: boolean }> {
  // Revoke third-party access first (best effort); the cascade removes the rest.
  try {
    await disconnectGoogleCalendar(admin, userId);
  } catch (err) {
    logError("account", "could not revoke Google Calendar access", { userId, message: (err as Error).message });
  }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    logError("account", "deletion failed", { userId, status: error.status, code: error.code, message: error.message });
    return { ok: false };
  }
  logInfo("account", "deleted", { userId });
  return { ok: true };
}
