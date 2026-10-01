import { accessToken } from "./auth";
import { config } from "./config";
import type { HealthProvider, SyncPayload } from "./health/types";

/**
 * Client for the existing Jarvis native endpoints (/api/integrations/fitness/*).
 * Every call carries the signed-in user's Supabase access token; the server
 * takes the user id ONLY from that token. A 401 is retried once with a
 * refreshed token.
 */
export type SourceState = "not_connected" | "syncing" | "connected" | "needs_attention";
export interface SourceStatus {
  provider: HealthProvider;
  state: SourceState;
  issue: "permission_denied" | "sync_failed" | "stale" | null;
  lastSyncedAt: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  for (const refresh of [false, true]) {
    const token = await accessToken(refresh);
    if (!token) throw new ApiError(401, "Signed out");
    const res = await fetch(`${config.apiUrl}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${token}`, ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (res.status === 401 && !refresh) continue;
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`);
    return json;
  }
  throw new ApiError(401, "Signed out");
}

export const api = {
  status: () => call<{ sources: SourceStatus[] }>("/api/integrations/fitness/status", { method: "GET" }),
  connect: (provider: HealthProvider) => call<{ connected: boolean }>("/api/integrations/fitness/connect", { method: "POST", body: { provider } }),
  sync: (payload: SyncPayload) => call<{ ok: true; days: number; workouts: number; skipped: number }>("/api/integrations/fitness/sync", { method: "POST", body: payload }),
  report: (provider: HealthProvider, issue: "permission_denied" | "sync_failed") =>
    call<{ reported: boolean }>("/api/integrations/fitness/status", { method: "POST", body: { provider, issue } }),
  disconnect: (provider: HealthProvider) => call<{ disconnected: boolean }>("/api/integrations/fitness/disconnect", { method: "POST", body: { provider } }),
};
