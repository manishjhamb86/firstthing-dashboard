"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { KYC_REQUIREMENTS, KYC_TYPE_LABEL, kycIsSettled } from "@/lib/kyc";
import type { OfferCircuitTerm } from "@/lib/offer";

// FEAT-029-AC-4 / FEAT-062-AC-4 — agreement preparation and contract term
// confirmation are PER-01's, not any pipeline actor's.
async function requirePer01() {
  await requireAdminPermission("manage_survey");
  return requireAdminPermission("manage_pipeline");
}

// FEAT-029-AC-1 — the agreement is prepared *from the accepted offer's
// terms*, so there is nothing to prepare until an offer is actually
// accepted. KYC is checked here too: an agreement drawn up while a required
// document is still outstanding is one that cannot legally complete.
export async function prepareAgreement(pipelineId: string) {
  const session = await requirePer01();

  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: {
      offers: { where: { status: "accepted" }, orderBy: { version: "desc" }, take: 1 },
      agreement: true,
      kycRequirements: true,
    },
  });
  if (!pipeline) return { error: "Deal not found." };
  if (pipeline.agreement) return { error: "An agreement has already been prepared for this deal." };

  const accepted = pipeline.offers[0];
  if (!accepted) return { error: "No accepted offer — an agreement is prepared from the terms the society accepted." };

  const missing = KYC_REQUIREMENTS.filter((req) => {
    const record = pipeline.kycRequirements.find((r) => r.type === req.type);
    return !record || !kycIsSettled(record.status);
  });
  if (missing.length > 0) {
    return {
      error: `KYC is incomplete — ${missing.map((m) => KYC_TYPE_LABEL[m.type]).join(" and ")} still outstanding.`,
    };
  }

  await db.agreement.create({
    data: { pipelineId, offerId: accepted.id, preparedById: session.user.id },
  });

  logger.info("agreement.prepared", { actorId: session.user.id, pipelineId, offerId: accepted.id });
  revalidatePath(`/admin/pipeline/${pipelineId}/agreement`);
  return {};
}

// FEAT-029-AC-2 — print / notarize / sign are discrete steps, so each is
// stamped on its own rather than collapsing into one opaque status.
export async function markAgreementStep(pipelineId: string, step: "printed" | "notarized" | "signed") {
  const session = await requirePer01();
  const agreement = await db.agreement.findUnique({ where: { pipelineId } });
  if (!agreement) return { error: "Prepare the agreement first." };

  // The steps are ordered in reality, so they are ordered here: a document
  // cannot be notarized before it is printed.
  if (step === "notarized" && !agreement.printedAt) return { error: "Print the agreement before notarizing it." };
  if (step === "signed" && !agreement.notarizedAt) return { error: "Notarize the agreement before recording signature." };

  await db.agreement.update({
    where: { pipelineId },
    data: { [`${step}At`]: new Date() },
  });

  logger.info("agreement.step_recorded", { actorId: session.user.id, pipelineId, step });
  revalidatePath(`/admin/pipeline/${pipelineId}/agreement`);
  return {};
}

// FEAT-029-AC-5 — the executed document is authoritative, but a difference
// from the accepted offer has to be *visible*, not silently reconciled.
export async function uploadExecutedAgreement(
  pipelineId: string,
  input: { s3Key: string; fileName: string; hasDeviation: boolean; deviationNote: string },
) {
  const session = await requirePer01();
  const agreement = await db.agreement.findUnique({ where: { pipelineId } });
  if (!agreement) return { error: "Prepare the agreement first." };
  if (!agreement.signedAt) return { error: "Record the physical signature before uploading the executed scan." };
  if (!input.s3Key) return { error: "Attach the scanned document." };
  if (input.hasDeviation && !input.deviationNote.trim()) {
    return { error: "Describe how the signed document differs from the accepted offer." };
  }

  await db.agreement.update({
    where: { pipelineId },
    data: {
      executedS3Key: input.s3Key,
      executedFileName: input.fileName,
      uploadedAt: new Date(),
      uploadedById: session.user.id,
      hasDeviation: input.hasDeviation,
      deviationNote: input.hasDeviation ? input.deviationNote.trim() : null,
    },
  });

  logger.info("agreement.executed_uploaded", {
    actorId: session.user.id,
    pipelineId,
    hasDeviation: input.hasDeviation,
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/agreement`);
  return {};
}

// FEAT-062 — the contract record. AC-1: every billing-relevant term is
// populated from the accepted offer and linked to the signed document.
export async function activateContract(pipelineId: string, termStart: string) {
  const session = await requirePer01();

  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: { agreement: { include: { offer: true } }, contract: true },
  });
  if (!pipeline) return { error: "Deal not found." };
  if (pipeline.contract) return { error: "This deal already has a contract." };

  const agreement = pipeline.agreement;
  if (!agreement) return { error: "Prepare and execute the agreement first." };

  // FEAT-029-AC-3's hard gate. Installation commits FirsThing's own capital,
  // so an unexecuted agreement can never be the thing it proceeds on.
  if (!agreement.executedS3Key) {
    return { error: "The executed agreement scan hasn't been uploaded — the deal can't advance without it." };
  }

  const offer = agreement.offer;
  // FEAT-062-AC-3 — a contract cannot activate missing a term FEAT-048/049
  // reads. These are validated at offer time too; re-checked here because
  // this is the last point before they start producing money figures.
  if (!offer.tolerancePct || !offer.revenueSharePct || !offer.unitElectricityRate || !offer.termMonths) {
    return { error: "The accepted offer is missing a required billing term — it can't be activated." };
  }

  const start = new Date(`${termStart}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return { error: "Give a valid term start date." };
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + offer.termMonths);

  await db.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        pipelineId,
        societyId: pipeline.societyId,
        serviceLine: pipeline.serviceLine,
        agreementId: agreement.id,
        status: "active",
        termStart: start,
        termEnd: end,
        activatedAt: new Date(),
        activatedById: session.user.id,
      },
    });

    // Version 1 of the terms, effective from the term start. FEAT-062-AC-5's
    // amendments add versions; nothing ever edits this row, so a prior
    // month always resolves to the version in force at the time (ADR-005).
    await tx.contractTermVersion.create({
      data: {
        contractId: contract.id,
        version: 1,
        effectiveFrom: start,
        benchmarkSource: offer.benchmarkSource,
        tolerancePct: offer.tolerancePct,
        revenueSharePct: offer.revenueSharePct,
        unitElectricityRate: offer.unitElectricityRate,
        exclusions: offer.exclusions ?? undefined,
        amcTerms: offer.amcTerms ?? undefined,
        spareStockCount: offer.spareStockCount,
        circuitBenchmarks: (offer.circuitTerms as OfferCircuitTerm[]) ?? [],
        recordedById: session.user.id,
      },
    });

    await tx.pipeline.update({ where: { id: pipelineId }, data: { stage: "agreed" } });
    await tx.society.update({ where: { id: pipeline.societyId }, data: { status: "active" } });
  });

  logger.info("contract.activated", {
    actorId: session.user.id,
    pipelineId,
    societyId: pipeline.societyId,
    termMonths: offer.termMonths,
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/agreement`);
  revalidatePath(`/admin/societies/${pipeline.societyId}`);
  return {};
}
