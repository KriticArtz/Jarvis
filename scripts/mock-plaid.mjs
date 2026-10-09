#!/usr/bin/env node
/**
 * A deterministic stand-in for the Plaid API — for automated tests only
 * (Plaid's sandbox needs network access and real sandbox keys). The app
 * reaches it only through PLAID_API_TEST_BASE_URL, honoured solely for
 * loopback addresses and never on a Vercel production deployment
 * (src/lib/env.ts). It implements just what the app calls:
 *   /link/token/create  /item/public_token/exchange  /item/get
 *   /institutions/get_by_id  /accounts/get  /transactions/sync  /item/remove
 *
 * Public tokens choose the institution: "public-sandbox-chase[-…]",
 * "public-sandbox-capital_one[-…]", "public-sandbox-fidelity[-…]". The same
 * public token always maps to the same item id. Add "-slow" (e.g.
 * "public-sandbox-chase-slow-1") to mimic a fresh real item whose first
 * syncs report transactions_update_status NOT_READY.
 * Data is generated relative to today: ~13 months of realistic history with
 * clear recurring payments (payroll, rent, subscriptions, a student loan, an
 * annual membership) and plenty of irregular spending that must NOT be
 * detected as recurring.
 *
 *   node scripts/mock-plaid.mjs [--port 4011]
 *
 * Test controls: POST /__fail {"code":"ITEM_LOGIN_REQUIRED"} (next call fails),
 * POST /__mutate {"item":"<item_id>"} (adds one transaction, removes one),
 * GET /__calls (endpoint names called), POST /__reset.
 */
import http from "node:http";
import { pathToFileURL } from "node:url";

const DAY = 86_400_000;
const iso = (d) => d.toISOString().slice(0, 10);
const atDay = (base, monthsBack, day) => new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - monthsBack, Math.min(day, 28)));

const INSTITUTIONS = {
  chase: { id: "ins_3", name: "Chase" },
  capital_one: { id: "ins_128026", name: "Capital One" },
  fidelity: { id: "ins_12", name: "Fidelity" },
};

function accountsFor(inst) {
  if (inst === "chase")
    return [
      { account_id: "chase-checking", name: "Total Checking", official_name: "Chase Total Checking", mask: "4412", type: "depository", subtype: "checking", balances: { current: 3240.18, available: 3190.18, limit: null, iso_currency_code: "USD" } },
      { account_id: "chase-savings", name: "Savings", official_name: "Chase Savings", mask: "9021", type: "depository", subtype: "savings", balances: { current: 4100, available: 4100, limit: null, iso_currency_code: "USD" } },
    ];
  if (inst === "capital_one")
    return [{ account_id: "c1-card", name: "Quicksilver", official_name: "Capital One Quicksilver", mask: "7781", type: "credit", subtype: "credit card", balances: { current: 918.4, available: 4081.6, limit: 5000, iso_currency_code: "USD" } }];
  return [
    { account_id: "fid-brokerage", name: "Individual Brokerage", mask: "3307", type: "investment", subtype: "brokerage", balances: { current: 1999.5, available: null, limit: null, iso_currency_code: "USD" } },
    { account_id: "fid-loan", name: "Student Loan", mask: "1180", type: "loan", subtype: "student", balances: { current: 14250, available: null, limit: null, iso_currency_code: "USD" } },
  ];
}

const pfc = (primary, detailed) => ({ primary, detailed });
let idSeq = 0;

/** Deterministic pseudo-random (no Math.random: tests must be repeatable). */
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

