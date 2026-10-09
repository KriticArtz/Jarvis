import { categoryKind, type CategoryKind } from "./categories";

/**
 * The money math (pure, unit-tested): overview, cash flow, budget pace,
 * debt-to-income and goal projections. Every result says what it's based
 * on; nothing is shown as a fact when the data can't support it.
 */

export type AccountType = "depository" | "credit" | "loan" | "investment" | "other";
export interface MoneyAccount {
  id: string;
  name: string;
  type: AccountType;
  subtype: string | null;
  mask: string | null;
  currentBalance: number | null;
  availableBalance: number | null;
  creditLimit: number | null;
  connectionId: string;
}
export interface MoneyTxn {
  id: string;
  date: string;
  /** > 0 money in, < 0 money out */
  amount: number;
  category: string;
  merchantKey: string;
  merchantName: string;
  pending: boolean;
  accountId: string;
  merchantWebsite?: string | null;
}
export type Frequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "annual";
export interface MoneyRecurring {
  id?: string;
  merchantName: string;
  category: string;
  frequency: Frequency;
  averageAmount: number;
  status: "active" | "inactive";
  nextExpectedDate?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ dates

export const monthKey = (iso: string) => iso.slice(0, 7);
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Add months to a date, keeping the day where possible (Jan 31 + 1 → Feb 28). */
export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const ym = `${ny}-${String(nm).padStart(2, "0")}`;
  return `${ym}-${String(Math.min(d, daysInMonth(ym))).padStart(2, "0")}`;
}
export function addDaysIso(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
/** The last `count` month keys ending with today's month, oldest first. */
export function monthRange(today: string, count: number, endOffset = 0): string[] {
  return Array.from({ length: count }, (_, i) => monthKey(addMonths(`${monthKey(today)}-01`, endOffset - (count - 1 - i))));
}

// ------------------------------------------------------------------ overview

export interface Overview {
  cash: number;
  investments: number;
  otherAssets: number;
  debt: number;
  hasAssets: boolean;
  hasLiabilities: boolean;
  /** Only when both assets and liabilities are connected — otherwise it would be a guess. */
  netWorth: number | null;
  /** Sum of connected asset accounts (always available when any are connected). */
  totalAssets: number;
}

export function overview(accounts: MoneyAccount[]): Overview {
  let cash = 0;
  let investments = 0;
  let otherAssets = 0;
  let debt = 0;
  let hasAssets = false;
  let hasLiabilities = false;
  for (const a of accounts) {
    const bal = a.currentBalance ?? 0;
    if (a.currentBalance === null) continue;
    if (a.type === "credit" || a.type === "loan") {
      hasLiabilities = true;
      debt += Math.max(0, bal);
    } else {
      hasAssets = true;
      if (a.type === "depository") cash += bal;
      else if (a.type === "investment") investments += bal;
      else otherAssets += bal;
    }
  }
  const totalAssets = round2(cash + investments + otherAssets);
  return {
    cash: round2(cash),
    investments: round2(investments),
    otherAssets: round2(otherAssets),
    debt: round2(debt),
    hasAssets,
    hasLiabilities,
    netWorth: hasAssets && hasLiabilities ? round2(totalAssets - debt) : null,
    totalAssets,
  };
}

// ------------------------------------------------------------------ cash flow

export type Period = "this_month" | "last_month" | "3m" | "6m" | "12m";
export const PERIODS: { value: Period; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];
export const isPeriod = (v: unknown): v is Period => PERIODS.some((p) => p.value === v);

const counts = (kind: CategoryKind) => kind === "spending" || kind === "debt_payment";

export interface CashFlow {
  months: { month: string; income: number; spending: number; net: number }[];
  income: number;
  spending: number;
  net: number;
  /** net / income, only when there was income */
  savingsRate: number | null;
  /** Where the money went: spending by category, largest first. */
  categories: { category: string; amount: number; share: number }[];
  /** True when the period includes the current, unfinished month. */
  partial: boolean;
}

export function cashFlow(txns: MoneyTxn[], period: Period, today: string): CashFlow {
  const months =
    period === "this_month" ? monthRange(today, 1) : period === "last_month" ? monthRange(today, 1, -1) : monthRange(today, period === "3m" ? 3 : period === "6m" ? 6 : 12);
  const byMonth = new Map(months.map((m) => [m, { month: m, income: 0, spending: 0, net: 0 }]));
  const byCategory = new Map<string, number>();
  for (const t of txns) {
    const row = byMonth.get(monthKey(t.date));
    if (!row) continue;
    const kind = categoryKind(t.category);
    if (kind === "income") row.income += t.amount;
    else if (counts(kind)) {
      row.spending -= t.amount; // outflows are negative; refunds net against spending
      byCategory.set(t.category, (byCategory.get(t.category) ?? 0) - t.amount);
    }
  }
  const rows = [...byMonth.values()].map((r) => ({ month: r.month, income: round2(r.income), spending: round2(r.spending), net: round2(r.income - r.spending) }));
  const income = round2(rows.reduce((s, r) => s + r.income, 0));
  const spending = round2(rows.reduce((s, r) => s + r.spending, 0));
  const positive = [...byCategory.entries()].filter(([, v]) => v > 0.005);
  const totalCat = positive.reduce((s, [, v]) => s + v, 0);
  return {
    months: rows,
    income,
    spending,
    net: round2(income - spending),
    savingsRate: income > 0 ? (income - spending) / income : null,
    categories: positive
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount: round2(amount), share: totalCat ? amount / totalCat : 0 })),
    partial: months.includes(monthKey(today)) && period !== "last_month",
  };
}

