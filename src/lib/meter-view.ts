import { cache } from "react";
import { db } from "@/lib/db";
import { savingsBand, savingsPct, theoreticalDailyKwh, type SavingsBand } from "@/lib/circuit-load";
import { effectiveBaselineAt, lastVerifiedAt, type RescaleEvent } from "@/lib/benchmark-rescale";
import { evaluateMeterHealth, outageMessage, outageMinutes, type MeterState } from "@/lib/meter-health";
import { freshnessLabel, isStale } from "@/lib/meter-live";
import { circuitLabelOf } from "@/lib/circuit-label";
import { monthLabel } from "@/lib/format-date";

/**
 * One meter, as every surface shows it.
 *
 * Built once so the back office and a society's own portal cannot disagree
 * about whether a meter is reporting, how old its figures are, or what it
 * measures. The two surfaces differ in what they let you DO, never in what
 * they say is true.
 */
export type MeterRow = {
  id: string;
  name: string;
  productModel: string;
  uiid: number;
  hasEnergySignal: boolean;
  /** Bound to a circuit or a society — so somebody owns it, and it is alerted on. */
  assigned: boolean;
  /**
   * When a sync last found this device gone from the eWeLink account. Hidden
   * from the list unless asked for, never deleted — the row can carry readings
   * a bill was computed from (user-asked 2026-09-09).
   */
  removedFromAccountAt: string | null;

  /**
   * Null only for a device that reports no electrical parameters at all —
   * there is nothing to poll, so there is nothing to be a state OF. Every
   * metering device has one, assigned or not: since 2026-08-29 the hourly
   * pass covers the whole account, so its health is a fact we hold and
   * "Unassigned" in this column would hide it behind something the circuit
   * column already says.
   */
  state: MeterState | null;
  outage: string | null;
  offlineSince: string | null;

  /** Last known figures, at their true scale. Always shown with `readAge`. */
  powerW: number | null;
  voltageV: number | null;
  currentA: number | null;
  dayKwh: number | null;
  monthKwh: number | null;
  readAt: string | null;
  readAge: string;
  /** True when calling these figures "current" would mislead. */
  stale: boolean;

  societyId: string | null;
  societyName: string | null;
  circuitId: string | null;
  circuitLabel: string | null;
  /** kWh/day if everything on the circuit ran flat out — the alert ceiling. */
  capacityKwh: number | null;
  /** Watts if everything on the circuit ran at once — the gauge's scale. */
  connectedLoadW: number | null;
  /** Power readings from the last 24h of polls, oldest first. */
  spark: number[];

  ownerId: string | null;
  ownerLabel: string | null;

  openAlerts: { id: string; kind: string; message: string; openedAt: string }[];
  /** Hours of exported history held for this meter. */
  hourlyCount: number;
  hourlyFrom: string | null;
  hourlyTo: string | null;
};

// Moved to circuit-label.ts (2026-09-12) — this module imports `db`, so a
// Client Component importing this pure formatter from here pulled the whole
// Prisma/pg client into the browser bundle. Re-exported so every existing
// call site (`from "@/lib/meter-view"`) keeps working unchanged.
export { circuitLabelOf };

const meterInclude = {
  circuit: {
    select: {
      id: true,
      location: true,
      lightType: true,
      devices: { select: { count: true, wattage: true, hoursPerDay: true } },
    },
  },
  society: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, email: true } },
  alerts: {
    where: { closedAt: null },
    orderBy: { openedAt: "desc" },
    select: { id: true, kind: true, message: true, openedAt: true },
  },
} as const;

type Loaded = Awaited<ReturnType<typeof loadMeters>>[number];

async function loadMeters(where: object) {
  return db.meterDevice.findMany({ where, include: meterInclude, orderBy: { name: "asc" } });
}

