// A society's payment rating (2026-10-21, user-asked; designed from
// docs/research/reports/Star and defaulter society showcase.md). The rating is
// a measured fact against a rule we publish — how many days late, on average,
// a society settles its released invoices — never an accusation. The user's
// calls: highly rated societies may be shown to other societies as "star
// partners" (with their committee's consent and an admin's approval); every
// society sees its own rating privately; nobody sees another society's low
// rating; payment punctuality is the only factor for now.
//
// Pure: no db, no clock — `asOf` is passed in, so the rule is unit-testable
// and the portal, the back office and the approval re-check all compute the
// same figure from the same rows.

import { SETTLE_TOLERANCE, settles } from "@/lib/payment";

/** Only invoices due within this window count — a rolling year. */
export const RATING_WINDOW_DAYS = 365;
/** Below this many counted invoices there is no rating at all, not a guess. */
export const MIN_RATED_INVOICES = 3;
/** Paid within this many days of the due date still counts as on time —
 *  a bank transfer can take a working day or two to clear. */
export const ON_TIME_GRACE_DAYS = 2;

/** Average days late (amount-weighted) → stars. The table is published as is. */
export const STAR_BANDS: Array<{ stars: number; maxDaysLate: number; label: string }> = [
  { stars: 5, maxDaysLate: ON_TIME_GRACE_DAYS, label: "Pays on time" },
  { stars: 4, maxDaysLate: 7, label: "Up to a week late on average" },
  { stars: 3, maxDaysLate: 15, label: "Up to two weeks late on average" },
  { stars: 2, maxDaysLate: 30, label: "Up to a month late on average" },
  { stars: 1, maxDaysLate: Infinity, label: "More than a month late on average" },
];

export type RatingInvoice = {
  id: string;
  number: string;
  amount: number;
  dueDate: Date;
  /** Days granted by extensions — they move the due date, so paying within
   *  an extension is paying on time. */
  extensionDays: number;
  payments: Array<{ amount: number; tdsAmount: number | null; confirmedAsOf: Date }>;
};

export type RatedInvoice = {
  id: string;
  number: string;
  amount: number;
  dueOn: Date;
  /** The day the last rupee (money or TDS) arrived; null while unpaid. */
  settledOn: Date | null;
  daysLate: number;
  /** Unpaid and past due — its days late keep growing every day. */
  open: boolean;
  onTime: boolean;
};

export type PaymentRating = {
  /** null = not enough history to rate. */
  stars: number | null;
  avgDaysLate: number | null;
  invoices: RatedInvoice[];
  counted: number;
  onTimeCount: number;
  openCount: number;
  /** Earliest due date among counted invoices — "since July 2025". */
  since: Date | null;
  /** True when an invoice unpaid more than 30 days held the rating below
   *  what the average alone would give — the reason to state, not the band. */
  capped: boolean;
  asOf: Date;
};

const DAY = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const daysBetween = (from: Date, to: Date) => Math.round((utcDay(to) - utcDay(from)) / DAY);

/** When cumulative payments (money + TDS, in date order) first covered the invoice. */
export function settledOn(inv: Pick<RatingInvoice, "amount" | "payments">): Date | null {
  let total = 0;
  for (const p of [...inv.payments].sort((a, b) => a.confirmedAsOf.getTime() - b.confirmedAsOf.getTime())) {
    total += settles(p);
    if (total >= inv.amount - SETTLE_TOLERANCE) return p.confirmedAsOf;
  }
  return null;
}

/**
 * One invoice judged as of `asOf`. Returns null when it does not count yet:
 * unpaid and not yet due (nothing is late about it).
 */
export function rateInvoice(inv: RatingInvoice, asOf: Date): RatedInvoice | null {
  const dueOn = new Date(utcDay(inv.dueDate) + inv.extensionDays * DAY);
  const paidOn = settledOn(inv);
  if (paidOn) {
    const daysLate = Math.max(0, daysBetween(dueOn, paidOn));
    return { id: inv.id, number: inv.number, amount: inv.amount, dueOn, settledOn: paidOn, daysLate, open: false, onTime: daysLate <= ON_TIME_GRACE_DAYS };
  }
  const overdue = daysBetween(dueOn, asOf);
  if (overdue <= 0) return null;
  return { id: inv.id, number: inv.number, amount: inv.amount, dueOn, settledOn: null, daysLate: overdue, open: true, onTime: overdue <= ON_TIME_GRACE_DAYS };
}

