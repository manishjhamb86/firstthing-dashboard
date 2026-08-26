// CON-45 — the circuit's load inventory, the theoretical daily figure, and
// the one colour system every reading row in the product uses.
//
// Deliberately pure, like portal-authority.ts and benchmark-rescale.ts: the
// Server Actions are thin shells, and everything a report or a review table
// claims about a number can be unit-tested without a database.
//
// The user's rules, verbatim where they matter (2026-08-17):
//   - Pre-install, each day is compared against the THEORETICAL figure
//     (Σ count × wattage × hours ÷ 1000) — the check that nothing unknown is
//     silently consuming on the circuit. Within ±5% clean; ±5–10% flagged;
//     beyond ±10% a red warning. The system never blocks — the user decides.
//   - Post-install and monitoring, each day is a SAVINGS % against the
//     pre-install average: ≥65 green · 60–65 cyan · 58–60 yellow ·
//     55–58 orange · <55 red. One warning when a month averages below 60.
//   - Savings above 80% get their own "check the meter" treatment rather
//     than green: CON-20 treats >80% as outside the plausible band, and a
//     dead meter reads as 100% savings.

export type LoadItem = {
  count: number;
  wattage: number; // per-unit watts
  hoursPerDay: number; // 24 or 12 normally; custom allowed
  /**
   * On the circuit, but not part of the retrofit (2026-08-26). The meter sees
   * it before and after, so it belongs in the theoretical figure a READING is
   * checked against — and must come off both sides before a SAVINGS
   * percentage is taken. Those are different questions, so they are different
   * functions rather than one with a flag.
   */
  excludedFromCalculation?: boolean;
};

/**
 * Σ(count × wattage × hoursPerDay) ÷ 1000 — kWh per day, for the WHOLE
 * circuit. This is what a pre-installation reading is validated against
 * (CON-17), because the meter measures everything on the circuit including
 * the fixtures nobody is replacing.
 */
export function theoreticalDailyKwh(items: LoadItem[]): number {
  return items.reduce((sum, i) => sum + (i.count * i.wattage * i.hoursPerDay) / 1000, 0);
}

/**
 * The part of the theoretical figure that is NOT being retrofitted — deducted
 * from both the before and after averages before savings are computed.
 * Gaur Saundaryam's five unreplaced surface lights are 2.16 kWh/day of a
 * 22.32 kWh/day circuit, and ignoring them reports 59.79% where the truth is
 * 66.89% — seven points of the figure a fee is a share of.
 */
export function excludedDailyKwh(items: LoadItem[]): number {
  return theoreticalDailyKwh(items.filter((i) => i.excludedFromCalculation));
}

/** The lights actually being replaced — what a saving is attributable to. */
export function retrofitLightCount(items: LoadItem[]): number {
  return items.filter((i) => !i.excludedFromCalculation).reduce((n, i) => n + i.count, 0);
}

// ── Pre-install: variance against theoretical ────────────────────────────

export type VarianceBand = "ok" | "flag" | "warn";

export const PRE_FLAG_PCT = 5;
export const PRE_WARN_PCT = 10;

export function varianceAgainstTheoretical(
  kWh: number,
  theoretical: number,
): { pct: number | null; band: VarianceBand } {
  if (theoretical <= 0) return { pct: null, band: "warn" }; // nothing to compare against is itself a warning
  const pct = ((kWh - theoretical) / theoretical) * 100;
  const abs = Math.abs(pct);
  return { pct, band: abs > PRE_WARN_PCT ? "warn" : abs > PRE_FLAG_PCT ? "flag" : "ok" };
}

// ── Post-install & monitoring: savings against the baseline ──────────────

export type SavingsBand = "green" | "cyan" | "yellow" | "orange" | "red" | "suspect";

export const SAVINGS_GREEN_MIN = 65;
export const SAVINGS_CYAN_MIN = 60;
export const SAVINGS_YELLOW_MIN = 58;
export const SAVINGS_ORANGE_MIN = 55;
/** CON-20's upper bound — above this, suspect the meter before celebrating. */
export const SAVINGS_SUSPECT_ABOVE = 80;

