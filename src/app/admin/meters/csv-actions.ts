"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { matchKnownFormat } from "@/lib/reading-formats";
import { hourlyPoints, type HourlyPoint } from "@/lib/reading-normalize";
import { circuitLabelOf } from "@/lib/meter-view";
import { handOffToBillingReview } from "@/lib/meter-billing-handoff";
import {
  matchMeter,
  dayKeyOf,
  type Candidate,
  type MatchOutcome,
  type CandidateScore,
} from "@/lib/meter-csv-match";

/**
 * Importing a meter's own hourly export.
 *
 * Two acts, deliberately: ANALYSE proposes which meter the file came from and
 * shows what it would store; COMMIT stores it. Nothing is written by the
 * first. The export carries no device identity, so which meter it belongs to
 * is a judgement — and one that looks completely normal afterwards if it is
 * wrong, which is exactly why a person confirms it.
 *
 * The commit re-derives everything from the file text itself. The browser's
 * parsed rows are never trusted, for the reason every reading path in this
 * codebase re-derives server-side: the figures have to trace to the bytes.
 */

const PERMISSION = "manage_users" as const;
const REFUSAL = "Importing meter readings is a society-management action (Manage users).";

export type CsvPreview = {
  fileName: string;
  vendor: string;
  hours: number;
  unparseableRows: number;
  firstDay: string;
  lastDay: string;
  days: number;
  totalKwh: number;
  /** Hours that carry a reading — the only ones that identify a meter. */
  nonZeroHours: number;
  problems: string[];
  match: MatchOutcome;
  /** What committing against the proposed meter would change. */
  effect: ImportEffect | null;
};

export type ImportEffect = {
  meterId: string;
  newHours: number;
  unchangedHours: number;
  supersededHours: number;
};

function parseFile(text: string): { points: HourlyPoint[]; vendor: string; problems: string[]; unparseable: number } | { error: string } {
  const known = matchKnownFormat(text);
  if (!known) {
    return {
      error:
        "This file is not in a layout the system recognises. A SONOFF export has the columns " +
        "`data,time,consumption/KWh` — check you exported the hourly history rather than a summary.",
    };
  }
  const h = hourlyPoints(text, known.mapping);
  if (h.points.length === 0) {
    return { error: "The file was recognised but carried no hourly rows at all." };
  }
  return { points: h.points, vendor: known.vendor, problems: h.problems, unparseable: h.rowsUnparseable };
}

async function effectOf(meterId: string, points: HourlyPoint[]): Promise<ImportEffect> {
  const existing = await db.meterHourlyReading.findMany({
    where: {
      meterId,
      day: { gte: minDay(points), lte: maxDay(points) },
    },
    select: { day: true, hour: true, kWh: true },
  });
  const held = new Map(existing.map((e) => [`${dayKeyOf(e.day)}#${e.hour}`, e.kWh]));
  let newHours = 0;
  let unchangedHours = 0;
  let supersededHours = 0;
  for (const p of points) {
    const prior = held.get(`${dayKeyOf(p.day)}#${p.hour}`);
    if (prior === undefined) newHours++;
    else if (Math.abs(prior - p.kWh) <= 0.0005) unchangedHours++;
    else supersededHours++;
  }
  return { meterId, newHours, unchangedHours, supersededHours };
}

function minDay(points: HourlyPoint[]): Date {
  return points.reduce((a, p) => (p.day < a ? p.day : a), points[0].day);
}
function maxDay(points: HourlyPoint[]): Date {
  return points.reduce((a, p) => (p.day > a ? p.day : a), points[0].day);
}

