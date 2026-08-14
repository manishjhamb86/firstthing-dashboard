"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { decideVoidCircuit } from "@/lib/circuit-void";

export type VoidCircuitResult = { error?: string };

/**
 * Soft-delete a circuit. Never a hard delete — a circuit is CON-11's billing
 * grain, and rows that produced (or could produce) a figure survive.
 *
 * The whole authority decision lives in `src/lib/circuit-void.ts` so it can be
 * unit-tested without a live request context; this is the thin shell that
 * gathers the facts and writes the result, the same split as
 * `portal-authority.ts` and `benchmark-rescale.ts`.
 */
export async function voidCircuit(circuitId: string, reason: string): Promise<VoidCircuitResult> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };

  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: {
      id: true,
      societyId: true,
      siteSurveyId: true,
      lightType: true,
      location: true,
      state: true,
      createdById: true,
      voidedAt: true,
      meterInstalledAt: true,
      preInstallBaseline: true,
      benchmarkSavingsPct: true,
      _count: {
        select: {
          gatePasses: true,
          commissioningReadings: true,
          meterReadings: true,
          rescaleEvents: true,
          feeLines: true,
        },
      },
    },
  });
  if (!circuit) return { error: "That circuit no longer exists." };

  // "Billed" means billed on a calculation that was actually RELEASED — a fee
  // line on a draft month is work in progress, not something a society has
  // been shown, and blocking on it would strand every circuit the moment ops
  // ran a trial calculation.
  const releasedFeeLineCount = await db.circuitFeeLine.count({
    where: { circuitId, calculation: { releasedAt: { not: null } } },
  });

  const facts = {
    meterInstalledAt: circuit.meterInstalledAt,
    preInstallBaseline: circuit.preInstallBaseline,
    benchmarkSavingsPct: circuit.benchmarkSavingsPct,
    gatePassCount: circuit._count.gatePasses,
    commissioningReadingCount: circuit._count.commissioningReadings,
    meterReadingCount: circuit._count.meterReadings,
    rescaleEventCount: circuit._count.rescaleEvents,
    feeLineCount: circuit._count.feeLines,
    releasedFeeLineCount,
  };

  const isOps =
    admin.permissions.includes("manage_pipeline") && admin.permissions.includes("manage_survey");

  const decision = decideVoidCircuit({
    actor: { id: admin.id, isOps },
    createdById: circuit.createdById,
    alreadyVoided: !!circuit.voidedAt,
    reason,
    facts,
  });

  if (!decision.allowed) {
    logger.warn("circuit.void_refused", {
      actorId: admin.id,
      circuitId,
      isOps,
      isCreator: circuit.createdById === admin.id,
      hasProgress: facts.meterInstalledAt != null || facts.gatePassCount > 0,
      releasedFeeLineCount,
    });
    return { error: decision.reason };
  }

  await db.circuit.update({
    where: { id: circuitId },
    data: { voidedAt: new Date(), voidedById: admin.id, voidReason: reason.trim() },
  });

  logger.info("circuit.voided", {
    actorId: admin.id,
    circuitId,
    societyId: circuit.societyId,
    tier: decision.tier,
    state: circuit.state,
    lightType: circuit.lightType,
    reason: reason.trim(),
  });

  revalidatePath(`/admin/societies/${circuit.societyId}/circuits`);
  revalidatePath(`/admin/societies/${circuit.societyId}`);
  if (circuit.siteSurveyId) revalidatePath("/admin/pipeline");
  revalidatePath("/admin/monitoring");
  revalidatePath("/admin");
  return {};
}

/**
 * Put a voided circuit back. Ops only, regardless of who voided it — the
 * asymmetry is deliberate: removing an untouched candidate is housekeeping,
 * but returning one to the registry puts it back in front of the billing
 * query, which is an ops decision at any stage.
 */
export async function restoreCircuit(circuitId: string): Promise<VoidCircuitResult> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };

  const isOps =
    admin.permissions.includes("manage_pipeline") && admin.permissions.includes("manage_survey");
  if (!isOps) {
    logger.warn("circuit.restore_refused", { actorId: admin.id, circuitId });
    return {
      error:
        "Restoring a removed circuit is an operations lead action. It needs both pipeline and field-survey authority.",
    };
  }

  const circuit = await db.circuit.findUnique({
    where: { id: circuitId },
    select: { id: true, societyId: true, voidedAt: true },
  });
  if (!circuit) return { error: "That circuit no longer exists." };
  if (!circuit.voidedAt) return { error: "That circuit hasn't been removed." };

  await db.circuit.update({
    where: { id: circuitId },
    data: { voidedAt: null, voidedById: null, voidReason: null },
  });

  logger.info("circuit.restored", { actorId: admin.id, circuitId, societyId: circuit.societyId });

  revalidatePath(`/admin/societies/${circuit.societyId}/circuits`);
  revalidatePath("/admin/monitoring");
  revalidatePath("/admin");
  return {};
}
