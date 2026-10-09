import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Hourglass, ShieldCheck } from "lucide-react";
import { requireOnboardedUser } from "@/lib/auth";
import { integrationsEncryptionKey, plaidConfig } from "@/lib/env";
import { computeMoney, loadMoneyBase, sinceFor } from "@/lib/money/data";
import { money, monthYear, percent } from "@/lib/money/format";
import { isPeriod, recurringTotals } from "@/lib/money/summary";
import { localDate } from "@/lib/time";
import { PageHeader } from "@/components/ui/card";
import { MoneyNav } from "@/components/money/money-nav";
import { CashFlowSection } from "@/components/money/cash-flow";
import { BudgetSection, DebtSection } from "@/components/money/budget-debt";
import { GoalsSection } from "@/components/money/goals";
import { RecurringList, RecurringTotals } from "@/components/money/recurring";
import { TransactionList } from "@/components/money/transactions";
import { AccountsSection } from "@/components/money/accounts";
import { ConnectBankButton } from "@/components/money/connect-bank";

export const metadata: Metadata = { title: "Money" };

/**
 * Money: the financial command center. Where you are (overview, this month),
 * where it's going (cash flow, budget, debt) and where you're headed
 * (goals and their projections) — from connected accounts, read-only.
 */
export default async function MoneyPage({ searchParams }: PageProps<"/money">) {
  const { supabase, userId, profile, isDemo } = await requireOnboardedUser();
  const params = await searchParams;
  const today = localDate(profile.timezone || "UTC");
  const period = isPeriod(params.period) ? params.period : "this_month";
  const base = await loadMoneyBase(supabase, userId, { since: sinceFor(period, today) });
  const m = computeMoney(base, today, period);
  const configured = Boolean(plaidConfig() && integrationsEncryptionKey()) && !isDemo;
  const connected = base.connections.length > 0;
  const importing = base.connections.some((c) => c.status === "connected" && c.history !== "complete");
  const ov = m.overview;
  const recurring = recurringTotals(base.recurring);
  const lead = m.goals.find((g) => !g.projection.achieved) ?? m.goals[0];
  const debtAccounts = base.accounts.filter((a) => a.type === "credit" || a.type === "loan");
  const payoff = m.goals
    .filter((g) => g.goal.kind === "pay_off")
    .map((g) => ({ name: g.goal.name, progress: g.projection.progress, remaining: g.projection.remaining }));

  return (
    <>
      <PageHeader title="Money" subtitle="Your financial life, understood in one place." />
      <MoneyNav />

      <div className="flex flex-col gap-14">
        {connected ? (
          <section aria-labelledby="overview-title" className="grid animate-fade-in gap-10 md:grid-cols-[1.25fr_1fr]">
            <div>
              <p id="overview-title" className="type-eyebrow">
                {ov.netWorth !== null ? "Net worth" : "Across connected accounts"}
              </p>
              <p className="type-display type-num mt-2 text-[56px] leading-[0.95] sm:text-[72px]">{money(ov.netWorth ?? ov.totalAssets)}</p>
              <ul className="type-num mt-5 flex flex-col gap-1 text-[16px]">
                {ov.cash ? (
                  <li>
                    <span className="text-money-in">+ {money(ov.cash)}</span> <span className="text-muted">cash</span>
                  </li>
                ) : null}
                {ov.investments ? (
                  <li>
                    <span className="text-money-in">+ {money(ov.investments)}</span> <span className="text-muted">investments</span>
                  </li>
                ) : null}
                {ov.otherAssets ? (
                  <li>
                    <span className="text-money-in">+ {money(ov.otherAssets)}</span> <span className="text-muted">other assets</span>
                  </li>
                ) : null}
                {ov.hasLiabilities ? (
                  <li>
                    <span>− {money(ov.debt)}</span> <span className="text-muted">debt</span>
                  </li>
                ) : null}
              </ul>
              {ov.netWorth === null ? <p className="mt-3 max-w-[40ch] text-[13px] text-muted">Connect your credit cards and loans too, and this becomes your net worth.</p> : null}
            </div>
            <div className="border-hairline md:border-l md:pl-10">
              <p className="type-eyebrow">This month</p>
              <dl className="type-num mt-3 flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">Income</dt>
                  <dd className="text-[22px] font-semibold text-money-in">{money(m.thisMonth.income)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">Spending</dt>
                  <dd className="text-[22px] font-semibold">{money(m.thisMonth.spending)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-hairline pt-3">
                  <dt className="text-muted">Net cash flow</dt>
                  <dd className="text-[22px] font-semibold">{money(m.thisMonth.net, { sign: true })}</dd>
                </div>
              </dl>
            </div>
          </section>
        ) : (
          <section aria-labelledby="connect-title" className="rounded-panel bg-surface-raised p-6 shadow-card sm:p-8">
            <h2 id="connect-title" className="type-display text-[32px] leading-tight sm:text-[40px]">
              See your whole financial picture.
            </h2>
            <p className="mt-3 max-w-[56ch] text-[16px] leading-relaxed text-muted">
              Connect your bank, cards and investments to see net worth, cash flow, recurring payments and how long your goals will take — and so your assistant can plan with your real numbers.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ConnectBankButton configured={configured} />
              {isDemo ? <span className="text-[14px] text-muted">Bank connections are available in your own account.</span> : null}
            </div>
            <p className="mt-6 flex max-w-[60ch] items-start gap-2 text-[13px] leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              Connections go through Plaid. We never see your bank password, and access is read-only: nothing here can move money, pay bills or cancel anything. You can still set a budget and goals without connecting.
            </p>
          </section>
        )}

        {importing ? (
          <p className="-mt-8 flex max-w-[64ch] items-start gap-2 text-[14px] text-muted" role="status">
            <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
            Your bank is still sending older transactions. Cash flow, recurring payments and projections fill in as it arrives — refresh in a few minutes.
          </p>
        ) : null}

        {connected ? (
          <section aria-label="At a glance" className="grid border-y border-hairline sm:grid-cols-3 sm:divide-x sm:divide-hairline">
            <Glance
              href="#debt-title"
              label="Debt-to-income"
              value={m.dti.status === "ok" ? percent(m.dti.ratio) : "—"}
              hint={m.dti.status === "ok" ? `${money(m.dti.monthlyDebt)} a month in debt payments` : "Add your income to see it"}
            />
            <Glance
              href="#goals-title"
              label={lead ? lead.goal.name : "Goals"}
              value={lead ? percent(lead.projection.progress) : "—"}
              hint={lead ? (lead.projection.projectedMonth ? `At this pace: projected ${monthYear(lead.projection.projectedMonth)}` : lead.projection.achieved ? "Reached" : "Set a monthly amount") : "Add a goal"}
            />
            <Glance href="/money/recurring" label="Recurring" value={money(recurring.monthly)} hint={`a month · ${money(recurring.yearly)} a year`} />
          </section>
        ) : null}

        {connected ? <CashFlowSection flow={m.cashFlow} period={period} /> : null}
        <Divider />
        <DebtSection
          totalDebt={ov.debt}
          debtAccounts={debtAccounts}
          dti={m.dti}
          income={base.income}
          transactionIncome={m.thisMonth.income}
          payoff={payoff}
        />
        <Divider />
        <BudgetSection status={m.budget} budgets={base.budgets} connected={connected} />
        <Divider />
        <GoalsSection goals={m.goals} accounts={base.accounts} recentSavings={m.recentSavings} today={today} />
        {connected ? (
          <>
            <Divider />
            <section aria-labelledby="recurring-title">
              <h2 id="recurring-title" className="text-title mb-2 font-semibold">
                Recurring payments
              </h2>
              <RecurringTotals items={base.recurring} />
              <div className="mt-5">
                <RecurringList items={base.recurring} today={today} limit={5} />
              </div>
            </section>
            <Divider />
            <section aria-labelledby="recent-title">
              <div className="mb-4 flex items-end justify-between gap-3">
                <h2 id="recent-title" className="text-title font-semibold">
                  Recent transactions
                </h2>
                <Link href="/money/transactions" className="inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-accent hover:underline">
                  All transactions <ArrowUpRight className="size-4" aria-hidden />
                </Link>
              </div>
              <TransactionList txns={base.txns.slice(0, 8)} accounts={base.accounts} today={today} />
            </section>
          </>
        ) : null}
        <Divider />
        <AccountsSection connections={base.connections} accounts={base.accounts} configured={configured} />
      </div>
    </>
  );
}

function Divider() {
  return <hr className="border-hairline" />;
}

function Glance({ href, label, value, hint }: { href: string; label: string; value: string; hint: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-20 items-baseline justify-between gap-4 border-b border-hairline py-4 last:border-b-0 transition-colors hover:bg-surface-2/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring sm:flex-col sm:items-start sm:justify-start sm:gap-0 sm:border-b-0 sm:px-5 sm:first:pl-0"
    >
      <span className="min-w-0">
        <span className="type-eyebrow block truncate">{label}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted sm:hidden">{hint}</span>
      </span>
      <span className="type-num shrink-0 text-[24px] font-semibold tracking-[-0.02em] sm:mt-1.5 sm:text-[28px]">{value}</span>
      <span className="mt-0.5 hidden text-[13px] leading-snug text-muted sm:block">{hint}</span>
    </Link>
  );
}
