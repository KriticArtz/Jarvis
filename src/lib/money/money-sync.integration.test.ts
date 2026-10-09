/**
 * Plaid → database, end to end, against a real local Supabase (real RLS) and
 * the mock Plaid API (scripts/mock-plaid.mjs). Run: npm run test:integration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMockPlaid, type MockPlaid } from "../../../scripts/mock-plaid.mjs";
import type { DB } from "@/lib/data/db";
import { plaidConfig } from "@/lib/env";
import { connectItem, disconnectConnection, linkToken, refreshRecurring, syncConnection } from "./sync";

const URL = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUBLISHABLE = process.env.INTEGRATION_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.INTEGRATION_SUPABASE_SECRET_KEY ?? "";
const reachable = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: PUBLISHABLE } }).then((r) => r.ok).catch(() => false);
const enabled = reachable && Boolean(PUBLISHABLE && SECRET);

let mock: MockPlaid;
let admin: SupabaseClient;
const users: Record<"a" | "b", { id: string; db: SupabaseClient }> = {} as never;
const saved: Record<string, string | undefined> = {};

async function makeUser(tag: string) {
  const email = `it-money-${tag}-${Date.now()}@lifepilot.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "integration-pass-1", email_confirm: true });
  if (error) throw error;
  const db = createClient(URL, PUBLISHABLE, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.auth.signInWithPassword({ email, password: "integration-pass-1" });
  await db.from("profiles").update({ timezone: "UTC", onboarding_completed_at: new Date().toISOString() }).eq("id", data.user.id);
  return { id: data.user.id, db };
}
const cfg = () => plaidConfig()!;
// Mock item ids derive from the public token; a fresh token per run keeps re-runs independent.
const RUN = Date.now();

describe.skipIf(!enabled)("Money: Plaid sync (mock Plaid, real Supabase)", () => {
  let chase = "";
  beforeAll(async () => {
    mock = createMockPlaid();
    const base = await mock.listen(0);
    for (const k of ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV", "PLAID_API_TEST_BASE_URL", "INTEGRATIONS_ENCRYPTION_KEY"]) saved[k] = process.env[k];
    Object.assign(process.env, { PLAID_CLIENT_ID: "test-client", PLAID_SECRET: "test-secret", PLAID_ENV: "sandbox", PLAID_API_TEST_BASE_URL: base, INTEGRATIONS_ENCRYPTION_KEY: randomBytes(32).toString("base64") });
    admin = createClient(URL, SECRET, { auth: { persistSession: false } });
    users.a = await makeUser("a");
    users.b = await makeUser("b");
  });
  afterAll(async () => {
    await mock?.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("uses the test base URL only because it's loopback", () => {
    expect(cfg().baseURL.startsWith("http://127.0.0.1:")).toBe(true);
  });

  it("connects: exchanges the token, stores it encrypted, imports accounts and history", async () => {
    expect(await linkToken(cfg(), admin as DB, users.a.id)).toMatchObject({ ok: true });
    const res = await connectItem(cfg(), admin as DB, users.a.id, `public-sandbox-chase-a1-${RUN}`);
    expect(res.ok).toBe(true);
    chase = res.ok ? res.connectionId : "";
    const { data: conn } = await admin.from("financial_connections").select("institution_name, status, last_synced_at").eq("id", chase).single();
    expect(conn).toMatchObject({ institution_name: "Chase", status: "connected" });
    const { data: cred } = await admin.from("financial_credentials").select("access_token_enc, sync_cursor").eq("connection_id", chase).single();
    expect(cred!.access_token_enc).toMatch(/^v1\./);
    expect(cred!.access_token_enc).not.toContain("access-sandbox");
    expect(cred!.sync_cursor).toBeTruthy();
    const { data: accounts } = await users.a.db.from("financial_accounts").select("name, type, current_balance, mask");
    expect(accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Total Checking", type: "depository", current_balance: 3240.18, mask: "4412" }),
        expect.objectContaining({ name: "Savings", type: "depository", current_balance: 4100 }),
      ]),
    );
    const { count } = await users.a.db.from("financial_transactions").select("id", { count: "exact", head: true });
    expect(count).toBeGreaterThan(100);
    // The user can read their data but never the token.
    expect((await users.a.db.from("financial_credentials").select("*")).error).not.toBeNull();
  });

  it("syncing again is idempotent; additions and removals are applied", async () => {
    const before = (await admin.from("financial_transactions").select("id", { count: "exact", head: true }).eq("connection_id", chase)).count;
    expect(await syncConnection(cfg(), admin as DB, users.a.id, chase)).toMatchObject({ ok: true, added: 0 });
    expect((await admin.from("financial_transactions").select("id", { count: "exact", head: true }).eq("connection_id", chase)).count).toBe(before);
    const { data: conn } = await admin.from("financial_connections").select("item_id").eq("id", chase).single();
    const change = mock.mutate(String(conn!.item_id));
    await syncConnection(cfg(), admin as DB, users.a.id, chase);
    const { data: ids } = await admin.from("financial_transactions").select("provider_transaction_id").eq("connection_id", chase).in("provider_transaction_id", [change.added, change.removed]);
    expect(ids!.map((r) => r.provider_transaction_id)).toEqual([change.added]);
  });

  it("detects recurring payments — and not irregular spending, transfers or income", async () => {
    await connectItem(cfg(), admin as DB, users.a.id, `public-sandbox-capital_one-a1-${RUN}`);
    const { data } = await users.a.db.from("recurring_payments").select("merchant_name, frequency, average_amount, status, confidence").eq("status", "active");
    const names = data!.map((r) => r.merchant_name).sort();
    expect(names).toEqual(expect.arrayContaining(["Apple", "GEICO", "Navient", "Netflix", "Oakwood Property", "Planet Fitness", "Spotify", "Verizon"]));
    for (const never of ["Trader Joe's", "Blue Bottle Coffee", "Amazon", "Acme Corp", "Capital One"]) expect(names).not.toContain(never);
    expect(data!.find((r) => r.merchant_name === "Netflix")).toMatchObject({ frequency: "monthly", average_amount: 15.49 });
    expect(data!.every((r) => Number(r.confidence) >= 0.6)).toBe(true);
  });

  it("keeps the user's review decision through re-detection", async () => {
    const { data: netflix } = await users.a.db.from("recurring_payments").select("id").eq("merchant_name", "Netflix").single();
    const { error } = await users.a.db.from("recurring_payments").update({ decision: "cancel" }).eq("id", netflix!.id);
    expect(error).toBeNull();
    await refreshRecurring(admin as DB, users.a.id);
    expect((await users.a.db.from("recurring_payments").select("decision").eq("id", netflix!.id).single()).data!.decision).toBe("cancel");
  });

  it("an institution that needs sign-in again is marked for reconnect, and reconnect works", async () => {
    mock.fail("ITEM_LOGIN_REQUIRED");
    expect(await syncConnection(cfg(), admin as DB, users.a.id, chase)).toEqual({ ok: false, reason: "reauth_required" });
    expect((await admin.from("financial_connections").select("status, last_error").eq("id", chase).single()).data).toEqual({ status: "reauth_required", last_error: "ITEM_LOGIN_REQUIRED" });
    expect(await linkToken(cfg(), admin as DB, users.a.id, chase)).toMatchObject({ ok: true });
    expect(await syncConnection(cfg(), admin as DB, users.a.id, chase)).toMatchObject({ ok: true });
    expect((await admin.from("financial_connections").select("status").eq("id", chase).single()).data!.status).toBe("connected");
  });

  it("another user can't sync, reconnect or take over someone else's connection", async () => {
    expect(await syncConnection(cfg(), admin as DB, users.b.id, chase)).toEqual({ ok: false, reason: "not_found" });
    expect(await linkToken(cfg(), admin as DB, users.b.id, chase)).toEqual({ ok: false, reason: "not_found" });
    // The same item can't move to another user.
    expect(await connectItem(cfg(), admin as DB, users.b.id, `public-sandbox-chase-a1-${RUN}`)).toEqual({ ok: false, reason: "provider_error" });
    expect(await disconnectConnection(cfg(), admin as DB, users.b.id, chase)).toBe(false);
    expect(mock.calls).not.toContain("/item/remove");
    expect((await users.b.db.from("financial_transactions").select("id")).data).toEqual([]);
    expect((await admin.from("financial_connections").select("user_id").eq("id", chase).single()).data!.user_id).toBe(users.a.id);
  });

  it("a fresh item whose history isn't ready yet is polled briefly until its history arrives", async () => {
    const res = await connectItem(cfg(), admin as DB, users.b.id, `public-sandbox-capital_one-slow-${RUN}`);
    expect(res).toMatchObject({ ok: true, history: "complete" }); // NOT_READY twice, then the history arrives
    const id = res.ok ? res.connectionId : "";
    expect((await admin.from("financial_connections").select("history_status").eq("id", id).single()).data!.history_status).toBe("complete");
    expect((await users.b.db.from("financial_transactions").select("id", { count: "exact", head: true })).count).toBeGreaterThan(10);
    await disconnectConnection(cfg(), admin as DB, users.b.id, id);
  }, 30_000);

  it("disconnecting revokes the item and deletes its data", async () => {
    expect(await disconnectConnection(cfg(), admin as DB, users.a.id, chase)).toBe(true);
    expect(mock.calls).toContain("/item/remove");
    expect((await admin.from("financial_accounts").select("id").eq("connection_id", chase)).data).toEqual([]);
    expect((await admin.from("financial_transactions").select("id").eq("connection_id", chase)).data).toEqual([]);
    // Rent and the loan came from Chase, so they're no longer active.
    const { data } = await users.a.db.from("recurring_payments").select("merchant_name").eq("status", "active");
    expect(data!.map((r) => r.merchant_name)).not.toContain("Oakwood Property");
  });
});