/** The last 24 hours of polled power, per meter, oldest first. */
async function sparkSeries(meterIds: string[]) {
  if (meterIds.length === 0) return new Map<string, number[]>();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.meterSample.findMany({
    where: { meterId: { in: meterIds }, recordedAt: { gte: since }, powerW: { not: null } },
    orderBy: { recordedAt: "asc" },
    select: { meterId: true, powerW: true },
  });
  const out = new Map<string, number[]>();
  for (const r of rows) {
    if (!out.has(r.meterId)) out.set(r.meterId, []);
    out.get(r.meterId)!.push(r.powerW!);
  }
  return out;
}

async function hourlySpans(meterIds: string[]) {
  if (meterIds.length === 0) return new Map<string, { count: number; from: Date; to: Date }>();
  const rows = await db.meterHourlyReading.groupBy({
    by: ["meterId"],
    where: { meterId: { in: meterIds } },
    _count: { _all: true },
    _min: { day: true },
    _max: { day: true },
  });
  return new Map(
    rows.map((r) => [r.meterId, { count: r._count._all, from: r._min.day!, to: r._max.day! }]),
  );
}

function toRow(
  m: Loaded,
  span: { count: number; from: Date; to: Date } | undefined,
  spark: number[] | undefined,
  now: Date,
): MeterRow {
  // Polled, therefore knowable. Assignment decides who is CHASED about a
  // meter (see meter-poll.ts) and drives the "Needs attention" triage — it
  // does not decide whether we are willing to say what we already know.
  const watched = m.hasEnergySignal;
  const health = evaluateMeterHealth({
    online: m.online,
    // The screen judges what the last poll stored; it does not itself poll.
    readOk: true,
    reportedAt: m.lastReportedAt,
    offlineSince: m.offlineSince,
    consecutiveFailures: m.consecutiveFailures,
    now,
  });
  const circuitLabel = m.circuit ? circuitLabelOf(m.circuit.location, m.circuit.lightType) : null;
  const devices = m.circuit?.devices ?? [];

  return {
    id: m.id,
    name: m.name,
    productModel: m.productModel,
    uiid: m.uiid,
    hasEnergySignal: m.hasEnergySignal,
    assigned: m.circuitId !== null || m.societyId !== null,
    removedFromAccountAt: m.removedFromAccountAt?.toISOString() ?? null,
    state: watched ? health.state : null,
    outage: watched
      ? outageMessage({
          meterName: m.name,
          circuitLabel,
          societyName: m.society?.name ?? null,
          state: health.state,
          minutes: outageMinutes(m.offlineSince, now),
        })
      : null,
    offlineSince: m.offlineSince?.toISOString() ?? null,
    powerW: m.lastPowerW,
    voltageV: m.lastVoltageV,
    currentA: m.lastCurrentA,
    dayKwh: m.lastDayKwh,
    monthKwh: m.lastMonthKwh,
    readAt: m.lastReadAt?.toISOString() ?? null,
    readAge: freshnessLabel(m.lastReadAt, now),
    stale: isStale(m.lastReadAt, now),
    societyId: m.societyId,
    societyName: m.society?.name ?? null,
    circuitId: m.circuitId,
    circuitLabel,
    capacityKwh: devices.length > 0 ? theoreticalDailyKwh(devices) : null,
    connectedLoadW: devices.length > 0 ? devices.reduce((sum, d) => sum + d.count * d.wattage, 0) : null,
    spark: spark ?? [],
    ownerId: m.ownerId,
    ownerLabel: m.owner ? (m.owner.name ?? m.owner.email) : null,
    openAlerts: m.alerts.map((a) => ({
      id: a.id,
      kind: a.kind,
      message: a.message,
      openedAt: a.openedAt.toISOString(),
    })),
    hourlyCount: span?.count ?? 0,
    hourlyFrom: span ? span.from.toISOString().slice(0, 10) : null,
    hourlyTo: span ? span.to.toISOString().slice(0, 10) : null,
  };
}

/** Every meter in the mirror — the back office's view. */
export const allMeterRows = cache(async (): Promise<MeterRow[]> => {
  const meters = await loadMeters({});
  const ids = meters.map((m) => m.id);
  const [spans, sparks] = await Promise.all([hourlySpans(ids), sparkSeries(ids)]);
  const now = new Date();
  return meters.map((m) => toRow(m, spans.get(m.id), sparks.get(m.id), now));
});

