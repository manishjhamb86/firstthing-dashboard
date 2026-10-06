import { addDays, utcMidnight } from "@/lib/circuit-load";
import { savingsPct, varianceAgainstTheoretical, type Exclusion } from "@/lib/circuit-load";

/**
 * Automated watch over a demo's pre-install and post-install monitoring
 * periods (2026-10-06, user-asked): "the system should automatically monitor
 * the consumption on the demo circuit and notify the person who did the
 * meter install or light replacement and the person who assigned, in case
 * anomaly detected."
 *
 * Deliberately does not duplicate anything already running:
 *   - `judgePostInstallDay`/`restartFromDate` in commissioning-anomaly.ts are
 *     specified but have no production caller — unlike those, this module's
 *     verdicts are actually wired to a daily sweep (demo-monitoring-alerts.ts).
 *   - `DemoResultReview` (circuit-figures.ts) fires once, at post acceptance,
 *     judging the demo's final accepted average. This module judges each
 *     DAY while the window is still open — a different, earlier question.
 *   - The pre-install check reuses `varianceAgainstTheoretical`'s existing
 *     ±10% "warn" band (CON-17) rather than a new threshold.
 *
 * The post-install band here (60-70%) is DELIBERATELY narrower than, and a
 * different question from, `circuit-demos.ts`'s BAND_MIN_PCT/BAND_MAX_PCT
 * (60-80%): that band decides whether the demo's ACCEPTED, final average
 * counts as a valid commissioned benchmark — noise is expected to average
 * out over the whole window by then. This one judges a SINGLE day while the
 * window is still running, as an early nudge to go check the circuit, not a
 * verdict on the demo itself. The same two-questions-same-numbers-would-be-
 * wrong shape this codebase already drew between CON-45's ±5% ingest check
 * and CON-01a's contract tolerance band.
 */

export const DEMO_DAILY_SAVINGS_MIN_PCT = 60;
export const DEMO_DAILY_SAVINGS_MAX_PCT = 70;

export type DemoMonitoringPeriod = "pre" | "post" | "none";

/**
 * Which period a demo is in right now, from its own raw fields — never
 * `Circuit.state`, which only answers "what phase is the CIRCUIT showing",
 * and can lag a demo that is still mid-window (`circuit-figures.ts`'s own
 * `resyncCircuitFigures` keeps the circuit at `post_install_monitoring`
 * until the post set is accepted, by design).
 *
 * Spans the user's own words exactly: pre is "right after meter was
 * installed and before demo light replacement/installation is performed";
 * post is "right after the demo light replacement/installation is performed
 * and till savings report is generated" — generation happens the moment the
 * post set is accepted in band (demo-step-actions.ts), or the demo sits in a
 * shared report either way.
 */
export function demoMonitoringPeriod(
  demo: { voidedAt: Date | null; rejected: boolean; meterInstalledAt: Date | null; lightReplacementDate: Date | null },
  postAccepted: boolean,
  shared: boolean,
): DemoMonitoringPeriod {
  if (demo.voidedAt || demo.rejected) return "none";
  if (demo.meterInstalledAt === null) return "none";
  if (demo.lightReplacementDate === null) return "pre";
  if (postAccepted || shared) return "none";
  return "post";
}

export type DayVerdict = { anomalous: boolean; pct: number | null; message: string };

/** CON-17's own ±10% tolerance, watched daily rather than only at the one-time load check. */
export function judgePreInstallDay(kWh: number, expectedKwh: number): DayVerdict {
  const v = varianceAgainstTheoretical(kWh, expectedKwh);
  if (v.pct === null) {
    return { anomalous: true, pct: null, message: "No expected load is recorded for this circuit to compare against." };
  }
  const sign = v.pct >= 0 ? "+" : "";
  return {
    anomalous: v.band === "warn",
    pct: v.pct,
    message: `Yesterday's pre-install reading was ${sign}${v.pct.toFixed(1)}% against the circuit's expected ${expectedKwh.toFixed(1)} kWh/day.`,
  };
}

/** A single day's savings against the demo's own baseline — not the demo's final accepted average. */
export function judgePostInstallDay(dayKwh: number, baselineKwh: number, ex?: Exclusion): DayVerdict {
  const pct = savingsPct(baselineKwh, dayKwh, ex);
  if (pct === null) {
    return { anomalous: false, pct: null, message: "No pre-install baseline is recorded yet to compare against." };
  }
  return {
    anomalous: pct < DEMO_DAILY_SAVINGS_MIN_PCT || pct > DEMO_DAILY_SAVINGS_MAX_PCT,
    pct,
    message: `Yesterday's post-install reading measured ${pct.toFixed(1)}% savings, outside the ${DEMO_DAILY_SAVINGS_MIN_PCT}–${DEMO_DAILY_SAVINGS_MAX_PCT}% range this daily watch expects.`,
  };
}

/**
 * The date yesterday's reading is due for, or null when nothing is due —
 * either the period itself isn't running, or no period has been chosen yet
 * (a demo with no `preFrom/preTo` set has nothing to be "missing" against).
 * Checks YESTERDAY, matching this codebase's standing rule that an ingest
 * window ends a day behind "now" — readings arrive by upload, not live.
 */
export function readingDueDate(
  period: DemoMonitoringPeriod,
  demo: { preFrom: Date | null; preTo: Date | null; postFrom: Date | null; postTo: Date | null },
  now: Date,
): Date | null {
  if (period === "none") return null;
  const from = period === "pre" ? demo.preFrom : demo.postFrom;
  const to = period === "pre" ? demo.preTo : demo.postTo;
  if (from === null || to === null) return null;
  const yesterday = addDays(utcMidnight(now), -1);
  const t = yesterday.getTime();
  if (t < utcMidnight(from).getTime() || t > utcMidnight(to).getTime()) return null;
  return yesterday;
}
