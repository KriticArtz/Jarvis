import "server-only";
import type { DB } from "@/lib/data/db";
import { integrationsEncryptionKey, type PlaidConfig } from "@/lib/env";
import { seal, unseal } from "@/lib/integrations/crypto";
import { errorInfo, logError } from "@/lib/observability/log";
import { localDate } from "@/lib/time";
import { normalizeAccount, normalizeTransaction } from "./plaid-normalize";
import { createLinkToken, exchangePublicToken, getAccounts, getInstitution, PlaidError, removeItem, syncTransactions, type HistoryStatus } from "./plaid";
import { detectRecurring } from "./recurring";
import { addDaysIso, type MoneyTxn } from "./summary";

/**
 * Plaid → database. Runs server-side with the service-role client AFTER the
 * caller has authenticated the user; every query is also scoped to that
 * user. Access tokens are encrypted before they're stored and decrypted only
 * here, bound to the user and the item (a token copied into another row
 * won't decrypt).
 */

export const MAX_CONNECTIONS = 10;
const purpose = (userId: string, itemId: string) => `plaid:access:${userId}:${itemId}`;

export type SyncFailure = "not_configured" | "not_found" | "reauth_required" | "provider_error" | "limit";

async function accessTokenFor(admin: DB, userId: string, connectionId: string): Promise<{ token: string; cursor: string | null; itemId: string } | null> {
  const key = integrationsEncryptionKey();
  if (!key) return null;
  const { data: conn } = await admin.from("financial_connections").select("id, item_id").eq("id", connectionId).eq("user_id", userId).maybeSingle();
  if (!conn) return null;
  const { data: cred } = await admin.from("financial_credentials").select("access_token_enc, sync_cursor").eq("connection_id", connectionId).eq("user_id", userId).maybeSingle();
  const token = unseal(key, purpose(userId, String(conn.item_id)), cred?.access_token_enc as string | undefined);
  return token ? { token, cursor: (cred?.sync_cursor as string | null) ?? null, itemId: String(conn.item_id) } : null;
}

export async function linkToken(cfg: PlaidConfig, admin: DB, userId: string, reconnectId?: string): Promise<{ ok: true; token: string } | { ok: false; reason: SyncFailure }> {
  try {
    if (reconnectId) {
      const access = await accessTokenFor(admin, userId, reconnectId);
      if (!access) return { ok: false, reason: "not_found" };
      return { ok: true, token: await createLinkToken(cfg, userId, access.token) };
    }
    const { count } = await admin.from("financial_connections").select("id", { count: "exact", head: true }).eq("user_id", userId);
    if ((count ?? 0) >= MAX_CONNECTIONS) return { ok: false, reason: "limit" };
    return { ok: true, token: await createLinkToken(cfg, userId) };
  } catch (err) {
    logError("money", "link token failed", { code: err instanceof PlaidError ? err.code : errorInfo(err).message });
    return { ok: false, reason: "provider_error" };
  }
}

/** Exchange Link's public token, store the (encrypted) access token, and run the first sync. */
const FIRST_SYNC_POLLS = 5;
const FIRST_SYNC_POLL_MS = 2_000;

export async function connectItem(cfg: PlaidConfig, admin: DB, userId: string, publicToken: string): Promise<{ ok: true; connectionId: string; history: HistoryStatus } | { ok: false; reason: SyncFailure }> {
  const key = integrationsEncryptionKey();
  if (!key) return { ok: false, reason: "not_configured" };
  try {
    const { accessToken, itemId } = await exchangePublicToken(cfg, publicToken);
    const institution = await getInstitution(cfg, accessToken);
    // An item belongs to exactly one user: never let an upsert move it to someone else.
    const { data: existing } = await admin.from("financial_connections").select("user_id").eq("provider", "plaid").eq("item_id", itemId).maybeSingle();
    if (existing && existing.user_id !== userId) return { ok: false, reason: "provider_error" };
    const { data: conn, error } = await admin
      .from("financial_connections")
      .upsert(
        { user_id: userId, provider: "plaid", item_id: itemId, institution_id: institution.id, institution_name: institution.name, status: "connected", last_error: null },
        { onConflict: "provider,item_id" },
      )
      .select("id, user_id")
      .single();
    if (error || !conn || conn.user_id !== userId) return { ok: false, reason: "provider_error" };
    await admin
      .from("financial_credentials")
      .upsert({ connection_id: conn.id, user_id: userId, access_token_enc: seal(key, purpose(userId, itemId), accessToken), sync_cursor: null }, { onConflict: "connection_id" });
    // Plaid imports history right after Link; without webhooks, wait briefly for the first batch.
    let res = await syncConnection(cfg, admin, userId, conn.id as string);
    for (let i = 0; i < FIRST_SYNC_POLLS && res.ok && res.history === "pending"; i++) {
      await new Promise((r) => setTimeout(r, FIRST_SYNC_POLL_MS));
      res = await syncConnection(cfg, admin, userId, conn.id as string);
    }
    return { ok: true, connectionId: conn.id as string, history: res.ok ? res.history : "pending" };
  } catch (err) {
    logError("money", "connect failed", { code: err instanceof PlaidError ? err.code : errorInfo(err).message });
    return { ok: false, reason: "provider_error" };
  }
}

/**
 * Balances + incremental transactions for one connection. Idempotent:
 * rows are upserted on the provider's ids, removed ones deleted, and the
 * cursor is saved only after everything is applied — a retry replays safely.
 */
