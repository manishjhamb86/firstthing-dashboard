import { cache } from "react";
import { db } from "@/lib/db";
import { demoLightsInstalled, totalLights } from "@/lib/light-population";
import { circuitMonitoringStart } from "@/lib/monitoring-projection";
import { effectiveBaselineAt, lastVerifiedAt } from "@/lib/benchmark-rescale";
import { lightCountStages, type LightStage } from "@/lib/light-count-history";
import { comparableBaseline, EXCLUSION_DEVICE_SELECT, excludedKwhAt, keptStory, exclusionFromDevices, type Exclusion, periodSavingsSummary, savingsBand, type SavingsBand } from "@/lib/circuit-load";
import { circuitLabelOf } from "@/lib/meter-view";
import { classifyDay } from "@/lib/invoice-month";

export type MonthTotal = {
  month: string;
  kWh: number;
  avoidedKwh: number;
  savingsPct: number | null;
};

/**
 * A month's totals, read out of the society-wide `daily` series — pure, so
 * the dashboard's month-over-month comparison is a real computation over
 * stored readings, never an invented delta. Only days carrying a baseline
 * count toward the percentage (the same rule `totalPct` above already
 * applies to "this month"): a day with no baseline in force says nothing
 * about whether the month improved.
 *
 * Returns EVERY month present, oldest first, so a caller can pick "this"
 * and "last" without re-deriving which months exist.
 */
export function monthlyTotals(
  daily: { date: string; kWh: number; baseline: number | null }[],
): MonthTotal[] {
  const byMonth = new Map<string, { kWh: number; baseline: number }>();
  for (const d of daily) {
    const m = d.date.slice(0, 7);
    const cur = byMonth.get(m) ?? { kWh: 0, baseline: 0 };
    cur.kWh += d.kWh;
    if (d.baseline !== null) cur.baseline += d.baseline;
    byMonth.set(m, cur);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => ({
      month,
      kWh: v.kWh,
      avoidedKwh: v.baseline - v.kWh,
      savingsPct: v.baseline > 0 ? ((v.baseline - v.kWh) / v.baseline) * 100 : null,
    }));
}

/**
 * The society's own electricity figures, assembled once per request for the
 * portal's dashboard and Electricity page (customer portal, 2026-08-29).
 *
 * Everything derives from the same store the back office reads — MeterReading
 * rows after each circuit's replacement date, judged against the baseline in
 * force on each day (INV-07 replay) — so the resident's screen and the
 * operator's can never disagree about a figure.
 *
 * Two provenance rules, both deliberate:
 *  · kWh figures are computed here from stored readings, exactly as the
 *    monthly report computes them.
 *  · ₹ figures are NEVER computed here. They come only from a RELEASED
 *    monthly calculation's fee lines (INV-02) — absent one, the screen says
 *    what will produce the figure instead of inventing a rate.
 *
 * "This month" is the month of the society's LATEST stored reading, not the
 * wall clock: readings arrive by monthly export, so the current calendar
 * month is usually empty, and a hero card that zeroes out on the 1st of
 * every month would read as an outage.
 */

export type PortalCircuit = {
  id: string;
  label: string;
  lightCount: number;
  /**
   * The population this circuit's saving is EXTRAPOLATED to for billing
   * (CON-11) — every light of this type across the society, not just the
   * `lightCount` actually metered. Disclosed here because the ₹ figure on
   * this page is computed against this number, not against `lightCount`
   * (researched 2026-09-11/12: IPMVP's Transparent principle requires the
   * extrapolation basis be stated to the party being billed, and showing
   * only the metered count would leave that basis unstated). Equal to
   * `lightCount` when the circuit represents only itself. Since 2026-09-27
   * this is the TOTAL: the full installation plus the demo lights.
   */
  representedLightCount: number;
  /** The lights fitted in the full installation, not counting the demo lights. */
  fullInstallation: number;
  /** The demo lights FirsThing replaced on this circuit before the full installation. */
  demoLights: number;
  /**
   * When the fixture count behind this circuit's saving was last physically
   * confirmed — a rescale event's date, or the commissioning date if the
   * count has never changed (IPMVP's re-inspection rule, disclosed —
   * researched 2026-09-11/12). Null only for a circuit with neither, which
   * should not occur for one with a replacement date recorded, but is read
   * that way rather than assumed.
   */
  lastVerifiedAt: string | null;
  /** The count at the demo, then each change, the last one current. */
  lightHistory: LightStage[];
  /** What stayed on the circuit unreplaced — as monitored now, after the full installation. */
  exclusion: Exclusion;
  /** What the demo left out and what the full installation recorded about it, in words (2026-09-27). */
  keptStory: { atDemo: string; afterFull: string } | null;
  /** YYYY-MM-DD: the first day of the monitoring period (the billing start). */
  monitoringFrom: string | null;
  /**
   * Every monitoring day, from the billing start — the period after full
   * installation, not the demo. `baseline` is the one in force that day, so a
   * light-count change moves it from its own date (INV-07).
   */
  monitoring: { date: string; kWh: number; excluded: boolean; underReview: boolean; baseline: number | null }[];
  /** Days recorded in the headline month (excluded days not counted). */
  monthDays: number;
  monthKwh: number | null;
  monthDailyAvg: number | null;
  savingsPct: number | null;
  band: SavingsBand | null;
  benchmarkPct: number | null;
  baselineNow: number | null;
};

