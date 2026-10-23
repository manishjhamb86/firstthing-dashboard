/**
 * One written rule for what "not on time" means, across every domain the
 * founders' page merges (2026-10-22, docs/research/reports/Founder
 * operations dashboard.md). Six item types already had a real deadline in
 * code before this file existed — invoices, tasks/visits/replacement days
 * (taskState(), src/lib/tasks.ts), installation days (evaluateDayGateChain(),
 * src/lib/installation-gate.ts), demo result reviews (reviewUrgency(),
 * src/lib/demo-result-review.ts), monthly inspections and gate passes. The
 * three below — complaints, meter alerts, demo steps — had none anywhere,
 * so the thresholds here are a DESIGN CHOICE the report proposes rather than
 * a fact read off existing behaviour; each is named as such at its own
 * export so a future change to one is a deliberate edit to a written number,
 * never a quiet drift (the report's own "thresholds are fixed and versioned"
 * rule, borrowed from how mature RAG-status tools treat this).
 *
 * This module decides SEVERITY only (ok/amber/red) and a clock string for a
 * row that is ALREADY known to need a person — whether an item belongs on
 * the list at all (an open ticket, an open meter alert, a demo mid-window)
 * is each loader's own query, not this file's job.
 */

export type LatenessTone = "ok" | "amber" | "red";

export type LatenessResult = {
  tone: LatenessTone;
  /** What a reader sees in the clock column — "Overdue by 4 days", "Day 9 of 5". */
  clock: string;
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60);
}

function pluralDays(n: number): string {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

// ---------------------------------------------------------------------------
// Invoices — the existing dueDate is the rule; amber 1–15 days past it, red
// beyond, plus a separate 45-day marker. 45 days mirrors MSMED Act s.15's
// payment window for a registered micro/small supplier — it carries legal
// weight only if FirsThing holds that registration and only if a housing
// society counts as a "buyer" under the Act, both open questions for
// counsel, so the UI calls this "past 45 days", never "MSMED breach".
// ---------------------------------------------------------------------------
export const INVOICE_AMBER_DAYS = 1;
export const INVOICE_RED_DAYS = 15;
export const INVOICE_PAST_45_DAYS = 45;

export function invoiceLateness(input: { dueDate: Date; settled: boolean; now: Date }): LatenessResult | null {
  if (input.settled) return null;
  const daysPastDue = daysBetween(input.dueDate, input.now);
  if (daysPastDue < INVOICE_AMBER_DAYS) return null;
  const marker = daysPastDue >= INVOICE_PAST_45_DAYS ? ` — past 45 days` : "";
  return {
    tone: daysPastDue >= INVOICE_RED_DAYS ? "red" : "amber",
    clock: `Overdue by ${pluralDays(daysPastDue)}${marker}`,
  };
}

// ---------------------------------------------------------------------------
// Complaint tickets — PROPOSED (no existing deadline field on Ticket). Not
// taken up within one day reads amber; not resolved within five days reads
// red. Calendar days, matching every other deadline already in this
// codebase (CON-13's own WARNING_AFTER_OVERDUE_DAYS etc. are calendar days
// too, not business days) — a business-day calendar is a real addition this
// report found no precedent for building, so v1 does not invent one.
// ---------------------------------------------------------------------------
export const TICKET_ACK_DAYS = 1;
export const TICKET_RESOLVE_DAYS = 5;

export function ticketLateness(input: {
  status: "open" | "in_progress" | "resolved";
  createdAt: Date;
  now: Date;
}): LatenessResult | null {
  if (input.status === "resolved") return null;
  const age = daysBetween(input.createdAt, input.now);
  if (input.status === "open" && age >= TICKET_ACK_DAYS) {
    return { tone: age >= TICKET_RESOLVE_DAYS ? "red" : "amber", clock: `Not taken up — ${pluralDays(age)} old` };
  }
  if (input.status === "in_progress" && age >= TICKET_RESOLVE_DAYS) {
    return { tone: "red", clock: `Open ${pluralDays(age)}, not resolved` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Meter alerts — PROPOSED. An alert already being OPEN means something is
// wrong (that decision is the alert's own, in meter-alerts.ts); this only
// says how urgently it needs a person now. Acknowledging is not resolving
// (PagerDuty's own rule, already how this schema treats acknowledgedAt) —
// an acknowledged alert still ages here, it just reads calmer.
// ---------------------------------------------------------------------------
export const METER_OFFLINE_RED_HOURS = 48;
export const METER_OUT_OF_RANGE_RED_HOURS = 24;
export const METER_UNACKNOWLEDGED_RED_HOURS = 4;

export function meterAlertLateness(input: {
  kind: string;
  openedAt: Date;
  acknowledgedAt: Date | null;
  now: Date;
}): LatenessResult {
  const hoursOpen = hoursBetween(input.openedAt, input.now);
  const redAfter = input.kind === "offline" ? METER_OFFLINE_RED_HOURS : METER_OUT_OF_RANGE_RED_HOURS;
  if (hoursOpen >= redAfter) {
    const d = Math.floor(hoursOpen / 24);
    return { tone: "red", clock: d >= 1 ? `Open ${pluralDays(d)}` : `Open ${Math.floor(hoursOpen)}h` };
  }
  if (!input.acknowledgedAt && hoursOpen >= METER_UNACKNOWLEDGED_RED_HOURS) {
    return { tone: "amber", clock: `Unacknowledged, open ${Math.floor(hoursOpen)}h` };
  }
  return { tone: "amber", clock: `Open ${Math.floor(hoursOpen)}h` };
}

// ---------------------------------------------------------------------------
// Demo steps — PROPOSED, from the five-valid-day window shape every demo
// already walks. A pre/post window amber past 7 days, red past 10; a booked
// replacement 2 days overdue is its own case, distinct from the window ages.
// ---------------------------------------------------------------------------
export const DEMO_WINDOW_AMBER_DAYS = 7;
export const DEMO_WINDOW_RED_DAYS = 10;
export const DEMO_REPLACEMENT_LATE_DAYS = 2;

export function demoWindowLateness(input: { openedAt: Date; now: Date }): LatenessResult | null {
  const age = daysBetween(input.openedAt, input.now);
  if (age < DEMO_WINDOW_AMBER_DAYS) return null;
  return { tone: age >= DEMO_WINDOW_RED_DAYS ? "red" : "amber", clock: `Window open ${pluralDays(age)}` };
}

export function demoReplacementLateness(input: { assignedAt: Date; now: Date }): LatenessResult | null {
  const age = daysBetween(input.assignedAt, input.now);
  if (age < DEMO_REPLACEMENT_LATE_DAYS) return null;
  return { tone: age >= DEMO_REPLACEMENT_LATE_DAYS * 2 ? "red" : "amber", clock: `Replacement assigned ${pluralDays(age)} ago, not done` };
}
