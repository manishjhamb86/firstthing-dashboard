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
import { circuitHourlySamples, PARTIAL_REASON_PREFIX } from "@/lib/monitoring-projection";
import { buildHourlyProfiles, classifyDay as classifyHourlyDay, type HourReading } from "@/lib/hourly-anomaly";

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

/**
 * An operator's explicit confirmation that a day the system auto-classed
 * `partial` should still count (2026-10-05, user-asked) — the one manual
 * direction `setReadingExclusion` above doesn't cover (that one only ever
 * takes a day OUT). Once set, every consumer of this row — the monthly
 * report, live monitoring, the portal's own dashboard — reads the SAME
 * stored override, so an operator's exception while processing a month
 * shows up on the resident's screen too, never a second disagreeing figure.
 *
 * `excludedAt` still wins outright if both are set on one row — stated here
 * and in the UI, not left as an unstated precedence.
 */
export async function setDayValidOverride(readingId: string, valid: boolean, reason: string): Promise<Outcome> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid." };
  const perms = admin.permissions as string[];
  if (!perms.includes("manage_survey")) return { error: "Marking a day valid is a field-survey action." };

  const reading = await db.meterReading.findUnique({
    where: { id: readingId },
    select: {
      id: true,
      usedInCalculationId: true,
      dayClass: true,
      excludedAt: true,
      excludedReason: true,
      circuit: { select: { id: true, voidedAt: true } },
    },
  });
  if (!reading || reading.circuit.voidedAt) return { error: "That reading no longer exists." };
  if (valid && !reason.trim()) return { error: "Say why this day is being marked valid — the report will show it." };
  if (valid && reading.dayClass !== "partial") {
    return { error: "This day is not marked partial — there is nothing to override." };
  }

  // Same freeze as exclusion (INV-03) — a billed day never changes, whichever
  // direction the change would go.
  const refusal = exclusionRefusal({
    phase: "monitoring",
    replacementRecorded: true,
    benchmarkConfirmed: true,
    billed: reading.usedInCalculationId !== null,
    isOps: perms.includes("manage_pipeline"),
  });
  if (refusal) {
    logger.warn("monitoring.valid_override_refused", { readingId, circuitId: reading.circuit.id, refusal });
    return { error: refusal };
  }

  // Marking valid also clears the auto-exclude the partial classification
  // set (src/lib/monitoring-projection.ts) — every reader keys its "does
  // this day count" question on `excludedAt`, so leaving it set would mean
  // the override changed nothing anyone actually reads. A genuine MANUAL
  // exclude (not the auto one) is left exactly as it is — this action
  // overrides the automatic classification, not somebody else's judgment.
  const wasAutoExcluded = reading.excludedAt !== null && (reading.excludedReason?.startsWith(PARTIAL_REASON_PREFIX) ?? false);

  await db.meterReading.update({
    where: { id: reading.id },
    data: valid
      ? {
          validOverrideAt: new Date(),
          validOverrideById: admin.id,
          validOverrideReason: reason.trim(),
          ...(wasAutoExcluded ? { excludedAt: null, excludedById: null, excludedReason: null } : {}),
        }
      : { validOverrideAt: null, validOverrideById: null, validOverrideReason: null },
  });
  await syncCircuitBandAlert(reading.circuit.id);
  logger.info("monitoring.valid_override_set", {
    actorId: admin.id,
    readingId,
    circuitId: reading.circuit.id,
    valid,
    reason: reason.trim() || null,
  });
  revalidatePath(`/admin/live-monitoring/${reading.circuit.id}`);
  return { ok: true };
}

/**
 * The real 24 hours behind one stored monitoring day, re-derived fresh on
 * demand (2026-10-06, user-asked: "allow backend user to see all 24 hour
 * readings of a day... once he clicks on a day"). Never read from the
 * row's own stored counts — a stored `hourlyNormalCount` etc. can predate
 * a profile-affecting re-projection (or, for an older row, not exist at
 * all), so this recomputes from the meter's own hourly store every time
 * it's asked, the same way the readings explorer's other figures are never
 * trusted stale relative to what actually happened.
 */
export async function getHourlyReadings(
  readingId: string,
): Promise<{ error: string } | { ok: true; hours: HourReading[] }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid." };
  const perms = admin.permissions as string[];
  if (!perms.includes("manage_survey") && !perms.includes("manage_pipeline")) {
    return { error: "Viewing hourly readings needs field-survey or operations access." };
  }

  const reading = await db.meterReading.findUnique({
    where: { id: readingId },
    select: {
      id: true,
      date: true,
      meterId: true,
      circuit: {
        select: {
          voidedAt: true,
          meterInstallations: { orderBy: { installedAt: "asc" }, select: { meterId: true, installedAt: true, removedAt: true } },
        },
      },
    },
  });
  if (!reading || reading.circuit.voidedAt) return { error: "That reading no longer exists." };
  if (!reading.meterId) {
    return { error: "This day has no hourly breakdown — it came from a monthly upload, not the meter's own hourly store." };
  }

  const hourly = await db.meterHourlyReading.findMany({
    where: { meterId: reading.meterId, day: reading.date },
    select: { hour: true, kWh: true },
  });
  const kwhByHour: (number | null)[] = new Array(24).fill(null);
  for (const h of hourly) kwhByHour[h.hour] = h.kWh;

  const now = new Date();
  const hourlySamples = await circuitHourlySamples(reading.circuit.meterInstallations, now);
  const profiles = buildHourlyProfiles(hourlySamples);
  const summary = classifyHourlyDay(kwhByHour, profiles);
  return { ok: true, hours: summary.hours };
}
