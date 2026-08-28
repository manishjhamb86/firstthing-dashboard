import { cache } from "react";
import { db } from "@/lib/db";
import { theoreticalDailyKwh } from "@/lib/circuit-load";
import { evaluateMeterHealth, outageMessage, outageMinutes, type MeterState } from "@/lib/meter-health";
import { freshnessLabel, isStale } from "@/lib/meter-live";

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

  /** Null for an unassigned device — it is not being watched, so it has no state. */
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

/**
 * A circuit reads as "location · light type", except when those are the same
 * word — several backfilled circuits are located in the Basement and carry
 * the light type "basement", and "Basement · basement" reads as a rendering
 * fault rather than as data.
 */
export function circuitLabelOf(location: string | null, lightType: string): string {
  const place = location?.trim() || "Unnamed";
  if (place.toLowerCase() === lightType.trim().toLowerCase()) return place;
  return `${place} · ${lightType}`;
}

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
  const watched = m.hasEnergySignal && (m.circuitId !== null || m.societyId !== null);
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
