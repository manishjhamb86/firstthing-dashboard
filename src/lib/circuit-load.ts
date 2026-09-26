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
  /** The fixture type — decides whether a kept fixture is "the same item" as a replaced one. */
  deviceTypeId?: string;
  /** Recorded at the replacement: lights on this line actually replaced (the rest stayed). */
  replacementCount?: number | null;
  /** For explanations. */
  name?: string;
};

/**
 * What comes off the meter's figures before a saving is taken (2026-09-26,
 * the user's rules):
 *
 *  - lights kept on the circuit that are THE SAME ITEM as the replaced ones
 *    come off as their share of what the meter MEASURED — the Hyde Park demo:
 *    63 tubes, 55 replaced, 8 kept, so 28.66 ÷ 63 × 8 = 3.64 kWh/day. The
 *    meter saw what they really drew, which a rated figure only estimates.
 *  - anything DIFFERENT left on the circuit (a street light, a fan, a TV)
 *    comes off at its theoretical draw, count × W × h ÷ 1000 — there is no
 *    measured figure to take a share of.
 *
 * With both on one circuit, the different items' theoretical draw comes off
 * first and the kept like-lights take their share of what remains:
 *     X(B) = fixed + (B − fixed) × share
 * where B is the before figure (or the baseline in force). "Share" is by
 * rated load within the like group, which for identical fixtures is exactly
 * kept ÷ total lights.
 *
 * Kept lights are an excluded line, or the part of a line not replaced when
 * the replacement recorded fewer lights than the line holds. "The same item"
 * means the same fixture type as a line being replaced.
 */
export type Exclusion = {
  /** kWh/day of kept items unlike anything replaced — theoretical. */
  fixedKwh: number;
  /** Share (0..1) of the rest that kept like-lights account for. */
  share: number;
  keptLike: { name: string; count: number }[];
  keptOther: { name: string; count: number; kWhPerDay: number }[];
  /** Lights of the replaced kind on the circuit, kept or replaced. */
  likeLights: number;
  /** Every like line has the same wattage and hours — the share is then exactly kept ÷ lights. */
  likeUniform: boolean;
  /** Every fixture on the inventory, kept or replaced. */
  inventoryCount: number;
};

export const NO_EXCLUSION: Exclusion = { fixedKwh: 0, share: 0, keptLike: [], keptOther: [], likeLights: 0, likeUniform: true, inventoryCount: 0 };

export function exclusionOf(items: LoadItem[]): Exclusion {
  const kwh = (count: number, i: LoadItem) => (count * i.wattage * i.hoursPerDay) / 1000;
  const kept = (i: LoadItem) =>
    i.excludedFromCalculation
      ? i.count
      : i.replacementCount != null && i.replacementCount < i.count
        ? i.count - i.replacementCount
        : 0;
  const typeOf = (i: LoadItem, n: number) => i.deviceTypeId ?? `line-${n}`;
  const likeTypes = new Set(items.map((i, n) => (i.excludedFromCalculation ? null : typeOf(i, n))).filter((t): t is string => t !== null));
  let fixedKwh = 0;
  let likeLoad = 0;
  let keptLikeLoad = 0;
  let likeLights = 0;
  const likeProfiles = new Set<string>();
  const keptLike = new Map<string, { name: string; count: number }>();
  const keptOther: Exclusion["keptOther"] = [];
  items.forEach((i, n) => {
    const k = kept(i);
    const name = i.name ?? "Fixture";
    if (likeTypes.has(typeOf(i, n))) {
      likeLoad += kwh(i.count, i);
      likeLights += i.count;
      likeProfiles.add(`${i.wattage}|${i.hoursPerDay}`);
      if (k > 0) {
        keptLikeLoad += kwh(k, i);
        const prev = keptLike.get(name);
        keptLike.set(name, { name, count: (prev?.count ?? 0) + k });
      }
    } else if (k > 0) {
      fixedKwh += kwh(k, i);
      keptOther.push({ name, count: k, kWhPerDay: kwh(k, i) });
    }
  });
  return {
    fixedKwh,
    share: likeLoad > 0 ? keptLikeLoad / likeLoad : 0,
    keptLike: [...keptLike.values()],
    keptOther,
    likeLights,
    likeUniform: likeProfiles.size <= 1,
    inventoryCount: items.reduce((n, i) => n + i.count, 0),
  };
}