/** Read the file, propose a meter, and say what committing would change. */
export async function analyseMeterCsv(input: {
  fileName: string;
  text: string;
  /** Set when the operator has already chosen a meter themselves. */
  meterId?: string;
}): Promise<{ error?: string; preview?: CsvPreview }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes(PERMISSION)) {
    logger.warn("meter.csv_analyse_refused", { actorId: actor.id });
    return { error: REFUSAL };
  }

  const parsed = parseFile(input.text);
  if ("error" in parsed) return { error: parsed.error };
  const { points, vendor, problems, unparseable } = parsed;

  // Only meters bound to something are candidates: filing a society's
  // readings against a device nobody has assigned helps no one.
  const meters = await db.meterDevice.findMany({
    where: { hasEnergySignal: true, OR: [{ circuitId: { not: null } }, { societyId: { not: null } }] },
    select: {
      id: true,
      name: true,
      society: { select: { name: true } },
      circuit: { select: { location: true, lightType: true } },
    },
  });
  const first = minDay(points);
  const last = maxDay(points);
  const stored = await db.meterHourlyReading.findMany({
    where: { meterId: { in: meters.map((m) => m.id) }, day: { gte: first, lte: last } },
    select: { meterId: true, day: true, hour: true, kWh: true },
  });
  const byMeter = new Map<string, { dayKey: string; hour: number; kWh: number }[]>();
  for (const s of stored) {
    if (!byMeter.has(s.meterId)) byMeter.set(s.meterId, []);
    byMeter.get(s.meterId)!.push({ dayKey: dayKeyOf(s.day), hour: s.hour, kWh: s.kWh });
  }
  const candidates: Candidate[] = meters.map((m) => ({
    meterId: m.id,
    meterName: m.name,
    circuitLabel: m.circuit ? circuitLabelOf(m.circuit.location, m.circuit.lightType) : null,
    societyName: m.society?.name ?? null,
    stored: byMeter.get(m.id) ?? [],
  }));

  const match = matchMeter(points, candidates);
  const chosen =
    input.meterId ??
    (match.kind === "confident" ? match.best.meterId : undefined);

  const dayKeys = new Set(points.map((p) => dayKeyOf(p.day)));
  const preview: CsvPreview = {
    fileName: input.fileName,
    vendor,
    hours: points.length,
    unparseableRows: unparseable,
    firstDay: dayKeyOf(first),
    lastDay: dayKeyOf(last),
    days: dayKeys.size,
    totalKwh: points.reduce((s, p) => s + p.kWh, 0),
    nonZeroHours: points.filter((p) => p.kWh > 0).length,
    problems,
    match,
    effect: chosen ? await effectOf(chosen, points) : null,
  };
  return { preview };
}

/**
 * Store the file's hours against the confirmed meter.
 *
 * Everything is re-derived from the text here — the client's rows are never
 * trusted. An hour already held with a different value is REPLACED and the
 * replacement counted, so an import that quietly rewrites history reports
 * that it did.
 */
