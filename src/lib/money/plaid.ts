import "server-only";
import { brand } from "@/config/brand";
import { plaidConfig, type PlaidConfig } from "@/lib/env";
import type { PlaidAccount, PlaidTransaction } from "./plaid-normalize";

/**
 * Minimal Plaid API client (server-only; plain fetch, no SDK). Tokens never
 * leave the server and are never logged — errors carry only Plaid's error
 * code. The app is read-only: it uses Transactions (with balances) and never
 * any Plaid product that moves money.
 */

export class PlaidError extends Error {
  constructor(
    readonly code: string,
    readonly type: string,
    readonly status: number,
  ) {
    super(`Plaid ${type}/${code}`);
    this.name = "PlaidError";
  }
  /** The institution needs the user to sign in again (Link update mode). */
  get needsReauth() {
    return this.code === "ITEM_LOGIN_REQUIRED" || this.code === "PENDING_EXPIRATION" || this.code === "ACCESS_NOT_GRANTED";
  }
}

async function call<T>(cfg: PlaidConfig, path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${cfg.baseURL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cfg.clientId, secret: cfg.secret, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error_code) {
    throw new PlaidError(String(data.error_code ?? "UNKNOWN"), String(data.error_type ?? "API_ERROR"), res.status);
  }
  return data as T;
}

export function requirePlaid(): PlaidConfig | null {
  return plaidConfig();
}

/** A Link token: new connection, or update mode (reconnect) when an access token is given. */
export async function createLinkToken(cfg: PlaidConfig, userId: string, accessToken?: string): Promise<string> {
  const res = await call<{ link_token: string }>(cfg, "/link/token/create", {
    user: { client_user_id: userId },
    client_name: brand.name.slice(0, 30),
    country_codes: ["US"],
    language: "en",
    ...(accessToken ? { access_token: accessToken } : { products: ["transactions"], transactions: { days_requested: 730 } }),
  });
  return res.link_token;
}

export async function exchangePublicToken(cfg: PlaidConfig, publicToken: string): Promise<{ accessToken: string; itemId: string }> {
  const res = await call<{ access_token: string; item_id: string }>(cfg, "/item/public_token/exchange", { public_token: publicToken });
  return { accessToken: res.access_token, itemId: res.item_id };
}

export async function getInstitution(cfg: PlaidConfig, accessToken: string): Promise<{ id: string | null; name: string | null }> {
  const item = await call<{ item: { institution_id?: string | null } }>(cfg, "/item/get", { access_token: accessToken });
  const id = item.item.institution_id ?? null;
  if (!id) return { id: null, name: null };
  try {
    const inst = await call<{ institution: { name: string } }>(cfg, "/institutions/get_by_id", { institution_id: id, country_codes: ["US"] });
    return { id, name: inst.institution.name };
  } catch {
    return { id, name: null };
  }
}

export async function getAccounts(cfg: PlaidConfig, accessToken: string): Promise<PlaidAccount[]> {
  const res = await call<{ accounts: PlaidAccount[] }>(cfg, "/accounts/get", { access_token: accessToken });
  return res.accounts;
}

/** Plaid's transactions_update_status: how much history it has imported for the item so far. */
export type HistoryStatus = "pending" | "recent" | "complete";
const HISTORY: Record<string, HistoryStatus> = { NOT_READY: "pending", INITIAL_UPDATE_COMPLETE: "recent", HISTORICAL_UPDATE_COMPLETE: "complete" };

export interface SyncPage {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: { transaction_id: string }[];
  nextCursor: string;
  history: HistoryStatus;
}

/**
 * All changes since `cursor` (null = everything). Pages are combined; if the
 * data changes mid-pagination Plaid asks us to restart from the original
 * cursor, which we do (a few times at most).
 */
export async function syncTransactions(cfg: PlaidConfig, accessToken: string, cursor: string | null): Promise<SyncPage> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const out: SyncPage = { added: [], modified: [], removed: [], nextCursor: cursor ?? "", history: "complete" };
    let next = cursor;
    try {
      for (let page = 0; page < 50; page++) {
        const res = await call<{ added: PlaidTransaction[]; modified: PlaidTransaction[]; removed: { transaction_id: string }[]; next_cursor: string; has_more: boolean; transactions_update_status?: string }>(
          cfg,
          "/transactions/sync",
          { access_token: accessToken, count: 500, ...(next ? { cursor: next } : {}) },
        );
        out.added.push(...res.added);
        out.modified.push(...res.modified);
        out.removed.push(...res.removed);
        out.nextCursor = res.next_cursor;
        // Older API versions omit the field; treat that as nothing pending.
        out.history = HISTORY[res.transactions_update_status ?? ""] ?? "complete";
        next = res.next_cursor;
        if (!res.has_more) return out;
      }
      return out;
    } catch (err) {
      if (err instanceof PlaidError && err.code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") continue;
      throw err;
    }
  }
  throw new PlaidError("TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION", "TRANSACTIONS_ERROR", 400);
}

export async function removeItem(cfg: PlaidConfig, accessToken: string): Promise<void> {
  await call(cfg, "/item/remove", { access_token: accessToken });
}
