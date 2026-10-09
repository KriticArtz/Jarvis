import { categoryKind, categoryLabel } from "./categories";
import type { MoneyBase } from "./data";
import { addDaysIso, addMonths, budgetStatus, cashFlow, debtToIncome, monthKey, monthlyAmount, overview, paceSentence, projectGoal, recentMonthlySavings, recurringTotals } from "./summary";

/**
 * The assistant's view of the user's money (pure): a compact, bounded summary —
 * never raw transactions. Every figure is computed by the same code as the
 * Money screen, and each one carries its basis (e.g. "gross income the user
 * entered", "at $750/month"). Read-only: the assistant can explain and plan
 * with it, never act on it.
 */
export interface MoneyContext {
  connectedInstitutions: number;
  balances: { cash: number; investments: number; debt: number; netWorth: number | null; totalAssets: number } | null;
  thisMonth: { income: number; spending: number; net: number; savingsRate: number | null; dayOfMonth: number; daysInMonth: number };
  lastMonth: { income: number; spending: number; net: number } | null;
  /** Average of recent complete months (up to 3) — "how much do I spend a month?" */
  typicalMonth: { months: number; income: number; spending: number; topCategories: { category: string; amount: number }[] } | null;
  budget: { monthly: number; spent: number; remaining: number; projected: number | null; pace: string } | null;
  categoryBudgets: { category: string; budget: number; spent: number; pace: string }[];
  debt: { monthlyPayments: number; dti: number | null; grossMonthlyIncome: number | null; incomeSource: "user_entered" | "not_provided" };
  goals: { name: string; kind: string; current: number; target: number; remaining: number; assumption: string | null; projected: string | null; targetDate: string | null; neededMonthly: number | null }[];
  recurring: { monthlyTotal: number; yearlyTotal: number; count: number; top: { name: string; amount: number; frequency: string; next: string | null }[]; next14Days: { name: string; amount: number; date: string }[] };
  /** Spending categories running well above their recent monthly average. */
  signals: string[];
}

