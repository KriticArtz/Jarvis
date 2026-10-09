import { describe, expect, it } from "vitest";
import { categoryFromPlaid } from "./categories";
import { merchantKey, safeWebsite } from "./merchant";
import { cancelHelp } from "./cancellation";
import { normalizeAccount, normalizeTransaction } from "./plaid-normalize";
import { detectRecurring } from "./recurring";
import { budgetStatus, cashFlow, debtToIncome, monthlyAmount, overview, projectGoal, recentMonthlySavings, type MoneyAccount, type MoneyTxn } from "./summary";
import { money } from "./format";
import { buildMoneyContext, renderMoneyContext } from "./ai-context";
import { addMonths } from "./summary";

const today = "2026-10-15";
let n = 0;
const tx = (date: string, amount: number, category: string, merchant = "Store", extra: Partial<MoneyTxn> = {}): MoneyTxn => ({
  id: `t${++n}`,
  date,
  amount,
  category,
  merchantKey: merchantKey(merchant),
  merchantName: merchant,
  pending: false,
  accountId: "acc",
  ...extra,
});
const acct = (type: MoneyAccount["type"], currentBalance: number | null, extra: Partial<MoneyAccount> = {}): MoneyAccount => ({
  id: `a${++n}`,
  name: type,
  type,
  subtype: null,
  mask: "0000",
  currentBalance,
  availableBalance: null,
  creditLimit: null,
  connectionId: "c",
  ...extra,
});

describe("normalization", () => {
  it("maps Plaid categories, keeping credit card payments out of spending", () => {
    expect(categoryFromPlaid("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")).toBe("credit_card_payment");
    expect(categoryFromPlaid("LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT")).toBe("loan_payments");
    expect(categoryFromPlaid("INCOME", "INCOME_WAGES")).toBe("income");
    expect(categoryFromPlaid("TRANSFER_OUT", null)).toBe("transfer");
    expect(categoryFromPlaid("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES")).toBe("groceries");
    expect(categoryFromPlaid("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT")).toBe("housing");
    expect(categoryFromPlaid("SOMETHING_NEW", null)).toBe("other");
  });

  it("normalizes merchants so the same merchant groups together", () => {
    expect(merchantKey("NETFLIX.COM 866-579-7172")).toBe("netflix");
    expect(merchantKey("SQ *BLUE BOTTLE #123")).toBe("blue bottle");
    expect(merchantKey("Netflix", "Netflix")).toBe("netflix");
    expect(merchantKey("PAYPAL *SPOTIFY")).toBe("spotify");
    expect(merchantKey("12345")).toBe("unknown");
  });

  it("keeps only real web URLs from the provider", () => {
    expect(safeWebsite("netflix.com")).toBe("https://netflix.com");
    expect(safeWebsite("javascript:alert(1)")).toBeNull();
    expect(safeWebsite("not a site")).toBeNull();
    expect(safeWebsite(null)).toBeNull();
  });

  it("flips Plaid's sign (positive = money in) and keeps only what we use", () => {
    const row = normalizeTransaction({
      transaction_id: "t1",
      account_id: "a1",
      amount: 15.49,
      date: "2026-10-01",
      name: "NETFLIX.COM",
      merchant_name: "Netflix",
      pending: false,
      website: "netflix.com",
      personal_finance_category: { primary: "ENTERTAINMENT", detailed: "ENTERTAINMENT_TV_AND_MOVIES" },
    });
    expect(row).toMatchObject({ amount: -15.49, merchant_key: "netflix", merchant_name: "Netflix", category: "entertainment", merchant_website: "https://netflix.com" });
    expect(normalizeTransaction({ transaction_id: "t2", account_id: "a", amount: -3200, date: "2026-10-01", name: "ACME PAYROLL", pending: false, personal_finance_category: { primary: "INCOME" } }).amount).toBe(3200);
    expect(normalizeAccount({ account_id: "x", name: "Card", type: "credit", balances: { current: 918.2, available: 4081.8, limit: 5000 } })).toMatchObject({ type: "credit", current_balance: 918.2, credit_limit: 5000 });
    expect(normalizeAccount({ account_id: "y", name: "Crypto", type: "brokerage-ish", balances: { current: 1, available: null } }).type).toBe("other");
  });
});