/**
 * Average monthly net cash flow over the last complete months (up to 3) —
 * the "recent savings" a goal projection can fall back on. Null when there
 * isn't a full month of history or the user isn't saving.
 */
export function recentMonthlySavings(txns: MoneyTxn[], today: string): { amount: number; months: number } | null {
  if (!txns.length) return null;
  const earliest = txns.reduce((min, t) => (t.date < min ? t.date : min), today);
  // A month counts only if the history started before it (so it's fully covered).
  const usable = monthRange(today, 3, -1).filter((m) => m > monthKey(earliest));
  if (!usable.length) return null;
  let net = 0;
  for (const t of txns) {
    if (!usable.includes(monthKey(t.date))) continue;
    const kind = categoryKind(t.category);
    if (kind === "income" || counts(kind)) net += t.amount;
  }
  const amount = round2(net / usable.length);
  return amount > 0 ? { amount, months: usable.length } : null;
}

// ------------------------------------------------------------------ budget

export type Pace = "under" | "on_pace" | "ahead" | "over";
export interface BudgetLine {
  category: string;
  budget: number;
  spent: number;
  remaining: number;
  projected: number;
  pace: Pace;
}
export interface BudgetStatus {
  month: string;
  /** Share of the month elapsed (0..1]. */
  elapsed: number;
  /** Too early in the month for the projection to mean much. */
  early: boolean;
  total: BudgetLine | null;
  categories: BudgetLine[];
  /** Month-to-date spending (with or without a budget). */
  spent: number;
}

/** A detected recurring payment as the budget projection sees it. */
export type BudgetRecurring = Pick<MoneyRecurring, "category" | "frequency" | "averageAmount" | "status" | "nextExpectedDate"> & { merchantKey: string };

const INTERVAL_DAYS: Record<Frequency, number> = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, annual: 365 };

/**
 * Projected month-end spending. Variable spending is extrapolated linearly from
 * the days elapsed; payments recognised as recurring (rent, loans, subscriptions)
 * count once, as they are — plus the ones still expected before month end — so
 * paying rent on the 1st doesn't read as "on course to spend 30× rent".
 */
function line(category: string, budget: number, spent: number, fixed: number, stillDue: number, elapsed: number): BudgetLine {
  const variable = Math.max(0, spent - fixed);
  const projected = round2(fixed + variable / elapsed + stillDue);
  const pace: Pace = spent > budget ? "over" : projected > budget * 1.1 ? "ahead" : projected < budget * 0.85 ? "under" : "on_pace";
  return { category, budget: round2(budget), spent: round2(spent), remaining: round2(budget - spent), projected, pace };
}

