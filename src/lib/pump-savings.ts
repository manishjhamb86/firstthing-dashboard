/**
 * Pump-room savings against the "before FirsThing" baseline (2026-11-13,
 * user-specified from RG Residency's Water Pump Energy Savings Report).
 *
 * The rules, pure, so the admin page, the portal page and the dashboard
 * card read one answer:
 *
 * - A day's saving is what the old kWh/KL would have used for that day's
 *   water, less what the pump actually drew:
 *       savedKwh = baselineKwhPerKl × kl − kwh
 *   No projection and no 30-day month — only days count.
 *
 * - The pump runs every day, so EVERY calendar day from the baseline's
 *   `savingsFrom` to yesterday has a row. A day with no reading is
 *   ESTIMATED: it carries the average kWh and KL of every day actually
 *   read since `savingsFrom`, and is marked so. Nothing is stored for an
 *   estimated day — it is computed here from the gaps, so when the day's
 *   reading lands the gap closes and the estimate is simply gone.
 *
 * - ₹ = kWh × the society's recorded electricity tariff. Without a tariff
 *   on record the kWh still shows and the ₹ is stated as missing — never
 *   assumed.
 *
 * - "Now" (the kWh/KL a society compares against the baseline) and the
 *   read-day average use READ days only: an estimate is the average, so
 *   it can never move either.
 *
 * Days are YYYY-MM-DD strings, as the rest of the pump-room view keeps
 * them; "yesterday" is India's wall-clock yesterday (field-today.ts's own
 * reasoning — a UTC server would be a day out for 5½ hours every night).
 */

import { istWallClock } from "@/lib/field-today";
import { readLooseDate } from "@/lib/loose-date";

export type ReadDay = { day: string; kwh: number | null; kl: number | null; spread?: boolean };

export type SavingsDay = {
  day: string;
  kwh: number;
  kl: number;
  kwhPerKl: number | null;
  savedKwh: number;
  /** No reading (or no usable figure) for this day: kwh/kl are the read-day average. */
  estimated: boolean;
  /** No report came, but the meter's total across the gap was divided onto this day — real consumption, evenly shared, marked. */
  spread: boolean;
};

export type ReadAverage = { kwh: number; kl: number; kwhDays: number; klDays: number };

const DAY_MS = 86_400_000;

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** India's wall-clock yesterday, as YYYY-MM-DD. */
export function istYesterday(now: Date = new Date()): string {
  const wall = istWallClock(now);
  return isoDay(Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - DAY_MS);
}

/** One day's saving in kWh against the baseline; null when either figure is missing. */
export function dailySavedKwh(baselineKwhPerKl: number, kwh: number | null, kl: number | null): number | null {
  if (kwh === null || kl === null) return null;
  return baselineKwhPerKl * kl - kwh;
}

/**
 * The average of every day read so far — kWh over the days that have a kWh
 * figure, KL over the days that have a KL figure, counted separately so a
 * day whose water register went backwards still contributes its
 * electricity. Null until at least one day of each exists.
 */
export function readAverage(readDays: ReadDay[]): ReadAverage | null {
  let kwhSum = 0, kwhDays = 0, klSum = 0, klDays = 0;
  for (const d of readDays) {
    if (d.kwh !== null) { kwhSum += d.kwh; kwhDays += 1; }
    if (d.kl !== null) { klSum += d.kl; klDays += 1; }
  }
  if (kwhDays === 0 || klDays === 0) return null;
  return { kwh: kwhSum / kwhDays, kl: klSum / klDays, kwhDays, klDays };
}

/**
 * Every calendar day from `from` to `to` inclusive, oldest first. A day
 * with both figures read is read; any other day is estimated from the
 * read-day average, filling only what is missing (a day with electricity
 * read and water missing keeps its real electricity). Returns [] when
 * nothing has been read yet — there is no average to estimate from, and
 * a page of invented days would be worse than an honest "nothing yet".
 */
export function fillEveryDay(input: { from: string; to: string; readDays: ReadDay[]; baselineKwhPerKl: number }): SavingsDay[] {
  const avg = readAverage(input.readDays);
  if (!avg) return [];
  const byDay = new Map(input.readDays.map((d) => [d.day, d]));
  const out: SavingsDay[] = [];
  for (let t = dayMs(input.from); t <= dayMs(input.to); t += DAY_MS) {
    const day = isoDay(t);
    const r = byDay.get(day);
    const kwh = r?.kwh ?? avg.kwh;
    const kl = r?.kl ?? avg.kl;
    const estimated = !r || r.kwh === null || r.kl === null;
    out.push({
      day,
      kwh,
      kl,
      kwhPerKl: kl > 0 ? kwh / kl : null,
      savedKwh: input.baselineKwhPerKl * kl - kwh,
      estimated,
      spread: !estimated && (r?.spread ?? false),
    });
  }
  return out;
}

export type SavingsTotal = {
  days: number;
  estimatedDays: number;
  savedKwh: number;
  /** Null without a tariff on record. */
  savedValue: number | null;
};

