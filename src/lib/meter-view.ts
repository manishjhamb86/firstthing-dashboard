import { cache } from "react";
import { db } from "@/lib/db";
import { addDays, savingsBand, savingsPct, theoreticalDailyKwh, type SavingsBand } from "@/lib/circuit-load";
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
  /** Calendar days actually covered — 0.4 for 10 of 24 hours today so far. */
  days: number;
  kWh: number;
  /** `baselineKwhPerDay × days` — null with no baseline to compare against. */
  expectedKwh: number | null;
  savingsPct: number | null;
  band: SavingsBand | null;
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

function makeComparison(
  key: MeterPeriodComparison["key"],
  label: string,
  kWh: number,
  days: number,
  baselineKwhPerDay: number | null,
): MeterPeriodComparison {
  const expectedKwh = baselineKwhPerDay !== null ? baselineKwhPerDay * days : null;
  const pct = expectedKwh !== null && expectedKwh > 0 ? savingsPct(expectedKwh, kWh) : null;
  return { key, label, days, kWh, expectedKwh, savingsPct: pct, band: pct !== null ? savingsBand(pct) : null };
}

/**
 * Today, yesterday, the last 7 days and the current calendar month, each
 * against the baseline — built from `meterHourly`'s own output so a gap or
 * a partial day is handled exactly once, not re-derived here. "Today" and
 * "this month" are windowed from the LATEST stored day, the same rule
 * `meterHourly` itself uses, not from the wall clock: a meter whose last
 * read was yesterday should not report "today" as a suspicious zero.
 */
export function periodComparisons(
  hourly: Awaited<ReturnType<typeof meterHourly>>,
  baselineKwhPerDay: number | null,
): MeterPeriodComparison[] {
  if (hourly.length === 0) return [];
  const byDay = new Map(hourly.map((h) => [h.day, h]));
  const latestDay = hourly[0].day;

  const out: MeterPeriodComparison[] = [];
  const today = byDay.get(latestDay)!;
  out.push(makeComparison("today", "Today so far", today.total, today.intervalCount / 24, baselineKwhPerDay));

  const yesterdayKey = addDays(new Date(`${latestDay}T00:00:00Z`), -1).toISOString().slice(0, 10);
  const yesterday = byDay.get(yesterdayKey);
  if (yesterday) out.push(makeComparison("yesterday", "Yesterday", yesterday.total, yesterday.intervalCount / 24, baselineKwhPerDay));

  const last7 = hourly.slice(0, 7);
  out.push(
    makeComparison(
      "week",
      "Last 7 days",
      last7.reduce((s, h) => s + h.total, 0),
      last7.reduce((s, h) => s + h.intervalCount / 24, 0),
      baselineKwhPerDay,
    ),
  );

  const month = latestDay.slice(0, 7);
  const monthRows = hourly.filter((h) => h.day.startsWith(month));
  out.push(
    makeComparison(
      "month",
      monthLabel(month),
      monthRows.reduce((s, h) => s + h.total, 0),
      monthRows.reduce((s, h) => s + h.intervalCount / 24, 0),
      baselineKwhPerDay,
    ),
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
    periods: periodComparisons(hourly, currentBaseline),
  };
}