export function savingsPct(baselineKwh: number, dayKwh: number): number | null {
  if (baselineKwh <= 0) return null;
  return ((baselineKwh - dayKwh) / baselineKwh) * 100;
}

export function savingsBand(pct: number): SavingsBand {
  if (pct > SAVINGS_SUSPECT_ABOVE) return "suspect";
  if (pct >= SAVINGS_GREEN_MIN) return "green";
  if (pct >= SAVINGS_CYAN_MIN) return "cyan";
  if (pct >= SAVINGS_YELLOW_MIN) return "yellow";
  if (pct >= SAVINGS_ORANGE_MIN) return "orange";
  return "red";
}

/**
 * The one place the colours live. Backgrounds are alpha tints so they read on
 * all three themes; the text colour is only set where the tint alone would be
 * ambiguous. A band is never the only signal — every consumer also renders
 * the % and a label, per the blueprint's own colourblind/greyscale rule.
 */
export const SAVINGS_BAND_META: Record<
  SavingsBand,
  { label: string; bg: string; accent: string }
> = {
  green: { label: "On target", bg: "rgba(34,163,90,0.16)", accent: "#1f9d55" },
  cyan: { label: "Within band", bg: "rgba(14,165,197,0.16)", accent: "#0e7fa5" },
  yellow: { label: "Slightly under", bg: "rgba(224,171,20,0.20)", accent: "#a97d0b" },
  orange: { label: "Under target", bg: "rgba(240,130,40,0.20)", accent: "#c05f13" },
  red: { label: "Well under", bg: "rgba(220,56,46,0.20)", accent: "#c22e26" },
  suspect: { label: "Implausibly high — check the meter", bg: "rgba(139,92,246,0.18)", accent: "#7c5bd1" },
};

export const VARIANCE_BAND_META: Record<VarianceBand, { label: string; bg: string; accent: string }> = {
  ok: { label: "Within ±5%", bg: "transparent", accent: "inherit" },
  flag: { label: "Outside ±5%", bg: "rgba(224,171,20,0.20)", accent: "#a97d0b" },
  warn: { label: "Outside ±10%", bg: "rgba(220,56,46,0.20)", accent: "#c22e26" },
};

// ── The baseline ─────────────────────────────────────────────────────────

export type StoredDay = {
  date: Date;
  kWh: number;
  /** excludedAt-backed: excluded days stay listed but never count. */
  excluded: boolean;
};

/**
 * The pre-install average — the figure every future savings % is computed
 * against for the term. Average over the days the operator kept, exactly as
 * decided 2026-08-17: acceptance is the filter, and a later exclusion
 * (before a report) removes a day from here the moment it is stamped.
 */
export function baselineAverage(days: StoredDay[]): number | null {
  const live = days.filter((d) => !d.excluded);
  if (live.length === 0) return null;
  return live.reduce((s, d) => s + d.kWh, 0) / live.length;
}

// ── Day classification against the circuit's own recorded dates ──────────

export type DayPhase =
  | "before_meter" // before or on the meter-install day — never imported
  | "pre_install" // day after meter install … day before replacement
  | "replacement_day" // excluded always — the day's variance is installation noise
  | "post_install"; // day after replacement onward

export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(d: Date, n: number): Date {
  return new Date(utcMidnight(d).getTime() + n * 86_400_000);
}

/**
 * Which phase a calendar day belongs to. The meter-install day itself is
 * excluded ("extract readings from next day of meter installation" — the
 * user's rule), as is the replacement day.
 */
export function classifyDay(
  day: Date,
  meterInstalledAt: Date,
  lightReplacementDate: Date | null,
): DayPhase {
  const d = utcMidnight(day).getTime();
  const meterDay = utcMidnight(meterInstalledAt).getTime();
  if (d <= meterDay) return "before_meter";
  if (lightReplacementDate === null) return "pre_install";
  const replaceDay = utcMidnight(lightReplacementDate).getTime();
  if (d < replaceDay) return "pre_install";
  if (d === replaceDay) return "replacement_day";
  return "post_install";
}