/**
 * The lights a saving is extrapolated from — the ones actually replaced.
 * When the inventory is the demo's lights (its count is the metered count),
 * every kept fixture comes off; otherwise only kept lights of the replaced
 * kind are known to be among the metered ones.
 */
export function replacedLightCount(metered: number, ex: Exclusion | undefined): number {
  if (!ex) return metered;
  const keptLike = ex.keptLike.reduce((n, k) => n + k.count, 0);
  const keptOther = ex.keptOther.reduce((n, k) => n + k.count, 0);
  const kept = ex.inventoryCount === metered ? keptLike + keptOther : keptLike;
  return metered - kept > 0 ? metered - kept : metered;
}

/** Lights of the replaced kind that were actually replaced. */
export function replacedLikeLights(ex: Exclusion): number {
  return ex.likeLights - ex.keptLike.reduce((n, k) => n + k.count, 0);
}

const f2 = (n: number) => n.toFixed(2);

/**
 * The calculation in words, for every screen and report that shows a saving
 * on a circuit with fixtures left unreplaced — the same sentences in the
 * back office, the reports and the society's portal, so nobody reads two
 * explanations of one figure. `before`/`after` are the figures the meter
 * gave (kWh/day); either may be null when not measured yet.
 */
export function describeExclusion(
  ex: Exclusion,
  before: number | null,
  after: number | null,
): { lines: string[]; formula: string | null; excludedKwh: number | null; savingPct: number | null } {
  const lines: string[] = [];
  const keptLikeCount = ex.keptLike.reduce((n, k) => n + k.count, 0);
  if (ex.keptOther.length > 0) {
    const what = ex.keptOther.map((k) => `${k.count} × ${k.name}`).join(", ");
    lines.push(
      `${what} ${ex.keptOther.length === 1 && ex.keptOther[0].count === 1 ? "stays" : "stay"} on the circuit and ${ex.keptOther.length === 1 && ex.keptOther[0].count === 1 ? "is" : "are"} not what was replaced, so ${ex.keptOther.length === 1 && ex.keptOther[0].count === 1 ? "its" : "their"} rated draw comes off: ${f2(ex.fixedKwh)} kWh/day (count × watts × hours).`,
    );
  }
  if (keptLikeCount > 0) {
    const names = ex.keptLike.map((k) => k.name).join(", ");
    const base = before === null ? null : before - ex.fixedKwh;
    const likeTerm = ex.likeUniform
      ? `÷ ${ex.likeLights} × ${keptLikeCount}`
      : `× ${(ex.share * 100).toFixed(1)}% (their share of the like lights' rated load)`;
    lines.push(
      `${keptLikeCount} of the ${ex.likeLights} ${names} ${keptLikeCount === 1 ? "was" : "were"} kept, not replaced. ${keptLikeCount === 1 ? "It is" : "They are"} the same kind as the lights that were replaced, so ${keptLikeCount === 1 ? "its" : "their"} share of what the meter measured comes off` +
        (base === null
          ? `: the before figure ${ex.fixedKwh > 0 ? "less the item above " : ""}${likeTerm}.`
          : `: ${f2(base)} ${likeTerm} = ${f2(base * ex.share)} kWh/day.`),
    );
  }
  if (lines.length === 0) return { lines, formula: null, excludedKwh: null, savingPct: null };
  const x = before === null ? null : excludedKwhAt(before, ex);
  lines.push("The same amount comes off the after figure, because those fixtures drew the same before and after.");
  const pct = before !== null && after !== null && x !== null && before - x > 0 ? ((before - after) / (before - x)) * 100 : null;
  const formula =
    before !== null && x !== null
      ? after !== null
        ? `Saving = (${f2(before)} − ${f2(after)}) ÷ (${f2(before)} − ${f2(x)}) = ${pct === null ? "—" : `${pct.toFixed(1)}%`} — the saving on the ${replacedLikeLights(ex)} lights that were replaced.`
        : `Saving = (before − after) ÷ (${f2(before)} − ${f2(x)}) — measured on the ${replacedLikeLights(ex)} lights that were replaced.`
      : null;
  return { lines, formula, excludedKwh: x, savingPct: pct };
}

/** The device columns exclusionOf needs — one select every reader shares. */
export const EXCLUSION_DEVICE_SELECT = {
  count: true,
  wattage: true,
  hoursPerDay: true,
  excludedFromCalculation: true,
  deviceTypeId: true,
  replacementCount: true,
  deviceType: { select: { name: true } },
} as const;

