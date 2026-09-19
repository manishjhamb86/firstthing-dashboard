/**
 * How far through a commissioning window a circuit actually is — reading
 * BOTH stores, because this product has two ingest paths and the demo board
 * could only see one of them.
 *
 * The bug this exists to close (user-reported 2026-09-20, "the same thing
 * shows different statuses at different places"): `/admin/demo-monitoring`
 * counted `CommissioningReading` rows and nothing else. The pre-install
 * window opens the moment the meter install is recorded
 * (`actions.ts` — `preInstallWindowStartAt = meterInstalledAt + 1`), so
 * EVERY commissioning circuit lands on that board, including the ones on
 * CON-45's CSV path, which never write a `CommissioningReading` at all.
 * Those rows read "Day 0 of 5 · awaiting the first reading" while the
 * circuit's own page listed the days the operator had just uploaded — and
 * then vanished from the board the instant the baseline landed, so the board
 * never showed CSV progress at any point.
 *
 * The second half is as important as the count: **the two flows do not share
 * a gate.** The legacy window is CON-19's five consecutive valid days
 * (`monitoring-window.ts`, REQUIRED_VALID_DAYS). The CSV path has no such
 * rule — `circuit-recompute.ts` averages every non-excluded day in the phase
 * and settles the baseline as soon as one exists. So "Day 3 of 5" is a true
 * sentence about a legacy circuit and a meaningless one about a stored-reading
 * circuit, and printing it for both is how one screen ends up contradicting
 * another. This module returns the label each flow can actually support.
 */

/** A legacy per-day entry — `CommissioningReading`. */
export type LegacyDay = {
  date: Date;
  /** `valid` | `anomaly` — the enum's own values. */
  status: string;
};

/** A CON-45 stored day — `MeterReading`. */
export type StoredDay = {
  date: Date;
  /** Set once an operator excludes the day; excluded days never count. */
  excludedAt: Date | null;
  anomalyFlag: boolean;
};

export type CommissioningFlow = "legacy" | "stored" | "none";

export type WindowProgress = {
  /** Which store the days actually came from. */
  flow: CommissioningFlow;
  /** Days behind the window that count toward its figure. */
  dayCount: number;
  /** A day is flagged and holding the window open (legacy restarts on one). */
  pendingAnomaly: boolean;
  /** Whether a day was recorded for today — only meaningful for the legacy flow. */
  loggedToday: boolean;
  /**
   * What to print. Never "of 5" for a stored-reading circuit: that gate is
   * the legacy window's alone.
   */
  label: string;
};

/** Days are stored at UTC midnight; compare on the same footing. */
function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function onOrAfter(d: Date, start: Date | null): boolean {
  return start === null || utcDay(d) >= utcDay(start);
}

export function windowProgress(input: {
  legacy: LegacyDay[];
  stored: StoredDay[];
  windowStartAt: Date | null;
  requiredValidDays: number;
  now: Date;
}): WindowProgress {
  const legacy = input.legacy.filter((r) => onOrAfter(r.date, input.windowStartAt));
  const stored = input.stored.filter((r) => onOrAfter(r.date, input.windowStartAt));

  // The legacy table wins when it holds anything, matching the circuit page's
  // own `usesLegacyFlow` split (commissioning rows present AND no stored
  // rows). A circuit never runs one window on each path.
  if (legacy.length > 0) {
    const valid = legacy.filter((r) => r.status === "valid").length;
    const today = utcDay(input.now);
    return {
      flow: "legacy",
      dayCount: valid,
      pendingAnomaly: legacy.some((r) => r.status === "anomaly"),
      loggedToday: legacy.some((r) => utcDay(r.date) === today),
      label: `Day ${valid} of ${input.requiredValidDays}`,
    };
  }

  if (stored.length > 0) {
    const counted = stored.filter((r) => r.excludedAt === null);
    return {
      flow: "stored",
      dayCount: counted.length,
      pendingAnomaly: counted.some((r) => r.anomalyFlag),
      // An uploaded sheet is not a daily act, so "logged today" is not a
      // question this flow asks. Reporting false would put every CSV circuit
      // in the board's "still needs today's reading" bucket permanently.
      loggedToday: true,
      label:
        counted.length === 1
          ? "1 day uploaded"
          : `${counted.length} days uploaded`,
    };
  }

  return {
    flow: "none",
    dayCount: 0,
    pendingAnomaly: false,
    // Nothing recorded either way — this genuinely is waiting on a person.
    loggedToday: false,
    label: "Awaiting the first reading",
  };
}