// ── Upload-kind derivation and the extraction window ─────────────────────

export type UploadKind = "pre_install" | "post_install" | "monitoring";

/**
 * What kind of upload this is, derived from the circuit's own record — never
 * asked of the operator:
 *   - no replacement date yet            → pre-install upload
 *   - replaced, but no benchmark yet     → post-install upload
 *   - benchmark confirmed                → monitoring upload
 */
export function deriveUploadKind(c: {
  lightReplacementDate: Date | null;
  benchmarkSavingsPct: number | null;
}): UploadKind {
  if (c.lightReplacementDate === null) return "pre_install";
  if (c.benchmarkSavingsPct === null) return "post_install";
  return "monitoring";
}

/**
 * The extraction window for an upload.
 *
 * Start:
 *   - pre/post uploads re-read everything from the day after meter install —
 *     the post upload's verification pass over the stored pre-install days
 *     is the point, not a side effect.
 *   - monitoring uploads start one day BEFORE the last stored reading (the
 *     user's 13 Nov → "pick from 12th Nov" rule): the day before is verified
 *     unchanged, and the last stored day itself is superseded by the fuller
 *     value, because the previously-uploaded final day may have been cut
 *     mid-day by the export.
 *
 * End: yesterday relative to `today` — today's rows are incomplete by
 * construction and never imported.
 */
/**
 * True when no day can possibly qualify yet — the meter went in today or
 * yesterday, so "the day after installation" has not finished. The window
 * then computes from > to, which is correct arithmetic and nonsense to show
 * as a date range ("2026-08-18 -> 2026-08-17").
 */
export function windowIsEmpty(w: { from: Date; to: Date }): boolean {
  return w.from.getTime() > w.to.getTime();
}

/** The first day that will ever qualify — what to tell the operator to wait for. */
export function firstQualifyingDay(w: { from: Date; to: Date }): Date {
  return w.from;
}

export function extractionWindow(args: {
  kind: UploadKind;
  meterInstalledAt: Date;
  /** required for a post-install window — the day the lights actually changed */
  lightReplacementDate?: Date | null;
  lastStoredDate: Date | null;
  today: Date;
}): { from: Date; to: Date } {
  const yesterday = addDays(args.today, -1);
  if (args.kind === "monitoring") {
    // A monitoring day can never precede the post-install window's own
    // start, whatever the last stored reading is — so the overlap rule is
    // floored at the day after the replacement.
    //
    // Without the floor, a live circuit with NO stored MeterReading rows
    // (its commissioning ran through the legacy window flow, which writes
    // CommissioningReading instead) fell through to "day after meter
    // install" and opened a window covering the entire pre-install history.
    // Days from before the lights changed would then be accepted into a
    // month that bills against the post-replacement baseline. Found by
    // moving the monthly upload to its own screen (2026-08-20) and watching
    // three saved days land outside the monitoring phase entirely.
    const floor = args.lightReplacementDate
      ? addDays(args.lightReplacementDate, 1)
      : addDays(args.meterInstalledAt, 1);
    const overlap = args.lastStoredDate !== null ? addDays(args.lastStoredDate, -1) : floor;
    return { from: overlap.getTime() < floor.getTime() ? floor : overlap, to: yesterday };
  }
  // A POST-install window starts the day after the LIGHTS were replaced, not
  // the day after the meter went in (user-reported 2026-08-19: replacement on
  // the 19th was offering 08-13 → 08-18). Anchoring it to meterInstalledAt
  // put days from BEFORE the replacement inside the post window, where they
  // would be committed as post-install readings and drag the savings
  // benchmark toward the old fittings' consumption. CON-19 excludes the
  // replacement day itself, exactly as the pre window excludes install day.
  if (args.kind === "post_install" && args.lightReplacementDate) {
    return { from: addDays(args.lightReplacementDate, 1), to: yesterday };
  }
  return { from: addDays(args.meterInstalledAt, 1), to: yesterday };
}

