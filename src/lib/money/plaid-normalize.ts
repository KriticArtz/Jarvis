import { categoryFromPlaid } from "./categories";
import { merchantDisplay, merchantKey, safeWebsite } from "./merchant";
import type { AccountType } from "./summary";

/**
 * Plaid API objects → our normalized rows (pure). Only the fields the product
 * uses are kept; raw Plaid payloads are never stored.
 */

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
  balances: { current: number | null; available: number | null; limit?: number | null; iso_currency_code?: string | null };
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code?: string | null;
  date: string;
  authorized_date?: string | null;
  name: string;
  merchant_name?: string | null;
  pending: boolean;
  payment_channel?: string | null;
  website?: string | null;
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null;
  counterparties?: { name?: string | null; website?: string | null; type?: string | null }[] | null;
}

const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);
const ACCOUNT_TYPES: AccountType[] = ["depository", "credit", "loan", "investment"];
const money = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

export function normalizeAccount(a: PlaidAccount) {
  return {
    provider_account_id: a.account_id.slice(0, 200),
    name: (a.name || a.official_name || "Account").slice(0, 200),
    official_name: clip(a.official_name, 200),
    mask: clip(a.mask, 8),
    type: (ACCOUNT_TYPES as string[]).includes(a.type) ? (a.type as AccountType) : ("other" as const),
    subtype: clip(a.subtype, 50),
    current_balance: money(a.balances.current),
    available_balance: money(a.balances.available),
    credit_limit: money(a.balances.limit ?? null),
    iso_currency: (a.balances.iso_currency_code ?? "USD").slice(0, 3),
  };
}

export function normalizeTransaction(t: PlaidTransaction) {
  const merchant = t.merchant_name ?? t.counterparties?.find((c) => c.type === "merchant" && c.name)?.name ?? null;
  const website = safeWebsite(t.website ?? t.counterparties?.find((c) => c.website)?.website ?? null);
  return {
    provider_transaction_id: t.transaction_id.slice(0, 200),
    date: t.date,
    authorized_date: t.authorized_date ?? null,
    name: (t.name || merchant || "Transaction").slice(0, 300),
    merchant_name: merchant ? merchantDisplay(t.name, merchant) : merchantDisplay(t.name),
    merchant_key: merchantKey(t.name, merchant),
    merchant_website: website,
    // Plaid: positive = money out. Ours: positive = money in.
    amount: Math.round(-t.amount * 100) / 100,
    iso_currency: (t.iso_currency_code ?? "USD").slice(0, 3),
    category: categoryFromPlaid(t.personal_finance_category?.primary, t.personal_finance_category?.detailed),
    provider_category: clip(t.personal_finance_category?.detailed ?? t.personal_finance_category?.primary ?? null, 80),
    pending: Boolean(t.pending),
    payment_channel: clip(t.payment_channel, 20),
  };
}
