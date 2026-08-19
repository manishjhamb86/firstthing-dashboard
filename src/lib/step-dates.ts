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
