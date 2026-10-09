/** Money and date formatting for the Money screens (pure, client-safe). */

const fmt = (cents: boolean) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
const WHOLE = fmt(false);
const EXACT = fmt(true);

/**
 * "$1,284", "$15.49", "−$918", "+$3,240". Whole dollars by default for
 * summaries; `cents` for transactions and subscriptions. `sign` adds + for
 * positive values. Uses a true minus sign.
 */
export function money(value: number, opts: { cents?: boolean; sign?: boolean } = {}): string {
  const cents = opts.cents ?? (Math.abs(value) < 100 && !Number.isInteger(value));
  const body = (cents ? EXACT : WHOLE).format(Math.abs(value));
  if (value < 0 && Math.abs(value) >= 0.005) return `−${body}`;
  return opts.sign && value > 0 ? `+${body}` : body;
}

export const percent = (ratio: number, digits = 0) => `${(ratio * 100).toFixed(digits)}%`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Oct 14" (adds the year when it isn't this year). */
export function shortDate(iso: string, today?: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const sameYear = !today || today.slice(0, 4) === String(y);
  return `${MONTHS[m - 1]} ${d}${sameYear ? "" : `, ${y}`}`;
}

/** "April 2027" */
export const monthYear = (iso: string) => `${LONG_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** "Oct" for a "YYYY-MM" month key */
export const monthShort = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];