/**
 * A society's own meters. The society id comes from the signed-in row, and
 * this function takes it as its ONLY scope — INV-05 is enforced here, in the
 * query, not by whatever the caller renders.
 */
export const societyMeterRows = cache(async (societyId: string): Promise<MeterRow[]> => {
  const meters = await loadMeters({ societyId, hasEnergySignal: true });
  const ids = meters.map((m) => m.id);
  const [spans, sparks] = await Promise.all([hourlySpans(ids), sparkSeries(ids)]);
  const now = new Date();
  return meters.map((m) => toRow(m, spans.get(m.id), sparks.get(m.id), now));
});

/** One meter, scoped when a society is asking. */
export async function meterRow(id: string, societyId?: string): Promise<MeterRow | null> {
  const m = await db.meterDevice.findFirst({
    where: { id, ...(societyId ? { societyId } : {}) },
    include: meterInclude,
  });
  if (!m) return null;
  const [spans, sparks] = await Promise.all([hourlySpans([m.id]), sparkSeries([m.id])]);
  return toRow(m, spans.get(m.id), sparks.get(m.id), new Date());
}

/**
 * The exported hourly series for a meter, most recent day first.
 *
 * Windowed by DAY, deliberately not by row count. The first version took the
 * newest `days * 24` rows — and on a day only 18 hours old, that window
 * reached just 6 hours into the oldest day, which then rendered as
 * "3.8 kWh · partial" while the store held a complete 18.58 kWh day. A
 * truncated query dressed as a partial day is a false claim, and partiality
 * is exactly the fact this chart promises to report honestly.
 */
export async function meterHourly(meterId: string, days = 14) {
  const latest = await db.meterHourlyReading.findFirst({
    where: { meterId },
    orderBy: { day: "desc" },
    select: { day: true },
  });
  if (!latest) return [];
  const cutoff = new Date(latest.day);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const rows = await db.meterHourlyReading.findMany({
    where: { meterId, day: { gte: cutoff } },
    orderBy: [{ day: "desc" }, { hour: "asc" }],
    select: { day: true, hour: true, kWh: true },
  });
  const byDay = new Map<string, { hour: number; kWh: number }[]>();
  for (const r of rows) {
    const key = r.day.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push({ hour: r.hour, kWh: r.kWh });
  }
  return [...byDay.entries()].map(([day, hours]) => ({
    day,
    hours: hours.sort((a, b) => a.hour - b.hour),
    total: hours.reduce((s, h) => s + h.kWh, 0),
    // Fewer than 24 is a partial day — shown as one, never as a low reading.
    intervalCount: hours.length,
  }));
}

// ── The demo behind the meter, and how it's doing against it ──────────────
//
// 2026-09-24, user-asked: a resident (and an operator) looking at a
// meter's live reading has no way to see what it's being measured against
// — the demo that set the benchmark, or how today/this week/this month
// compares to it. Built from the SAME circuit fields the demo report and
// the Electricity page already read (`preInstallBaseline`,
// `benchmarkSavingsPct`, `CircuitDemo`), so this can never disagree with
// them — and from the SAME `MeterHourlyReading` store `meterHourly()`
// already reads for the hourly chart, so a meter with no bound circuit or
// no demo history simply has nothing to show, not a second source of truth.

export type MeterDemo = {
  sequence: number;
  lightCount: number;
  beforeKwhPerDay: number;
  afterKwhPerDay: number;
  savingsPct: number;
  rejected: boolean;
  rejectionReason: string | null;
};

export type MeterPeriodComparison = {
  key: "today" | "yesterday" | "week" | "month";
  label: string;
  /** Null when there is nothing on record for this period — never a zero. */
  kWh: number | null;
  /** Calendar days covered — 0.5 for twelve hours of today so far. */
  days: number;
  /** `baselineKwhPerDay × days` — null with no baseline or no reading. */
  expectedKwh: number | null;
  savingsPct: number | null;
  band: SavingsBand | null;
  /** Where the figure comes from, or why there is none. */
  note: string;
};

