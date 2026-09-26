"use server";

// Excluding a MONITORING day (2026-09-26). Since per-demo commissioning, the
// daily store holds monitoring days only — a demo's days live on the demo and
// are excluded there. A monitoring day feeds no baseline or benchmark, so the
// only freeze is INV-03: a day a released calculation consumed never changes.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { exclusionRefusal } from "@/lib/reading-exclusion";
import { syncCircuitBandAlert } from "@/lib/savings-band-alerts";

type Outcome = { error: string } | { ok: true };

export async function setReadingExclusion(readingId: string, exclude: boolean, reason: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid." };
  const perms = admin.permissions as string[];
  if (!perms.includes("manage_survey")) return { error: "Excluding a reading is a field-survey action." };

  const reading = await db.meterReading.findUnique({
    where: { id: readingId },
    select: { id: true, usedInCalculationId: true, circuit: { select: { id: true, voidedAt: true } } },
  });
  if (!reading || reading.circuit.voidedAt) return { error: "That reading no longer exists." };
  if (exclude && !reason.trim()) return { error: "Say why this day is being excluded — the report will show it." };

  const refusal = exclusionRefusal({
    phase: "monitoring",
    replacementRecorded: true,
    benchmarkConfirmed: true,
    billed: reading.usedInCalculationId !== null,
    isOps: perms.includes("manage_pipeline"),
  });
  if (refusal) {
    logger.warn("monitoring.exclusion_refused", { readingId, circuitId: reading.circuit.id, refusal });
    return { error: refusal };
  }

  await db.meterReading.update({
    where: { id: reading.id },
    data: exclude
      ? { excludedAt: new Date(), excludedById: admin.id, excludedReason: reason.trim() }
      : { excludedAt: null, excludedById: null, excludedReason: null },
  });
  await syncCircuitBandAlert(reading.circuit.id);
  logger.info("monitoring.exclusion_set", {
    actorId: admin.id,
    readingId,
    circuitId: reading.circuit.id,
    exclude,
    reason: reason.trim() || null,
  });
  revalidatePath(`/admin/live-monitoring/${reading.circuit.id}`);
  return { ok: true };
}
