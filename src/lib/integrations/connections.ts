import { hasCalendarWriteAccess } from "./calendar/scopes";
import type { DB } from "@/lib/data/db";

export type IntegrationProvider = "google_calendar" | "apple_calendar" | "apple_health" | "health_connect";
export type IntegrationKind = "calendar" | "fitness";

/** What the UI and AI may know about a connection. Never includes tokens. */
export interface ConnectionSummary {
  provider: IntegrationProvider;
  kind: IntegrationKind;
  status: "connected" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
  connectedAt: string;
  /** Calendars: the grant allows creating and changing events (not just reading). */
  writable: boolean;
}

/**
 * The user's integrations. Safe before the integrations migration is applied
 * (returns none), so the rest of the app keeps working.
 */
export async function getConnections(db: DB, userId: string): Promise<ConnectionSummary[]> {
  const { data, error } = await db
    .from("integration_connections")
    .select("provider, kind, status, last_synced_at, last_error, created_at, scopes")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((c) => ({
    provider: c.provider as IntegrationProvider,
    kind: c.kind as IntegrationKind,
    status: c.status as "connected" | "error",
    lastSyncedAt: c.last_synced_at as string | null,
    lastError: c.last_error as string | null,
    connectedAt: c.created_at as string,
    writable: c.kind === "calendar" && hasCalendarWriteAccess((c.scopes as string[] | null) ?? []),
  }));
}

export const PROVIDER_LABEL: Record<IntegrationProvider, string> = {
  google_calendar: "Google Calendar",
  apple_calendar: "Apple Calendar",
  apple_health: "Apple Health",
  health_connect: "Health Connect",
};
