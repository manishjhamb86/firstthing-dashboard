// FEAT-045 / INV-09 — every upload runs anomaly detection before that
// month's bill can be generated.
//
// Pure and shared on purpose. FEAT-045-AC-5 requires the *same* detection to
// feed both the billing ingest and CAP-02's commissioning windows ("rather
// than being duplicated"), so the rule lives here once and both callers pass
// it a list of days.

import { daysInPeriod, utcDayOf } from "./reading-normalize";

/**
 * The tolerance band, in percent, for both detectors that need one: how far a
 * day may sit from the circuit's typical day, and how far it may move from
 * the day before.
 *
 * ±5% is the user's explicit choice (2026-08-15), matching the figure they
 * originally specified for this pipeline. It is deliberately one named
 * constant used by both detectors so retuning is a single edit — worth
 * knowing that common-area lighting drifts with daylight length, so days near
 * the start and end of a month can exceed this band on seasonal grounds
 * alone, which is a review-queue volume question rather than a correctness
 * one.
 */
export const ANOMALY_TOLERANCE_PCT = 5;

/** Below three days there is no meaningful "typical day" to compare against. */
export const MIN_DAYS_FOR_RANGE = 3;

export type AnomalyKind = "zero_reading" | "out_of_range" | "day_over_day_jump" | "missing_days";

export type DayInput = {
  date: Date;
  kWh: number;
  /** Already excluded by an earlier decision — ignored entirely, not re-flagged. */
  excluded?: boolean;
};

export type Finding = {
  kind: AnomalyKind;
  /** Null for a period-scoped finding. */
  date: Date | null;
  detail: string;
  observedValue: number | null;
  expectedValue: number | null;
  deviationPct: number | null;
  /**
   * INV-09 — a blocking finding holds the month out of billing until someone
   * resolves or explicitly accepts it. Missing days are informational here
   * because CON-12's coverage floor is the gate that actually governs them;
   * flagging them as blocking too would mean two gates for one fact, and the
   * bulk "resolve all clean" action on SCR-081 would have nothing safe left
   * to act on.
   */
  blocksBilling: boolean;
};

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function pctDiff(value: number, reference: number): number {
  if (reference === 0) return value === 0 ? 0 : Infinity;
  return ((value - reference) / reference) * 100;
}

function dayLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * @param days   every day the period has a reading for, in any order
 * @param period "YYYY-MM"; supplying it enables the missing-day detector
 */
export function detectAnomalies(
  days: DayInput[],
  period?: string,
  tolerancePct = ANOMALY_TOLERANCE_PCT,
): Finding[] {
  const findings: Finding[] = [];
  const live = days
    .filter((d) => !d.excluded)
    .map((d) => ({ ...d, date: utcDayOf(d.date) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // A zero is its own finding and must not also drag the reference value
  // down — a meter that failed for three days would otherwise lower the
  // median enough to make the working days look like the anomaly.
  const nonZero = live.filter((d) => d.kWh > 0);
  const reference = median(nonZero.map((d) => d.kWh));

  for (const d of live) {
    if (d.kWh === 0) {
      findings.push({
        kind: "zero_reading",
        date: d.date,
        detail: `${dayLabel(d.date)} recorded 0 kWh. A metered lighting circuit does not consume nothing for a day — this is a meter or export fault until shown otherwise.`,
        observedValue: 0,
        expectedValue: reference || null,
        deviationPct: null,
        blocksBilling: true,
      });
    }
  }

  if (nonZero.length >= MIN_DAYS_FOR_RANGE && reference > 0) {
    for (const d of nonZero) {
      const dev = pctDiff(d.kWh, reference);
      if (Math.abs(dev) > tolerancePct) {
        findings.push({
          kind: "out_of_range",
          date: d.date,
          detail: `${dayLabel(d.date)} is ${dev > 0 ? "+" : ""}${dev.toFixed(1)}% against this circuit's typical ${reference.toFixed(2)} kWh day, outside the ±${tolerancePct}% band.`,
          observedValue: d.kWh,
          expectedValue: reference,
          deviationPct: dev,
          blocksBilling: true,
        });
      }
    }
  }

  // Day-over-day compares consecutive *calendar* days only. Across a gap the
  // comparison is meaningless — the change had somewhere to hide.
  for (let i = 1; i < live.length; i++) {
    const prev = live[i - 1];
    const cur = live[i];
    const gapDays = (cur.date.getTime() - prev.date.getTime()) / 86_400_000;
    if (gapDays !== 1) continue;
    if (prev.kWh === 0 || cur.kWh === 0) continue; // already reported as a zero
    const dev = pctDiff(cur.kWh, prev.kWh);
    if (Math.abs(dev) > tolerancePct) {
      findings.push({
        kind: "day_over_day_jump",
        date: cur.date,
        detail: `${dayLabel(cur.date)} moved ${dev > 0 ? "+" : ""}${dev.toFixed(1)}% from the day before (${prev.kWh.toFixed(2)} → ${cur.kWh.toFixed(2)} kWh), beyond the ±${tolerancePct}% band.`,
        observedValue: cur.kWh,
        expectedValue: prev.kWh,
        deviationPct: dev,
        blocksBilling: true,
      });
    }
  }

  if (period) {
    const total = daysInPeriod(period);
    const present = new Set(live.map((d) => d.date.getTime()));
    const [y, m] = period.split("-").map(Number);
    const missing: string[] = [];
    for (let day = 1; day <= total; day++) {
      const ts = Date.UTC(y, m - 1, day);
      if (!present.has(ts)) missing.push(String(day));
    }
    if (missing.length > 0) {
      findings.push({
        kind: "missing_days",
        date: null,
        detail: `${missing.length} of ${total} days have no reading (${missing.join(", ")}). Missing days are excluded from the calculation and never estimated (CON-12).`,
        observedValue: live.length,
        expectedValue: total,
        deviationPct: null,
        blocksBilling: false,
      });
    }
  }

  return findings;
}

export function blockingFindings(findings: Finding[]): Finding[] {
  return findings.filter((f) => f.blocksBilling);
}