export type PortalEnergy = {
  /** "2026-06" — the month every headline figure below describes. */
  month: string | null;
  circuits: PortalCircuit[];
  totals: {
    consumedKwh: number | null;
    avoidedKwh: number | null;
    savingsPct: number | null;
    band: SavingsBand | null;
    /**
     * Days of the headline month a circuit's own reading reads as untrustworthy
     * (classifyDay's "suspect"/"offline" — CON-45's own check) and so were held
     * out of every figure above (2026-10-02, user-asked). The dashboard reads
     * this to show "under review" rather than a % that quietly excluded them.
     */
    underReviewDays: number;
  };
  /**
   * EVERY recorded day, society-wide, oldest first — the chart buckets it
   * (daily/weekly/monthly/yearly) client-side, so the series has to carry
   * the whole history rather than a fixed window.
   *
   * `baseline` is the sum of the baselines in force ON THAT DAY (INV-07
   * replay), counting only the circuits that actually reported it — summing
   * every circuit's baseline on a day when one was silent would overstate
   * what the old lights would have drawn and inflate the saving.
   *
   * `underReview` is true when any contributing circuit's own reading that
   * day failed CON-45's own plausibility check — its kWh/baseline are held
   * out of this day's sum (the same treatment as an operator's own
   * exclusion), and the day reads "under review" rather than as a real
   * figure or a silent gap.
   */
  daily: { date: string; kWh: number; baseline: number | null; underReview: boolean }[];
};

/** The demo's span: its first meter day to its last post-install day. */
function demoPeriod(
  demos: { meterInstalledAt: Date | null; preFrom: Date | null; postTo: Date | null }[],
): { from: Date; to: Date | null } | null {
  const starts = demos.map((d) => d.meterInstalledAt ?? d.preFrom).filter((d): d is Date => d !== null);
  if (starts.length === 0) return null;
  const ends = demos.map((d) => d.postTo).filter((d): d is Date => d !== null);
  return {
    from: new Date(Math.min(...starts.map((d) => d.getTime()))),
    to: ends.length > 0 ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null,
  };
}