export function budgetStatus(budgets: { category: string; monthlyAmount: number }[], txns: MoneyTxn[], today: string, recurring: BudgetRecurring[] = []): BudgetStatus {
  const month = monthKey(today);
  const day = Number(today.slice(8, 10));
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const elapsed = Math.min(1, Math.max(day, 1) / daysInMonth(month));
  const active = recurring.filter((r) => r.status === "active" && counts(categoryKind(r.category)));
  const recurringKeys = new Set(active.map((r) => r.merchantKey));
  const spentBy = new Map<string, number>();
  const fixedBy = new Map<string, number>();
  const dueBy = new Map<string, number>();
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const t of txns) {
    if (monthKey(t.date) !== month || !counts(categoryKind(t.category))) continue;
    for (const k of ["total", t.category]) {
      add(spentBy, k, -t.amount);
      if (recurringKeys.has(t.merchantKey)) add(fixedBy, k, -t.amount);
    }
  }
  // Recurring payments still expected later this month.
  for (const r of active) {
    let next = r.nextExpectedDate;
    while (next && next > today && next <= monthEnd) {
      for (const k of ["total", r.category]) add(dueBy, k, r.averageAmount);
      next = addDaysIso(next, INTERVAL_DAYS[r.frequency]);
    }
  }
  const lineFor = (category: string, budget: number) =>
    line(category, budget, Math.max(0, spentBy.get(category) ?? 0), Math.max(0, fixedBy.get(category) ?? 0), dueBy.get(category) ?? 0, elapsed);
  const total = budgets.find((b) => b.category === "total");
  return {
    month,
    elapsed,
    early: day < 5,
    total: total ? lineFor("total", total.monthlyAmount) : null,
    categories: budgets
      .filter((b) => b.category !== "total")
      .map((b) => lineFor(b.category, b.monthlyAmount))
      .sort((a, b) => b.spent / b.budget - a.spent / a.budget),
    spent: round2(Math.max(0, spentBy.get("total") ?? 0)),
  };
}

/** Calm, non-judgmental wording for a budget pace. */
export function paceSentence(pace: Pace): string {
  switch (pace) {
    case "under":
      return "You're running under your budget.";
    case "on_pace":
      return "You're on pace.";
    case "ahead":
      return "You're running ahead of your budget.";
    case "over":
      return "You've used this month's budget.";
  }
}

// ------------------------------------------------------------------ debt-to-income

export const MONTHLY_FACTOR: Record<Frequency, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, annual: 1 / 12 };
export const monthlyAmount = (r: Pick<MoneyRecurring, "frequency" | "averageAmount">) => round2(r.averageAmount * MONTHLY_FACTOR[r.frequency]);

/** Active recurring payments per month and per year (every frequency normalized to monthly). */
export function recurringTotals(items: Pick<MoneyRecurring, "frequency" | "averageAmount" | "status">[]) {
  const active = items.filter((r) => r.status === "active");
  const monthly = round2(active.reduce((s, r) => s + monthlyAmount(r), 0));
  return { monthly, yearly: round2(monthly * 12), count: active.length };
}

export type Dti =
  | { status: "needs_income"; monthlyDebt: number; items: { name: string; monthly: number }[] }
  | { status: "ok"; ratio: number; monthlyDebt: number; grossMonthlyIncome: number; items: { name: string; monthly: number }[]; otherDebt: number };

/**
 * DTI = monthly recurring debt obligations / GROSS monthly income × 100.
 * Gross income is only ever what the user told us — never inferred from
 * deposits. Obligations are the active recurring loan payments we detected
 * plus any debt payments the user said we can't see.
 */
export function debtToIncome(input: { grossMonthlyIncome: number | null; otherMonthlyDebt: number | null; recurring: MoneyRecurring[] }): Dti {
  const items = input.recurring
    .filter((r) => r.status === "active" && categoryKind(r.category) === "debt_payment")
    .map((r) => ({ name: r.merchantName, monthly: monthlyAmount(r) }));
  const otherDebt = round2(input.otherMonthlyDebt ?? 0);
  const monthlyDebt = round2(items.reduce((s, i) => s + i.monthly, 0) + otherDebt);
  if (!input.grossMonthlyIncome || input.grossMonthlyIncome <= 0) return { status: "needs_income", monthlyDebt, items };
  return { status: "ok", ratio: monthlyDebt / input.grossMonthlyIncome, monthlyDebt, grossMonthlyIncome: round2(input.grossMonthlyIncome), items, otherDebt };
}