export function exclusionFromDevices(
  rows: readonly {
    count: number;
    wattage: number;
    hoursPerDay: number;
    excludedFromCalculation: boolean;
    deviceTypeId: string;
    replacementCount: number | null;
    deviceType?: { name: string } | null;
  }[],
): Exclusion {
  return exclusionOf(
    rows.map((r) => ({
      count: r.count,
      wattage: r.wattage,
      hoursPerDay: r.hoursPerDay,
      excludedFromCalculation: r.excludedFromCalculation,
      deviceTypeId: r.deviceTypeId,
      replacementCount: r.replacementCount,
      name: r.deviceType?.name,
    })),
  );
}

/** kWh/day that comes off a before figure (or baseline) of `beforeKwh`. */
export function excludedKwhAt(beforeKwh: number, ex: Exclusion | undefined): number {
  if (!ex) return 0;
  return ex.fixedKwh + Math.max(0, beforeKwh - ex.fixedKwh) * ex.share;
}

/**
 * The most a circuit may draw in a day and still meet a benchmark of `pct`
 * against baseline B: the replaced lights must save pct of THEIR share, so
 * the ceiling is B − pct × (B − X(B)). Without exclusions, B × (1 − pct).
 */
export function benchmarkCeiling(baseline: number, pct: number, ex?: Exclusion): number {
  return baseline - (pct / 100) * (baseline - excludedKwhAt(baseline, ex));
}

export function hasExclusion(ex: Exclusion | undefined): boolean {
  return !!ex && (ex.fixedKwh > 0 || ex.share > 0);
}

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

/**
 * The load a demo's meter should display, in watts (CON-17's ±10% check).
 * The meter measures everything on the circuit, replaced or not, so when the
 * inventory describes the lights the demo runs on (its counts add up to the
 * demo's), the figure is Σ count × wattage over EVERY line — a circuit of 93
 * tubes and 7 street lights is not 100 × one wattage (2026-09-26). Otherwise
 * the demo's lights × the circuit's wattage, as before.
 */