export type MeterDemoContext = {
  circuitId: string | null;
  meteredLightCount: number | null;
  representedLightCount: number | null;
  /** kWh/day before installation, as commissioned — never mutated (ADR-005). */
  preInstallBaseline: number | null;
  /** The baseline actually in force today, after any rescale (INV-07 replay). */
  currentBaseline: number | null;
  benchmarkSavingsPct: number | null;
  installedAt: string | null;
  lastVerifiedAt: string | null;
  demos: MeterDemo[];
  periods: MeterPeriodComparison[];
};

const EMPTY_DEMO_CONTEXT: MeterDemoContext = {
  circuitId: null,
  meteredLightCount: null,
  representedLightCount: null,
  preInstallBaseline: null,
  currentBaseline: null,
  benchmarkSavingsPct: null,
  installedAt: null,
  lastVerifiedAt: null,
  demos: [],
  periods: [],
};

const IST_MS = 330 * 60 * 1000;
const DAY_MS = 86_400_000;
const istDay = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const istHoursIntoDay = (d: Date) => ((d.getTime() + IST_MS) % DAY_MS) / 3_600_000;

function compare(
  key: MeterPeriodComparison["key"],
  label: string,
  kWh: number | null,
  days: number,
  baseline: number | null,
  note: string,
): MeterPeriodComparison {
  const expectedKwh = kWh !== null && baseline !== null && days > 0 ? baseline * days : null;
  const pct = expectedKwh !== null && expectedKwh > 0 ? savingsPct(expectedKwh, kWh!) : null;
  return { key, label, kWh, days, expectedKwh, savingsPct: pct, band: pct !== null ? savingsBand(pct) : null, note };
}

/**
 * Today, yesterday, the last 7 days and this month, each against the
 * baseline — and each from the source that actually holds it.
 *
 * TODAY and THIS MONTH come from the meter's own live counters, the same
 * figures the Energy counters card shows, so the two can never disagree.
 * The first version windowed "today" from the latest UPLOADED hourly day,
 * which on a meter whose history ended on the 16th labelled the 16th as
 * "Today so far" beside a live counter for the 24th (user-caught
 * 2026-09-24: "both these figures don't match").
 *
 * YESTERDAY and the LAST 7 DAYS come from the uploaded hourly history —
 * the only source that holds them — and say where that history ends when it
 * does not reach them, rather than substituting older days.
 *
 * Days are Indian calendar days: a reading at 01:00 IST belongs to the day
 * the reader is living in, not to UTC's previous one.
 */