const r0 = (n: number) => Math.round(n);
const usd = (n: number) => `${Math.round(n) < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const usd2 = (n: number) => `$${n.toFixed(2)}`;

export function buildMoneyContext(base: MoneyBase, today: string): MoneyContext | null {
  const hasAnything = base.connections.length || base.goals.length || base.budgets.length || base.income.grossMonthlyIncome;
  if (!hasAnything) return null;
  const connected = base.connections.length > 0;
  const ov = overview(base.accounts);
  const tm = cashFlow(base.txns, "this_month", today);
  const lm = cashFlow(base.txns, "last_month", today);
  const budget = budgetStatus(base.budgets, base.txns, today, base.recurring);
  const dti = debtToIncome({ grossMonthlyIncome: base.income.grossMonthlyIncome, otherMonthlyDebt: base.income.otherMonthlyDebt, recurring: base.recurring });
  const recentSavings = recentMonthlySavings(base.txns, today);
  const accountById = new Map(base.accounts.map((a) => [a.id, a]));
  const totals = recurringTotals(base.recurring);
  const active = base.recurring.filter((r) => r.status === "active");
  const day = Number(today.slice(8, 10));
  const dim = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();

  // A typical month: the last (up to) 3 complete months the data fully covers.
  let typicalMonth: MoneyContext["typicalMonth"] = null;
  const firstMonth = base.txns.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null)?.slice(0, 7);
  if (connected && firstMonth) {
    const prev = cashFlow(base.txns, "3m", addDaysIso(`${monthKey(today)}-01`, -1));
    const full = prev.months.filter((mo) => mo.month > firstMonth);
    if (full.length) {
      const n = full.length;
      const covered = new Set(full.map((mo) => mo.month));
      const byCat = new Map<string, number>();
      for (const t of base.txns) {
        if (!covered.has(monthKey(t.date)) || categoryKind(t.category) !== "spending") continue;
        byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amount);
      }
      typicalMonth = {
        months: n,
        income: full.reduce((sum, mo) => sum + mo.income, 0) / n,
        spending: full.reduce((sum, mo) => sum + mo.spending, 0) / n,
        topCategories: [...byCat.entries()]
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([category, amount]) => ({ category: categoryLabel(category), amount: amount / n })),
      };
    }
  }

  // Unusual spending: a category whose month-to-date pace is well above its average of the previous 3 months.
  // Recurring payments (rent, loans, subscriptions) are left out: paying rent on the 1st isn't a spending spree.
  const signals: string[] = [];
  if (connected && day >= 7) {
    const fixed = new Set(base.recurring.filter((r) => r.status === "active").map((r) => r.merchantKey));
    const monthStart = `${monthKey(today)}-01`;
    const priorStart = `${monthKey(addMonths(monthStart, -3))}-01`;
    const now = new Map<string, number>();
    const prior = new Map<string, number>();
    for (const t of base.txns) {
      if (t.amount >= 0 || categoryKind(t.category) !== "spending" || fixed.has(t.merchantKey)) continue;
      const into = t.date >= monthStart && t.date <= today ? now : t.date >= priorStart && t.date < monthStart ? prior : null;
      into?.set(t.category, (into.get(t.category) ?? 0) - t.amount);
    }
    for (const [category, amount] of now) {
      const pace = (amount / day) * dim;
      const usual = (prior.get(category) ?? 0) / 3;
      if (usual >= 50 && pace > usual * 1.5) signals.push(`${categoryLabel(category)} is running at about ${usd(pace)} this month vs a usual ${usd(usual)}/month`);
    }
  }

  return {
    connectedInstitutions: base.connections.length,
    balances: connected ? { cash: ov.cash, investments: ov.investments, debt: ov.debt, netWorth: ov.netWorth, totalAssets: ov.totalAssets } : null,
    thisMonth: { income: tm.income, spending: tm.spending, net: tm.net, savingsRate: tm.savingsRate, dayOfMonth: day, daysInMonth: dim },
    lastMonth: connected ? { income: lm.income, spending: lm.spending, net: lm.net } : null,
    typicalMonth,
    budget: budget.total
      ? { monthly: budget.total.budget, spent: budget.total.spent, remaining: budget.total.remaining, projected: budget.early ? null : budget.total.projected, pace: paceSentence(budget.total.pace) }
      : null,
    categoryBudgets: budget.categories.slice(0, 6).map((c) => ({ category: categoryLabel(c.category), budget: c.budget, spent: c.spent, pace: paceSentence(c.pace) })),
    debt: {
      monthlyPayments: dti.monthlyDebt,
      dti: dti.status === "ok" ? dti.ratio : null,
      grossMonthlyIncome: base.income.grossMonthlyIncome,
      incomeSource: base.income.grossMonthlyIncome ? "user_entered" : "not_provided",
    },
    goals: base.goals.slice(0, 6).map((g) => {
      const p = projectGoal({ ...g, account: g.accountId ? (accountById.get(g.accountId) ?? null) : null }, today, recentSavings);
      return {
        name: g.name,
        kind: g.kind,
        current: p.current,
        target: g.targetAmount,
        remaining: p.remaining,
        assumption: p.contribution ? (p.contribution.source === "planned" ? `$${r0(p.contribution.amount)}/month (the user's plan)` : `$${r0(p.contribution.amount)}/month (recent average savings)`) : null,
        projected: p.achieved ? "reached" : p.projectedMonth ? `${p.projectedMonth.slice(0, 7)} (${p.months} months)` : null,
        targetDate: g.targetDate,
        neededMonthly: p.neededMonthly,
      };
    }),
    recurring: {
      monthlyTotal: totals.monthly,
      yearlyTotal: totals.yearly,
      count: totals.count,
      top: [...active]
        .sort((a, b) => monthlyAmount(b) - monthlyAmount(a))
        .slice(0, 8)
        .map((r) => ({ name: r.merchantName, amount: r.averageAmount, frequency: r.frequency, next: r.nextExpectedDate })),
      next14Days: active
        .filter((r) => r.nextExpectedDate && r.nextExpectedDate >= today && r.nextExpectedDate <= addDaysIso(today, 14))
        .sort((a, b) => (a.nextExpectedDate ?? "").localeCompare(b.nextExpectedDate ?? ""))
        .slice(0, 8)
        .map((r) => ({ name: r.merchantName, amount: r.averageAmount, date: r.nextExpectedDate! })),
    },
    signals: signals.slice(0, 3),
  };
}