// ------------------------------------------------------------------ goals

export interface GoalInput {
  kind: "save" | "pay_off";
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  monthlyContribution: number | null;
  /** A linked account: savings balance for "save", amount owed for "pay_off". */
  account?: Pick<MoneyAccount, "type" | "currentBalance"> | null;
}
export interface GoalProjection {
  current: number;
  remaining: number;
  progress: number;
  achieved: boolean;
  /** The assumption behind the projection — always shown with it. */
  contribution: { amount: number; source: "planned" | "recent_savings" } | null;
  months: number | null;
  /** First day of the projected month (YYYY-MM-01). */
  projectedMonth: string | null;
  /** With a target date: the monthly amount it would take, and whether the assumption gets there. */
  neededMonthly: number | null;
  onTrack: boolean | null;
  scenarios: { amount: number; months: number | null; projectedMonth: string | null }[];
}

const MAX_MONTHS = 600;
const monthsFor = (remaining: number, monthly: number) => (monthly > 0 ? Math.ceil(remaining / monthly - 1e-9) : null);

function niceStep(c: number): number {
  if (c < 200) return 50;
  if (c < 500) return 100;
  if (c <= 2000) return 250;
  return 500;
}

export function projectGoal(goal: GoalInput, today: string, recentSavings: { amount: number } | null): GoalProjection {
  let current = goal.currentAmount;
  if (goal.account && goal.account.currentBalance !== null) {
    if (goal.kind === "save" && goal.account.type !== "credit" && goal.account.type !== "loan") current = Math.max(0, goal.account.currentBalance);
    if (goal.kind === "pay_off" && (goal.account.type === "credit" || goal.account.type === "loan")) {
      current = Math.max(0, goal.targetAmount - Math.max(0, goal.account.currentBalance));
    }
  }
  current = round2(current);
  const remaining = round2(Math.max(0, goal.targetAmount - current));
  const achieved = remaining <= 0;
  const contribution = goal.monthlyContribution
    ? { amount: goal.monthlyContribution, source: "planned" as const }
    : recentSavings && recentSavings.amount > 0
      ? { amount: recentSavings.amount, source: "recent_savings" as const }
      : null;
  const projection = (monthly: number) => {
    const m = achieved ? 0 : monthsFor(remaining, monthly);
    return m === null || m > MAX_MONTHS ? { months: null, projectedMonth: null } : { months: m, projectedMonth: `${monthKey(addMonths(today, m))}-01` };
  };
  const main = contribution ? projection(contribution.amount) : { months: null, projectedMonth: null };
  let neededMonthly: number | null = null;
  let onTrack: boolean | null = null;
  if (goal.targetDate && !achieved) {
    const monthsLeft = Math.max(1, (Number(goal.targetDate.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(goal.targetDate.slice(5, 7)) - Number(today.slice(5, 7)));
    neededMonthly = round2(remaining / monthsLeft);
    onTrack = main.projectedMonth ? main.projectedMonth <= `${monthKey(goal.targetDate)}-01` : null;
  }
  const scenarios =
    contribution && !achieved
      ? (() => {
          const c = contribution.amount;
          const step = niceStep(c);
          const base = Math.round(c / step) * step;
          const amounts = [...new Set([base - step, base, base + step, base + 2 * step].filter((a) => a > 0 && Math.abs(a - c) > 0.5))].slice(0, 3);
          return amounts.map((amount) => ({ amount, ...projection(amount) }));
        })()
      : [];
  return {
    current,
    remaining,
    progress: goal.targetAmount > 0 ? Math.min(1, current / goal.targetAmount) : 0,
    achieved,
    contribution,
    months: main.months,
    projectedMonth: main.projectedMonth,
    neededMonthly,
    onTrack,
    scenarios,
  };
}