// ── Review rows: what the operator actually decides on ───────────────────

export type RowDisposition =
  | "new" // not stored — accept (default) or reject
  | "stored_match" // stored, identical — nothing to do
  | "stored_changed" // stored, differs — warn, keep stored (user's rule)
  | "supersede" // the monitoring overlap day — fuller value replaces stored
  | "released" // INV-03 — consumed by a released calculation, untouchable
  | "out_of_window"; // before meter install / replacement day / today

export type ReviewRow = {
  date: Date;
  kWh: number;
  intervalCount: number;
  expectedIntervals: number | null;
  partial: boolean;
  phase: DayPhase;
  disposition: RowDisposition;
  storedKwh: number | null;
  storedExcluded: boolean;
  /** pre-install rows: variance vs theoretical */
  variancePct: number | null;
  varianceBand: VarianceBand | null;
  /** post/monitoring rows: savings vs baseline */
  savingsPct: number | null;
  savingsBand: SavingsBand | null;
};

/**
 * Builds the full review row set for an upload. Everything here is
 * recomputed server-side at commit from the same inputs — the client's rows
 * are presentation, never authority.
 */
export function buildReviewRows(args: {
  kind: UploadKind;
  parsedDays: { date: Date; kWh: number; intervalCount: number }[];
  expectedIntervals: number | null;
  window: { from: Date; to: Date };
  meterInstalledAt: Date;
  lightReplacementDate: Date | null;
  stored: { date: Date; kWh: number; excluded: boolean; released: boolean }[];
  lastStoredDate: Date | null;
  theoretical: number | null;
  baseline: number | null;
}): ReviewRow[] {
  const storedByDay = new Map(args.stored.map((s) => [utcMidnight(s.date).getTime(), s]));
  const lastStored = args.lastStoredDate ? utcMidnight(args.lastStoredDate).getTime() : null;

  const rows: ReviewRow[] = [];
  for (const day of args.parsedDays) {
    const at = utcMidnight(day.date);
    const t = at.getTime();
    const phase = classifyDay(at, args.meterInstalledAt, args.lightReplacementDate);
    const inWindow = t >= args.window.from.getTime() && t <= args.window.to.getTime();
    const stored = storedByDay.get(t);

    let disposition: RowDisposition;
    if (!inWindow || phase === "before_meter" || phase === "replacement_day") {
      disposition = "out_of_window";
    } else if (stored?.released) {
      disposition = "released";
    } else if (stored) {
      const changed = Math.abs(stored.kWh - day.kWh) > 1e-9;
      if (args.kind === "monitoring" && lastStored !== null && t === lastStored && changed) {
        // The deliberate overlap: the previously-final day is superseded by
        // the fuller value — that is what the one-day overlap exists for.
        disposition = "supersede";
      } else {
        disposition = changed ? "stored_changed" : "stored_match";
      }
    } else {
      disposition = "new";
    }

    const partial =
      args.expectedIntervals !== null &&
      args.expectedIntervals > 1 &&
      day.intervalCount < args.expectedIntervals;

    let variancePct: number | null = null;
    let vBand: VarianceBand | null = null;
    let sPct: number | null = null;
    let sBand: SavingsBand | null = null;
    if (partial) {
      // A part-day total cannot be judged against a whole-day figure. 13 of
      // 24 hours against a 24-hour theoretical reads as roughly -50% no
      // matter how healthy the circuit is — the day simply isn't over. The
      // day is already excluded from every average; giving it a red band as
      // well reports a fault that the data does not show. Left null, and the
      // UI says "partial day" in place of a verdict.
    } else if (phase === "pre_install" && args.theoretical !== null) {
      const v = varianceAgainstTheoretical(day.kWh, args.theoretical);
      variancePct = v.pct;
      vBand = v.band;
    } else if (phase === "post_install" && args.baseline !== null) {
      sPct = savingsPct(args.baseline, day.kWh);
      sBand = sPct === null ? null : savingsBand(sPct);
    }

    rows.push({
      date: at,
      kWh: day.kWh,
      intervalCount: day.intervalCount,
      expectedIntervals: args.expectedIntervals,
      partial,
      phase,
      disposition,
      storedKwh: stored?.kWh ?? null,
      storedExcluded: stored?.excluded ?? false,
      variancePct,
      varianceBand: vBand,
      savingsPct: sPct,
      savingsBand: sBand,
    });
  }
  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** The rows an operator can actually act on. */
export function actionableRows(rows: ReviewRow[]): ReviewRow[] {
  return rows.filter((r) => r.disposition === "new" || r.disposition === "supersede");
}

export function changedStoredRows(rows: ReviewRow[]): ReviewRow[] {
  return rows.filter((r) => r.disposition === "stored_changed");
}

// ── Summary figures ──────────────────────────────────────────────────────

export function averageKwh(rows: { kWh: number }[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + r.kWh, 0) / rows.length;
}

/** One warning when a period averages below the contractual floor. */
export const SAVINGS_WARN_BELOW = 60;

export function periodSavingsSummary(
  baseline: number | null,
  days: { kWh: number; excluded?: boolean }[],
): { averageKwh: number | null; savingsPct: number | null; band: SavingsBand | null; warn: boolean } {
  const live = days.filter((d) => !d.excluded);
  const avg = averageKwh(live);
  if (avg === null || baseline === null || baseline <= 0) {
    return { averageKwh: avg, savingsPct: null, band: null, warn: false };
  }
  const pct = ((baseline - avg) / baseline) * 100;
  return { averageKwh: avg, savingsPct: pct, band: savingsBand(pct), warn: pct < SAVINGS_WARN_BELOW };
}

// ── The window, resolved from the circuit alone ──────────────────────────
// Both the page (which shows the operator the valid period BEFORE they pick
// a file) and the ingest action (which classifies the days in one) need the
// same answer. Keeping it in one composition means the period shown on the
// step and the period the commit enforces cannot drift apart.

/**
 * How far past today DEMO_MODE lifts the window's END. A demo sheet carries
 * simulated days that have not happened yet — replace the lights today and
 * the post-install readings are necessarily future-dated. It moves the END
 * only: the START still comes from the pivot date, so a day on or before
 * the replacement stays out of the post window even in demo. Sequence is
 * never what demo mode relaxes.
 */
export const DEMO_WINDOW_HORIZON_DAYS = 366;

export type ReadingWindow = {
  kind: UploadKind;
  from: Date;
  to: Date;
  /** from > to — no day can qualify yet; show the wait, not a backwards range. */
  empty: boolean;
  /** the end was lifted past today because demo mode is on */
  demoExtended: boolean;
};

export function circuitReadingWindow(args: {
  meterInstalledAt: Date | null;
  lightReplacementDate: Date | null;
  benchmarkSavingsPct: number | null;
  lastStoredDate: Date | null;
  demo: boolean;
  now?: Date;
}): ReadingWindow | null {
  if (!args.meterInstalledAt) return null;
  const now = args.now ?? new Date();
  const kind = deriveUploadKind(args);
  const w = extractionWindow({
    kind,
    meterInstalledAt: args.meterInstalledAt,
    lightReplacementDate: args.lightReplacementDate,
    lastStoredDate: args.lastStoredDate,
    today: args.demo ? addDays(now, DEMO_WINDOW_HORIZON_DAYS) : now,
  });
  return { kind, from: w.from, to: w.to, empty: windowIsEmpty(w), demoExtended: args.demo };
}

/** Whole days the window spans, inclusive. 0 when the window is empty. */
export function windowLengthDays(w: { from: Date; to: Date }): number {
  if (windowIsEmpty(w)) return 0;
  return Math.round((utcMidnight(w.to).getTime() - utcMidnight(w.from).getTime()) / 86_400_000) + 1;
}