export async function syncConnection(cfg: PlaidConfig, admin: DB, userId: string, connectionId: string): Promise<{ ok: true; added: number; history: HistoryStatus } | { ok: false; reason: SyncFailure }> {
  const access = await accessTokenFor(admin, userId, connectionId);
  if (!access) return { ok: false, reason: "not_found" };
  const now = new Date().toISOString();
  try {
    const accounts = await getAccounts(cfg, access.token);
    if (accounts.length) {
      const { error } = await admin.from("financial_accounts").upsert(
        accounts.map((a) => ({ ...normalizeAccount(a), user_id: userId, connection_id: connectionId, last_synced_at: now })),
        { onConflict: "connection_id,provider_account_id" },
      );
      if (error) throw new Error(`accounts upsert: ${error.code}`);
    }
    const { data: ours } = await admin.from("financial_accounts").select("id, provider_account_id").eq("connection_id", connectionId).eq("user_id", userId);
    const accountId = new Map((ours ?? []).map((a) => [String(a.provider_account_id), String(a.id)]));

    const changes = await syncTransactions(cfg, access.token, access.cursor);
    const upserts = [...changes.added, ...changes.modified]
      .filter((t) => accountId.has(t.account_id))
      .map((t) => ({ ...normalizeTransaction(t), user_id: userId, connection_id: connectionId, account_id: accountId.get(t.account_id)! }));
    for (let i = 0; i < upserts.length; i += 500) {
      const { error } = await admin.from("financial_transactions").upsert(upserts.slice(i, i + 500), { onConflict: "connection_id,provider_transaction_id" });
      if (error) throw new Error(`transactions upsert: ${error.code}`);
    }
    const removed = changes.removed.map((r) => r.transaction_id);
    for (let i = 0; i < removed.length; i += 200) {
      await admin.from("financial_transactions").delete().eq("connection_id", connectionId).eq("user_id", userId).in("provider_transaction_id", removed.slice(i, i + 200));
    }
    await admin.from("financial_credentials").update({ sync_cursor: changes.nextCursor || null }).eq("connection_id", connectionId).eq("user_id", userId);
    await admin.from("financial_connections").update({ status: "connected", last_synced_at: now, last_error: null, history_status: changes.history }).eq("id", connectionId).eq("user_id", userId);
    await refreshRecurring(admin, userId);
    return { ok: true, added: changes.added.length, history: changes.history };
  } catch (err) {
    const reauth = err instanceof PlaidError && err.needsReauth;
    const code = err instanceof PlaidError ? err.code : "SYNC_FAILED";
    await admin
      .from("financial_connections")
      .update({ status: reauth ? "reauth_required" : "error", last_error: code.slice(0, 200) })
      .eq("id", connectionId)
      .eq("user_id", userId);
    logError("money", "sync failed", { code: err instanceof PlaidError ? err.code : errorInfo(err).message });
    return { ok: false, reason: reauth ? "reauth_required" : "provider_error" };
  }
}

/**
 * Re-detect recurring payments from the last ~13 months. Upserts by pattern
 * so the user's Keep / Review / Cancel decision survives; patterns no longer
 * found are marked inactive rather than deleted.
 */
export async function refreshRecurring(admin: DB, userId: string, today?: string): Promise<number> {
  let day = today;
  if (!day) {
    const { data: profile } = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
    day = localDate((profile?.timezone as string | undefined) || "UTC");
  }
  const { data } = await admin
    .from("financial_transactions")
    .select("id, date, amount, category, merchant_key, merchant_name, pending, account_id, merchant_website")
    .eq("user_id", userId)
    .gte("date", addDaysIso(day, -400))
    .order("date")
    .limit(10000);
  const txns: MoneyTxn[] = (data ?? []).map((t) => ({
    id: String(t.id),
    date: String(t.date),
    amount: Number(t.amount),
    category: String(t.category),
    merchantKey: String(t.merchant_key),
    merchantName: String(t.merchant_name ?? t.merchant_key),
    pending: Boolean(t.pending),
    accountId: String(t.account_id),
    merchantWebsite: (t.merchant_website as string | null) ?? null,
  }));
  const found = detectRecurring(txns, day);
  if (found.length) {
    const { error } = await admin.from("recurring_payments").upsert(
      found.map((r) => ({
        user_id: userId,
        pattern_key: r.patternKey,
        merchant_key: r.merchantKey,
        merchant_name: r.merchantName,
        merchant_website: r.merchantWebsite,
        category: r.category,
        frequency: r.frequency,
        average_amount: r.averageAmount,
        last_amount: r.lastAmount,
        last_date: r.lastDate,
        next_expected_date: r.nextExpectedDate,
        occurrences: r.occurrences,
        confidence: r.confidence,
        status: r.status,
        account_id: r.accountId,
        detected_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,pattern_key" },
    );
    if (error) logError("money", "recurring upsert failed", { code: error.code });
  }
  const keep = new Set(found.map((r) => r.patternKey));
  const { data: existing } = await admin.from("recurring_payments").select("id, pattern_key").eq("user_id", userId).eq("status", "active");
  const stale = (existing ?? []).filter((r) => !keep.has(String(r.pattern_key))).map((r) => r.id);
  if (stale.length) await admin.from("recurring_payments").update({ status: "inactive" }).in("id", stale).eq("user_id", userId);
  return found.length;
}

/** Revoke the item at Plaid (best effort) and delete everything it brought in. */
export async function disconnectConnection(cfg: PlaidConfig | null, admin: DB, userId: string, connectionId: string): Promise<boolean> {
  const access = cfg ? await accessTokenFor(admin, userId, connectionId) : null;
  if (cfg && access) {
    try {
      await removeItem(cfg, access.token);
    } catch (err) {
      logError("money", "item remove failed", { code: err instanceof PlaidError ? err.code : errorInfo(err).message });
    }
  }
  const { data: deleted, error } = await admin.from("financial_connections").delete().eq("id", connectionId).eq("user_id", userId).select("id");
  if (error || !deleted?.length) return false;
  await refreshRecurring(admin, userId);
  return true;
}
