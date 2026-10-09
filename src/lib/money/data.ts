import "server-only";
import type { DB } from "@/lib/data/db";
import { addDaysIso, budgetStatus, cashFlow, debtToIncome, overview, projectGoal, recentMonthlySavings, type AccountType, type Frequency, type MoneyAccount, type MoneyRecurring, type MoneyTxn, type Period } from "./summary";

/**
 * Everything the Money screens need, read with the user's own session (RLS
 * applies). Transactions are limited to the window the screen shows.
 */

export interface Connection {
  id: string;
  institutionName: string;
  status: "connected" | "reauth_required" | "error";
  lastSyncedAt: string | null;
  /** How much history Plaid has imported so far. */
  history: "pending" | "recent" | "complete";
}
export interface StoredRecurring extends MoneyRecurring {
  id: string;
  merchantKey: string;
  merchantWebsite: string | null;
  lastAmount: number;
  lastDate: string;
  nextExpectedDate: string | null;
  decision: "keep" | "review" | "cancel" | null;
  confidence: number;
  accountId: string | null;
}
export interface StoredGoal {
  id: string;
  name: string;
  kind: "save" | "pay_off";
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  monthlyContribution: number | null;
  accountId: string | null;
  status: string;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function loadMoneyBase(db: DB, userId: string, opts: { since: string }) {
  const [connections, accounts, txns, recurring, goals, budgets, income] = await Promise.all([
    db.from("financial_connections").select("id, institution_name, status, last_synced_at, history_status").eq("user_id", userId).order("created_at"),
    db.from("financial_accounts").select("id, connection_id, name, type, subtype, mask, current_balance, available_balance, credit_limit").eq("user_id", userId).order("name"),
    db
      .from("financial_transactions")
      .select("id, date, authorized_date, name, amount, category, merchant_key, merchant_name, pending, account_id, merchant_website")
      .eq("user_id", userId)
      .gte("date", opts.since)
      .order("date", { ascending: false })
      .limit(8000),
    db
      .from("recurring_payments")
      .select("id, merchant_key, merchant_name, merchant_website, category, frequency, average_amount, last_amount, last_date, next_expected_date, status, decision, confidence, account_id")
      .eq("user_id", userId)
      .order("average_amount", { ascending: false }),
    db.from("financial_goals").select("id, name, kind, target_amount, current_amount, target_date, monthly_contribution, account_id, status").eq("user_id", userId).neq("status", "archived").order("created_at"),
    db.from("financial_budgets").select("category, monthly_amount").eq("user_id", userId),
    db.from("financial_income_profile").select("gross_monthly_income, other_monthly_debt_payments").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    connections: (connections.data ?? []).map(
      (c): Connection => ({ id: String(c.id), institutionName: String(c.institution_name ?? "Bank"), status: c.status as Connection["status"], lastSyncedAt: (c.last_synced_at as string | null) ?? null, history: (c.history_status as Connection["history"]) ?? "complete" }),
    ),
    accounts: (accounts.data ?? []).map(
      (a): MoneyAccount => ({
        id: String(a.id),
        connectionId: String(a.connection_id),
        name: String(a.name),
        type: a.type as AccountType,
        subtype: (a.subtype as string | null) ?? null,
        mask: (a.mask as string | null) ?? null,
        currentBalance: num(a.current_balance),
        availableBalance: num(a.available_balance),
        creditLimit: num(a.credit_limit),
      }),
    ),
    txns: (txns.data ?? []).map(
      (t): MoneyTxn & { name: string; authorizedDate: string | null } => ({
        name: String(t.name),
        authorizedDate: (t.authorized_date as string | null) ?? null,
        id: String(t.id),
        date: String(t.date),
        amount: Number(t.amount),
        category: String(t.category),
        merchantKey: String(t.merchant_key),
        merchantName: String(t.merchant_name ?? t.merchant_key),
        pending: Boolean(t.pending),
        accountId: String(t.account_id),
        merchantWebsite: (t.merchant_website as string | null) ?? null,
      }),
    ),
    recurring: (recurring.data ?? []).map(
      (r): StoredRecurring => ({
        id: String(r.id),
        merchantKey: String(r.merchant_key),
        merchantName: String(r.merchant_name),
        merchantWebsite: (r.merchant_website as string | null) ?? null,
        category: String(r.category),
        frequency: r.frequency as Frequency,
        averageAmount: Number(r.average_amount),
        lastAmount: Number(r.last_amount),
        lastDate: String(r.last_date),
        nextExpectedDate: (r.next_expected_date as string | null) ?? null,
        status: r.status as "active" | "inactive",
        decision: (r.decision as StoredRecurring["decision"]) ?? null,
        confidence: Number(r.confidence),
        accountId: (r.account_id as string | null) ?? null,
      }),
    ),
    goals: (goals.data ?? []).map(
      (g): StoredGoal => ({
        id: String(g.id),
        name: String(g.name),
        kind: g.kind as StoredGoal["kind"],
        targetAmount: Number(g.target_amount),
        currentAmount: Number(g.current_amount),
        targetDate: (g.target_date as string | null) ?? null,
        monthlyContribution: num(g.monthly_contribution),
        accountId: (g.account_id as string | null) ?? null,
        status: String(g.status),
      }),
    ),
    budgets: (budgets.data ?? []).map((b) => ({ category: String(b.category), monthlyAmount: Number(b.monthly_amount) })),
    income: {
      grossMonthlyIncome: num(income.data?.gross_monthly_income),
      otherMonthlyDebt: num(income.data?.other_monthly_debt_payments),
    },
  };
}

export type MoneyBase = Awaited<ReturnType<typeof loadMoneyBase>>;

/** The whole command center, computed. */
export function computeMoney(base: MoneyBase, today: string, period: Period) {
  const recentSavings = recentMonthlySavings(base.txns, today);
  const accountById = new Map(base.accounts.map((a) => [a.id, a]));
  return {
    overview: overview(base.accounts),
    cashFlow: cashFlow(base.txns, period, today),
    thisMonth: cashFlow(base.txns, "this_month", today),
    budget: budgetStatus(base.budgets, base.txns, today, base.recurring),
    dti: debtToIncome({ grossMonthlyIncome: base.income.grossMonthlyIncome, otherMonthlyDebt: base.income.otherMonthlyDebt, recurring: base.recurring }),
    recentSavings,
    goals: base.goals.map((g) => ({ goal: g, projection: projectGoal({ ...g, account: g.accountId ? (accountById.get(g.accountId) ?? null) : null }, today, recentSavings) })),
  };
}

/** Transactions window for a period (plus room for recent-savings history). */
export function sinceFor(period: Period, today: string): string {
  const months = period === "12m" ? 12 : period === "6m" ? 6 : 4;
  return addDaysIso(`${today.slice(0, 7)}-01`, -months * 31);
}
