"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { saveBudget, saveIncomeProfile } from "@/lib/actions/money";
import { BUDGET_CATEGORIES, categoryLabel } from "@/lib/money/categories";
import { money, percent } from "@/lib/money/format";
import { paceSentence, type BudgetStatus, type Dti, type MoneyAccount, type Pace } from "@/lib/money/summary";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { Figure } from "./amount";

const PACE_DOT: Record<Pace, string> = { under: "bg-success", on_pace: "bg-success", ahead: "bg-warning", over: "bg-warning" };

function SectionTitle({ id, title, subtitle, action }: { id: string; title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={id} className="text-title font-semibold">
          {title}
        </h2>
        {subtitle ? <p className="text-[14px] text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Spent vs budget, with a tick where spending "should" be by today. */
function PaceBar({ spent, budget, elapsed, label }: { spent: number; budget: number; elapsed: number; label: string }) {
  const ratio = Math.min(1, spent / budget);
  return (
    <div className="relative h-2.5 rounded-full bg-surface-2" role="img" aria-label={label}>
      <div className={cn("h-full rounded-full", spent > budget ? "bg-warning" : "bg-accent")} style={{ width: `${ratio * 100}%` }} />
      <div className="absolute -top-1 h-[18px] w-[2px] rounded-full bg-foreground/70" style={{ left: `calc(${elapsed * 100}% - 1px)` }} title="Where spending would be today at an even pace" />
    </div>
  );
}

// ------------------------------------------------------------------ budget

export function BudgetSection({ status, budgets, connected }: { status: BudgetStatus; budgets: { category: string; monthlyAmount: number }[]; connected: boolean }) {
  const [editing, setEditing] = useState(false);
  const t = status.total;
  return (
    <section aria-labelledby="budget-title">
      <SectionTitle
        id="budget-title"
        title="Budget"
        subtitle="This month"
        action={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden /> {budgets.length ? "Edit budget" : "Set a budget"}
          </Button>
        }
      />
      {!connected ? (
        <p className="max-w-[60ch] text-[15px] text-muted">
          {t ? (
            <>
              <span className="type-num font-semibold text-foreground">{money(t.budget)}</span> a month.{" "}
            </>
          ) : null}
          Once an account is connected, you’ll see what’s spent, what’s left and whether you’re on pace.
        </p>
      ) : t ? (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <Figure label="Monthly budget" value={money(t.budget)} />
            <Figure label="Spent" value={money(t.spent)} />
            <Figure label="Remaining" value={money(t.remaining)} hint={t.remaining < 0 ? "Past this month's budget" : undefined} />
            <Figure label="Projected" value={status.early ? "—" : money(t.projected)} hint={status.early ? "Too early in the month to project" : "This month's pace, bills counted once"} />
          </div>
          <div className="mt-6">
            <PaceBar spent={t.spent} budget={t.budget} elapsed={status.elapsed} label={`${money(t.spent)} of ${money(t.budget)} spent, ${percent(status.elapsed)} of the month gone`} />
            <p className="mt-3 text-[15px]">
              <span className={cn("mr-2 inline-flex size-2 -translate-y-px rounded-full", PACE_DOT[t.pace])} aria-hidden />
              {paceSentence(t.pace)}{" "}
              {t.pace === "ahead" && !status.early ? <span className="text-muted">At this pace you’d spend about {money(t.projected)}.</span> : null}
            </p>
          </div>
        </>
      ) : (
        <p className="text-[15px] text-muted">
          <span className="type-num font-semibold text-foreground">{money(status.spent)}</span> spent so far this month. Set a budget to see what’s left and whether you’re on pace.
        </p>
      )}
      {connected && status.categories.length ? (
        <ul className="mt-8 flex flex-col gap-4">
          {status.categories.map((c) => (
            <li key={c.category}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
                <span className="font-medium">{categoryLabel(c.category)}</span>
                <span className="type-num text-muted">
                  <span className="text-foreground">{money(c.spent)}</span> of {money(c.budget)}
                </span>
              </div>
              <PaceBar spent={c.spent} budget={c.budget} elapsed={status.elapsed} label={`${categoryLabel(c.category)}: ${money(c.spent)} of ${money(c.budget)}`} />
            </li>
          ))}
        </ul>
      ) : null}
      <BudgetSheet open={editing} onClose={() => setEditing(false)} budgets={budgets} />
    </section>
  );
}

function BudgetSheet({ open, onClose, budgets }: { open: boolean; onClose: () => void; budgets: { category: string; monthlyAmount: number }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const initial = Object.fromEntries(budgets.map((b) => [b.category, String(b.monthlyAmount)]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));
  const submit = () =>
    start(async () => {
      const { total, ...categories } = values;
      const res = await saveBudget({ total: total ?? "", categories });
      if (!res.ok) return setError(res.error ?? "Please check the amounts.");
      toast({ title: res.message ?? "Saved", tone: "success" });
      onClose();
      router.refresh();
    });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Monthly budget"
      footer={
        <Button onClick={submit} disabled={pending} className="w-full">
          {pending ? "Saving…" : "Save budget"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Total monthly spending" htmlFor="budget-total" hint="Everything except transfers between your own accounts. Leave blank for none.">
          <Input id="budget-total" inputMode="decimal" placeholder="2400" value={values.total ?? ""} onChange={(e) => set("total", e.target.value)} />
        </Field>
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer items-center text-[15px] font-medium">By category (optional)</summary>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {BUDGET_CATEGORIES.map((c) => (
              <Field key={c} label={categoryLabel(c)} htmlFor={`budget-${c}`}>
                <Input id={`budget-${c}`} inputMode="decimal" value={values[c] ?? ""} onChange={(e) => set(c, e.target.value)} />
              </Field>
            ))}
          </div>
        </details>
        {error ? <FormMessage>{error}</FormMessage> : null}
      </div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ debt

export function DebtSection({
  totalDebt,
  debtAccounts,
  dti,
  income,
  transactionIncome,
  payoff,
}: {
  totalDebt: number;
  debtAccounts: MoneyAccount[];
  dti: Dti;
  income: { grossMonthlyIncome: number | null; otherMonthlyDebt: number | null };
  /** Deposits categorized as income this month — shown separately, never used for DTI. */
  transactionIncome: number;
  payoff: { name: string; progress: number; remaining: number }[];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <section aria-labelledby="debt-title">
      <SectionTitle
        id="debt-title"
        title="Debt"
        action={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden /> {income.grossMonthlyIncome ? "Edit income" : "Add income"}
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Figure label="Total debt" value={debtAccounts.length ? money(totalDebt) : "—"} hint={debtAccounts.length ? `${debtAccounts.length} account${debtAccounts.length === 1 ? "" : "s"}` : "No credit cards or loans connected"} />
        <Figure label="Monthly debt payments" value={money(dti.monthlyDebt)} hint={dti.items.length ? "Recurring loan payments" + (income.otherMonthlyDebt ? " + what you added" : "") : "None detected yet"} />
        {dti.status === "ok" ? (
          <Figure label="Debt-to-income" value={percent(dti.ratio)} hint={`Of ${money(dti.grossMonthlyIncome)} gross monthly income you entered`} />
        ) : (
          <div className="col-span-2 sm:col-span-1">
            <p className="type-eyebrow">Debt-to-income</p>
            <p className="mt-1 text-[15px] leading-snug text-muted">Add your monthly income to calculate debt-to-income ratio.</p>
          </div>
        )}
      </div>

      {debtAccounts.length ? (
        <ul className="mt-6 divide-y divide-hairline border-y border-hairline">
          {debtAccounts.map((a) => {
            const util = a.type === "credit" && a.creditLimit && a.currentBalance !== null ? a.currentBalance / a.creditLimit : null;
            return (
              <li key={a.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium">{a.name}</p>
                  <p className="text-[13px] text-muted">
                    {a.type === "credit" ? "Credit card" : "Loan"}
                    {a.mask ? ` ••${a.mask}` : ""}
                    {util !== null ? ` · ${percent(util)} of ${money(a.creditLimit!)} limit used` : ""}
                  </p>
                </div>
                <span className="type-num text-[15px] font-medium">{a.currentBalance === null ? "—" : money(-Math.abs(a.currentBalance))}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {debtAccounts.length || dti.items.length || income.otherMonthlyDebt ? (
      <p className="mt-4 max-w-[68ch] text-[13px] leading-relaxed text-muted">
        {dti.items.length || income.otherMonthlyDebt
          ? `Counted as monthly debt: ${[...dti.items.map((i) => `${i.name} ${money(i.monthly)}`), ...(income.otherMonthlyDebt ? [`other payments you entered ${money(income.otherMonthlyDebt)}`] : [])].join(" · ")}.`
          : "No recurring loan payments found yet."}{" "}
        Credit card minimums aren’t detected — add them under Edit income if you want them counted.
      </p>
      ) : null}

      {payoff.length ? (
        <ul className="mt-6 flex flex-col gap-3">
          {payoff.map((p) => (
            <li key={p.name}>
              <div className="mb-1.5 flex items-baseline justify-between text-[14px]">
                <span className="font-medium">{p.name}</span>
                <span className="type-num text-muted">{money(p.remaining)} to go</span>
              </div>
              <div className="h-2 rounded-full bg-surface-2" role="img" aria-label={`${p.name}: ${percent(p.progress)} paid off`}>
                <div className="h-full rounded-full bg-success" style={{ width: `${p.progress * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <IncomeSheet open={editing} onClose={() => setEditing(false)} income={income} transactionIncome={transactionIncome} />
    </section>
  );
}

function IncomeSheet({ open, onClose, income, transactionIncome }: { open: boolean; onClose: () => void; income: { grossMonthlyIncome: number | null; otherMonthlyDebt: number | null }; transactionIncome: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [gross, setGross] = useState(income.grossMonthlyIncome ? String(income.grossMonthlyIncome) : "");
  const [other, setOther] = useState(income.otherMonthlyDebt ? String(income.otherMonthlyDebt) : "");
  const submit = () =>
    start(async () => {
      const res = await saveIncomeProfile({ grossMonthlyIncome: gross, otherMonthlyDebt: other });
      if (!res.ok) return setError(res.error ?? "Please check the amounts.");
      toast({ title: "Saved", tone: "success" });
      onClose();
      router.refresh();
    });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Income for debt-to-income"
      footer={
        <Button onClick={submit} disabled={pending} className="w-full">
          {pending ? "Saving…" : "Save"}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Gross monthly income"
          htmlFor="gross-income"
          hint="Before taxes and deductions. Debt-to-income uses only this number — it's never guessed from your deposits."
        >
          <Input id="gross-income" inputMode="decimal" placeholder="3000" value={gross} onChange={(e) => setGross(e.target.value)} />
        </Field>
        {transactionIncome > 0 ? (
          <p className="-mt-2 text-[13px] text-muted">For reference: {money(transactionIncome)} arrived as income in your connected accounts this month (after taxes, so usually lower).</p>
        ) : null}
        <Field label="Other monthly debt payments" htmlFor="other-debt" hint="Card minimums, or loans we can't see in your connected accounts (e.g. a car loan paid elsewhere). Optional.">
          <Input id="other-debt" inputMode="decimal" placeholder="0" value={other} onChange={(e) => setOther(e.target.value)} />
        </Field>
        {error ? <FormMessage>{error}</FormMessage> : null}
      </div>
    </Sheet>
  );
}
