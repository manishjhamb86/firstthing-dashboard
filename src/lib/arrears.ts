// CON-13 / FEAT-087 — the arrears clock, as a pure module.
//
// This one is unusual and the unusual part is the whole point: manual
// intervention is only ever needed to STOP or DELAY a suspension, never to
// trigger one. Every human touchpoint here is a brake. That means the
// automatic path has to be right on its own, with nobody watching — which is
// exactly why the arithmetic lives in a tested pure function rather than
// inside the job that fires it.
//
// The consequence is real: suspension halts physical field servicing —
// routine inspections, ticket dispatch, spare replacement. It does NOT stop
// ingest, calculation, invoicing or portal access; arrears keep accruing and
// the committee can still see what is owed next to the savings evidence,
// which is precisely when that evidence is most useful.

/** Overdue tracking starts this many days after RELEASE, not generation. */
export const OVERDUE_TRACKING_AFTER_DAYS = 2;

/** The contract payment term. Warning starts once payment is this overdue. */
export const WARNING_AFTER_OVERDUE_DAYS = 10;

/** The suspension-warning countdown. */
export const WARNING_WINDOW_DAYS = 5;

/** CON-13 — granted in increments of up to this many days per request. */
export const MAX_EXTENSION_DAYS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function utcDay(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS);
}

/** Same UTC calendar day — the granularity CON-13's freshness rule works at. */
export function isSameUtcDay(a: Date, b: Date): boolean {
  return utcDay(a) === utcDay(b);
}

export type ArrearsInput = {
  releasedAt: Date | null;
  /** Sum of payments recorded against the invoice. */
  amountPaid: number;
  invoiceAmount: number;
  /** The most recent `confirmedAsOf` across the invoice's payments. */
  paymentConfirmedAsOf: Date | null;
  /** Total days granted across every extension (CON-13). */
  extensionDaysGranted: number;
  alreadySuspendedAt: Date | null;
  now: Date;
};

export type ArrearsPhase = "not_released" | "current" | "overdue" | "warning" | "suspended" | "paid";

export type ArrearsState = {
  phase: ArrearsPhase;
  overdueTrackingFrom: Date | null;
  /** When the 5-day countdown starts (or started). */
  warningFrom: Date | null;
  /** When suspension is due, extensions included. */
  suspendDueAt: Date | null;
  daysUntilSuspension: number | null;
};

/**
 * Where an invoice sits on CON-13's clock right now.
 *
 * Release, not generation, is the event this keys off (FLOW-10 step 10) —
 * a society cannot be late paying an invoice it has not been shown.
 */
export function arrearsStateOf(input: ArrearsInput): ArrearsState {
  const none: ArrearsState = {
    phase: "not_released",
    overdueTrackingFrom: null,
    warningFrom: null,
    suspendDueAt: null,
    daysUntilSuspension: null,
  };
  if (!input.releasedAt) return none;

  const overdueTrackingFrom = addDays(input.releasedAt, OVERDUE_TRACKING_AFTER_DAYS);
  const warningFrom = addDays(overdueTrackingFrom, WARNING_AFTER_OVERDUE_DAYS);
  const suspendDueAt = addDays(warningFrom, WARNING_WINDOW_DAYS + input.extensionDaysGranted);

  const base = { overdueTrackingFrom, warningFrom, suspendDueAt };

  // Paid wins over every other phase, including a suspension already in
  // force: restoring on payment is a single state change with no backfill.
  if (input.amountPaid >= input.invoiceAmount) {
    return { ...base, phase: "paid", daysUntilSuspension: null };
  }
  if (input.alreadySuspendedAt) return { ...base, phase: "suspended", daysUntilSuspension: 0 };

  const daysUntilSuspension = Math.ceil((suspendDueAt.getTime() - input.now.getTime()) / DAY_MS);

  if (input.now < overdueTrackingFrom) return { ...base, phase: "current", daysUntilSuspension };
  if (input.now < warningFrom) return { ...base, phase: "overdue", daysUntilSuspension };
  return { ...base, phase: "warning", daysUntilSuspension };
}

export type SuspensionVerdict =
  | { fire: true }
  | { fire: false; reason: "not_due" | "paid" | "already_suspended" | "stale_payment_data" };

/**
 * CON-13's safety rule, and the single most consequential branch in this file.
 *
 * A suspension may only fire against a **same-day-confirmed** payment status.
 * Payments are recorded by hand from Zoho, so "we have no record of payment"
 * genuinely might mean "nobody has checked since Tuesday" — and an erroneous
 * automatic suspension halts real field servicing at a real customer. Stale
 * data therefore STOPS the clock and asks ops to confirm, rather than firing
 * on data nobody has looked at.
 *
 * This is a safety rule, not an approval gate: with fresh data the automatic
 * path still needs nobody's permission. The distinction matters, because
 * turning it into an approval would defeat CON-13's own design.
 *
 * An invoice with no payments at all is a real state, not a stale one — a
 * society that has never paid anything has nothing to confirm. What must be
 * fresh is the *confirmation*, which is why `paymentStatusConfirmedAt` is a
 * separate input from the payments themselves.
 */