export function starsFor(avgDaysLate: number): number {
  return STAR_BANDS.find((b) => avgDaysLate <= b.maxDaysLate)!.stars;
}

/**
 * The rating: every released invoice due within the last year, each counted
 * at its days late (an unpaid one at its days overdue so far, so a society
 * that does not pay never looks better than one that pays late), averaged
 * weighted by amount. An unpaid invoice more than 30 days overdue caps the
 * rating at 2 stars whatever the average says — a large on-time history must
 * not hide a bill that has not been paid at all.
 */
export function paymentRating(invoices: RatingInvoice[], asOf: Date): PaymentRating {
  const windowStart = utcDay(asOf) - RATING_WINDOW_DAYS * DAY;
  const rated = invoices
    .map((i) => rateInvoice(i, asOf))
    .filter((r): r is RatedInvoice => r !== null && r.dueOn.getTime() > windowStart)
    .sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime());
  const counted = rated.length;
  const onTimeCount = rated.filter((r) => r.onTime).length;
  const openCount = rated.filter((r) => r.open).length;
  const since = rated[0]?.dueOn ?? null;
  const weight = rated.reduce((n, r) => n + r.amount, 0);
  if (counted < MIN_RATED_INVOICES || weight <= 0) {
    return { stars: null, avgDaysLate: null, invoices: rated, counted, onTimeCount, openCount, since, capped: false, asOf };
  }
  const avgDaysLate = Math.round((rated.reduce((n, r) => n + r.amount * r.daysLate, 0) / weight) * 10) / 10;
  const byAverage = starsFor(avgDaysLate);
  const stars = rated.some((r) => r.open && r.daysLate > 30) ? Math.min(byAverage, 2) : byAverage;
  return { stars, avgDaysLate, invoices: rated, counted, onTimeCount, openCount, since, capped: stars < byAverage, asOf };
}

/**
 * Harder to get onto the star list than to stay on it, so a society does not
 * flicker on and off month to month. Entering needs 5 stars with nothing
 * unpaid past due; staying needs 4 or more with nothing unpaid past due.
 */
export function qualifiesToEnter(r: PaymentRating): boolean {
  return r.stars === 5 && r.openCount === 0;
}
export function qualifiesToStay(r: PaymentRating): boolean {
  return r.stars !== null && r.stars >= 4 && r.openCount === 0;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthYear = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/**
 * The star card's text — generated from the figures, never typed, so a
 * published card can only ever say what the payments show.
 */
export function starSummary(r: PaymentRating): string | null {
  if (r.stars === null || !r.since) return null;
  const since = monthYear(r.since);
  const noun = r.counted === 1 ? "invoice" : "invoices";
  if (r.onTimeCount === r.counted) return `Paid all ${r.counted} ${noun} on time since ${since}.`;
  return `Paid ${r.onTimeCount} of ${r.counted} ${noun} on time since ${since}.`;
}

/** The published rule, in words — shown on the portal beside every rating. */
export const RATING_RULE: string[] = [
  `Your rating looks at every released invoice that fell due in the last ${RATING_WINDOW_DAYS} days.`,
  `Each invoice is counted by how many days after its due date it was fully paid. Tax deducted at source counts as paid, and an agreed extension moves the due date. Paying within ${ON_TIME_GRACE_DAYS} days of the due date counts as on time.`,
  "An invoice still unpaid counts by how many days it is overdue so far.",
  "The days late are averaged, with larger invoices weighing more.",
  "An invoice unpaid for more than 30 days past its due date limits the rating to 2 stars.",
  `A society with fewer than ${MIN_RATED_INVOICES} invoices due in the period is not rated yet.`,
];
