"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { istYesterday, parseReportDays, refuseBaseline } from "@/lib/pump-savings";

/**
 * The pump room's "before FirsThing" baseline and the report days typed in
 * beside it (2026-11-13). Both carry a figure a society is told it saved,
 * so both are an operations-lead act — the standing PER-01 proxy (BOTH
 * manage_pipeline and manage_survey), not the society-management permission
 * that assigns a room to a society. Refusals return in words; nothing here
 * throws (a thrown Server Action is an opaque digest in production).
 */
function isOps(actor: { permissions: string[] }): boolean {
  return actor.permissions.includes("manage_pipeline") && actor.permissions.includes("manage_survey");
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const utcDay = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function revalidatePumpRoom(meterId: string, societyId: string | null) {
  revalidatePath(`/admin/pump-rooms/${meterId}`);
  revalidatePath("/admin/pump-rooms");
  revalidatePath("/portal/pump-room");
  revalidatePath("/portal");
  if (societyId) revalidatePath(`/admin/societies/${societyId}`);
}

export async function recordPumpBaseline(input: {
  meterId: string;
  periodFrom: string;
  periodTo: string;
  kwh: number;
  kl: number;
  savingsFrom: string;
  sourceDocumentId: string | null;
  note: string;
  /** Required when a live baseline already exists — this one supersedes it. */
  reason: string;
}): Promise<{ error?: string; kwhPerKl?: number }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOps(actor)) {
    logger.warn("pump_room.baseline_refused", { actorId: actor.id, meterId: input.meterId, reason: "permission" });
    return { error: "Recording a pump room's baseline is an operations-lead action — it decides what the society is told it saved." };
  }
  const refusal = refuseBaseline({ ...input, today: istYesterday(new Date(Date.now() + 86_400_000)) });
  if (refusal) {
    logger.warn("pump_room.baseline_refused", { actorId: actor.id, meterId: input.meterId, reason: refusal });
    return { error: refusal };
  }
  const meter = await db.emsPumpMeter.findUnique({
    where: { id: input.meterId },
    select: { id: true, societyId: true, baselines: { where: { supersededAt: null }, select: { id: true, kwhPerKl: true } } },
  });
  if (!meter) return { error: "That pump room no longer exists." };
  if (!meter.societyId) return { error: "Assign the pump room to its society first — the tariff and the portal both come from the society." };
  const live = meter.baselines[0] ?? null;
  if (live && input.reason.trim() === "") return { error: "A baseline is already on record. Say why this one replaces it — the earlier figure stays on record with that reason." };
  if (input.sourceDocumentId) {
    const doc = await db.storedDocument.findFirst({ where: { id: input.sourceDocumentId, societyId: meter.societyId, voidedAt: null }, select: { id: true } });
    if (!doc) return { error: "That document is not one of this society's filed documents." };
  }
  const kwhPerKl = input.kwh / input.kl;
  const now = new Date();
  await db.$transaction(async (tx) => {
    if (live) {
      await tx.emsPumpBaseline.update({ where: { id: live.id }, data: { supersededAt: now, supersededById: actor.id } });
    }
    await tx.emsPumpBaseline.create({
      data: {
        pumpMeterId: meter.id,
        periodFrom: utcDay(input.periodFrom),
        periodTo: utcDay(input.periodTo),
        kwh: input.kwh,
        kl: input.kl,
        kwhPerKl,
        savingsFrom: utcDay(input.savingsFrom),
        sourceDocumentId: input.sourceDocumentId,
        note: [input.note.trim(), live ? `Replaces the earlier baseline (${live.kwhPerKl.toFixed(2)} kWh/KL): ${input.reason.trim()}` : ""].filter(Boolean).join(" — ") || null,
        recordedById: actor.id,
      },
    });
  });
  logger.info("pump_room.baseline_recorded", {
    actorId: actor.id,
    meterId: meter.id,
    kwhPerKl,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    savingsFrom: input.savingsFrom,
    supersededId: live?.id ?? null,
  });
  await revalidatePumpRoom(meter.id, meter.societyId);
  return { kwhPerKl };
}

/**
 * Days typed in from a filed report's own daily table. A day the vendor's
 * email has already given us is never overwritten by a typed figure — the
 * meter is the better source — and is reported back as skipped.
 */
export async function importPumpReportDays(input: { meterId: string; sourceDocumentId: string | null; text: string }): Promise<{ error?: string; added?: number; skipped?: string[] }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOps(actor)) {
    logger.warn("pump_room.report_days_refused", { actorId: actor.id, meterId: input.meterId, reason: "permission" });
    return { error: "Typing in a report's days is an operations-lead action." };
  }
  const parsed = parseReportDays(input.text);
  if (parsed.problems.length > 0) return { error: parsed.problems.slice(0, 5).join(" ") };
  if (parsed.days.length === 0) return { error: "No days to add — one line per day: the date, the kWh, then the KL." };
  const yesterday = istYesterday();
  const future = parsed.days.find((d) => d.day > yesterday);
  if (future) return { error: `${future.day} has not happened yet.` };
  if (!parsed.days.every((d) => DAY.test(d.day))) return { error: "A date did not read as a full day." };

  const meter = await db.emsPumpMeter.findUnique({ where: { id: input.meterId }, select: { id: true, societyId: true } });
  if (!meter) return { error: "That pump room no longer exists." };
  if (input.sourceDocumentId) {
    const doc = await db.storedDocument.findFirst({ where: { id: input.sourceDocumentId, societyId: meter.societyId ?? "", voidedAt: null }, select: { id: true } });
    if (!doc) return { error: "That document is not one of this society's filed documents." };
  }
  const existing = await db.emsPumpReading.findMany({
    where: { pumpMeterId: meter.id, date: { in: parsed.days.map((d) => utcDay(d.day)) } },
    select: { date: true, origin: true },
  });
  const readByEmail = new Set(existing.filter((e) => e.origin === "ems_email").map((e) => e.date.toISOString().slice(0, 10)));
  const toWrite = parsed.days.filter((d) => !readByEmail.has(d.day));
  await db.$transaction(
    toWrite.map((d) =>
      db.emsPumpReading.upsert({
        where: { pumpMeterId_date: { pumpMeterId: meter.id, date: utcDay(d.day) } },
        create: { pumpMeterId: meter.id, date: utcDay(d.day), origin: "report", sourceDocumentId: input.sourceDocumentId, dailyKwh: d.kwh, dailyKl: d.kl },
        update: { origin: "report", sourceDocumentId: input.sourceDocumentId, dailyKwh: d.kwh, dailyKl: d.kl },
      }),
    ),
  );
  const skipped = [...readByEmail].sort();
  logger.info("pump_room.report_days_imported", { actorId: actor.id, meterId: meter.id, added: toWrite.length, skipped: skipped.length, sourceDocumentId: input.sourceDocumentId });
  await revalidatePumpRoom(meter.id, meter.societyId);
  return { added: toWrite.length, skipped };
}