export function expectedDisplayedLoadW(input: {
  meteredLightCount: number;
  wattage: number;
  devices: { count: number; wattage: number }[];
}): { watts: number; fromInventory: boolean } {
  const lights = input.devices.reduce((n, d) => n + d.count, 0);
  if (input.devices.length > 0 && lights === input.meteredLightCount) {
    return { watts: input.devices.reduce((n, d) => n + d.count * d.wattage, 0), fromInventory: true };
  }
  return { watts: input.meteredLightCount * input.wattage, fromInventory: false };
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

/**
 * The saving on the lights that were replaced. `ex` describes what was left
 * on the circuit unreplaced (exclusionOf); its draw X at this baseline comes
 * off BOTH sides — the meter sees it before and after alike — so the saving
 * is (baseline − day) over (baseline − X). Without it a circuit carrying lights nobody replaced
 * reports a saving lower than the retrofit actually achieved (2026-09-26,
 * user-specified).
 */
export function savingsPct(baselineKwh: number, dayKwh: number, ex?: Exclusion): number | null {
  const replacedBaseline = baselineKwh - excludedKwhAt(baselineKwh, ex);
  if (replacedBaseline <= 0) return null;
  return ((baselineKwh - dayKwh) / replacedBaseline) * 100;
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
/**
 * Whether the pre-install baseline is still open to being computed.
 *
 * "The lights are not in yet" was the whole test, and for a circuit walked
 * through commissioning in real time it is the same thing — the baseline
 * always settles before the replacement is recorded. A society that predates
 * the system reverses that order: both dates come off its demo report before
 * a single reading exists, so the baseline was treated as settled when it was
 * still null, and the days that would have produced it could never be
 * uploaded (found walking Ace City's own history, 2026-08-26).
 *
 * Shared by the phase and the recompute so the two cannot disagree about
 * which era an upload belongs to.
 */
export function baselineUnsettled(c: {
  lightReplacementDate: Date | null;
  preInstallBaseline?: number | null;
}): boolean {
  return c.lightReplacementDate === null || (c.preInstallBaseline ?? null) === null;
}

export function deriveUploadKind(c: {
  lightReplacementDate: Date | null;
  preInstallBaseline?: number | null;
  benchmarkSavingsPct: number | null;
}): UploadKind {
  if (baselineUnsettled(c)) return "pre_install";
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
  // A PRE-install window ends the day before the lights changed, when that
  // day is known. It usually is not — during commissioning the replacement
  // has not happened — but a backfilled circuit records both dates up front,
  // and without the bound its pre-install upload would sweep in every day
  // AFTER the replacement too and average the new fittings into the old
  // fittings' baseline. CON-19 excludes the replacement day itself.
  if (args.kind === "pre_install" && args.lightReplacementDate) {
    return { from: addDays(args.meterInstalledAt, 1), to: addDays(args.lightReplacementDate, -1) };
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
  /**
   * Intervals in this day whose value was non-zero — a 24-row day can still
   * be mostly silence, since the vendor's export writes 0 for an hour the
   * meter was offline (same rule the stored-readings listing already shows
   * after commit; the review table now shows it BEFORE, per the user's own
   * 2026-09-18 ask).
   */
  dataHours: number;
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
  parsedDays: { date: Date; kWh: number; intervalCount: number; dataHours: number }[];
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
      dataHours: day.dataHours,
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
  /** What was left on the circuit unreplaced — off both sides (savingsPct). */
  ex?: Exclusion,
): { averageKwh: number | null; savingsPct: number | null; band: SavingsBand | null; warn: boolean } {
  const live = days.filter((d) => !d.excluded);
  const avg = averageKwh(live);
  const pct = avg === null || baseline === null ? null : savingsPct(baseline, avg, ex);
  if (pct === null) {
    return { averageKwh: avg, savingsPct: null, band: null, warn: false };
  }
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
  /** Carried so the phase and the window agree on which era is still open. */
  preInstallBaseline?: number | null;
  benchmarkSavingsPct: number | null;
  lastStoredDate: Date | null;
  demo: boolean;
  now?: Date;
  /** What the operator says the readings are for (2026-09-25); defaults to the circuit's current step. */
  kind?: UploadKind;
  /** The demo periods: an upload for the demo readings is held to exactly these days when set. */
  preDemoFrom?: Date | null;
  preDemoTo?: Date | null;
  postDemoFrom?: Date | null;
  postDemoTo?: Date | null;
}): ReadingWindow | null {
  if (!args.meterInstalledAt) return null;
  const now = args.now ?? new Date();
  const kind = args.kind ?? deriveUploadKind(args);
  if (kind === "pre_install" && args.preDemoFrom && args.preDemoTo) {
    const w = { from: args.preDemoFrom, to: args.preDemoTo };
    return { kind, ...w, empty: windowIsEmpty(w), demoExtended: false };
  }
  if (kind === "post_install" && args.postDemoFrom && args.postDemoTo) {
    const w = { from: args.postDemoFrom, to: args.postDemoTo };
    return { kind, ...w, empty: windowIsEmpty(w), demoExtended: false };
  }
  const w = extractionWindow({
    kind,
    meterInstalledAt: args.meterInstalledAt,
    lightReplacementDate: args.lightReplacementDate,
    lastStoredDate: args.lastStoredDate,
    today: args.demo ? addDays(now, DEMO_WINDOW_HORIZON_DAYS) : now,
  });
  return { kind, from: w.from, to: w.to, empty: windowIsEmpty(w), demoExtended: args.demo };
}

/**
 * The operator's own choice of which days in a file to actually consider —
 * narrower than the phase-derived window, never wider than it (user-asked
 * 2026-09-18: a vendor export can hold a year of history, and only a
 * stretch of it should feed a given benchmark). Intersecting rather than
 * replacing means CON-19's phase boundaries — before the meter, the
 * replacement day, today — can never be reached around, only narrowed
 * within.
 */
export function narrowToChosenRange(
  window: { from: Date; to: Date },
  chosenRange: { from: Date; to: Date } | null,
): { from: Date; to: Date } {
  if (!chosenRange) return window;
  const from = window.from.getTime() > chosenRange.from.getTime() ? window.from : chosenRange.from;
  const to = window.to.getTime() < chosenRange.to.getTime() ? window.to : chosenRange.to;
  return { from, to };
}

/** Whole days the window spans, inclusive. 0 when the window is empty. */
export function windowLengthDays(w: { from: Date; to: Date }): number {
  if (windowIsEmpty(w)) return 0;
  return Math.round((utcMidnight(w.to).getTime() - utcMidnight(w.from).getTime()) / 86_400_000) + 1;
}
