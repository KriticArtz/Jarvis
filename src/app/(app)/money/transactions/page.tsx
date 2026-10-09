import type { Metadata } from "next";
import { requireOnboardedUser } from "@/lib/auth";
import { BUDGET_CATEGORIES, CATEGORIES, isCategory, type CategoryKey } from "@/lib/money/categories";
import { uuid } from "@/lib/validation/schemas";
import { localDate } from "@/lib/time";
import { PageHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { MoneyNav } from "@/components/money/money-nav";
import { TransactionList, type TxnDetail } from "@/components/money/transactions";
import type { AccountType, MoneyAccount } from "@/lib/money/summary";

export const metadata: Metadata = { title: "Transactions" };

const LIMIT = 150;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Search and filter transactions (server-side; read with the user's own session). */
export default async function TransactionsPage({ searchParams }: PageProps<"/money/transactions">) {
  const { supabase, userId, profile } = await requireOnboardedUser();
  const today = localDate(profile.timezone || "UTC");
  const p = await searchParams;
  const q = str(p.q).trim().slice(0, 60);
  const category = isCategory(p.category) ? (p.category as CategoryKey) : "";
  const account = uuid.safeParse(p.account).success ? str(p.account) : "";
  const type = p.type === "income" || p.type === "expense" ? p.type : "";
  const from = DATE.test(str(p.from)) ? str(p.from) : "";
  const to = DATE.test(str(p.to)) ? str(p.to) : "";

  let query = supabase
    .from("financial_transactions")
    .select("id, date, authorized_date, name, amount, category, merchant_key, merchant_name, pending, account_id, merchant_website")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  // Search text is reduced to letters, digits and spaces, so it can't change the filter's meaning.
  const safe = q.replace(/[^\p{L}\p{N} ]+/gu, " ").trim();
  if (safe) query = query.or(`merchant_name.ilike.%${safe}%,name.ilike.%${safe}%`);
  if (category) query = query.eq("category", category);
  if (account) query = query.eq("account_id", account);
  if (type === "income") query = query.gt("amount", 0);
  if (type === "expense") query = query.lt("amount", 0);
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);

  const [{ data }, { data: accountRows }] = await Promise.all([
    query,
    supabase.from("financial_accounts").select("id, connection_id, name, type, subtype, mask, current_balance, available_balance, credit_limit").eq("user_id", userId).order("name"),
  ]);
  const txns: TxnDetail[] = (data ?? []).map((t) => ({
    id: String(t.id),
    date: String(t.date),
    authorizedDate: (t.authorized_date as string | null) ?? null,
    name: String(t.name),
    amount: Number(t.amount),
    category: String(t.category),
    merchantKey: String(t.merchant_key),
    merchantName: String(t.merchant_name ?? t.merchant_key),
    pending: Boolean(t.pending),
    accountId: String(t.account_id),
    merchantWebsite: (t.merchant_website as string | null) ?? null,
  }));
  const accounts: MoneyAccount[] = (accountRows ?? []).map((a) => ({
    id: String(a.id),
    connectionId: String(a.connection_id),
    name: String(a.name),
    type: a.type as AccountType,
    subtype: (a.subtype as string | null) ?? null,
    mask: (a.mask as string | null) ?? null,
    currentBalance: a.current_balance === null ? null : Number(a.current_balance),
    availableBalance: a.available_balance === null ? null : Number(a.available_balance),
    creditLimit: a.credit_limit === null ? null : Number(a.credit_limit),
  }));
  const filtered = Boolean(q || category || account || type || from || to);
  const categories = [...BUDGET_CATEGORIES, "income", "transfer", "credit_card_payment"] as CategoryKey[];

  return (
    <>
      <PageHeader title="Transactions" subtitle="Everything that moved through your connected accounts." />
      <MoneyNav />
      <form method="get" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3" role="search" aria-label="Filter transactions">
        <label className="col-span-2 sm:col-span-3">
          <span className="sr-only">Search</span>
          <Input name="q" type="search" defaultValue={q} placeholder="Search merchant or description" className="h-11" />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <Select name="category" defaultValue={category} className="h-11">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">Account</span>
          <Select name="account" defaultValue={account} className="h-11">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.mask ? ` ••${a.mask}` : ""}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">Money in or out</span>
          <Select name="type" defaultValue={type} className="h-11">
            <option value="">In and out</option>
            <option value="income">Money in</option>
            <option value="expense">Money out</option>
          </Select>
        </label>
        <div className="col-span-2 grid grid-cols-2 gap-3 sm:col-span-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            From
            <Input name="from" type="date" defaultValue={from} max={today} className="h-11" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-muted">
            To
            <Input name="to" type="date" defaultValue={to} max={today} className="h-11" />
          </label>
          <Button type="submit" className="self-end">
            Apply
          </Button>
          {filtered ? (
            <ButtonLink href="/money/transactions" variant="ghost" className="self-end">
              Clear
            </ButtonLink>
          ) : null}
        </div>
      </form>
      <p className="mb-4 text-[13px] text-muted" aria-live="polite">
        {txns.length === LIMIT ? `Showing the latest ${LIMIT} — narrow it down with the filters.` : `${txns.length} transaction${txns.length === 1 ? "" : "s"}${filtered ? " match" : ""}.`}
      </p>
      <TransactionList txns={txns} accounts={accounts} today={today} />
    </>
  );
}
