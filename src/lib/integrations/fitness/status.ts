/**
 * Connection state of a health source, as shown in Settings and returned to
 * the native apps (pure; unit-tested). Derived from the existing
 * integration_connections row — no extra state is stored:
 *
 *  - not_connected   no row
 *  - syncing         connected on the phone, first data not received yet
 *  - connected       data received recently
 *  - needs_attention the phone reported a problem (e.g. permission removed),
 *                    or no data has arrived for STALE_AFTER_DAYS
 */
export type FitnessConnectionState = "not_connected" | "syncing" | "connected" | "needs_attention";

/** Problems the native app can report. Stored as `last_error` (a code, never health data). */
export const FITNESS_ISSUES = ["permission_denied", "sync_failed"] as const;
export type FitnessIssue = (typeof FITNESS_ISSUES)[number] | "stale";

export const STALE_AFTER_DAYS = 3;
/** How long a fresh connection counts as "syncing" before it needs attention. */
const FIRST_SYNC_GRACE_HOURS = 24;

export interface FitnessConnectionRow {
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

export function fitnessConnectionState(row: FitnessConnectionRow | null, now: Date = new Date()): { state: FitnessConnectionState; issue: FitnessIssue | null } {
  if (!row) return { state: "not_connected", issue: null };
  if (row.status !== "connected") {
    const issue = (FITNESS_ISSUES as readonly string[]).includes(row.last_error ?? "") ? (row.last_error as FitnessIssue) : "sync_failed";
    return { state: "needs_attention", issue };
  }
  if (!row.last_synced_at) {
    const age = now.getTime() - Date.parse(row.created_at);
    return age > FIRST_SYNC_GRACE_HOURS * 3600_000 ? { state: "needs_attention", issue: "stale" } : { state: "syncing", issue: null };
  }
  if (now.getTime() - Date.parse(row.last_synced_at) > STALE_AFTER_DAYS * 86_400_000) return { state: "needs_attention", issue: "stale" };
  return { state: "connected", issue: null };
}