export async function commitMeterCsv(input: {
  meterId: string;
  fileName: string;
  text: string;
  /** True when the operator filed it against a meter the evidence did not propose. */
  overrodeMatch: boolean;
  matchDetail?: CandidateScore | null;
}): Promise<{
  error?: string;
  stored?: number;
  superseded?: number;
  importId?: string;
  /** Where the same file went for billing review, when the meter is bound. */
  review?: { href: string; circuitLabel: string; reused: boolean };
  /** Why it could not be filed for review, when it could not. */
  reviewSkipped?: string;
}> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes(PERMISSION)) {
    logger.warn("meter.csv_commit_refused", { actorId: actor.id, meterId: input.meterId });
    return { error: REFUSAL };
  }

  const meter = await db.meterDevice.findUnique({
    where: { id: input.meterId },
    select: {
      id: true,
      name: true,
      circuitId: true,
      societyId: true,
      circuit: { select: { location: true, lightType: true, societyId: true } },
    },
  });
  if (!meter) return { error: "That meter is no longer in the mirror." };
  if (!meter.circuitId && !meter.societyId) {
    return { error: "Assign this meter to a circuit or society first — an unassigned meter has nothing to record against." };
  }

  const parsed = parseFile(input.text);
  if ("error" in parsed) return { error: parsed.error };
  const { points } = parsed;

  const effect = await effectOf(meter.id, points);
  const first = minDay(points);
  const last = maxDay(points);

  const importId = await db.$transaction(
    async (tx) => {
      const imp = await tx.meterCsvImport.create({
        data: {
          meterId: meter.id,
          fileName: input.fileName,
          firstDay: first,
          lastDay: last,
          hoursInFile: points.length,
          hoursStored: effect.newHours + effect.supersededHours,
          hoursSuperseded: effect.supersededHours,
          matchMethod: input.overrodeMatch ? "operator_override" : "hour_overlap",
          matchedHours: input.matchDetail?.distinctive ?? null,
          matchDetail: input.matchDetail ? JSON.parse(JSON.stringify(input.matchDetail)) : undefined,
          overrodeMatch: input.overrodeMatch,
          uploadedById: actor.id,
        },
      });

      // Clear exactly the hours this file carries, then insert them.
      //
      // Grouped by day rather than one clause per point: a 190-day export is
      // 4,536 points, and an OR of 4,536 clauses is a query Postgres plans
      // badly and may refuse outright. Complete days go in a single
      // statement; only a partial day — the first and last of a range export,
      // typically — needs its own. Deleting the whole day range instead
      // would be wrong: it would drop hours a previous, denser import held
      // that this file simply does not cover.
      const hoursByDay = new Map<number, Set<number>>();
      for (const p of points) {
        const t = p.day.getTime();
        if (!hoursByDay.has(t)) hoursByDay.set(t, new Set());
        hoursByDay.get(t)!.add(p.hour);
      }
      const completeDays: Date[] = [];
      for (const [t, hours] of hoursByDay) {
        if (hours.size === 24) completeDays.push(new Date(t));
        else await tx.meterHourlyReading.deleteMany({
          where: { meterId: meter.id, day: new Date(t), hour: { in: [...hours] } },
        });
      }
      if (completeDays.length > 0) {
        await tx.meterHourlyReading.deleteMany({
          where: { meterId: meter.id, day: { in: completeDays } },
        });
      }
      await tx.meterHourlyReading.createMany({
        data: points.map((p) => ({
          meterId: meter.id,
          day: p.day,
          hour: p.hour,
          kWh: p.kWh,
          importId: imp.id,
        })),
      });
      return imp.id;
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  logger.info("meter.csv_imported", {
    actorId: actor.id,
    meterId: meter.id,
    meterName: meter.name,
    fileName: input.fileName,
    hours: points.length,
    superseded: effect.supersededHours,
    overrodeMatch: input.overrodeMatch,
  });

  // One upload, one pipeline: the same file goes to the circuit's billing
  // review, where the row-by-row acceptance (CON-45) is the only remaining
  // step between this import and every billing surface. A failure here must
  // not roll back the hours — the meter store is already correct — so it is
  // reported rather than thrown.
  let review: { href: string; circuitLabel: string; reused: boolean } | undefined;
  let reviewSkipped: string | undefined;
  if (meter.circuitId && meter.circuit) {
    try {
      const handoff = await handOffToBillingReview({
        actorId: actor.id,
        circuitId: meter.circuitId,
        fileName: input.fileName,
        text: input.text,
      });
      if (handoff.filed) {
        await db.meterCsvImport.update({
          where: { id: importId },
          data: { rawReadingFileId: handoff.rawFileId },
        });
        review = {
          // The link goes where the review is actually VISIBLE: a circuit
          // still commissioning reviews on its own page's current step; one
          // in live monitoring reviews on the monitoring screen — on a
          // finished circuit the readings step is a collapsed "done" section,
          // and a link into a collapsed section is a dead end.
          href:
            handoff.kind === "monitoring"
              ? `/admin/live-monitoring/${meter.circuitId}`
              : `/admin/societies/${meter.circuit.societyId}/circuits/${meter.circuitId}`,
          circuitLabel: circuitLabelOf(meter.circuit.location, meter.circuit.lightType),
          reused: handoff.reused,
        };
      } else {
        reviewSkipped = handoff.reason;
      }
    } catch (err) {
      logger.warn("meter.billing_review_handoff_failed", { importId, error: String(err) });
      reviewSkipped = "the file could not be stored for review — upload it on the circuit page instead";
    }
  } else {
    reviewSkipped = "the meter is not bound to a circuit, so there is no billing review to send it to";
  }

  revalidatePath(`/admin/meters/${meter.id}`);
  revalidatePath("/admin/meters");
  return { stored: points.length, superseded: effect.supersededHours, importId, review, reviewSkipped };
}
