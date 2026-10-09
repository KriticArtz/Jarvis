"use client";

import Link from "next/link";
import { useState } from "react";
import { categoryLabel } from "@/lib/money/categories";
import { money, monthShort, percent } from "@/lib/money/format";
import { PERIODS, type CashFlow, type Period } from "@/lib/money/summary";
import { cn } from "@/lib/cn";
import { Figure } from "./amount";

/**
 * "Where is my money going?" — income vs spending month by month (one axis,
 * two series, legend + direct labels), the period's totals, and spending by
 * category. Hover a month for its numbers (each month is also labelled for
 * screen readers); the same data is available as a table, which is the
 * keyboard path on narrow screens where 12 columns can't each be a target.
 */
export function CashFlowSection({ flow, period }: { flow: CashFlow; period: Period }) {
  const months = flow.months.length;
  return (
    <section aria-labelledby="cashflow-title" className="scroll-mt-24">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="cashflow-title" className="text-title font-semibold">
            Cash flow
          </h2>
          <p className="text-[14px] text-muted">{flow.partial ? "Includes this month so far." : "Income and spending, transfers excluded."}</p>
        </div>
        <PeriodPicker value={period} />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Figure label="Income" value={<span className="text-money-in">{money(flow.income, { sign: flow.income > 0 })}</span>} hint={months > 1 ? `${money(flow.income / months)} / month` : undefined} />
        <Figure label="Spending" value={money(flow.spending)} hint={months > 1 ? `${money(flow.spending / months)} / month` : undefined} />
        <Figure label="Net cash flow" value={money(flow.net, { sign: true })} hint={months > 1 ? `${money(flow.net / months, { sign: true })} / month` : undefined} />
        <Figure label="Savings rate" value={flow.savingsRate === null ? "—" : percent(flow.savingsRate)} hint={flow.savingsRate === null ? "No income in this period" : "Net ÷ income"} />
      </div>

      {months > 1 ? <MonthlyBars flow={flow} /> : <SingleMonth flow={flow} />}
      <Categories flow={flow} />
    </section>
  );
}

function PeriodPicker({ value }: { value: Period }) {
  return (
    <nav aria-label="Cash flow period" className="-mx-1 max-w-full overflow-x-auto px-1 no-scrollbar">
      <ul className="inline-flex rounded-full bg-surface-2 p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
        {PERIODS.map((p) => (
          <li key={p.value}>
            <Link
              href={p.value === "this_month" ? "/money#cashflow-title" : `/money?period=${p.value}#cashflow-title`}
              scroll={false}
              aria-current={p.value === value ? "true" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-(--dur-2) focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring",
                p.value === value ? "bg-surface-raised text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_0_0_1px_var(--hairline)]" : "text-muted hover:text-foreground",
              )}
            >
              {p.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-[13px] text-muted" aria-hidden>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-money-in" /> Income
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-money-out" /> Spending
      </span>
    </div>
  );
}

function MonthlyBars({ flow }: { flow: CashFlow }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...flow.months.flatMap((m) => [m.income, m.spending]));
  const shown = active ?? flow.months.length - 1;
  const m = flow.months[shown];
  return (
    <figure className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <Legend />
        {/* Readout for the hovered/focused month (or the latest). */}
        <p className="type-num text-[13px] text-muted" aria-live="polite">
          <span className="font-medium text-foreground">{monthShort(m.month)}</span> · in {money(m.income)} · out {money(m.spending)} · net {money(m.net, { sign: true })}
        </p>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-hairline" />
        <ol className="flex h-44 items-end gap-1 sm:gap-2" aria-label="Income and spending by month">
          {flow.months.map((row, i) => (
            <li
              key={row.month}
              role="img"
              aria-label={`${monthShort(row.month)}: income ${money(row.income)}, spending ${money(row.spending)}, net ${money(row.net, { sign: true })}`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className={cn("flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-[6px] px-0.5 transition-colors", shown === i && active !== null && "bg-surface-2/70")}
            >
              <span className="w-full max-w-4 rounded-t-[4px] bg-money-in" style={{ height: `${(row.income / max) * 100}%`, minHeight: row.income > 0 ? 2 : 0 }} />
              <span className="w-full max-w-4 rounded-t-[4px] bg-money-out" style={{ height: `${(row.spending / max) * 100}%`, minHeight: row.spending > 0 ? 2 : 0 }} />
            </li>
          ))}
        </ol>
      </div>
      <ol className="mt-2 flex gap-1 sm:gap-2" aria-hidden>
        {flow.months.map((row, i) => (
          <li key={row.month} className={cn("min-w-0 flex-1 text-center text-[11px] text-subtle", flow.months.length > 6 && i % 2 === 1 && "max-sm:invisible")}>
            {monthShort(row.month)}
          </li>
        ))}
      </ol>
      <details className="mt-3 text-[13px] text-muted">
        <summary className="inline-flex min-h-11 cursor-pointer items-center hover:text-foreground">Show as a table</summary>
        <table className="type-num mt-1 w-full text-left">
          <thead>
            <tr className="text-subtle">
              <th className="py-1 font-medium">Month</th>
              <th className="py-1 text-right font-medium">Income</th>
              <th className="py-1 text-right font-medium">Spending</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {flow.months.map((row) => (
              <tr key={row.month} className="border-t border-hairline">
                <td className="py-1.5">{row.month}</td>
                <td className="py-1.5 text-right">{money(row.income)}</td>
                <td className="py-1.5 text-right">{money(row.spending)}</td>
                <td className="py-1.5 text-right">{money(row.net, { sign: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function SingleMonth({ flow }: { flow: CashFlow }) {
  const max = Math.max(1, flow.income, flow.spending);
  const rows = [
    { label: "Income", value: flow.income, cls: "bg-money-in" },
    { label: "Spending", value: flow.spending, cls: "bg-money-out" },
  ];
  return (
    <figure className="mt-8 flex flex-col gap-3" aria-label="Income and spending">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3">
          <span className="text-[13px] text-muted">{r.label}</span>
          <span className="h-3 rounded-r-[4px] bg-surface-2">
            <span className={cn("block h-full rounded-r-[4px]", r.cls)} style={{ width: `${(Math.max(0, r.value) / max) * 100}%` }} />
          </span>
          <span className="type-num text-[14px] font-medium">{money(r.value)}</span>
        </div>
      ))}
    </figure>
  );
}

function Categories({ flow }: { flow: CashFlow }) {
  if (!flow.categories.length) return null;
  const top = flow.categories.slice(0, 7);
  const rest = flow.categories.slice(7).reduce((s, c) => s + c.amount, 0);
  const rows = rest > 0 ? [...top, { category: "__rest", amount: rest, share: rest / flow.spending }] : top;
  const max = Math.max(...rows.map((r) => r.amount));
  return (
    <div className="mt-10">
      <h3 className="type-eyebrow mb-3">Where it went</h3>
      <ul className="flex flex-col gap-2.5">
        {rows.map((c) => (
          <li key={c.category} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 sm:grid-cols-[12rem_1fr_auto]">
            <span className="truncate text-[14px]">{c.category === "__rest" ? "Everything else" : categoryLabel(c.category)}</span>
            <span className="h-2 rounded-r-[4px] bg-surface-2">
              <span className="block h-full rounded-r-[4px] bg-money-out" style={{ width: `${(c.amount / max) * 100}%` }} />
            </span>
            <span className="type-num w-24 text-right text-[14px]">
              {money(c.amount)} <span className="text-[12px] text-subtle">{percent(c.share)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
