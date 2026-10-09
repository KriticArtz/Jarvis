import type { Metadata } from "next";
import { requireOnboardedUser } from "@/lib/auth";
import { loadMoneyBase } from "@/lib/money/data";
import { money, shortDate } from "@/lib/money/format";
import { addDaysIso } from "@/lib/money/summary";
import { localDate } from "@/lib/time";
import { PageHeader } from "@/components/ui/card";
import { MoneyNav } from "@/components/money/money-nav";
import { RecurringList, RecurringTotals } from "@/components/money/recurring";

export const metadata: Metadata = { title: "Recurring payments" };

export default async function RecurringPage() {
  const { supabase, userId, profile } = await requireOnboardedUser();
  const today = localDate(profile.timezone || "UTC");
  const base = await loadMoneyBase(supabase, userId, { since: addDaysIso(today, -1) });
  const inactive = base.recurring.filter((r) => r.status === "inactive");
  const dueSoon = base.recurring.filter((r) => r.status === "active" && r.nextExpectedDate && r.nextExpectedDate >= today && r.nextExpectedDate <= addDaysIso(today, 7))
    .sort((a, b) => a.nextExpectedDate!.localeCompare(b.nextExpectedDate!));

  return (
    <>
      <PageHeader title="Recurring" subtitle="Subscriptions, bills and loan payments that repeat." />
      <MoneyNav />
      <div className="flex flex-col gap-12">
        <section aria-label="Total">
          <RecurringTotals items={base.recurring} />
          {dueSoon.length ? (
            <p className="mt-2 text-[15px] text-muted">
              Next 7 days: {dueSoon.map((r) => `${r.merchantName} ${money(r.averageAmount, { cents: true })} (${shortDate(r.nextExpectedDate!, today)})`).join(" · ")}
            </p>
          ) : null}
        </section>
        <section aria-labelledby="active-title">
          <h2 id="active-title" className="type-eyebrow mb-2">
            Active
          </h2>
          <RecurringList items={base.recurring} today={today} />
        </section>
        {inactive.length ? (
          <section aria-labelledby="inactive-title">
            <h2 id="inactive-title" className="type-eyebrow mb-2">
              No longer seen
            </h2>
            <ul className="divide-y divide-hairline border-y border-hairline text-[15px]">
              {inactive.map((r) => (
                <li key={r.id} className="flex min-h-12 items-center justify-between gap-3 py-2.5 text-muted">
                  <span className="truncate">{r.merchantName}</span>
                  <span className="type-num">last {shortDate(r.lastDate, today)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="max-w-[64ch] text-[13px] leading-relaxed text-muted">
          How this works: a payment shows up here once it has repeated several times from the same merchant, at a similar amount and a regular interval — weekly, every two weeks, monthly, quarterly or yearly. One-off and irregular purchases never do. Cancelling is always up to you: we show where to manage each one, but we can&apos;t cancel anything for you.
        </p>
      </div>
    </>
  );
}
