import { categoryKind } from "./categories";
import { addDaysIso, addMonths, daysBetween, type Frequency, type MoneyTxn } from "./summary";

/**
 * Recurring-payment detection (pure, unit-tested).
 *
 * A pattern needs several charges — never just one — from the same
 * normalized merchant, at similar amounts, at a regular interval:
 *   1. Outflows only; transfers and income are ignored.
 *   2. Group by merchant; within a merchant, cluster by amount (±20% or ±$2),
 *      so two different subscriptions from one merchant stay apart.
 *   3. For each cluster, compare the gaps between charges with each
 *      frequency's window and pick the best fit.
 *   4. Score confidence from interval regularity, amount stability, number of
 *      occurrences and recency. Patterns below MIN_CONFIDENCE are dropped.
 *   5. A pattern whose next charge is long overdue is "inactive" (probably
 *      cancelled) and isn't counted in recurring totals.
 * Pending charges count as the latest occurrence.
 */

export const MIN_CONFIDENCE = 0.6;

const WINDOWS: Record<Frequency, { min: number; max: number; days: number; minOccurrences: number }> = {
  weekly: { min: 5, max: 9, days: 7, minOccurrences: 4 },
  biweekly: { min: 12, max: 17, days: 14, minOccurrences: 3 },
  monthly: { min: 26, max: 35, days: 30.4, minOccurrences: 3 },
  quarterly: { min: 80, max: 100, days: 91, minOccurrences: 2 },
  annual: { min: 350, max: 380, days: 365, minOccurrences: 2 },
};

export interface DetectedRecurring {
  patternKey: string;
  merchantKey: string;
  merchantName: string;
  merchantWebsite: string | null;
  category: string;
  frequency: Frequency;
  averageAmount: number;
  lastAmount: number;
  lastDate: string;
  nextExpectedDate: string;
  occurrences: number;
  confidence: number;
  status: "active" | "inactive";
  accountId: string | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Similar amounts belong together: within 20% or $2 of the cluster's median. */
function clusterByAmount(txns: MoneyTxn[]): MoneyTxn[][] {
  const sorted = [...txns].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
  const clusters: MoneyTxn[][] = [];
  for (const t of sorted) {
    const amt = Math.abs(t.amount);
    const c = clusters.find((cl) => {
      const m = median(cl.map((x) => Math.abs(x.amount)));
      return Math.abs(amt - m) <= Math.max(2, m * 0.2);
    });
    if (c) c.push(t);
    else clusters.push([t]);
  }
  return clusters;
}

/** Amount band for the stable pattern key: a modest price change stays in the same band. */
const amountBand = (amount: number) => Math.round(Math.log(Math.max(amount, 1)) / Math.log(1.3));

function nextDate(last: string, frequency: Frequency): string {
  if (frequency === "monthly") return addMonths(last, 1);
  if (frequency === "quarterly") return addMonths(last, 3);
  if (frequency === "annual") return addMonths(last, 12);
  return addDaysIso(last, frequency === "weekly" ? 7 : 14);
}

export function detectRecurring(txns: MoneyTxn[], today: string): DetectedRecurring[] {
  const outflows = txns.filter((t) => {
    const kind = categoryKind(t.category);
    return t.amount < 0 && (kind === "spending" || kind === "debt_payment") && t.merchantKey !== "unknown";
  });
  const byMerchant = new Map<string, MoneyTxn[]>();
  for (const t of outflows) byMerchant.set(t.merchantKey, [...(byMerchant.get(t.merchantKey) ?? []), t]);

  const found: DetectedRecurring[] = [];
  for (const [key, group] of byMerchant) {
    for (const cluster of clusterByAmount(group)) {
      // One charge per day at most (a pending + posted pair is one charge).
      const byDay = new Map<string, MoneyTxn>();
      for (const t of cluster.sort((a, b) => a.date.localeCompare(b.date))) if (!byDay.has(t.date) || !t.pending) byDay.set(t.date, t);
      const charges = [...byDay.values()];
      if (charges.length < 2) continue;
      const gaps = charges.slice(1).map((t, i) => daysBetween(charges[i].date, t.date));

      let best: { frequency: Frequency; fit: number } | null = null;
      for (const [frequency, w] of Object.entries(WINDOWS) as [Frequency, (typeof WINDOWS)[Frequency]][]) {
        if (charges.length < w.minOccurrences) continue;
        const fit = gaps.filter((g) => g >= w.min && g <= w.max).length / gaps.length;
        if (!best || fit > best.fit) best = { frequency, fit };
      }
      if (!best || best.fit < 0.75) continue;

      const w = WINDOWS[best.frequency];
      const amounts = charges.map((t) => Math.abs(t.amount));
      const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      const sd = Math.sqrt(amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length);
      const stability = 1 - Math.min(1, (sd / mean) * 4);
      const evidence = Math.min(1, (charges.length - 1) / (w.minOccurrences + 1));
      const last = charges[charges.length - 1];
      const sinceLast = daysBetween(last.date, today);
      const overdue = sinceLast > w.days * 1.6 + 5;
      const recency = overdue ? 0 : 1;
      const confidence = round2(0.45 * best.fit + 0.25 * stability + 0.2 * evidence + 0.1 * recency);
      if (confidence < MIN_CONFIDENCE) continue;

      const name = [...charges].reverse().find((t) => t.merchantName)?.merchantName ?? key;
      found.push({
        patternKey: `${key}:${best.frequency}:${amountBand(mean)}`.slice(0, 200),
        merchantKey: key,
        merchantName: name,
        merchantWebsite: [...charges].reverse().find((t) => t.merchantWebsite)?.merchantWebsite ?? null,
        category: last.category,
        frequency: best.frequency,
        averageAmount: round2(mean),
        lastAmount: round2(Math.abs(last.amount)),
        lastDate: last.date,
        nextExpectedDate: nextDate(last.date, best.frequency),
        occurrences: charges.length,
        confidence,
        status: overdue ? "inactive" : "active",
        accountId: last.accountId ?? null,
      });
    }
  }
  return found.sort((a, b) => b.averageAmount - a.averageAmount);
}
