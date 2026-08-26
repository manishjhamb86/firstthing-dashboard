/**
 * Is this meter reporting, and if not, since when — decided in one pure
 * function so the hourly poll, the manual sync and the screen cannot
 * disagree about what "offline" means.
 *
 * The three-state answer is the lesson the water-tank work paid for:
 * `online` from a vendor means CONNECTED, not REPORTING. A meter can hold an
 * open connection and have said nothing for six hours, and presenting that
 * last figure as live is how a stale number becomes a decision.
 */
export type MeterState = "reporting" | "silent" | "offline";

/** A meter that has said nothing for this long is silent, however connected. */
export const SILENT_AFTER_MS = 2 * 60 * 60 * 1000;

export type HealthInput = {
  /** What the vendor says about the connection. */
  online: boolean;
  /** When the device itself last reported a value. */
  reportedAt: Date | null;
  /** What we already believed, so a run of failures keeps its start time. */
  offlineSince: Date | null;
  now: Date;
};

export type Health = {
  state: MeterState;
  /** Null when healthy; otherwise when the trouble started. */
  offlineSince: Date | null;
  /** True only on the transition, so an alert fires once, not every hour. */
  becameUnhealthy: boolean;
  /** True only on recovery, for the same reason. */
  recovered: boolean;
};

export function evaluateMeterHealth(input: HealthInput): Health {
  const { online, reportedAt, offlineSince, now } = input;
  const age = reportedAt ? now.getTime() - reportedAt.getTime() : Infinity;
  const state: MeterState = !online ? "offline" : age > SILENT_AFTER_MS ? "silent" : "reporting";
  const wasUnhealthy = offlineSince !== null;

  if (state === "reporting") {
    return { state, offlineSince: null, becameUnhealthy: false, recovered: wasUnhealthy };
  }
  // Keep the original start time across a run of bad polls: "down since 09:00"
  // is the fact somebody acts on, and restamping it every hour would erase it.
  return {
    state,
    offlineSince: offlineSince ?? now,
    becameUnhealthy: !wasUnhealthy,
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