export function totalOf(days: SavingsDay[], tariff: number | null): SavingsTotal {
  const savedKwh = days.reduce((a, d) => a + d.savedKwh, 0);
  return {
    days: days.length,
    estimatedDays: days.filter((d) => d.estimated).length,
    savedKwh,
    savedValue: tariff === null ? null : savedKwh * tariff,
  };
}

export type SavingsSummary = {
  /** The last day on the list, read or estimated. */
  yesterday: (SavingsDay & { savedValue: number | null }) | null;
  /** The calendar month `to` falls in. */
  month: SavingsTotal & { period: string };
  overall: SavingsTotal;
};

export function savingsSummary(days: SavingsDay[], tariff: number | null): SavingsSummary {
  const last = days[days.length - 1] ?? null;
  const period = last ? last.day.slice(0, 7) : "";
  const monthDays = days.filter((d) => d.day.slice(0, 7) === period);
  return {
    yesterday: last ? { ...last, savedValue: tariff === null ? null : last.savedKwh * tariff } : null,
    month: { period, ...totalOf(monthDays, tariff) },
    overall: totalOf(days, tariff),
  };
}

/**
 * The kWh/KL the society is running at NOW: total kWh ÷ total KL over the
 * read days inside the last `windowDays` calendar days ending at `to` —
 * never the mean of daily ratios, and never an estimated day.
 */
export function nowKwhPerKl(readDays: ReadDay[], to: string, windowDays = 30): { kwhPerKl: number; days: number; from: string } | null {
  const toMs = dayMs(to);
  const fromMs = toMs - (windowDays - 1) * DAY_MS;
  let kwh = 0, kl = 0, n = 0, first: string | null = null;
  for (const d of readDays) {
    const t = dayMs(d.day);
    if (t < fromMs || t > toMs || d.kwh === null || d.kl === null) continue;
    kwh += d.kwh; kl += d.kl; n += 1;
    if (first === null || d.day < first) first = d.day;
  }
  if (n === 0 || kl <= 0) return null;
  return { kwhPerKl: kwh / kl, days: n, from: first! };
}

export type ReportDayLine = { day: string; kwh: number; kl: number | null };

/**
 * The daily table of a filed savings report, pasted in as one line per day
 * — "24 June 2026, 592, 987" or "2026-06-24 592 987" — into days this
 * system can hold. A line it cannot read is named back, line number and
 * text, rather than skipped: a day silently dropped from a report is a day
 * that then reads as estimated, and nobody would know why. A numeric date
 * with no named month (10/11/2026) is refused as ambiguous — the report
 * prints "24 June", so there is no reason to guess.
 */
export function parseReportDays(text: string): { days: ReportDayLine[]; problems: string[] } {
  const days: ReportDayLine[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || /^(date|day)\b/i.test(line)) return;
    // The date is everything before the first run of two-or-more spaces, a
    // comma, a tab or a pipe that is followed by a number.
    const m = /^(.+?)[\s,;|\t]+(-?\d+(?:\.\d+)?)(?:[\s,;|\t]+(-?\d+(?:\.\d+)?))?\s*$/.exec(line);
    if (!m) { problems.push(`Line ${i + 1}: "${line}" — expected a date, then kWh, then KL.`); return; }
    const d = readLooseDate(m[1].trim());
    if (!d) { problems.push(`Line ${i + 1}: cannot read "${m[1].trim()}" as a date.`); return; }
    if (d.kind === "ambiguous") { problems.push(`Line ${i + 1}: "${m[1].trim()}" could be ${d.dayFirst} or ${d.monthFirst} — write the month as a word.`); return; }
    const kwh = Number(m[2]);
    const kl = m[3] === undefined ? null : Number(m[3]);
    if (!(kwh >= 0) || (kl !== null && !(kl >= 0))) { problems.push(`Line ${i + 1}: a negative figure on ${d.iso}.`); return; }
    if (seen.has(d.iso)) { problems.push(`Line ${i + 1}: ${d.iso} appears twice.`); return; }
    seen.add(d.iso);
    days.push({ day: d.iso, kwh, kl });
  });
  return { days, problems };
}

/** Refusals for recording a baseline, in words. */
export function refuseBaseline(input: { periodFrom: string; periodTo: string; kwh: number; kl: number; savingsFrom: string; today: string }): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(input.periodTo) || !/^\d{4}-\d{2}-\d{2}$/.test(input.savingsFrom)) {
    return "Each date needs a full day, year-month-day.";
  }
  if (input.periodTo < input.periodFrom) return "The baseline period ends before it starts.";
  if (input.savingsFrom <= input.periodTo) return "Savings can only start after the baseline period ends — the period measures the pump BEFORE the change.";
  if (input.savingsFrom > input.today) return "Savings cannot start in the future.";
  if (!(input.kwh > 0) || !(input.kl > 0)) return "The period's electricity and water must both be above zero — the baseline is kWh divided by KL.";
  const kwhPerKl = input.kwh / input.kl;
  if (kwhPerKl > 5) return `${kwhPerKl.toFixed(2)} kWh per kilolitre is not a figure a water pump produces — check the kWh and KL are the period totals, in those units.`;
  return null;
}