export function periodComparisons(
  hourly: Awaited<ReturnType<typeof meterHourly>>,
  baseline: number | null,
  live: { dayKwh: number | null; monthKwh: number | null; readAt: Date | null },
  now: Date,
): MeterPeriodComparison[] {
  const today = istDay(now);
  const byDay = new Map(hourly.map((h) => [h.day, h]));
  const lastHistory = hourly[0]?.day ?? null;
  const historyNote = lastHistory ? `uploaded history ends ${lastHistory.split("-").reverse().join("-")}` : "no hourly history uploaded yet";

  const out: MeterPeriodComparison[] = [];

  // Today — the meter's own day counter, if it was read today.
  const readToday = live.readAt !== null && istDay(live.readAt) === today;
  out.push(
    readToday && live.dayKwh !== null
      ? compare("today", "Today so far", live.dayKwh, istHoursIntoDay(live.readAt!) / 24, baseline, "the meter's own counter")
      : compare("today", "Today so far", null, 0, baseline, live.readAt ? "not read yet today" : "never read"),
  );

  // Yesterday — from history, only if history holds that exact day.
  const yKey = istDay(new Date(now.getTime() - DAY_MS));
  const y = byDay.get(yKey);
  out.push(
    y
      ? compare("yesterday", "Yesterday", y.total, y.intervalCount / 24, baseline, `${y.intervalCount} of 24 hours recorded`)
      : compare("yesterday", "Yesterday", null, 0, baseline, historyNote),
  );

  // Last 7 days — the seven days before today, from history.
  const weekKeys = Array.from({ length: 7 }, (_, i) => istDay(new Date(now.getTime() - (i + 1) * DAY_MS)));
  const week = weekKeys.map((k) => byDay.get(k)).filter((d): d is NonNullable<typeof d> => !!d);
  out.push(
    week.length > 0
      ? compare(
          "week",
          "Last 7 days",
          week.reduce((s, d) => s + d.total, 0),
          week.reduce((s, d) => s + d.intervalCount / 24, 0),
          baseline,
          week.length === 7 ? "all 7 days recorded" : `${week.length} of 7 days recorded — ${historyNote}`,
        )
      : compare("week", "Last 7 days", null, 0, baseline, historyNote),
  );

  // This month — the meter's own month counter, if read this month.
  const readThisMonth = live.readAt !== null && istDay(live.readAt).slice(0, 7) === today.slice(0, 7);
  const monthDaysElapsed = readThisMonth ? Number(istDay(live.readAt!).slice(8, 10)) - 1 + istHoursIntoDay(live.readAt!) / 24 : 0;
  out.push(
    readThisMonth && live.monthKwh !== null
      ? compare("month", monthLabel(today.slice(0, 7)), live.monthKwh, monthDaysElapsed, baseline, "the meter's own counter")
      : compare("month", monthLabel(today.slice(0, 7)), null, 0, baseline, "not read yet this month"),
  );

  return out;
}

/**
 * One meter's demo/benchmark context, scoped when a society is asking
 * (INV-05, same convention as `meterRow`). Null fields throughout for a
 * meter with no bound circuit, no baseline yet, or no demo — never a
 * fabricated figure standing in for "we don't know yet".
 */
export async function meterDemoContext(meterId: string, societyId?: string): Promise<MeterDemoContext> {
  const m = await db.meterDevice.findFirst({
    where: { id: meterId, ...(societyId ? { societyId } : {}) },
    select: {
      circuitId: true,
      lastDayKwh: true,
      lastMonthKwh: true,
      lastReadAt: true,
      circuit: {
        select: {
          meteredLightCount: true,
          representedLightCount: true,
          preInstallBaseline: true,
          benchmarkSavingsPct: true,
          lightReplacementDate: true,
          rescaleEvents: true,
          demos: {
            orderBy: { sequence: "asc" },
            select: {
              sequence: true,
              meteredLightCount: true,
              preInstallBaseline: true,
              postInstallAverage: true,
              savingsPct: true,
              rejected: true,
              rejectionReason: true,
            },
          },
        },
      },
    },
  });
  if (!m || !m.circuit) return EMPTY_DEMO_CONTEXT;

  const c = m.circuit;
  const now = new Date();
  const events = c.rescaleEvents as RescaleEvent[];
  const currentBaseline = effectiveBaselineAt(c.preInstallBaseline, events, now);
  const hourly = await meterHourly(meterId, 35);

  return {
    circuitId: m.circuitId,
    meteredLightCount: c.meteredLightCount,
    representedLightCount: c.representedLightCount,
    preInstallBaseline: c.preInstallBaseline,
    currentBaseline,
    benchmarkSavingsPct: c.benchmarkSavingsPct,
    installedAt: c.lightReplacementDate?.toISOString().slice(0, 10) ?? null,
    lastVerifiedAt: lastVerifiedAt(events, c.lightReplacementDate, now)?.toISOString().slice(0, 10) ?? null,
    demos: c.demos.map((d) => ({
      sequence: d.sequence,
      lightCount: d.meteredLightCount,
      beforeKwhPerDay: d.preInstallBaseline,
      afterKwhPerDay: d.postInstallAverage,
      savingsPct: d.savingsPct,
      rejected: d.rejected,
      rejectionReason: d.rejectionReason,
    })),
    periods: periodComparisons(hourly, currentBaseline, { dayKwh: m.lastDayKwh, monthKwh: m.lastMonthKwh, readAt: m.lastReadAt }, now),
  };
}