function transactionsFor(inst, today) {
  const out = [];
  const add = (account_id, date, amount, name, merchant_name, category, extra = {}) => {
    if (date > today) return;
    out.push({
      transaction_id: `${inst}-tx-${++idSeq}`,
      account_id,
      amount,
      iso_currency_code: "USD",
      date: iso(date),
      authorized_date: iso(date),
      name,
      merchant_name,
      pending: false,
      payment_channel: "online",
      website: null,
      personal_finance_category: category,
      counterparties: [],
      ...extra,
    });
  };
  const rand = rng(inst.length * 7919);
  if (inst === "chase") {
    // Biweekly payroll (net).
    for (let d = new Date(today.getTime() - 392 * DAY); d <= today; d = new Date(d.getTime() + 14 * DAY)) add("chase-checking", d, -1476.92, "ACME CORP PAYROLL", "Acme Corp", pfc("INCOME", "INCOME_WAGES"));
    for (let m = 12; m >= 0; m--) {
      add("chase-checking", atDay(today, m, 1), 1200, "OAKWOOD PROPERTY MGMT RENT", "Oakwood Property", pfc("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_RENT"));
      add("chase-checking", atDay(today, m, 12), 320, "NAVIENT STUDENT LOAN PMT", "Navient", pfc("LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT"));
      add("chase-checking", atDay(today, m, 9), 65, "VERIZON WIRELESS", "Verizon", pfc("RENT_AND_UTILITIES", "RENT_AND_UTILITIES_TELEPHONE"), { website: "verizon.com" });
      add("chase-checking", atDay(today, m, 26), 98.2, "GEICO AUTO INSURANCE", "GEICO", pfc("GENERAL_SERVICES", "GENERAL_SERVICES_INSURANCE"), { website: "geico.com" });
      add("chase-checking", atDay(today, m, 3), 300, "TRANSFER TO SAVINGS", null, pfc("TRANSFER_OUT", "TRANSFER_OUT_SAVINGS"));
      add("chase-checking", atDay(today, m, 20), 640 + Math.round(rand() * 300), "CAPITAL ONE CRCARDPMT", "Capital One", pfc("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"));
    }
    // Irregular grocery runs: varying amounts and gaps → not recurring.
    for (let d = new Date(today.getTime() - 380 * DAY); d <= today; d = new Date(d.getTime() + (4 + Math.floor(rand() * 7)) * DAY)) {
      add("chase-checking", d, Math.round((35 + rand() * 120) * 100) / 100, "TRADER JOE'S #552", "Trader Joe's", pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"));
    }
    // A pending purchase today.
    add("chase-checking", today, 54.12, "TRADER JOE'S #552", "Trader Joe's", pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES"), { pending: true });
  }
  if (inst === "capital_one") {
    for (let m = 12; m >= 0; m--) {
      add("c1-card", atDay(today, m, 14), 15.49, "NETFLIX.COM", "Netflix", pfc("ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES"), { website: "netflix.com" });
      add("c1-card", atDay(today, m, 18), 11.99, "SPOTIFY USA", "Spotify", pfc("ENTERTAINMENT", "ENTERTAINMENT_MUSIC_AND_AUDIO"), { website: "spotify.com" });
      add("c1-card", atDay(today, m, 21), 39.99, "PLANET FITNESS CLUB FEE", "Planet Fitness", pfc("PERSONAL_CARE", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS"));
      add("c1-card", atDay(today, m, 4), 2.99, "APPLE.COM/BILL", "Apple", pfc("GENERAL_SERVICES", "GENERAL_SERVICES_OTHER_GENERAL_SERVICES"));
    }
    add("c1-card", atDay(today, 12, 2), 139, "AMAZON PRIME*MEMBERSHIP", "Amazon Prime", pfc("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES"));
    add("c1-card", atDay(today, 0, 2) <= today ? atDay(today, 0, 2) : atDay(today, 1, 2), 139, "AMAZON PRIME*MEMBERSHIP", "Amazon Prime", pfc("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES"));
    // Eating out and shopping: irregular.
    for (let d = new Date(today.getTime() - 380 * DAY); d <= today; d = new Date(d.getTime() + (2 + Math.floor(rand() * 6)) * DAY)) {
      const r = rand();
      if (r < 0.5) add("c1-card", d, Math.round((8 + rand() * 60) * 100) / 100, "SQ *BLUE BOTTLE COFFEE", "Blue Bottle Coffee", pfc("FOOD_AND_DRINK", "FOOD_AND_DRINK_COFFEE"));
      else add("c1-card", d, Math.round((15 + rand() * 180) * 100) / 100, "AMAZON MKTPL*2K4", "Amazon", pfc("GENERAL_MERCHANDISE", "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES"));
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function createMockPlaid() {
  const items = new Map(); // access_token -> { item_id, inst, txns, removedIds }
  let failNext = null;
  const calls = [];

  function handle(path, body) {
    calls.push(path);
    if (failNext && path !== "/link/token/create") {
      const code = failNext;
      failNext = null;
      return [400, { error_type: code === "ITEM_LOGIN_REQUIRED" ? "ITEM_ERROR" : "API_ERROR", error_code: code, error_message: "mock failure" }];
    }
    if (!body.client_id || !body.secret) return [400, { error_type: "INVALID_REQUEST", error_code: "MISSING_FIELDS", error_message: "client_id and secret required" }];
    const item = body.access_token ? items.get(body.access_token) : null;
    if (body.access_token && !item) return [400, { error_type: "INVALID_INPUT", error_code: "INVALID_ACCESS_TOKEN", error_message: "unknown token" }];
    switch (path) {
      case "/link/token/create":
        return [200, { link_token: `link-sandbox-${body.access_token ? "update" : "new"}-${Date.now()}`, expiration: new Date(Date.now() + 4 * 3600_000).toISOString() }];
      case "/item/public_token/exchange": {
        // "public-sandbox-chase" or "public-sandbox-chase-<anything>"; the same public token always maps to the same item.
        const inst = /^public-sandbox-([a-z_]+?)(?:-|$)/.exec(String(body.public_token ?? ""))?.[1] ?? "";
        if (!INSTITUTIONS[inst]) return [400, { error_type: "INVALID_INPUT", error_code: "INVALID_PUBLIC_TOKEN", error_message: "bad token" }];
        const access = `access-sandbox-${inst}-${Math.abs(hash(String(body.public_token) + Date.now() + Math.random()))}`;
        const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
        // A public token containing "-slow" behaves like a fresh real item: the first two syncs are NOT_READY.
        items.set(access, { item_id: `item-${inst}-${Math.abs(hash(String(body.public_token)))}`, inst, txns: transactionsFor(inst, today), removed: [], notReady: String(body.public_token).includes("-slow") ? 2 : 0 });
        return [200, { access_token: access, item_id: items.get(access).item_id }];
      }
      case "/item/get":
        return [200, { item: { item_id: item.item_id, institution_id: INSTITUTIONS[item.inst].id } }];
      case "/institutions/get_by_id": {
        const inst = Object.values(INSTITUTIONS).find((i) => i.id === body.institution_id);
        return inst ? [200, { institution: { institution_id: inst.id, name: inst.name } }] : [400, { error_type: "INVALID_INPUT", error_code: "INVALID_INSTITUTION", error_message: "x" }];
      }
      case "/accounts/get":
        return [200, { accounts: accountsFor(item.inst), item: { item_id: item.item_id } }];
      case "/transactions/sync": {
        // Cursor = "<version>:<offset>"; version bumps when the data changes.
        if (item.notReady > 0) {
          item.notReady--;
          return [200, { added: [], modified: [], removed: [], next_cursor: "", has_more: false, transactions_update_status: "NOT_READY" }];
        }
        const done = { transactions_update_status: "HISTORICAL_UPDATE_COMPLETE" };
        const [version, offset] = String(body.cursor || "0:0").split(":").map(Number);
        const count = Math.min(Number(body.count ?? 100), 500);
        if (version === item.version && offset >= item.txns.length) {
          const removed = item.pendingRemoved ?? [];
          const added = item.pendingAdded ?? [];
          item.pendingRemoved = [];
          item.pendingAdded = [];
          return [200, { added, modified: [], removed: removed.map((id) => ({ transaction_id: id })), next_cursor: `${item.version}:${item.txns.length}`, has_more: false, ...done }];
        }
        const start = version === (item.version ?? 0) ? offset : 0;
        const page = item.txns.slice(start, start + count);
        const next = start + page.length;
        return [200, { added: page, modified: [], removed: [], next_cursor: `${item.version ?? 0}:${next}`, has_more: next < item.txns.length, ...done }];
      }
      case "/item/remove":
        items.delete(body.access_token);
        return [200, { removed: true }];
      default:
        return [404, { error_type: "INVALID_REQUEST", error_code: "NOT_FOUND", error_message: path }];
    }
  }

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (req.url === "/__calls") return send(200, calls);
    if (req.url === "/__reset") {
      items.clear();
      calls.length = 0;
      failNext = null;
      return send(200, { ok: true });
    }
    if (req.url === "/__fail") {
      failNext = body.code ?? "INTERNAL_SERVER_ERROR";
      return send(200, { ok: true });
    }
    if (req.url === "/__mutate") {
      const entry = [...items.values()].find((i) => i.item_id === body.item);
      if (!entry) return send(404, { ok: false });
      const removed = entry.txns.shift();
      const added = { ...entry.txns[entry.txns.length - 1], transaction_id: `${entry.inst}-tx-new-${Date.now()}`, name: "NEW PURCHASE", merchant_name: "Corner Store", amount: 12.5 };
      entry.version = entry.version ?? 0;
      entry.pendingRemoved = [removed.transaction_id];
      entry.pendingAdded = [added];
      return send(200, { removed: removed.transaction_id, added: added.transaction_id });
    }
    const [status, data] = handle(req.url ?? "", body);
    send(status, data);
  });

  return {
    server,
    calls,
    listen: (port = 0) => new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((resolve) => server.close(() => resolve())),
    fail: (code) => {
      failNext = code;
    },
    mutate: (itemId) => {
      const entry = [...items.values()].find((i) => i.item_id === itemId);
      const removed = entry.txns.shift();
      const added = { ...entry.txns[entry.txns.length - 1], transaction_id: `${entry.inst}-tx-new-${Date.now()}`, name: "NEW PURCHASE", merchant_name: "Corner Store", amount: 12.5 };
      entry.version = entry.version ?? 0;
      entry.pendingRemoved = [removed.transaction_id];
      entry.pendingAdded = [added];
      return { removed: removed.transaction_id, added: added.transaction_id };
    },
  };
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const i = process.argv.indexOf("--port");
  const port = i > 0 ? Number(process.argv[i + 1]) : 4011;
  const mock = createMockPlaid();
  console.log(`Mock Plaid API listening at ${await mock.listen(port)}`);
}
