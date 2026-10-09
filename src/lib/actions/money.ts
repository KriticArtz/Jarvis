"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { integrationsEncryptionKey, plaidConfig } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUDGET_CATEGORIES } from "@/lib/money/categories";
import { connectItem, disconnectConnection, linkToken, syncConnection, type SyncFailure } from "@/lib/money/sync";
import { uuid } from "@/lib/validation/schemas";
import { GENERIC_ERROR, NOT_SIGNED_IN, type ActionResult } from "./result";

/**
 * Money server actions. Bank data is read-only: these actions connect,
 * refresh and disconnect institutions, and save the user's own settings
 * (budget, income, goals, review decisions). Nothing here moves money,
 * pays anything or cancels anything.
 */

const DEMO: ActionResult = { ok: false, error: "Bank connections are available in your own account, not the shared demo." };
const NOT_CONFIGURED: ActionResult = { ok: false, error: "Bank connections aren't set up on this server yet." };
const MIN_SYNC_INTERVAL_MS = 30_000;

const FAILURE: Record<SyncFailure, string> = {
  not_configured: "Bank connections aren't set up on this server yet.",
  not_found: "That connection isn't available anymore.",
  reauth_required: "Your bank needs you to sign in again. Use Reconnect to continue.",
  provider_error: "Couldn't reach your bank just now. Nothing was changed — please try again in a minute.",
  limit: "You've connected the maximum number of institutions.",
};

async function bankContext() {
  const session = await getSessionUser();
  if (!session) return { ok: false as const, error: NOT_SIGNED_IN };
  if (session.isDemo) return { ok: false as const, error: DEMO };
  const cfg = plaidConfig();
  const admin = createAdminClient();
  if (!cfg || !admin || !integrationsEncryptionKey()) return { ok: false as const, error: NOT_CONFIGURED };
  return { ok: true as const, session, cfg, admin };
}

/** A Plaid Link token (new connection, or reconnect when a connection id is given). */
export async function createLinkToken(reconnectId?: string): Promise<ActionResult & { linkToken?: string }> {
  const ctx = await bankContext();
  if (!ctx.ok) return ctx.error;
  if (reconnectId !== undefined && !uuid.safeParse(reconnectId).success) return { ok: false, error: FAILURE.not_found };
  const res = await linkToken(ctx.cfg, ctx.admin, ctx.session.userId, reconnectId);
  return res.ok ? { ok: true, linkToken: res.token } : { ok: false, error: FAILURE[res.reason] };
}

const publicTokenSchema = z.string().trim().min(10).max(300);

/** After Plaid Link succeeds: exchange the public token server-side and import the accounts. */
export async function connectInstitution(publicToken: string): Promise<ActionResult> {
  const ctx = await bankContext();
  if (!ctx.ok) return ctx.error;
  const parsed = publicTokenSchema.safeParse(publicToken);
  if (!parsed.success) return { ok: false, error: "That connection didn't complete. Please try again." };
  const res = await connectItem(ctx.cfg, ctx.admin, ctx.session.userId, parsed.data);
  revalidatePath("/money", "layout");
  if (!res.ok) return { ok: false, error: FAILURE[res.reason] };
  return {
    ok: true,
    message:
      res.history === "complete"
        ? "Connected. Your accounts and transactions are in."
        : res.history === "recent"
          ? "Connected. Recent transactions are in; older history is still arriving — refresh in a few minutes."
          : "Connected. Your bank is still sending transactions — refresh in a minute.",
  };
}

/** After a reconnect (Link update mode): mark it healthy again and sync. */
export async function finishReconnect(connectionId: string): Promise<ActionResult> {
  return refresh(connectionId, true);
}

/** Refresh balances and transactions (one connection, or all of them). */
export async function refreshMoney(connectionId?: string): Promise<ActionResult> {
  return refresh(connectionId, false);
}

/** At most one sync per connection every 30 seconds — except a connection that's just been reconnected. */
async function refresh(connectionId: string | undefined, afterReconnect: boolean): Promise<ActionResult> {
  const ctx = await bankContext();
  if (!ctx.ok) return ctx.error;
  if (connectionId !== undefined && !uuid.safeParse(connectionId).success) return { ok: false, error: FAILURE.not_found };
  const q = ctx.admin.from("financial_connections").select("id, last_synced_at, status").eq("user_id", ctx.session.userId);
  const { data: conns } = connectionId ? await q.eq("id", connectionId) : await q;
  if (!conns?.length) return { ok: false, error: FAILURE.not_found };
  const due = conns.filter((c) => (afterReconnect && c.status !== "connected") || !c.last_synced_at || Date.now() - Date.parse(String(c.last_synced_at)) > MIN_SYNC_INTERVAL_MS);
  if (!due.length) return { ok: true, message: "Already up to date." };
  let failure: SyncFailure | null = null;
  for (const c of due) {
    const res = await syncConnection(ctx.cfg, ctx.admin, ctx.session.userId, String(c.id));
    if (!res.ok) failure = res.reason;
  }
  revalidatePath("/money", "layout");
  return failure ? { ok: false, error: FAILURE[failure] } : { ok: true, message: "Up to date." };
}