export const societyEnergy = cache(async (societyId: string): Promise<PortalEnergy> => {
  const circuits = await db.circuit.findMany({
    where: { societyId, voidedAt: null },
    select: {
      id: true,
      location: true,
      lightType: true,
      meteredLightCount: true,
      representedLightCount: true,
      benchmarkSavingsPct: true,
      preInstallBaseline: true,
      rescaleEvents: true,
      devices: { select: EXCLUSION_DEVICE_SELECT },
      // Every live demo: the first is the initial demo (its lights are the
      // demo lights); only counted ones place the lights' replacement.
      demos: {
        where: { voidedAt: null },
        orderBy: { sequence: "asc" },
        select: { rejected: true, meteredLightCount: true, lightReplacementDate: true, meterInstalledAt: true, preFrom: true, postTo: true },
      },
      meterReadings: {
        // NO supersededAt filter: supersession updates the row IN PLACE, so
        // a non-null supersededAt is a corrected day whose kWh is current.
        // The filter this shipped with excluded corrected days from the
        // resident's own figures (caught 2026-08-31).
        where: { source: "csv" },
        orderBy: { date: "asc" },
        select: { date: true, kWh: true, excludedAt: true, intervalCount: true, dayClass: true, validOverrideAt: true },
      },
    },
  });

  const today = new Date();
  type Day = { date: string; kWh: number; excluded: boolean; underReview: boolean };
  // A circuit reaches the resident once its lights are in. Its days are the
  // monitoring rows from the billing start (2026-09-26); before a billing
  // start is known, the days after the lights went in.
  const installed = circuits.flatMap((c) => {
    const replaced =
      c.demos
        .filter((d) => !d.rejected)
        .map((d) => d.lightReplacementDate)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return replaced || c.benchmarkSavingsPct !== null ? [{ ...c, lightReplacementDate: replaced }] : [];
  });
  const starts = new Map(
    await Promise.all(installed.map(async (c) => [c.id, await circuitMonitoringStart(c.id)] as const)),
  );
  const perCircuit = installed.map((c) => {
    const from = starts.get(c.id) ?? c.lightReplacementDate;
    const baselineNow = effectiveBaselineAt(c.preInstallBaseline, c.rescaleEvents, today);
    const monitoring: Day[] = c.meterReadings
      .filter((r) => (from ? (starts.get(c.id) ? r.date >= from : r.date > from) : true))
      .map((r) => {
        // A day this project's own CON-45 rule already calls untrustworthy
        // (a dead meter reading zero, a day short of its circuit's own
        // expected hours — day-validity.ts, 2026-10-05 — or a saving above
        // the bound a working meter can produce) is withheld from the
        // resident rather than shown as a real figure, with "under review"
        // in its place (user-asked, 2026-10-02). Reusing classifyDay is
        // deliberate: it is the SAME check the invoice-first stats already
        // apply, so a day cannot read fine here and suspect on the invoice —
        // and an operator's override on one shows up on both alike.
        const dayBaselineForClassify = effectiveBaselineAt(c.preInstallBaseline, c.rescaleEvents, r.date);
        const cls = classifyDay(
          {
            date: r.date.toISOString().slice(0, 10),
            kWh: r.kWh,
            intervalCount: r.intervalCount,
            dataHours: null,
            dayClass: r.dayClass,
            validOverride: r.validOverrideAt !== null,
          },
          dayBaselineForClassify ?? 0,
        );
        return {
          date: r.date.toISOString().slice(0, 10),
          kWh: r.kWh,
          excluded: r.excludedAt !== null,
          underReview: cls === "suspect" || cls === "offline",
        };
      });
    return { c, monitoring, baselineNow };
  });

  // The headline month is the newest month with a COUNTED day. An excluded
  // day (a partial export, an offline meter) says nothing, and taking the
  // month from it blanked every figure on the page (Hyde Park, 2026-09-27:
  // 1 September was a 10-of-24-hour day, so the page headlined a September
  // with nothing in it).
  const latest = perCircuit
    .flatMap((p) => p.monitoring.filter((d) => !d.excluded && !d.underReview).map((d) => d.date))
    .sort()
    .at(-1);
  const month = latest ? latest.slice(0, 7) : null;

  let totalConsumed = 0;
  let totalBaseline = 0;
  // The baseline of the lights actually replaced — what a saving is a share of.
  let totalReplacedBaseline = 0;
  let anyMonth = false;
  let underReviewDays = 0;

  const rows: PortalCircuit[] = perCircuit.map(({ c, monitoring, baselineNow }) => {
    const monthDaysAll = month ? monitoring.filter((d) => d.date.startsWith(month)) : [];
    const exclusion = exclusionFromDevices(c.devices, "monitoring");
    const demoLights = demoLightsInstalled({ meteredLightCount: c.meteredLightCount, demos: c.demos, devices: c.devices });
    // A day under review is held out of the average the same way an excluded
    // one already is — it just arrived there by the system's own check
    // rather than an operator's — while staying its OWN flag on `monitoring`
    // so the daily table can say "under review" rather than merely omitting it.
    // Each day against the baseline in force THAT DAY, not "now" applied
    // across the whole headline month (2026-10-02, user-caught) — a rescale
    // landing mid-month must not retroactively inflate or deflate days
    // measured before it.
    const dayBaselineAt = (d: Date) => effectiveBaselineAt(c.preInstallBaseline, c.rescaleEvents, d);
    const s = periodSavingsSummary(
      dayBaselineAt,
      monthDaysAll.map((d) => ({ date: d.date, kWh: d.kWh, excluded: d.excluded || d.underReview })),
      exclusion,
    );
    const counted = monthDaysAll.filter((d) => !d.excluded && !d.underReview).length;
    underReviewDays += monthDaysAll.filter((d) => d.underReview && !d.excluded).length;
    if (s.averageKwh !== null && counted > 0) {
      let circuitComparable = 0;
      let circuitReplaced = 0;
      let anyDayBaseline = false;
      for (const d of monthDaysAll) {
        if (d.excluded || d.underReview) continue;
        const b = dayBaselineAt(new Date(`${d.date}T00:00:00Z`));
        if (b === null) continue;
        anyDayBaseline = true;
        // The circuit as it now stands: fixtures taken off it at the full
        // installation are not in its before figure (2026-09-27).
        circuitComparable += comparableBaseline(b, exclusion);
        circuitReplaced += b - excludedKwhAt(b, exclusion);
      }
      if (anyDayBaseline) {
        anyMonth = true;
        totalConsumed += s.averageKwh * counted;
        totalBaseline += circuitComparable;
        totalReplacedBaseline += circuitReplaced;
      }
    }
    return {
      id: c.id,
      label: circuitLabelOf(c.location, c.lightType),
      lightCount: c.meteredLightCount,
      representedLightCount: totalLights(c.representedLightCount, demoLights),
      fullInstallation: c.representedLightCount,
      demoLights,
      monthDays: counted,
      monthKwh: s.averageKwh !== null ? s.averageKwh * counted : null,
      monthDailyAvg: s.averageKwh,
      savingsPct: s.savingsPct,
      band: s.band,
      benchmarkPct: c.benchmarkSavingsPct,
      baselineNow,
      lightHistory: lightCountStages({
        currentLightCount: c.meteredLightCount,
        commissionedBaseline: c.preInstallBaseline,
        benchmarkPct: c.benchmarkSavingsPct,
        demo: demoPeriod(c.demos.filter((d) => !d.rejected)),
        fallbackStart: c.lightReplacementDate,
        events: c.rescaleEvents,
        today,
        exclusion,
      }),
      exclusion,
      keptStory: keptStory(
        exclusionFromDevices(c.devices, "demo"),
        exclusion,
        c.devices.some((d) => d.keptRecordedAt),
        c.meteredLightCount,
      ),
      monitoringFrom: (starts.get(c.id) ?? null)?.toISOString().slice(0, 10) ?? null,
      monitoring: monitoring.map((d) => ({
        ...d,
        baseline: effectiveBaselineAt(c.preInstallBaseline, c.rescaleEvents, new Date(`${d.date}T00:00:00Z`)),
      })),
      lastVerifiedAt: (lastVerifiedAt(c.rescaleEvents, c.lightReplacementDate, today) ?? null)
        ?.toISOString()
        .slice(0, 10) ?? null,
    };
  });

  const totalPct = anyMonth && totalReplacedBaseline > 0 ? ((totalBaseline - totalConsumed) / totalReplacedBaseline) * 100 : null;

  // Society-wide daily series: for each recorded day, sum the kWh AND the
  // baselines of the circuits that reported it, so every bucket compares
  // like with like.
  const byDate = new Map<string, { kWh: number; baseline: number; replacedBaseline: number; missingBaseline: boolean; underReview: boolean }>();
  for (const p of perCircuit) {
    const ex = exclusionFromDevices(p.c.devices, "monitoring");
    for (const d of p.monitoring) {
      if (d.excluded) continue;
      const cur = byDate.get(d.date) ?? { kWh: 0, baseline: 0, replacedBaseline: 0, missingBaseline: false, underReview: false };
      // A day under review contributes no figure — it marks the date and is
      // held out of the sum, the same way an excluded day already is, rather
      // than silently blending an unreliable reading into the total.
      if (d.underReview) {
        cur.underReview = true;
        byDate.set(d.date, cur);
        continue;
      }
      const dayBaseline = effectiveBaselineAt(
        p.c.preInstallBaseline,
        p.c.rescaleEvents,
        new Date(`${d.date}T00:00:00Z`),
      );
      cur.kWh += d.kWh;
      if (dayBaseline === null) cur.missingBaseline = true;
      else {
        cur.baseline += comparableBaseline(dayBaseline, ex);
        cur.replacedBaseline += dayBaseline - excludedKwhAt(dayBaseline, ex);
      }
      byDate.set(d.date, cur);
    }
  }
  const daily = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({
      date,
      kWh: v.kWh,
      baseline: v.missingBaseline ? null : v.baseline,
      replacedBaseline: v.missingBaseline ? null : v.replacedBaseline,
      underReview: v.underReview,
    }));

  // ₹ is FEAT-111's (published-months.ts): the society's rupee figures come
  // from RELEASED months, whichever month the readings have reached.

  return {
    month,
    circuits: rows,
    totals: {
      consumedKwh: anyMonth ? totalConsumed : null,
      avoidedKwh: anyMonth ? totalBaseline - totalConsumed : null,
      savingsPct: totalPct,
      band: totalPct !== null ? savingsBand(totalPct) : null,
      underReviewDays,
    },
    daily,
  };
});
