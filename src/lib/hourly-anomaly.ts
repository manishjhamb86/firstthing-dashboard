/**
 * Per-hour anomaly detection for a circuit's own hourly meter readings
 * (2026-10-06, user-asked: "use AI to detect any abnormality... for each
 * hour... show green/yellow/red counts").
 *
 * Built as a statistical, deterministic detector, not a live per-hour model
 * call, for the same reason this codebase has made that call every other
 * time a reading-quality question came up (day-validity.ts's own learned
 * operating-hours mask, the CSV-ingest detectors in reading-anomaly.ts): a
 * figure an operator acts on has to read the same way twice on the same
 * data, and a model call per hour per day per circuit would also be a real
 * cost at this product's own stated scale (800+ circuits, 24 hours a day).
 * If literal model-based detection is wanted instead, this is the one
 * module to replace — everything downstream reads its classification, not
 * raw numbers.
 *
 * The method: median + median absolute deviation (MAD) per hour-of-day,
 * over the circuit's own rolling history (the same window
 * inferOperatingHours already uses) — a long-established robust-statistics
 * technique for exactly this shape of problem (flagging an outlier in a
 * series that is expected to vary by time of day), chosen over mean+stddev
 * because a single wild day does not drag the whole baseline toward it the
 * way an outlier-sensitive mean would. An evening-peak hour and a 3am
 * trough are judged against their OWN history, never a single blanket
 * threshold shared across the day.
 */

export type HourProfile = { hour: number; median: number; mad: number; sampleSize: number };

/** Below this many sampled days for an hour, its profile is not trusted — unclassified, never flagged on thin evidence. */
export const MIN_HOUR_SAMPLE = 10;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** One profile per hour-of-day (0-23) with enough history to judge from. */
export function buildHourlyProfiles(samples: { hour: number; kWh: number }[]): Map<number, HourProfile> {
  const byHour = new Map<number, number[]>();
  for (const s of samples) byHour.set(s.hour, [...(byHour.get(s.hour) ?? []), s.kWh]);
  const out = new Map<number, HourProfile>();
  for (const [hour, values] of byHour) {
    if (values.length < MIN_HOUR_SAMPLE) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const median = percentile(sorted, 0.5);
    const deviations = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
    const mad = percentile(deviations, 0.5);
    out.set(hour, { hour, median, mad, sampleSize: values.length });
  }
  return out;
}

export type HourClass = "normal" | "suspect" | "anomaly" | "unclassified";

// 1.4826 is the standard constant that makes MAD comparable to a standard
// deviation for a normal distribution — the conventional scaling, not a
// number picked for this product.
const MAD_TO_SIGMA = 1.4826;
const SUSPECT_Z = 2.5;
const ANOMALY_Z = 4.5;

export function classifyHour(kWh: number, profile: HourProfile | undefined): HourClass {
  if (!profile) return "unclassified";
  // A near-zero spread (an hour that has always read almost identically)
  // is floored so an ordinary small wobble is never scored as wild — the
  // floor is a fraction of the hour's own median, with a small absolute
  // minimum for an hour whose median itself sits near zero.
  const effectiveMad = Math.max(profile.mad, profile.median * 0.08, 0.02);
  const z = Math.abs(kWh - profile.median) / (MAD_TO_SIGMA * effectiveMad);
  if (z >= ANOMALY_Z) return "anomaly";
  if (z >= SUSPECT_Z) return "suspect";
  return "normal";
}

export type HourReading = { hour: number; kWh: number; present: boolean; class: HourClass };

export type DaySummary = {
  hours: HourReading[];
  normalCount: number;
  suspectCount: number;
  anomalyCount: number;
};

/** `kwhByHour[h]` is null where the meter reported nothing for that hour. */
export function classifyDay(kwhByHour: (number | null)[], profiles: Map<number, HourProfile>): DaySummary {
  const hours: HourReading[] = [];
  let normalCount = 0;
  let suspectCount = 0;
  let anomalyCount = 0;
  for (let h = 0; h < 24; h++) {
    const kWh = kwhByHour[h];
    const present = kWh !== null;
    const cls = present ? classifyHour(kWh, profiles.get(h)) : "unclassified";
    hours.push({ hour: h, kWh: kWh ?? 0, present, class: cls });
    if (cls === "normal") normalCount++;
    else if (cls === "suspect") suspectCount++;
    else if (cls === "anomaly") anomalyCount++;
  }
  return { hours, normalCount, suspectCount, anomalyCount };
}
