/**
 * Day-level reading validity (2026-10-05, user-asked): a day counts for any
 * average or extrapolation only once it is judged COMPLETE against the
 * circuit's own operating hours — not a blanket 24-hour assumption. Pure,
 * no network, no database; written once at the two places a `MeterReading`
 * row is produced (`src/lib/monitoring-projection.ts`, the monthly-upload
 * commit in `src/app/admin/readings/actions.ts`) and read everywhere a day's
 * completeness matters (`classifyDay` in `src/lib/invoice-month.ts`).
 *
 * A circuit that runs fewer than 24 hours a day (street lights on a timer)
 * has real, expected off-hours every day — reading zero then is not a gap.
 * There is no schedule field recording WHICH hours that is, so it is learned
 * from the circuit's own history: an hour that consistently draws power is
 * "expected on"; an hour that consistently reads zero is the circuit's own
 * off-hours, not a data problem. Below a minimum sample, or with no hourly
 * breakdown at all, every caller falls back to treating all 24 hours as
 * expected — today's exact behaviour, so a new circuit is never penalised
 * for lacking history yet.
 */

export type OperatingHours = {
  /** Hours (0-23) the circuit is expected to draw power. */
  hours: Set<number>;
  /** False below the minimum sample — callers should treat every hour as
   *  expected rather than trust a mask built from too little history. */
  confident: boolean;
};

/** How far back the learned pattern looks — recent enough to track a real
 *  schedule change, long enough to not be thrown by one odd week. */
export const OPERATING_HOURS_WINDOW_DAYS = 90;
/** Calendar days of history needed before the inferred mask is trusted. */
export const MIN_SAMPLE_DAYS = 10;
/** An hour clearing this fraction of sampled days is "expected on". Low on
 *  purpose — missing the mark in the direction of expecting MORE hours is
 *  the safe failure (a day reads partial a little too often, never the
 *  reverse: a real gap wrongly waved through as the circuit's own off-hour). */
export const ON_FRACTION_THRESHOLD = 0.2;

const ALL_24_HOURS: OperatingHours = { hours: new Set(Array.from({ length: 24 }, (_, i) => i)), confident: false };

/**
 * Learns which hours of the day a circuit is actually expected to draw
 * power, from its own hourly history. `today` is passed in rather than read
 * from the clock, so this stays pure and testable.
 */
export function inferOperatingHours(
  hourlySamples: { day: string; hour: number; kWh: number }[],
  today: Date,
): OperatingHours {
  const cutoff = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - OPERATING_HOURS_WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const byHour = new Map<number, { on: number; total: number }>();
  const daysSeen = new Set<string>();
  for (const s of hourlySamples) {
    if (s.day < cutoffStr) continue;
    daysSeen.add(s.day);
    const e = byHour.get(s.hour) ?? { on: 0, total: 0 };
    e.total += 1;
    if (s.kWh > 0) e.on += 1;
    byHour.set(s.hour, e);
  }
  if (daysSeen.size < MIN_SAMPLE_DAYS) return ALL_24_HOURS;

  const hours = new Set<number>();
  for (let h = 0; h < 24; h++) {
    const e = byHour.get(h);
    if (e && e.total > 0 && e.on / e.total > ON_FRACTION_THRESHOLD) hours.add(h);
  }
  // Nothing cleared the bar — an unreadable pattern, not evidence the
  // circuit is never on. A day can never be "complete" against an empty
  // mask, so fall back rather than silently waving every day through.
  if (hours.size === 0) return ALL_24_HOURS;
  return { hours, confident: true };
}

export type DayHourClass = { dayClass: "complete" | "partial"; hoursExpected: number; hoursPresent: number };

/**
 * One day's completeness against the circuit's own expected hours.
 *
 * `hourlyPresent[h]` true means hour `h` carried a non-zero reading — only
 * available for a meter-projected day. A monthly-upload row carries no
 * per-hour breakdown, so it is judged by COUNT against the circuit's own
 * learned number of expected hours, not the specific mask.
 */
export function classifyDayHours(
  input: { hourlyPresent: boolean[] | null; intervalCount: number | null },
  operating: OperatingHours,
): DayHourClass {
  if (input.hourlyPresent) {
    const expected = operating.confident ? [...operating.hours] : [...ALL_24_HOURS.hours];
    const hoursExpected = expected.length;
    const hoursPresent = expected.filter((h) => input.hourlyPresent![h]).length;
    return { dayClass: hoursPresent === hoursExpected ? "complete" : "partial", hoursExpected, hoursPresent };
  }
  const hoursExpected = operating.confident ? operating.hours.size : 24;
  const hoursPresent = input.intervalCount ?? 0;
  return { dayClass: hoursPresent >= hoursExpected ? "complete" : "partial", hoursExpected, hoursPresent };
}
