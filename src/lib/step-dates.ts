import { isDemoMode } from "./demo-mode";
import { logger } from "./logger";

/**
 * Relative ordering for a circuit's commissioning dates.
 *
 * The requirement (user, 2026-08-19) is NOT "skip validation when
 * backdating" — it is that a whole historical commissioning can be entered
 * with every step carrying its real past date, and the ordering between
 * those dates still enforced. A March install is legitimate; a replacement
 * dated before its own meter install is not, in any mode.
 *
 * These are relative rules, so they hold in demo mode too. DEMO_MODE only
 * relaxes "must be now" constraints (how long a window must run, whether
 * today counts), never the sequence. Getting that backwards once already
 * broke the reading-window check this exists to protect.
 */

export const STEP_DATE_ERRORS = {
  future: "That date is in the future.",
  beforeMeter: "The lights cannot have been replaced before the meter was installed.",
  sameDayAsMeter:
    "The lights cannot be replaced on the same day the meter went in — the pre-install window needs at least one full day.",
  beforeLastReading:
    "There are pre-install readings dated after this replacement date. Replacement has to come after the readings it is measured against.",
} as const;

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Validates a light-replacement date against the dates that must precede it.
 * Returns null when the date is acceptable.
 */
export function refuseReplacementDate(input: {
  replacementDate: Date;
  meterInstalledAt: Date | null;
  /** latest pre-install reading already recorded, if any */
  lastPreInstallReading: Date | null;
  now: Date;
}): string | null {
  const day = startOfDayUTC(input.replacementDate);

  if (day.getTime() > startOfDayUTC(input.now).getTime()) return STEP_DATE_ERRORS.future;

  if (input.meterInstalledAt) {
    const meterDay = startOfDayUTC(input.meterInstalledAt);
    if (day.getTime() < meterDay.getTime()) return STEP_DATE_ERRORS.beforeMeter;
    // The pre-install window opens the day AFTER install, so a replacement on
    // the install day itself would leave that window no days at all.
    if (day.getTime() === meterDay.getTime()) return STEP_DATE_ERRORS.sameDayAsMeter;
  }

  // A reading taken after the replacement is not a pre-install reading, so a
  // replacement date earlier than the readings already stored would silently
  // reclassify them.
  if (input.lastPreInstallReading) {
    const lastDay = startOfDayUTC(input.lastPreInstallReading);
    if (day.getTime() < lastDay.getTime()) return STEP_DATE_ERRORS.beforeLastReading;
  }

  return null;
}

// ── The deal's own dates ─────────────────────────────────────────────────
// Same rule as the circuit's, one level up: DEMO_MODE lets a whole past deal
// be entered with its real dates (a society formed in January, a lead logged
// in February, a survey in March), and the ordering between those dates is
// still enforced. "I should be able to make entry of old records ... but then
// it should follow the date validation" — the user, 2026-08-19.
//
// Every rule here is RELATIVE, so it holds in both modes. Only the inputs
// themselves are demo-gated: in normal operation each step is stamped now(),
// which satisfies all of this for free.

/** A predecessor a date must not precede. Null dates are simply not checked. */
export type DatePredecessor = { label: string; date: Date | null };

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Refuses a date that is in the future, or that precedes something that must
 * already have happened. Returns null when acceptable.
 *
 * The message names both ends — what is being dated and what it collides
 * with, by date — because "invalid date" on a form of six dates tells the
 * operator nothing about which pair is wrong.
 */
export function refuseOrderedDate(input: {
  /** what is being dated, capitalised: "The lead" */
  subject: string;
  date: Date;
  now: Date;
  mustNotPrecede?: DatePredecessor[];
}): string | null {
  if (Number.isNaN(input.date.getTime())) return `${input.subject} needs a valid date.`;

  const day = startOfDayUTC(input.date);
  if (day.getTime() > startOfDayUTC(input.now).getTime()) {
    return `${input.subject} cannot be dated in the future.`;
  }

  for (const p of input.mustNotPrecede ?? []) {
    if (!p.date) continue;
    const before = startOfDayUTC(p.date);
    if (day.getTime() < before.getTime()) {
      return `${input.subject} cannot be dated before ${p.label} (${iso(before)}).`;
    }
  }
  return null;
}

/**
 * Resolves a demo-mode backdate input into a Date, an error string, or null
 * for "use now()".
 *
 * The demo gate lives HERE rather than at each call site, so a form field
 * that leaks into a production build still cannot move a date: the value is
 * ignored outright unless DEMO_MODE is on.
 */
export async function resolveBackdate(
  input: string | undefined,
  subject: string,
  mustNotPrecede: DatePredecessor[] = [],
  now: Date = new Date(),
): Promise<Date | string | null> {
  if (!input) return null;
  if (!(await isDemoMode())) return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  const refusal = refuseOrderedDate({ subject, date, now, mustNotPrecede });
  if (refusal) return refusal;
  logger.warn("demo.backdated", { subject, date: date.toISOString().slice(0, 10) });
  return date;
}
