/**
 * Our spending categories, mapped from Plaid's personal finance categories
 * (pure). Every transaction gets exactly one. The `kind` decides how it
 * counts:
 *   income        money earned (payroll, interest, dividends)
 *   spending      day-to-day outflows (a refund in a spending category nets against it)
 *   debt_payment  loan and mortgage payments: spending, and a debt obligation for DTI
 *   transfer      money moving between the user's own accounts (incl. credit card
 *                 payments) — excluded from income and spending so nothing counts twice
 */
export type CategoryKind = "income" | "spending" | "debt_payment" | "transfer";

export const CATEGORIES = {
  income: { label: "Income", kind: "income" },
  housing: { label: "Housing", kind: "spending" },
  utilities: { label: "Bills & utilities", kind: "spending" },
  groceries: { label: "Groceries", kind: "spending" },
  dining: { label: "Food & drink", kind: "spending" },
  shopping: { label: "Shopping", kind: "spending" },
  entertainment: { label: "Entertainment & streaming", kind: "spending" },
  transportation: { label: "Transportation", kind: "spending" },
  travel: { label: "Travel", kind: "spending" },
  health: { label: "Health", kind: "spending" },
  personal_care: { label: "Personal care & fitness", kind: "spending" },
  services: { label: "Services & insurance", kind: "spending" },
  home: { label: "Home", kind: "spending" },
  fees: { label: "Fees", kind: "spending" },
  giving_taxes: { label: "Giving & taxes", kind: "spending" },
  other: { label: "Other", kind: "spending" },
  loan_payments: { label: "Loan payments", kind: "debt_payment" },
  transfer: { label: "Transfers", kind: "transfer" },
  credit_card_payment: { label: "Credit card payments", kind: "transfer" },
} as const satisfies Record<string, { label: string; kind: CategoryKind }>;

export type CategoryKey = keyof typeof CATEGORIES;

export const isCategory = (v: unknown): v is CategoryKey => typeof v === "string" && v in CATEGORIES;
export const categoryLabel = (key: string) => (isCategory(key) ? CATEGORIES[key].label : "Other");
export const categoryKind = (key: string): CategoryKind => (isCategory(key) ? CATEGORIES[key].kind : "spending");

/** Categories a budget can be set for (spending and debt payments). */
export const BUDGET_CATEGORIES = (Object.keys(CATEGORIES) as CategoryKey[]).filter((k) => {
  const kind = CATEGORIES[k].kind;
  return kind === "spending" || kind === "debt_payment";
});

/** Plaid personal_finance_category (primary + detailed) → our category. */
export function categoryFromPlaid(primary: string | null | undefined, detailed: string | null | undefined): CategoryKey {
  const p = (primary ?? "").toUpperCase();
  const d = (detailed ?? "").toUpperCase();
  if (d === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return "credit_card_payment";
  if (p === "INCOME") return "income";
  if (p === "TRANSFER_IN" || p === "TRANSFER_OUT") return "transfer";
  if (p === "LOAN_PAYMENTS") return "loan_payments";
  if (d === "RENT_AND_UTILITIES_RENT") return "housing";
  if (p === "RENT_AND_UTILITIES") return "utilities";
  if (d === "FOOD_AND_DRINK_GROCERIES") return "groceries";
  if (p === "FOOD_AND_DRINK") return "dining";
  if (p === "GENERAL_MERCHANDISE") return "shopping";
  if (p === "ENTERTAINMENT") return "entertainment";
  if (p === "TRANSPORTATION") return "transportation";
  if (p === "TRAVEL") return "travel";
  if (p === "MEDICAL") return "health";
  if (p === "PERSONAL_CARE") return "personal_care";
  if (p === "GENERAL_SERVICES") return "services";
  if (p === "HOME_IMPROVEMENT") return "home";
  if (p === "BANK_FEES") return "fees";
  if (p === "GOVERNMENT_AND_NON_PROFIT") return "giving_taxes";
  return "other";
}