/** The context section the assistant reads (bounded: a few hundred words at most). */
export function renderMoneyContext(m: MoneyContext): string {
  const out: string[] = [];
  out.push("## Money (read-only summary; you can explain and plan with it, never move money or cancel anything)");
  if (m.balances) {
    out.push(
      m.balances.netWorth !== null
        ? `Net worth: ${usd(m.balances.netWorth)} (cash ${usd(m.balances.cash)}${m.balances.investments ? `, investments ${usd(m.balances.investments)}` : ""}, debt ${usd(m.balances.debt)})`
        : `Connected asset accounts: ${usd(m.balances.totalAssets)} (cash ${usd(m.balances.cash)}${m.balances.investments ? `, investments ${usd(m.balances.investments)}` : ""}); no credit cards or loans connected, so net worth isn't known`,
    );
    out.push(
      `This month so far (day ${m.thisMonth.dayOfMonth} of ${m.thisMonth.daysInMonth}): income ${usd(m.thisMonth.income)}, spending ${usd(m.thisMonth.spending)}, net ${usd(m.thisMonth.net)}${m.thisMonth.savingsRate !== null ? ` (savings rate ${Math.round(m.thisMonth.savingsRate * 100)}%)` : ""}`,
    );
    if (m.lastMonth) out.push(`Last month: income ${usd(m.lastMonth.income)}, spending ${usd(m.lastMonth.spending)}, net ${usd(m.lastMonth.net)}`);
    if (m.typicalMonth) {
      const t = m.typicalMonth;
      out.push(
        `Typical month (average of the last ${t.months} complete month${t.months === 1 ? "" : "s"}): income ${usd(t.income)}, spending ${usd(t.spending)}${t.topCategories.length ? `; biggest: ${t.topCategories.map((c) => `${c.category} ${usd(c.amount)}`).join(", ")}` : ""}`,
      );
    }
  } else {
    out.push("No bank accounts connected (the user can connect them on the Money screen).");
  }
  if (m.budget) {
    out.push(
      `Budget: ${usd(m.budget.monthly)}/month; spent ${usd(m.budget.spent)}, remaining ${usd(m.budget.remaining)}${m.budget.projected !== null ? `, projected ${usd(m.budget.projected)}` : ""}. ${m.budget.pace}`,
    );
  } else {
    out.push("Budget: none set.");
  }
  for (const c of m.categoryBudgets) out.push(`- ${c.category} budget ${usd(c.budget)}: spent ${usd(c.spent)}. ${c.pace}`);
  out.push(
    m.debt.dti !== null
      ? `Debt payments: ${usd(m.debt.monthlyPayments)}/month; debt-to-income ${Math.round(m.debt.dti * 100)}% (gross income ${usd(m.debt.grossMonthlyIncome!)}/month, as entered by the user)`
      : `Debt payments: ${usd(m.debt.monthlyPayments)}/month; debt-to-income unknown (the user hasn't entered gross income — don't guess it from deposits)`,
  );
  if (m.goals.length) {
    out.push("Financial goals (projections are estimates at the stated monthly amount, not promises):");
    for (const g of m.goals) {
      out.push(
        `- ${g.name} (${g.kind === "pay_off" ? "pay off" : "save"}): ${usd(g.current)} of ${usd(g.target)}, ${usd(g.remaining)} to go; ${
          g.projected === "reached" ? "reached" : g.assumption ? `at ${g.assumption} → projected ${g.projected ?? "more than 50 years"}` : "no monthly amount set, so no projection"
        }${g.targetDate ? `; target date ${g.targetDate}${g.neededMonthly !== null ? ` (needs about ${usd(g.neededMonthly)}/month)` : ""}` : ""}`,
      );
    }
  }
  if (m.recurring.count) {
    out.push(`Recurring payments: ${usd(m.recurring.monthlyTotal)}/month (${usd(m.recurring.yearlyTotal)}/year) across ${m.recurring.count}. Largest: ${m.recurring.top.map((r) => `${r.name} ${usd2(r.amount)}/${r.frequency === "monthly" ? "mo" : r.frequency}`).join(", ")}`);
    if (m.recurring.next14Days.length) out.push(`Due in the next 14 days: ${m.recurring.next14Days.map((r) => `${r.name} ${usd2(r.amount)} on ${r.date}`).join(", ")}`);
  }
  if (m.signals.length) out.push(`Worth noticing: ${m.signals.join("; ")}`);
  return out.join("\n");
}