export async function disconnectInstitution(connectionId: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (session.isDemo) return DEMO;
  if (!uuid.safeParse(connectionId).success) return { ok: false, error: FAILURE.not_found };
  const admin = createAdminClient();
  if (!admin) return NOT_CONFIGURED;
  const ok = await disconnectConnection(plaidConfig(), admin, session.userId, connectionId);
  revalidatePath("/money", "layout");
  return ok ? { ok: true, message: "Disconnected. Its accounts and transactions were removed." } : GENERIC_ERROR;
}

// ------------------------------------------------------------------ the user's own settings

const decisionSchema = z.object({ id: uuid, decision: z.enum(["keep", "review", "cancel"]).nullable() });

/** Keep / Review / Cancel is a note for the user. Nothing is cancelled by the app. */
export async function setRecurringDecision(input: { id: string; decision: "keep" | "review" | "cancel" | null }): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return GENERIC_ERROR;
  const { data, error } = await session.supabase
    .from("recurring_payments")
    .update({ decision: parsed.data.decision })
    .eq("id", parsed.data.id)
    .eq("user_id", session.userId)
    .select("id");
  if (error || !data?.length) return GENERIC_ERROR;
  revalidatePath("/money", "layout");
  return { ok: true };
}

const amount = z.coerce.number().positive("Enter an amount above zero.").max(9_999_999, "That's too large.");
const optionalAmount = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), amount.nullable());

const budgetSchema = z.object({
  total: optionalAmount,
  categories: z.record(z.enum(BUDGET_CATEGORIES as [string, ...string[]]), optionalAmount).default({}),
});

/** Replace the monthly budget: an overall amount and/or per-category amounts (blank = none). */
export async function saveBudget(input: { total: string | number | null; categories?: Record<string, string | number | null> }): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the amounts." };
  const { supabase, userId } = session;
  const wanted = [
    ...(parsed.data.total ? [{ category: "total", monthly_amount: parsed.data.total }] : []),
    ...Object.entries(parsed.data.categories)
      .filter(([, v]) => v)
      .map(([category, v]) => ({ category, monthly_amount: v as number })),
  ];
  const { error: delErr } = await supabase
    .from("financial_budgets")
    .delete()
    .eq("user_id", userId)
    .not("category", "in", `(${wanted.map((w) => `"${w.category}"`).join(",") || '""'})`);
  if (delErr) return GENERIC_ERROR;
  if (wanted.length) {
    const { error } = await supabase.from("financial_budgets").upsert(wanted.map((w) => ({ ...w, user_id: userId })), { onConflict: "user_id,category" });
    if (error) return GENERIC_ERROR;
  }
  revalidatePath("/money", "layout");
  return { ok: true, message: "Budget saved." };
}

const incomeSchema = z.object({ grossMonthlyIncome: optionalAmount, otherMonthlyDebt: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().min(0).max(9_999_999).nullable()) });

/** The user's own gross monthly income (and debt payments we can't see) — used for debt-to-income. */
export async function saveIncomeProfile(input: { grossMonthlyIncome: string | number | null; otherMonthlyDebt: string | number | null }): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = incomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the amounts." };
  const { error } = await session.supabase.from("financial_income_profile").upsert(
    { user_id: session.userId, gross_monthly_income: parsed.data.grossMonthlyIncome, other_monthly_debt_payments: parsed.data.otherMonthlyDebt },
    { onConflict: "user_id" },
  );
  if (error) return GENERIC_ERROR;
  revalidatePath("/money", "layout");
  return { ok: true, message: "Saved." };
}

const goalSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1, "Give your goal a name.").max(80),
    kind: z.enum(["save", "pay_off"]),
    targetAmount: amount,
    currentAmount: z.preprocess((v) => (v === "" || v == null ? 0 : v), z.coerce.number().min(0).max(99_999_999)),
    targetDate: z.preprocess((v) => (v === "" || v == null ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
    monthlyContribution: optionalAmount,
    accountId: z.preprocess((v) => (v === "" || v == null ? null : v), uuid.nullable()),
  })
  .refine((g) => g.kind === "pay_off" || g.accountId !== null || g.currentAmount <= g.targetAmount * 10, { message: "Check the current amount." });

export type FinancialGoalInput = z.input<typeof goalSchema>;

export async function saveFinancialGoal(input: FinancialGoalInput): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the goal." };
  const g = parsed.data;
  const row = {
    user_id: session.userId,
    name: g.name,
    kind: g.kind,
    target_amount: g.targetAmount,
    current_amount: g.currentAmount,
    target_date: g.targetDate,
    monthly_contribution: g.monthlyContribution,
    account_id: g.accountId,
  };
  const { error } = g.id
    ? await session.supabase.from("financial_goals").update(row).eq("id", g.id).eq("user_id", session.userId)
    : await session.supabase.from("financial_goals").insert(row);
  if (error) return GENERIC_ERROR; // includes RLS refusing someone else's account
  revalidatePath("/money", "layout");
  return { ok: true, message: g.id ? "Goal updated." : "Goal added." };
}

export async function deleteFinancialGoal(id: string): Promise<ActionResult> {
  const session = await getSessionUser();
  if (!session) return NOT_SIGNED_IN;
  if (!uuid.safeParse(id).success) return GENERIC_ERROR;
  const { error } = await session.supabase.from("financial_goals").delete().eq("id", id).eq("user_id", session.userId);
  if (error) return GENERIC_ERROR;
  revalidatePath("/money", "layout");
  return { ok: true, message: "Goal removed." };
}