describe("overview", () => {
  it("only calls it net worth when assets and liabilities are both connected", () => {
    const both = overview([acct("depository", 3240), acct("investment", 6100), acct("credit", 918)]);
    expect(both).toMatchObject({ cash: 3240, investments: 6100, debt: 918, netWorth: 8422 });
    const assetsOnly = overview([acct("depository", 3240)]);
    expect(assetsOnly.netWorth).toBeNull();
    expect(assetsOnly.totalAssets).toBe(3240);
    expect(overview([acct("depository", null)]).hasAssets).toBe(false);
  });
});

describe("cash flow", () => {
  const txns = [
    tx("2026-10-01", 3200, "income", "Acme"),
    tx("2026-10-03", -1200, "housing", "Landlord"),
    tx("2026-10-05", -84.5, "groceries", "Trader Joes"),
    tx("2026-10-06", 20, "groceries", "Trader Joes"), // refund
    tx("2026-10-07", -500, "transfer", "Savings"),
    tx("2026-10-08", -918, "credit_card_payment", "Capital One"),
    tx("2026-10-09", -300, "loan_payments", "Navient"),
    tx("2026-09-01", 3200, "income", "Acme"),
    tx("2026-09-10", -2000, "shopping", "Store"),
  ];
  it("counts income and spending once — transfers and card payments excluded, refunds netted", () => {
    const cf = cashFlow(txns, "this_month", today);
    expect(cf).toMatchObject({ income: 3200, spending: 1564.5, net: 1635.5, partial: true });
    expect(cf.savingsRate).toBeCloseTo(1635.5 / 3200);
    expect(cf.categories.map((c) => c.category)).toEqual(["housing", "loan_payments", "groceries"]);
  });
  it("covers the chosen period month by month", () => {
    const cf = cashFlow(txns, "3m", today);
    expect(cf.months.map((m) => m.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(cf.months[1]).toEqual({ month: "2026-09", income: 3200, spending: 2000, net: 1200 });
    expect(cashFlow(txns, "last_month", today)).toMatchObject({ income: 3200, spending: 2000, partial: false });
    expect(cashFlow([], "this_month", today).savingsRate).toBeNull();
  });
  it("estimates recent savings from complete months only", () => {
    expect(recentMonthlySavings(txns, today)).toBeNull(); // history starts in September: no complete month before October except September itself? Sept started on the 1st but isn't "before" its first txn month
    const longer = [tx("2026-06-20", 10, "income"), ...txns];
    expect(recentMonthlySavings(longer, today)).toEqual({ amount: 400, months: 3 }); // (0 + 1200 + 0) / 3
  });
});

describe("budget", () => {
  const spend = (amount: number, day = "05", category = "dining") => tx(`2026-10-${day}`, -amount, category);
  it("projects the month and describes pace without judgment", () => {
    const b = budgetStatus([{ category: "total", monthlyAmount: 2400 }], [spend(1200)], today);
    expect(b.total).toMatchObject({ budget: 2400, spent: 1200, remaining: 1200, pace: "on_pace" });
    expect(b.total!.projected).toBeCloseTo(1200 / (15 / 31), 0);
    expect(budgetStatus([{ category: "total", monthlyAmount: 2400 }], [spend(1700)], today).total!.pace).toBe("ahead");
    expect(budgetStatus([{ category: "total", monthlyAmount: 2400 }], [spend(500)], today).total!.pace).toBe("under");
    expect(budgetStatus([{ category: "total", monthlyAmount: 2400 }], [spend(2500)], today).total!.pace).toBe("over");
    expect(budgetStatus([], [spend(10)], "2026-10-02").early).toBe(true);
  });
  it("tracks category budgets and ignores transfers and income", () => {
    const b = budgetStatus(
      [{ category: "dining", monthlyAmount: 300 }],
      [spend(120), tx("2026-10-02", -1000, "transfer"), tx("2026-10-01", 3000, "income"), tx("2026-09-30", -50, "dining")],
      today,
    );
    expect(b.total).toBeNull();
    expect(b.spent).toBe(120);
    expect(b.categories).toEqual([expect.objectContaining({ category: "dining", spent: 120, remaining: 180 })]);
  });
  it("counts recurring payments once instead of extrapolating them", () => {
    const rent = { merchantKey: merchantKey("Oakwood Property"), category: "housing", frequency: "monthly" as const, averageAmount: 1200, status: "active" as const, nextExpectedDate: "2026-11-01" };
    const netflix = { merchantKey: merchantKey("Netflix"), category: "entertainment", frequency: "monthly" as const, averageAmount: 15.49, status: "active" as const, nextExpectedDate: "2026-10-20" };
    const txns = [tx("2026-10-01", -1200, "housing", "Oakwood Property"), spend(300, "08", "groceries")];
    // Day 8 of 31: rent counted once, groceries extrapolated, Netflix still to come.
    const b = budgetStatus([{ category: "total", monthlyAmount: 2400 }], txns, "2026-10-08", [rent, netflix]);
    expect(b.total!.projected).toBeCloseTo(1200 + (300 / 8) * 31 + 15.49, 1);
    expect(b.total!.pace).toBe("on_pace");
    // Without recurring knowledge the same month looks wildly ahead.
    expect(budgetStatus([{ category: "total", monthlyAmount: 2400 }], txns, "2026-10-08").total!.pace).toBe("ahead");
  });
});

describe("debt-to-income", () => {
  const loans = [
    { merchantName: "Navient", category: "loan_payments", frequency: "monthly" as const, averageAmount: 320, status: "active" as const },
    { merchantName: "Toyota Financial", category: "loan_payments", frequency: "monthly" as const, averageAmount: 400, status: "active" as const },
    { merchantName: "Old loan", category: "loan_payments", frequency: "monthly" as const, averageAmount: 999, status: "inactive" as const },
    { merchantName: "Netflix", category: "entertainment", frequency: "monthly" as const, averageAmount: 15.49, status: "active" as const },
  ];
  it("never infers gross income: without it, asks for it", () => {
    const r = debtToIncome({ grossMonthlyIncome: null, otherMonthlyDebt: null, recurring: loans });
    expect(r).toMatchObject({ status: "needs_income", monthlyDebt: 720 });
  });
  it("monthly debt obligations / gross monthly income", () => {
    const r = debtToIncome({ grossMonthlyIncome: 3000, otherMonthlyDebt: null, recurring: loans });
    expect(r.status === "ok" && r.ratio).toBeCloseTo(0.24);
    expect(r.monthlyDebt).toBe(720);
    const withOther = debtToIncome({ grossMonthlyIncome: 3000, otherMonthlyDebt: 180, recurring: loans });
    expect(withOther.status === "ok" && withOther.ratio).toBeCloseTo(0.3);
    expect(monthlyAmount({ frequency: "biweekly", averageAmount: 100 })).toBeCloseTo(216.67, 1);
  });
});

describe("goal projection", () => {
  const goal = { kind: "save" as const, targetAmount: 10000, currentAmount: 3200, targetDate: null, monthlyContribution: 750 };
  it("projects completion from the stated contribution, with what-if amounts", () => {
    const p = projectGoal(goal, today, null);
    expect(p).toMatchObject({ current: 3200, remaining: 6800, months: 10, projectedMonth: "2027-08-01", contribution: { amount: 750, source: "planned" } });
    expect(p.progress).toBeCloseTo(0.32);
    expect(p.scenarios).toEqual([
      { amount: 500, months: 14, projectedMonth: "2027-12-01" },
      { amount: 1000, months: 7, projectedMonth: "2027-05-01" },
      { amount: 1250, months: 6, projectedMonth: "2027-04-01" },
    ]);
  });
  it("falls back to recent savings, says so, or makes no projection at all", () => {
    expect(projectGoal({ ...goal, monthlyContribution: null }, today, { amount: 1200 }).contribution).toEqual({ amount: 1200, source: "recent_savings" });
    const none = projectGoal({ ...goal, monthlyContribution: null }, today, null);
    expect([none.contribution, none.months, none.projectedMonth, none.scenarios]).toEqual([null, null, null, []]);
  });
  it("uses a linked account and a target date", () => {
    const linked = projectGoal({ ...goal, account: { type: "depository", currentBalance: 4100 }, targetDate: "2027-04-30" }, today, null);
    expect(linked.current).toBe(4100);
    expect(linked.neededMonthly).toBeCloseTo(5900 / 6);
    expect(linked.onTrack).toBe(false);
    const payoff = projectGoal({ kind: "pay_off", targetAmount: 3000, currentAmount: 0, targetDate: null, monthlyContribution: 300, account: { type: "credit", currentBalance: 918 } }, today, null);
    expect(payoff).toMatchObject({ current: 2082, remaining: 918, months: 4 });
    expect(projectGoal({ ...goal, currentAmount: 10000 }, today, null)).toMatchObject({ achieved: true, remaining: 0, scenarios: [] });
  });
});

describe("recurring detection", () => {
  const monthly = (merchant: string, amount: number, months: string[], category = "entertainment", extra: Partial<MoneyTxn> = {}) =>
    months.map((m) => tx(`${m}`, -amount, category, merchant, extra));
  const lastSix = ["2026-05-14", "2026-06-14", "2026-07-14", "2026-08-14", "2026-09-14", "2026-10-14"];

  it("finds a regular monthly charge with high confidence and its next date", () => {
    const [r] = detectRecurring(monthly("Netflix", 15.49, lastSix), today);
    expect(r).toMatchObject({ merchantName: "Netflix", frequency: "monthly", averageAmount: 15.49, occurrences: 6, status: "active", nextExpectedDate: "2026-11-14" });
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("never calls one charge, or irregular charges, recurring", () => {
    expect(detectRecurring(monthly("Netflix", 15.49, ["2026-10-14"]), today)).toEqual([]);
    expect(detectRecurring(monthly("Amazon", 40, ["2026-06-02", "2026-06-09", "2026-07-25", "2026-09-30", "2026-10-03"], "shopping"), today)).toEqual([]);
  });

  it("keeps two subscriptions from one merchant apart, and ignores transfers and income", () => {
    const apple = [...monthly("Apple", 2.99, lastSix), ...monthly("Apple", 10.99, lastSix)];
    const rows = detectRecurring([...apple, ...monthly("Savings", 500, lastSix, "transfer"), ...lastSix.map((d) => tx(d, 3200, "income", "Acme"))], today);
    expect(rows.map((r) => [r.merchantName, r.averageAmount])).toEqual([
      ["Apple", 10.99],
      ["Apple", 2.99],
    ]);
    expect(new Set(rows.map((r) => r.patternKey)).size).toBe(2);
  });

  it("handles weekly, annual, a small price change, pending charges and cancelled subscriptions", () => {
    const weekly = detectRecurring(monthly("Class Pass", 25, ["2026-09-17", "2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15"], "personal_care"), today);
    expect(weekly[0]).toMatchObject({ frequency: "weekly", nextExpectedDate: "2026-10-22" });
    const annual = detectRecurring(monthly("Amazon Prime", 139, ["2024-11-02", "2025-11-01"], "shopping"), "2026-10-15");
    expect(annual[0]).toMatchObject({ frequency: "annual", nextExpectedDate: "2026-11-01", status: "active" });
    const priceChange = detectRecurring([...monthly("Spotify", 10.99, lastSix.slice(0, 3)), ...monthly("Spotify", 11.99, lastSix.slice(3))], today);
    expect(priceChange).toHaveLength(1);
    expect(priceChange[0].lastAmount).toBe(11.99);
    const withPending = detectRecurring([...monthly("Gym", 39.99, lastSix, "personal_care"), tx("2026-10-14", -39.99, "personal_care", "Gym", { pending: true })], today);
    expect(withPending[0].occurrences).toBe(6);
    const cancelled = detectRecurring(monthly("Hulu", 7.99, ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"]), today);
    expect(cancelled[0].status).toBe("inactive");
  });
});

describe("cancellation help (never fabricated)", () => {
  it("official pages only for known providers; else the bank-reported site; else instructions", () => {
    expect(cancelHelp("netflix", null, "Netflix")).toMatchObject({ kind: "official", url: "https://www.netflix.com/cancelplan" });
    expect(cancelHelp("blue apron", "https://blueapron.com", "Blue Apron")).toMatchObject({ kind: "merchant", label: "Open merchant", url: "https://blueapron.com" });
    const help = cancelHelp("local gym", null, "Local Gym");
    expect(help.kind).toBe("instructions");
    expect("url" in help).toBe(false);
  });
});

describe("formatting", () => {
  it("is easy to scan", () => {
    expect(money(8421)).toBe("$8,421");
    expect(money(-918)).toBe("−$918");
    expect(money(3240, { sign: true })).toBe("+$3,240");
    expect(money(15.49)).toBe("$15.49");
    expect(money(1284.5, { cents: true })).toBe("$1,284.50");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("assistant money context (read-only summary)", () => {
  const base = (over: Partial<import("./data").MoneyBase> = {}): import("./data").MoneyBase => ({
    connections: [{ id: "c", institutionName: "Chase", status: "connected", lastSyncedAt: null, history: "complete" }],
    accounts: [acct("depository", 3240), acct("investment", 6100), acct("credit", 918)],
    txns: [tx("2026-10-01", 3200, "income", "Acme"), tx("2026-10-03", -1284, "shopping", "Store")].map((t) => ({ ...t, name: t.merchantName, authorizedDate: null })),
    recurring: Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`,
      merchantKey: `m${i}`,
      merchantName: `Service ${i}`,
      merchantWebsite: null,
      category: "entertainment",
      frequency: "monthly" as const,
      averageAmount: 10 + i,
      lastAmount: 10 + i,
      lastDate: "2026-10-01",
      nextExpectedDate: "2026-10-20",
      status: "active" as const,
      decision: null,
      confidence: 0.9,
      accountId: null,
    })),
    goals: [{ id: "g", name: "Emergency fund", kind: "save", targetAmount: 10000, currentAmount: 3200, targetDate: null, monthlyContribution: 750, accountId: null, status: "active" }],
    budgets: [{ category: "total", monthlyAmount: 2400 }],
    income: { grossMonthlyIncome: null, otherMonthlyDebt: null },
    ...over,
  });

  it("is absent when the user has set nothing up", () => {
    expect(buildMoneyContext(base({ connections: [], accounts: [], txns: [], recurring: [], goals: [], budgets: [] }), today)).toBeNull();
  });

  it("summarizes with the same math as the Money screen, and stays small", () => {
    const m = buildMoneyContext(base(), today)!;
    expect(m.balances).toMatchObject({ cash: 3240, investments: 6100, debt: 918, netWorth: 8422 });
    expect(m.thisMonth).toMatchObject({ income: 3200, spending: 1284, net: 1916 });
    expect(m.goals[0]).toMatchObject({ name: "Emergency fund", remaining: 6800, projected: "2027-08 (10 months)", assumption: "$750/month (the user's plan)" });
    expect(m.recurring.top).toHaveLength(8);
    const text = renderMoneyContext(m);
    expect(text).toContain("read-only");
    expect(text).toContain("Net worth: $8,422");
    expect(text).toContain("debt-to-income unknown (the user hasn't entered gross income — don't guess it from deposits)");
    expect(text).toContain("Emergency fund (save): $3,200 of $10,000, $6,800 to go; at $750/month (the user's plan) → projected 2027-08 (10 months)");
    expect(text).not.toContain("Store"); // no raw transactions
    expect(text.length).toBeLessThan(2500);
  });

  it("describes a typical month from complete months only", () => {
    const history = [
      tx("2026-06-20", -40, "dining"), // partial first month: excluded
      ...["07", "08", "09"].flatMap((mo) => [tx(`2026-${mo}-01`, 3000, "income"), tx(`2026-${mo}-05`, -600, "groceries"), tx(`2026-${mo}-09`, -300, "dining")]),
    ].map((t) => ({ ...t, name: t.merchantName, authorizedDate: null }));
    const m = buildMoneyContext(base({ txns: history }), today)!;
    expect(m.typicalMonth).toMatchObject({ months: 3, income: 3000, spending: 900 });
    expect(m.typicalMonth!.topCategories[0]).toMatchObject({ amount: 600 });
    expect(renderMoneyContext(m)).toContain("Typical month (average of the last 3 complete months): income $3,000, spending $900; biggest: ");
  });

  it("uses only user-entered gross income for debt-to-income", () => {
    const m = buildMoneyContext(base({ income: { grossMonthlyIncome: 3000, otherMonthlyDebt: 720 } }), today)!;
    expect(m.debt).toMatchObject({ dti: 0.24, incomeSource: "user_entered" });
  });
});
