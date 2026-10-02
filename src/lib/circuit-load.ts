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
  /**
   * After the full installation (2026-09-27): how many of this line's KEPT
   * fixtures are still kept, and how many were taken off the circuit. Absent
   * = as at the demo. Kept fixtures replaced at the full installation are in
   * neither — from then on they are simply replaced lights.
   */
  keptNow?: number;
  removedNow?: number;
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
  /**
   * Fixtures taken OFF the circuit at the full installation (2026-09-27). The
   * meter no longer sees them, so they come off the before side only — the
   * circuit's comparable before is B − Xr. Always zero as at the demo.
   */
  removedFixedKwh: number;
  removedShare: number;
  removedLike: { name: string; count: number }[];
  removedOther: { name: string; count: number; kWhPerDay: number }[];
  /** Kept fixtures replaced at the full installation — now counted as replaced lights. */
  replacedLater: { name: string; count: number }[];
};

export const NO_EXCLUSION: Exclusion = {
  fixedKwh: 0, share: 0, keptLike: [], keptOther: [], likeLights: 0, likeUniform: true, inventoryCount: 0,
  removedFixedKwh: 0, removedShare: 0, removedLike: [], removedOther: [], replacedLater: [],
};

export function exclusionOf(items: LoadItem[]): Exclusion {
  const kwh = (count: number, i: LoadItem) => (count * i.wattage * i.hoursPerDay) / 1000;
  const keptAtDemo = (i: LoadItem) =>
    i.excludedFromCalculation
      ? i.count
      : i.replacementCount != null && i.replacementCount < i.count
        ? i.count - i.replacementCount
        : 0;
  const typeOf = (i: LoadItem, n: number) => i.deviceTypeId ?? `line-${n}`;
  const likeTypes = new Set(items.map((i, n) => (i.excludedFromCalculation ? null : typeOf(i, n))).filter((t): t is string => t !== null));
  let fixedKwh = 0;
  let removedFixedKwh = 0;
  let likeLoad = 0;
  let keptLikeLoad = 0;
  let removedLikeLoad = 0;
  let likeLights = 0;
  const likeProfiles = new Set<string>();
  const keptLike = new Map<string, { name: string; count: number }>();
  const removedLike = new Map<string, { name: string; count: number }>();
  const replacedLater = new Map<string, { name: string; count: number }>();
  const keptOther: Exclusion["keptOther"] = [];
  const removedOther: Exclusion["removedOther"] = [];
  const add = (m: Map<string, { name: string; count: number }>, name: string, n: number) => {
    if (n <= 0) return;
    m.set(name, { name, count: (m.get(name)?.count ?? 0) + n });
  };
  items.forEach((i, n) => {
    const atDemo = keptAtDemo(i);
    const k = i.keptNow ?? atDemo;
    const r = i.removedNow ?? 0;
    const name = i.name ?? "Fixture";
    add(replacedLater, name, atDemo - k - r);
    if (likeTypes.has(typeOf(i, n))) {
      likeLoad += kwh(i.count, i);
      likeLights += i.count;
      likeProfiles.add(`${i.wattage}|${i.hoursPerDay}`);
      if (k > 0) {
        keptLikeLoad += kwh(k, i);
        add(keptLike, name, k);
      }
      if (r > 0) {
        removedLikeLoad += kwh(r, i);
        add(removedLike, name, r);
      }
    } else {
      if (k > 0) {
        fixedKwh += kwh(k, i);
        keptOther.push({ name, count: k, kWhPerDay: kwh(k, i) });
      }
      if (r > 0) {
        removedFixedKwh += kwh(r, i);
        removedOther.push({ name, count: r, kWhPerDay: kwh(r, i) });
      }
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
    removedFixedKwh,
    removedShare: likeLoad > 0 ? removedLikeLoad / likeLoad : 0,
    removedLike: [...removedLike.values()],
    removedOther,
    replacedLater: [...replacedLater.values()],
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
  const sum = (xs: { count: number }[]) => xs.reduce((n, k) => n + k.count, 0);
  const keptLike = sum(ex.keptLike) + sum(ex.removedLike ?? []);
  const keptOther = sum(ex.keptOther) + sum(ex.removedOther ?? []);
  const kept = ex.inventoryCount === metered ? keptLike + keptOther : keptLike;
  return metered - kept > 0 ? metered - kept : metered;
}

/** Lights of the replaced kind that are replaced (at the demo, or later at the full installation). */
export function replacedLikeLights(ex: Exclusion): number {
  const sum = (xs: { count: number }[]) => xs.reduce((n, k) => n + k.count, 0);
  return ex.likeLights - sum(ex.keptLike) - sum(ex.removedLike ?? []);
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
  const sum = (xs: { count: number }[]) => xs.reduce((n, k) => n + k.count, 0);
  const one = (xs: { count: number }[]) => xs.length === 1 && xs[0].count === 1;
  const keptLikeCount = sum(ex.keptLike);
  const removedLike = ex.removedLike ?? [];
  const removedOther = ex.removedOther ?? [];
  const removedLikeCount = sum(removedLike);
  const rest = before === null ? null : likeRemainder(before, ex);
  const likeTerm = (n: number) =>
    ex.likeUniform ? `÷ ${ex.likeLights} × ${n}` : `× their share of the like lights' rated load`;

  if (ex.keptOther.length > 0) {
    const what = ex.keptOther.map((k) => `${k.count} × ${k.name}`).join(", ");
    lines.push(
      `${what} ${one(ex.keptOther) ? "stays" : "stay"} on the circuit and ${one(ex.keptOther) ? "is" : "are"} not what was replaced, so ${one(ex.keptOther) ? "its" : "their"} rated draw comes off: ${f2(ex.fixedKwh)} kWh/day (count × watts × hours).`,
    );
  }
  if (keptLikeCount > 0) {
    const names = ex.keptLike.map((k) => k.name).join(", ");
    lines.push(
      `${keptLikeCount} of the ${ex.likeLights} ${names} ${keptLikeCount === 1 ? "was" : "were"} kept, not replaced. ${keptLikeCount === 1 ? "It is" : "They are"} the same kind as the lights that were replaced, so ${keptLikeCount === 1 ? "its" : "their"} share of what the meter measured comes off` +
        (rest === null ? `: the before figure ${likeTerm(keptLikeCount)}.` : `: ${f2(rest)} ${likeTerm(keptLikeCount)} = ${f2(rest * ex.share)} kWh/day.`),
    );
  }
  if (removedOther.length > 0 || removedLikeCount > 0) {
    const what = [
      ...removedLike.map((k) => `${k.count} × ${k.name}`),
      ...removedOther.map((k) => `${k.count} × ${k.name}`),
    ].join(", ");
    const xr = before === null ? null : removedKwhAt(before, ex);
    lines.push(
      `${what} ${removedLikeCount + sum(removedOther) === 1 ? "was" : "were"} taken off the circuit at the full installation. The meter no longer sees ${removedLikeCount + sum(removedOther) === 1 ? "it" : "them"}, so ${removedLikeCount + sum(removedOther) === 1 ? "its" : "their"} draw comes off the before figure only${xr === null ? "." : `: ${f2(xr)} kWh/day.`}`,
    );
  }
  if (lines.length === 0) return { lines, formula: null, excludedKwh: null, savingPct: null };
  const xk = before === null ? null : keptKwhAt(before, ex);
  const xr = before === null ? null : removedKwhAt(before, ex);
  const x = xk === null || xr === null ? null : xk + xr;
  if ((xk ?? 0) > 0 || keptLikeCount > 0 || ex.keptOther.length > 0) {
    lines.push("The kept fixtures' draw comes off the after figure too, because they drew the same before and after.");
  }
  const comparable = before === null || xr === null ? null : before - xr;
  const pct =
    comparable !== null && after !== null && x !== null && before! - x > 0 ? ((comparable - after) / (before! - x)) * 100 : null;
  const top = xr !== null && xr > 0 ? `${f2(before!)} − ${f2(xr)} − ${after === null ? "after" : f2(after)}` : `${f2(before ?? 0)} − ${after === null ? "after" : f2(after)}`;
  const formula =
    before !== null && x !== null
      ? after !== null
        ? `Saving = (${top}) ÷ (${f2(before)} − ${f2(x)}) = ${pct === null ? "—" : `${pct.toFixed(1)}%`} — the saving on the ${replacedLikeLights(ex)} lights that were replaced.`
        : `Saving = (${top}) ÷ (${f2(before)} − ${f2(x)}) — measured on the ${replacedLikeLights(ex)} lights that were replaced.`
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
  keptReplacedCount: true,
  keptRemovedCount: true,
  keptRecordedAt: true,
  deviceType: { select: { name: true } },
} as const;

/**
 * Which deduction a figure wants (2026-09-27). A demo's figures — its
 * benchmark, the demo report, the pre/post-installation reports — are what
 * the demo measured, with the fixtures kept AT THE DEMO. Everything monitored
 * after the full installation reads what was recorded there: kept fixtures
 * replaced then are no longer deducted; ones taken off come off the before
 * side only.
 */
export type ExclusionView = "demo" | "monitoring";

export function exclusionFromDevices(
  rows: readonly {
    count: number;
    wattage: number;
    hoursPerDay: number;
    excludedFromCalculation: boolean;
    deviceTypeId: string;
    replacementCount: number | null;
    keptReplacedCount?: number | null;
    keptRemovedCount?: number | null;
    keptRecordedAt?: Date | null;
    deviceType?: { name: string } | null;
  }[],
  view: ExclusionView = "demo",
): Exclusion {
  return exclusionOf(
    rows.map((r) => {
      const item: LoadItem = {
        count: r.count,
        wattage: r.wattage,
        hoursPerDay: r.hoursPerDay,
        excludedFromCalculation: r.excludedFromCalculation,
        deviceTypeId: r.deviceTypeId,
        replacementCount: r.replacementCount,
        name: r.deviceType?.name,
      };
      if (view === "monitoring" && r.keptRecordedAt) {
        const atDemo = keptAtDemoOf(item);
        const replaced = Math.min(atDemo, Math.max(0, r.keptReplacedCount ?? 0));
        const removed = Math.min(atDemo - replaced, Math.max(0, r.keptRemovedCount ?? 0));
        item.keptNow = atDemo - replaced - removed;
        item.removedNow = removed;
      }
      return item;
    }),
  );
}

/** Fixtures a line kept at the demo: the whole line when excluded, else those not replaced. */
export function keptAtDemoOf(i: Pick<LoadItem, "count" | "excludedFromCalculation" | "replacementCount">): number {
  return i.excludedFromCalculation
    ? i.count
    : i.replacementCount != null && i.replacementCount < i.count
      ? i.count - i.replacementCount
      : 0;
}

/** What the like-lights' shares are taken of: the before figure less every fixed (rated) item. */
function likeRemainder(beforeKwh: number, ex: Exclusion): number {
  return Math.max(0, beforeKwh - ex.fixedKwh - (ex.removedFixedKwh ?? 0));
}

/** kWh/day of fixtures kept on the circuit — off both the before and after figures. */
export function keptKwhAt(beforeKwh: number, ex: Exclusion | undefined): number {
  if (!ex) return 0;
  return ex.fixedKwh + likeRemainder(beforeKwh, ex) * ex.share;
}

/** kWh/day of fixtures taken off the circuit at the full installation — off the before figure only. */
export function removedKwhAt(beforeKwh: number, ex: Exclusion | undefined): number {
  if (!ex) return 0;
  return (ex.removedFixedKwh ?? 0) + likeRemainder(beforeKwh, ex) * (ex.removedShare ?? 0);
}

/**
 * Everything that comes off a before figure (or baseline) of `beforeKwh` to
 * leave the draw of the lights that were replaced: kept + removed.
 */
export function excludedKwhAt(beforeKwh: number, ex: Exclusion | undefined): number {
  return keptKwhAt(beforeKwh, ex) + removedKwhAt(beforeKwh, ex);
}

/** The before figure the circuit AS IT NOW STANDS compares with: less the fixtures taken off it. */
export function comparableBaseline(beforeKwh: number, ex: Exclusion | undefined): number {
  return beforeKwh - removedKwhAt(beforeKwh, ex);
}

/**
 * The most a circuit may draw in a day and still meet a benchmark of `pct`
 * against baseline B: the replaced lights must save pct of THEIR share, so
 * the ceiling is (B − Xr) − pct × (B − Xk − Xr). Without exclusions, B × (1 − pct).
 */
export function benchmarkCeiling(baseline: number, pct: number, ex?: Exclusion): number {
  return comparableBaseline(baseline, ex) - (pct / 100) * (baseline - excludedKwhAt(baseline, ex));
}

export function hasExclusion(ex: Exclusion | undefined): boolean {
  return !!ex && (ex.fixedKwh > 0 || ex.share > 0 || (ex.removedFixedKwh ?? 0) > 0 || (ex.removedShare ?? 0) > 0);
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

/**
 * The daily kWh a demo's PRE-INSTALL readings are judged against — the same
 * rule as `expectedDisplayedLoadW`, extended from the one-time load check to
 * every day of readings (2026-10-02, user-caught). A demo's own
 * `meteredLightCount` can be corrected (operations, demo mode) without
 * touching the circuit's load inventory — "a demo is measured on the lights
 * it was run on," not necessarily on everything the inventory lists — so a
 * day's "vs theoretical" figure has to follow the DEMO's count, not the raw
 * inventory total, or the two screens for the same demo disagree about what
 * it was even measuring (a corrected 140 → 40 showed 0.0% here and -71% on
 * the readings table for the identical demo).
 */
export function expectedDailyKwh(input: {
  meteredLightCount: number;
  wattage: number;
  workingHours: number;
  devices: LoadItem[];
}): number {
  const lights = input.devices.reduce((n, d) => n + d.count, 0);
  if (input.devices.length > 0 && lights === input.meteredLightCount) {
    return theoreticalDailyKwh(input.devices);
  }
  return (input.meteredLightCount * input.wattage * input.workingHours) / 1000;
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
  // Fixtures taken off the circuit come off the before side only (2026-09-27).
  return ((comparableBaseline(baselineKwh, ex) - dayKwh) / replacedBaseline) * 100;
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

/**
 * A period's savings, against the baseline IN FORCE ON EACH DAY, not one
 * "now" figure applied across the whole period (2026-10-02, user-caught: a
 * printed report for August read 72% in its headline while every one of its
 * own day rows read 45-55%, because the headline used `effectiveBaselineAt`
 * at the moment the report was GENERATED — after a 01-Sep rescale — while
 * each day correctly replayed the baseline as of that day). `baselineAt` may
 * be a plain number (the pre-existing, still-supported shape — every call
 * site with no rescale in its window behaves identically) or a resolver,
 * which this aggregates by SUMMING each day's own numerator and denominator
 * rather than averaging kWh against one baseline — the same "weighted by
 * each day's own figure, never a plain average of percentages" rule already
 * used for `sinceStart`'s overall %. With a constant baseline this reduces
 * to exactly `savingsPct(baseline, averageKwh, ex)`, so a period that never
 * crosses a rescale sees no change at all.
 */
export function periodSavingsSummary(
  baselineAt: number | null | ((date: Date) => number | null),
  days: { date?: Date | string; kWh: number; excluded?: boolean }[],
  /** What was left on the circuit unreplaced — off both sides (savingsPct). */
  ex?: Exclusion,
): { averageKwh: number | null; savingsPct: number | null; band: SavingsBand | null; warn: boolean } {
  const resolve: (date?: Date | string) => number | null =
    typeof baselineAt === "function"
      ? (date) => (date === undefined ? null : baselineAt(typeof date === "string" ? new Date(date) : date))
      : () => baselineAt;
  const live = days.filter((d) => !d.excluded);
  const avg = averageKwh(live);
  let savedSum = 0;
  let replacedSum = 0;
  for (const d of live) {
    const b = resolve(d.date);
    if (b === null) continue;
    const replaced = b - excludedKwhAt(b, ex);
    if (replaced <= 0) continue;
    savedSum += comparableBaseline(b, ex) - d.kWh;
    replacedSum += replaced;
  }
  if (replacedSum <= 0) {
    return { averageKwh: avg, savingsPct: null, band: null, warn: false };
  }
  const pct = (savedSum / replacedSum) * 100;
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

/**
 * What happened to a circuit's kept fixtures, in two sentences (2026-09-27,
 * user-asked: "display the information properly to avoid any confusion if
 * anything changed"). `atDemo` says what the demo left out; `afterFull` says
 * what the full installation recorded and what that means for the saving
 * now — or that nothing is recorded yet, so the demo's deduction carries on.
 * Null when the demo left nothing out.
 */
export function keptStory(
  demo: Exclusion,
  now: Exclusion,
  recorded: boolean,
  meteredLights: number,
): { atDemo: string; afterFull: string } | null {
  if (!hasExclusion(demo)) return null;
  const sum = (xs: { count: number }[]) => xs.reduce((n, k) => n + k.count, 0);
  const list = (xs: { count: number; name: string }[]) => xs.map((k) => `${k.count} × ${k.name}`).join(", ");
  const keptLike = sum(demo.keptLike);
  const demoParts: string[] = [];
  if (keptLike > 0) {
    demoParts.push(
      `${keptLike} of the ${demo.likeLights} ${demo.keptLike.map((k) => k.name).join(", ")} ${keptLike === 1 ? "was" : "were"} kept, so the demo's saving — the benchmark — is on the ${replacedLikeLights(demo)} replaced`,
    );
  }
  if (demo.keptOther.length > 0) {
    demoParts.push(`${list(demo.keptOther)} stayed on the circuit and ${sum(demo.keptOther) === 1 ? "its" : "their"} draw was left out`);
  }
  const atDemo = `During the demo: ${demoParts.join("; ")}.`;

  if (!recorded) {
    return { atDemo, afterFull: "Not yet recorded at the full installation — the saving still leaves them out, as in the demo." };
  }
  const replacedLater = now.replacedLater ?? [];
  const removed = [...(now.removedLike ?? []), ...(now.removedOther ?? [])];
  const stillKept = [...now.keptLike, ...now.keptOther.map(({ name, count }) => ({ name, count }))];
  const done: string[] = [];
  if (replacedLater.length > 0) done.push(`${list(replacedLater)} replaced with energy-saving lights`);
  if (removed.length > 0) done.push(`${list(removed)} taken off the circuit`);
  if (stillKept.length > 0) done.push(`${list(stillKept)} still kept`);
  const tail = !hasExclusion(now)
    ? ` From then on nothing is left out: the saving is on all ${meteredLights} lights, against the full before figure.`
    : removed.length > 0 && stillKept.length === 0
      ? " From then on the saving is on the circuit as it now stands — without the fixtures taken off."
      : " The fixtures still kept stay left out of the saving, as below.";
  return { atDemo, afterFull: `At the full installation: ${done.join("; ")}.${tail}` };
}
