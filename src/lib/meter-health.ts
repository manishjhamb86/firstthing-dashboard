/**
 * Is this meter reporting, and is what it reports physically possible —
 * decided in one pure module so the hourly job, a manual sync and the screen
 * cannot disagree about what "offline" means.
 *
 * The three-state answer is the lesson the water-tank work paid for:
 * `online` from a vendor means CONNECTED, not REPORTING. A meter can hold an
 * open connection and have said nothing for six hours, and presenting that
 * last figure as live is how a stale number becomes a decision.
 */
export type MeterState = "reporting" | "silent" | "offline";

/** A meter that has said nothing for this long is silent, however connected. */
export const SILENT_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * How many consecutive bad polls raise an alert. One missed hour is a flaky
 * connection or a router rebooting; two in a row is a meter somebody has to
 * go and look at. Alerting on the first would train the reader to dismiss
 * them, and the one that mattered would go with the rest.
 */
export const OFFLINE_AFTER_FAILURES = 2;

export type HealthInput = {
  /** What the vendor says about the connection. */
  online: boolean;
  /** Whether the read itself succeeded — a thrown request is a failure too. */
  readOk: boolean;
  /** When the device itself last reported a value. */
  reportedAt: Date | null;
  /** What we already believed, so a run of failures keeps its start time. */
  offlineSince: Date | null;
  /** The streak so far, before this poll. */
  consecutiveFailures: number;
  now: Date;
};

export type Health = {
  state: MeterState;
  /** Null when healthy; otherwise when the trouble started. */
  offlineSince: Date | null;
  consecutiveFailures: number;
  /**
   * True on the poll that reaches the threshold, and only that one. An alert
   * that repeats every hour is an alert people filter out.
   */
  shouldAlert: boolean;
  /** True only on the poll that recovers, for the same reason. */
  recovered: boolean;
};

export function evaluateMeterHealth(input: HealthInput): Health {
  const { online, readOk, reportedAt, offlineSince, consecutiveFailures, now } = input;
  const age = reportedAt ? now.getTime() - reportedAt.getTime() : Infinity;
  const state: MeterState = !readOk || !online ? "offline" : age > SILENT_AFTER_MS ? "silent" : "reporting";

  if (state === "reporting") {
    return {
      state,
      offlineSince: null,
      consecutiveFailures: 0,
      shouldAlert: false,
      // Only a meter that had actually reached the alerting threshold has
      // anything to recover from — a single blip that never alerted must not
      // announce its own recovery.
      recovered: consecutiveFailures >= OFFLINE_AFTER_FAILURES,
    };
  }

  const failures = consecutiveFailures + 1;
  return {
    state,
    // Keep the original start time across a run of bad polls: "down since
    // 09:00" is the fact somebody acts on, and restamping it every hour
    // would erase it.
    offlineSince: offlineSince ?? now,
    consecutiveFailures: failures,
    shouldAlert: failures === OFFLINE_AFTER_FAILURES,
    recovered: false,
  };
}

/** How long a meter has been unhealthy, in whole minutes. */
export function outageMinutes(offlineSince: Date | null, now: Date): number | null {
  if (!offlineSince) return null;
  return Math.max(0, Math.floor((now.getTime() - offlineSince.getTime()) / 60000));
}

/**
 * The line a person is chased with. It names the meter, what it measures and
 * how long it has been out — an alert that says only "a meter is offline"
 * makes the reader go and find out which one.
 */
export function outageMessage(input: {
  meterName: string;
  circuitLabel: string | null;
  societyName: string | null;
  state: MeterState;
  minutes: number | null;
}): string {
  const what = input.state === "offline" ? "is not reachable" : "is connected but has stopped reporting";
  const where = input.circuitLabel
    ? ` on ${input.circuitLabel}${input.societyName ? ` (${input.societyName})` : ""}`
    : input.societyName
      ? ` at ${input.societyName}`
      : "";
  const since =
    input.minutes === null
      ? ""
      : input.minutes < 60
        ? ` — ${input.minutes} minutes now`
        : ` — ${Math.floor(input.minutes / 60)}h ${input.minutes % 60}m now`;
  return `${input.meterName}${where} ${what}${since}.`;
}

/**
 * Headroom over the circuit's theoretical daily consumption before a reading
 * counts as impossible.
 *
 * The check is deliberately a PHYSICAL CEILING, not a statistical band: a
 * circuit cannot draw more than everything on it, running flat out, all day.
 * A band around recent days would fire on a festival, a repair, or a season,
 * and this alert has to mean "go and look at this meter". The headroom
 * absorbs metering tolerance and a load inventory that is a fixture or two
 * short of the truth.
 */
export const CAPACITY_HEADROOM = 1.1;

export type CapacityVerdict =
  | { verdict: "unknown"; reason: string }
  | { verdict: "within"; ceilingKwh: number }
  | { verdict: "over"; ceilingKwh: number; overBy: number; message: string };

/**
 * Whether a day's consumption is physically possible for this circuit.
 *
 * `theoreticalDailyKwh` is the whole circuit — every fixture on it, including
 * the ones nobody replaced — because that is what the meter measures.
 */
export function evaluateCapacity(input: {
  dayKwh: number | null;
  theoreticalDailyKwh: number | null;
  meterName: string;
}): CapacityVerdict {
  const { dayKwh, theoreticalDailyKwh: capacity, meterName } = input;
  if (dayKwh === null) return { verdict: "unknown", reason: "the meter reported no day counter" };
  if (capacity === null || capacity <= 0) {
    // Stated, never guessed. A circuit with no load inventory has no ceiling
    // to be measured against, and inventing one would put a fabricated figure
    // behind a real alert.
    return { verdict: "unknown", reason: "this circuit has no load inventory to give it a ceiling" };
  }
  const ceilingKwh = capacity * CAPACITY_HEADROOM;
  if (dayKwh <= ceilingKwh) return { verdict: "within", ceilingKwh };
  return {
    verdict: "over",
    ceilingKwh,
    overBy: dayKwh - ceilingKwh,
    message:
      `${meterName} has recorded ${dayKwh.toFixed(2)} kWh today, more than the ` +
      `${capacity.toFixed(2)} kWh everything on this circuit could draw running all day. ` +
      `Either the meter is measuring a load that is not on the register, or it is misreporting.`,
  };
}
