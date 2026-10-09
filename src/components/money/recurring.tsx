"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Check, CircleHelp, X } from "lucide-react";
import { setRecurringDecision } from "@/lib/actions/money";
import { cancelHelp } from "@/lib/money/cancellation";
import { categoryLabel } from "@/lib/money/categories";
import { money, shortDate } from "@/lib/money/format";
import { monthlyAmount, recurringTotals, type Frequency } from "@/lib/money/summary";
import type { StoredRecurring } from "@/lib/money/data";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

const PER: Record<Frequency, string> = { weekly: "week", biweekly: "2 weeks", monthly: "month", quarterly: "quarter", annual: "year" };
const DECISION = { keep: { label: "Keeping", tone: "success" }, review: { label: "To review", tone: "warning" }, cancel: { label: "To cancel", tone: "neutral" } } as const;

export function RecurringTotals({ items }: { items: StoredRecurring[] }) {
  const t = recurringTotals(items);
  return (
    <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span className="type-num text-[28px] font-semibold tracking-[-0.02em]">
        {money(t.monthly)}
        <span className="text-[16px] font-medium text-muted"> / month</span>
      </span>
      <span className="type-num text-[15px] text-muted">
        {money(t.yearly)} / year · {t.count} recurring payment{t.count === 1 ? "" : "s"}
      </span>
    </p>
  );
}

export function RecurringList({ items, today, limit }: { items: StoredRecurring[]; today: string; limit?: number }) {
  const [open, setOpen] = useState<StoredRecurring | null>(null);
  const active = items.filter((r) => r.status === "active").sort((a, b) => (a.nextExpectedDate ?? "9").localeCompare(b.nextExpectedDate ?? "9"));
  const shown = limit ? active.slice(0, limit) : active;
  if (!active.length) return <p className="text-[15px] text-muted">No recurring payments found yet. They show up once the same charge repeats a few times.</p>;
  return (
    <>
      <ul className="divide-y divide-hairline border-y border-hairline" aria-label="Recurring payments">
        {shown.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpen(r)}
              className="flex min-h-14 w-full items-center gap-3 py-3 text-left transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:bg-surface-2"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-medium">{r.merchantName}</span>
                  {r.decision ? <Badge tone={DECISION[r.decision].tone}>{DECISION[r.decision].label}</Badge> : null}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {categoryLabel(r.category)}
                  {r.nextExpectedDate ? ` · next ${shortDate(r.nextExpectedDate, today)}` : ""}
                </span>
              </span>
              <span className="type-num text-right text-[15px]">
                {money(r.averageAmount, { cents: true })}
                <span className="block text-[12px] text-muted">/ {PER[r.frequency]}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {limit && active.length > limit ? (
        <Link href="/money/recurring" className="mt-3 inline-flex min-h-11 items-center gap-1 text-[14px] font-medium text-accent hover:underline">
          All {active.length} recurring payments <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      ) : null}
      {open ? <RecurringSheet item={open} today={today} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function RecurringSheet({ item, today, onClose }: { item: StoredRecurring; today: string; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [decision, setDecision] = useState(item.decision);
  const [showCancel, setShowCancel] = useState(item.decision === "cancel");
  const help = cancelHelp(item.merchantKey, item.merchantWebsite, item.merchantName);
  const decide = (choice: "keep" | "review" | "cancel") =>
    start(async () => {
      const next = decision === choice ? null : choice;
      const res = await setRecurringDecision({ id: item.id, decision: next });
      if (!res.ok) return toast({ title: "Couldn't save that", tone: "danger" });
      setDecision(next);
      setShowCancel(next === "cancel");
      router.refresh();
    });
  return (
    <Sheet open onClose={onClose} title={item.merchantName}>
      <div className="flex flex-col gap-6">
        <dl className="type-num grid grid-cols-2 gap-x-6 gap-y-4 text-[15px]">
          <div>
            <dt className="type-eyebrow">Amount</dt>
            <dd className="mt-1 font-semibold">
              {money(item.averageAmount, { cents: true })} / {PER[item.frequency]}
            </dd>
          </div>
          <div>
            <dt className="type-eyebrow">Per year</dt>
            <dd className="mt-1 font-semibold">{money(monthlyAmount(item) * 12)}</dd>
          </div>
          <div>
            <dt className="type-eyebrow">Last charged</dt>
            <dd className="mt-1">
              {shortDate(item.lastDate, today)} · {money(item.lastAmount, { cents: true })}
            </dd>
          </div>
          <div>
            <dt className="type-eyebrow">Next expected</dt>
            <dd className="mt-1">{item.nextExpectedDate ? shortDate(item.nextExpectedDate, today) : "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="type-eyebrow">Category</dt>
            <dd className="mt-1">{categoryLabel(item.category)}</dd>
          </div>
        </dl>

        <div>
          <p className="type-eyebrow mb-2">Your call</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Review this payment">
            {(
              [
                ["keep", "Keep", Check],
                ["review", "Review", CircleHelp],
                ["cancel", "Cancel", X],
              ] as const
            ).map(([d, label, Icon]) => (
              <Button key={d} variant={decision === d ? "primary" : "secondary"} aria-pressed={decision === d} disabled={pending} onClick={() => decide(d)}>
                <Icon className="size-4" aria-hidden /> {label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-muted">This is just a note for you. Nothing is changed with {item.merchantName}.</p>
        </div>

        {showCancel ? (
          <div className="rounded-tile bg-surface-2/70 p-4" data-cancel-help={help.kind}>
            <p className="text-[15px] font-medium">How to cancel</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">{help.note}</p>
            {"url" in help ? (
              <a
                href={help.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn("mt-3 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-accent hover:underline")}
              >
                {help.label} <ArrowUpRight className="size-4" aria-hidden />
              </a>
            ) : null}
            <p className="mt-3 text-[12px] text-subtle">We can’t cancel subscriptions or stop payments for you — you stay in control of your accounts.</p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