export function shouldFireSuspension(input: {
  state: ArrearsState;
  amountPaid: number;
  invoiceAmount: number;
  /** When ops last confirmed this invoice's payment status against Zoho. */
  paymentStatusConfirmedAt: Date | null;
  alreadySuspendedAt: Date | null;
  now: Date;
}): SuspensionVerdict {
  if (input.alreadySuspendedAt) return { fire: false, reason: "already_suspended" };
  if (input.amountPaid >= input.invoiceAmount) return { fire: false, reason: "paid" };
  if (!input.state.suspendDueAt || input.now < input.state.suspendDueAt) {
    return { fire: false, reason: "not_due" };
  }
  if (!input.paymentStatusConfirmedAt || !isSameUtcDay(input.paymentStatusConfirmedAt, input.now)) {
    return { fire: false, reason: "stale_payment_data" };
  }
  return { fire: true };
}

/** CON-13 — each grant is capped; the cap is per request, not per invoice. */
export function refuseExtension(days: number): string | null {
  if (!Number.isInteger(days) || days <= 0) return "An extension is a whole number of days.";
  if (days > MAX_EXTENSION_DAYS) {
    return `An extension is granted in increments of up to ${MAX_EXTENSION_DAYS} days per request (CON-13).`;
  }
  return null;
}

// ── SCR-092's triage rule ─────────────────────────────────────────────────
//
// The release queue's stated risk IS its design brief: at 200 societies a
// one-at-a-time gate becomes the month-end bottleneck, and a queue that
// treats all 200 identically guarantees either a rubber stamp or a missed
// window. So the queue's job is triage — surface the handful that need a
// human, make the rest one confident action.
//
// Needs-review months are never bulk-releasable. That refusal is the
// structural guarantee that the gate stays real.

export const ROUTINE_TOTAL_VARIANCE_PCT = 10;
export const ROUTINE_MIN_COVERAGE_DAYS = 28;

export type TriageInput = {
  anyOutOfBand: boolean;
  basisChangedSinceLastMonth: boolean;
  total: number;
  /** Mean of the society's trailing 3 released months, if there are any. */
  trailingMean: number | null;
  hasOpenDispute: boolean;
  coverageDays: number;
  unacknowledgedInvoiceMismatch: boolean;
  invoiceAttached: boolean;
};

export type Triage = { routine: boolean; reasons: string[] };

/**
 * A month is routine when ALL of: every circuit in band, no basis change from
 * last month, total within 10% of the trailing 3-month mean, no open dispute,
 * coverage ≥ 28 days. Anything else needs review, and the row states which
 * condition failed — the reason is a column, not a tooltip.
 *
 * Reasons are written in the accountant's language, not the system's: "Total
 * is 34% above the 3-month average", never "anomaly".
 */
export function triage(input: TriageInput): Triage {
  const reasons: string[] = [];

  if (!input.invoiceAttached) reasons.push("No Zoho invoice uploaded yet");
  if (input.unacknowledgedInvoiceMismatch) {
    reasons.push("Invoice total doesn't match the computed amount");
  }
  if (input.anyOutOfBand) reasons.push("A circuit is outside its contracted band");
  if (input.basisChangedSinceLastMonth) reasons.push("A circuit switched to metered billing this month");
  if (input.hasOpenDispute) reasons.push("An open deviation review");
  if (input.coverageDays < ROUTINE_MIN_COVERAGE_DAYS) {
    reasons.push(`Only ${input.coverageDays} days of readings`);
  }
  if (input.trailingMean !== null && input.trailingMean > 0) {
    const deltaPct = ((input.total - input.trailingMean) / input.trailingMean) * 100;
    if (Math.abs(deltaPct) > ROUTINE_TOTAL_VARIANCE_PCT) {
      const dir = deltaPct > 0 ? "above" : "below";
      reasons.push(`Total is ${Math.abs(Math.round(deltaPct))}% ${dir} the 3-month average`);
    }
  }

  return { routine: reasons.length === 0, reasons };
}

/**
 * FEAT-054-AC-3 — the hard blockers, distinct from triage.
 *
 * Triage decides whether a month needs a human's attention; these decide
 * whether it may be released at all. A needs-review month can still be
 * released after the accountant looks at it; a blocked one cannot be
 * released by anybody until the blocker clears.
 */
export function releaseBlockers(input: {
  status: string;
  invoiceAttached: boolean;
  unacknowledgedInvoiceMismatch: boolean;
  openBlockingAnomalies: number;
  reportGenerated: boolean;
}): string[] {
  const blockers: string[] = [];
  if (input.status === "held") blockers.push("The month is held and has no calculated figures.");
  if (input.status === "released") blockers.push("Already released.");
  if (!input.invoiceAttached) blockers.push("No Zoho invoice has been uploaded for this month (CON-33).");
  if (input.unacknowledgedInvoiceMismatch) {
    blockers.push("The invoice amount differs from the computed amount and hasn't been acknowledged.");
  }
  if (input.openBlockingAnomalies > 0) {
    blockers.push(`${input.openBlockingAnomalies} reading flag(s) are still unresolved (INV-09).`);
  }
  if (!input.reportGenerated) blockers.push("No savings report has been generated for this month.");
  return blockers;
}
