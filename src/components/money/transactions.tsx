"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { categoryLabel } from "@/lib/money/categories";
import { shortDate } from "@/lib/money/format";
import { addDaysIso, type MoneyAccount, type MoneyTxn } from "@/lib/money/summary";
import { Badge } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { Amount } from "./amount";

export interface TxnDetail extends MoneyTxn {
  name: string;
  authorizedDate: string | null;
}

function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDaysIso(today, -1)) return "Yesterday";
  return shortDate(date, today);
}

/** Transactions grouped by day; a row opens its details. */
export function TransactionList({ txns, accounts, today }: { txns: TxnDetail[]; accounts: MoneyAccount[]; today: string }) {
  const [open, setOpen] = useState<TxnDetail | null>(null);
  const accountName = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.name}${a.mask ? ` ••${a.mask}` : ""}` : "Account";
  };
  if (!txns.length) return <p className="text-[15px] text-muted">No transactions match.</p>;
  const days: { date: string; items: TxnDetail[] }[] = [];
  for (const t of txns) {
    const last = days[days.length - 1];
    if (last?.date === t.date) last.items.push(t);
    else days.push({ date: t.date, items: [t] });
  }
  return (
    <>
      <div className="flex flex-col gap-6">
        {days.map((d) => (
          <section key={d.date} aria-label={dayLabel(d.date, today)}>
            <h3 className="type-eyebrow mb-1">{dayLabel(d.date, today)}</h3>
            <ul className="divide-y divide-hairline border-b border-hairline">
              {d.items.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(t)}
                    className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-surface-2/50 focus-visible:outline-none focus-visible:bg-surface-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-medium">{t.merchantName}</span>
                        {t.pending ? <Badge>Pending</Badge> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted">
                        {categoryLabel(t.category)} · {accountName(t.accountId)}
                      </span>
                    </span>
                    <Amount value={t.amount} className="text-[15px]" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {open ? (
        <Sheet open onClose={() => setOpen(null)} title={open.merchantName}>
          <div className="flex flex-col gap-5">
            <p className="type-num text-[32px] font-semibold tracking-[-0.02em]">
              <Amount value={open.amount} />
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-[15px]">
              <div>
                <dt className="type-eyebrow">Date</dt>
                <dd className="mt-1">{shortDate(open.date, today)}</dd>
              </div>
              <div>
                <dt className="type-eyebrow">Status</dt>
                <dd className="mt-1">{open.pending ? "Pending" : "Posted"}</dd>
              </div>
              <div>
                <dt className="type-eyebrow">Category</dt>
                <dd className="mt-1">{categoryLabel(open.category)}</dd>
              </div>
              <div>
                <dt className="type-eyebrow">Account</dt>
                <dd className="mt-1">{accountName(open.accountId)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="type-eyebrow">On your statement</dt>
                <dd className="mt-1 break-words font-mono text-[13px] text-muted">{open.name}</dd>
              </div>
              {open.authorizedDate && open.authorizedDate !== open.date ? (
                <div>
                  <dt className="type-eyebrow">Authorized</dt>
                  <dd className="mt-1">{shortDate(open.authorizedDate, today)}</dd>
                </div>
              ) : null}
            </dl>
            {open.merchantWebsite ? (
              <a href={open.merchantWebsite} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-accent hover:underline">
                Open merchant <ArrowUpRight className="size-4" aria-hidden />
              </a>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
