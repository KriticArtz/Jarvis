"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { deleteFinancialGoal, saveFinancialGoal } from "@/lib/actions/money";
import { money, monthYear, percent, shortDate } from "@/lib/money/format";
import { projectGoal, type GoalProjection, type MoneyAccount } from "@/lib/money/summary";
import type { StoredGoal } from "@/lib/money/data";
import { Button } from "@/components/ui/button";
import { Field, FormMessage, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

/**
 * Financial goals with a forecast. Every projection names its assumption
 * ("At $750/month") and reads as an estimate ("Projected", "At this pace").
 * The monthly amount can be tried out right here; saving makes it the plan.
 */
export function GoalsSection({
  goals,
  accounts,
  recentSavings,
  today,
}: {
  goals: { goal: StoredGoal; projection: GoalProjection }[];
  accounts: MoneyAccount[];
  recentSavings: { amount: number; months: number } | null;
  today: string;
}) {
  const [editing, setEditing] = useState<StoredGoal | "new" | null>(null);
  return (
    <section aria-labelledby="goals-title">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="goals-title" className="text-title font-semibold">
            Goals
          </h2>
          <p className="text-[14px] text-muted">Where you’re going, and how long it takes at your pace.</p>
        </div>
        <Button variant="secondary" onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden /> Add goal
        </Button>
      </div>
      {goals.length ? (
        <ul className="flex flex-col divide-y divide-hairline border-y border-hairline">
          {goals.map(({ goal }) => (
            <GoalRow key={goal.id} goal={goal} account={accounts.find((a) => a.id === goal.accountId) ?? null} recentSavings={recentSavings} today={today} onEdit={() => setEditing(goal)} />
          ))}
        </ul>
      ) : (
        <p className="text-[15px] text-muted">An emergency fund, a card to pay off, a car — add a goal and see when you’d get there.</p>
      )}
      <p className="mt-4 text-[12px] leading-snug text-subtle">Projections assume the same amount every month. They’re estimates, not promises — and not financial advice.</p>
      {editing ? <GoalSheet goal={editing === "new" ? null : editing} accounts={accounts} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function GoalRow({ goal, account, recentSavings, today, onEdit }: { goal: StoredGoal; account: MoneyAccount | null; recentSavings: { amount: number } | null; today: string; onEdit: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [trial, setTrial] = useState<string>("");
  const trialAmount = Number(trial);
  const tryingOut = trial !== "" && Number.isFinite(trialAmount) && trialAmount > 0;
  const p = projectGoal({ ...goal, monthlyContribution: tryingOut ? trialAmount : goal.monthlyContribution, account }, today, recentSavings);
  // The assumption is always stated next to the result it produces.
  const assumption = p.contribution
    ? p.contribution.source === "planned"
      ? `${money(p.contribution.amount)}/month${tryingOut ? " (trying out)" : " (your plan)"}`
      : `About ${money(p.contribution.amount)}/month (your recent average savings)`
    : null;

  const savePlan = () =>
    start(async () => {
      const res = await saveFinancialGoal({
        id: goal.id,
        name: goal.name,
        kind: goal.kind,
        targetAmount: goal.targetAmount,
        currentAmount: goal.currentAmount,
        targetDate: goal.targetDate,
        monthlyContribution: trialAmount,
        accountId: goal.accountId,
      });
      toast({ title: res.ok ? `Plan saved: ${money(trialAmount)}/month` : "Couldn't save that", description: res.ok ? undefined : res.error, tone: res.ok ? "success" : "danger" });
      if (res.ok) {
        setTrial("");
        router.refresh();
      }
    });

  return (
    <li className="py-5" data-goal={goal.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="type-eyebrow">{goal.kind === "pay_off" ? "Pay off" : "Save"}</p>
          <h3 className="mt-1 truncate text-[17px] font-semibold">{goal.name}</h3>
        </div>
        <Button variant="ghost" onClick={onEdit} aria-label={`Edit ${goal.name}`}>
          Edit
        </Button>
      </div>
      <p className="type-num mt-2 text-[15px]">
        <span className="font-semibold">{money(p.current)}</span> <span className="text-muted">/ {money(goal.targetAmount)}</span>
        <span className="ml-2 text-[13px] text-muted">{percent(p.progress)}</span>
      </p>
      <div className="mt-2 h-2 rounded-full bg-surface-2" role="img" aria-label={`${percent(p.progress)} of ${money(goal.targetAmount)}`}>
        <div className="h-full rounded-full bg-success" style={{ width: `${p.progress * 100}%` }} />
      </div>
      {p.achieved ? (
        <p className="mt-3 text-[15px] font-medium text-success">Reached. Nicely done.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-1 text-[15px]">
          <p className="type-num text-muted">
            {money(p.remaining)} remaining{goal.targetDate ? ` · target ${shortDate(goal.targetDate, today)}` : ""}
            {account ? ` · tracking ${account.name}` : ""}
          </p>
          {assumption ? (
            <div data-forecast className="type-num">
              <p>
                <span className="text-muted">{assumption} →</span>{" "}
                {p.months !== null ? (
                  <span className="font-semibold">
                    approximately {p.months} month{p.months === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="text-muted">more than 50 years</span>
                )}
              </p>
              {p.projectedMonth ? (
                <p>
                  <span className="text-muted">At this pace →</span> projected {monthYear(p.projectedMonth)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-muted">Set a monthly amount to see when you’d get there.</p>
          )}
          {p.neededMonthly !== null ? (
            <p className={cn("text-[14px]", p.onTrack === false ? "text-warning" : "text-muted")}>
              To reach it by {shortDate(goal.targetDate!, today)}: about {money(p.neededMonthly)}/month{p.onTrack === true ? " — you're on track." : p.onTrack === false ? "." : ""}
            </p>
          ) : null}
          {p.scenarios.length ? (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="What if you put in a different amount">
              {p.scenarios.map((s) => (
                <li key={s.amount}>
                  <button
                    type="button"
                    onClick={() => setTrial(String(s.amount))}
                    aria-label={`${money(s.amount)} a month: approximately ${s.months === null ? "more than 50 years" : `${s.months} month${s.months === 1 ? "" : "s"}`}`}
                    className="type-num inline-flex min-h-11 items-center rounded-full bg-surface-2 px-3.5 text-[13px] text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
                  >
                    {money(s.amount)}/mo → {s.months === null ? "50+ yrs" : `~${s.months} mo`}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor={`trial-${goal.id}`} className="text-[14px] text-muted">
              Try a monthly amount
            </label>
            <div className="w-32">
              <Input id={`trial-${goal.id}`} inputMode="decimal" placeholder={p.contribution ? String(Math.round(p.contribution.amount)) : "500"} value={trial} onChange={(e) => setTrial(e.target.value)} className="h-11" />
            </div>
            {tryingOut ? (
              <Button variant="secondary" onClick={savePlan} disabled={pending}>
                {pending ? "Saving…" : "Make this my plan"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </li>
  );
}

function GoalSheet({ goal, accounts, onClose }: { goal: StoredGoal | null; accounts: MoneyAccount[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    name: goal?.name ?? "",
    kind: goal?.kind ?? ("save" as "save" | "pay_off"),
    targetAmount: goal ? String(goal.targetAmount) : "",
    currentAmount: goal ? String(goal.currentAmount) : "",
    targetDate: goal?.targetDate ?? "",
    monthlyContribution: goal?.monthlyContribution ? String(goal.monthlyContribution) : "",
    accountId: goal?.accountId ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const eligible = accounts.filter((a) => (f.kind === "save" ? a.type === "depository" || a.type === "investment" : a.type === "credit" || a.type === "loan"));
  const submit = () =>
    start(async () => {
      const res = await saveFinancialGoal({ id: goal?.id, ...f, accountId: eligible.some((a) => a.id === f.accountId) ? f.accountId : "" });
      if (!res.ok) return setError(res.error ?? "Please check the goal.");
      toast({ title: res.message ?? "Saved", tone: "success" });
      onClose();
      router.refresh();
    });
  const remove = () =>
    start(async () => {
      if (!goal) return;
      const res = await deleteFinancialGoal(goal.id);
      toast({ title: res.ok ? "Goal removed" : "Couldn't remove it", tone: res.ok ? "neutral" : "danger" });
      onClose();
      router.refresh();
    });
  return (
    <Sheet
      open
      onClose={onClose}
      title={goal ? "Edit goal" : "New goal"}
      footer={
        <div className="flex gap-2">
          {goal ? (
            <Button variant="danger" onClick={remove} disabled={pending}>
              Remove
            </Button>
          ) : null}
          <Button onClick={submit} disabled={pending} className="flex-1">
            {pending ? "Saving…" : "Save goal"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" htmlFor="goal-name">
          <Input id="goal-name" placeholder="Emergency fund" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Kind" htmlFor="goal-kind">
          <Select id="goal-kind" value={f.kind} onChange={(e) => set("kind", e.target.value)}>
            <option value="save">Save up</option>
            <option value="pay_off">Pay off a debt</option>
          </Select>
        </Field>
        <Field label={f.kind === "pay_off" ? "Amount to pay off" : "Target amount"} htmlFor="goal-target">
          <Input id="goal-target" inputMode="decimal" placeholder="10000" value={f.targetAmount} onChange={(e) => set("targetAmount", e.target.value)} />
        </Field>
        {eligible.length ? (
          <Field label={f.kind === "pay_off" ? "Debt account (optional)" : "Track an account (optional)"} htmlFor="goal-account" hint={f.kind === "pay_off" ? "Progress follows that balance going down." : "Progress follows that account's balance."}>
            <Select id="goal-account" value={f.accountId} onChange={(e) => set("accountId", e.target.value)}>
              <option value="">Enter progress myself</option>
              {eligible.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.mask ? ` ••${a.mask}` : ""}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {!f.accountId ? (
          <Field label={f.kind === "pay_off" ? "Paid so far" : "Saved so far"} htmlFor="goal-current">
            <Input id="goal-current" inputMode="decimal" placeholder="0" value={f.currentAmount} onChange={(e) => set("currentAmount", e.target.value)} />
          </Field>
        ) : null}
        <Field label="Monthly amount you plan to put in" htmlFor="goal-monthly" hint="Used for the projection. Leave blank to use your recent savings, if there's enough history.">
          <Input id="goal-monthly" inputMode="decimal" placeholder="750" value={f.monthlyContribution} onChange={(e) => set("monthlyContribution", e.target.value)} />
        </Field>
        <Field label="Target date (optional)" htmlFor="goal-date">
          <Input id="goal-date" type="date" value={f.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
        </Field>
        {error ? <FormMessage>{error}</FormMessage> : null}
      </div>
    </Sheet>
  );
}
