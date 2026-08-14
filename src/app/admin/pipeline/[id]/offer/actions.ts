"use server";

import { revalidatePath } from "next/cache";
import type { BenchmarkSource } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import {
  OFFER_BLOCKER_MESSAGE,
  projectedMonthlyFee,
  refuseOffer,
  type OfferCircuitTerm,
} from "@/lib/offer";
import type { DemoReportCircuit } from "@/lib/demo-report";

// FEAT-027-AC-4 / FEAT-028-AC-4 — offer work is PER-01/PER-07's. Both hold
// manage_pipeline; the PER-01 proxy (both permissions) would wrongly exclude
// a pure PER-07 sales account, which FEAT-027 explicitly names as an actor.
async function requireOfferActor() {
  return requireAdminPermission("manage_pipeline");
}

export type OfferTermInput = {
  benchmarkSource: BenchmarkSource;
  negotiatedBenchmarkPct: number | null;
  tolerancePct: number;
  revenueSharePct: number;
  unitElectricityRate: number;
  termMonths: number;
  spareStockCount: number;
  exclusions: string;
  amcTerms: string;
};

export async function generateOffer(pipelineId: string, input: OfferTermInput) {
  const session = await requireOfferActor();

  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: { demoReports: { orderBy: { version: "desc" }, take: 1 }, offers: { orderBy: { version: "desc" } } },
  });
  if (!pipeline) return { error: "Deal not found." };

  const demoReport = pipeline.demoReports[0] ?? null;

  const blocker = refuseOffer({
    benchmarkSource: input.benchmarkSource,
    demoReportId: demoReport?.id ?? null,
    negotiatedBenchmarkPct: input.negotiatedBenchmarkPct,
    terms: input,
  });
  if (blocker) {
    logger.warn("offer.generation_refused", { actorId: session.user.id, pipelineId, reason: blocker });
    return { error: OFFER_BLOCKER_MESSAGE[blocker] };
  }

  // The per-circuit benchmark table is snapshotted onto the offer (CON-11):
  // the offer must keep saying what it was priced on even if a circuit is
  // later rescaled (INV-07).
  const snapshot = (demoReport?.circuitSnapshot as DemoReportCircuit[] | undefined) ?? [];
  const circuitTerms: OfferCircuitTerm[] = snapshot.map((c) => ({
    circuitId: c.circuitId,
    lightType: c.lightType,
    location: c.location,
    meteredLightCount: c.meteredLightCount,
    representedLightCount: c.representedLightCount,
    benchmarkSavingsPct:
      input.benchmarkSource === "negotiated_fixed" ? input.negotiatedBenchmarkPct! : c.benchmarkSavingsPct,
    preInstallBaseline: c.preInstallBaseline,
    projectedSavedKwhPerDay: c.projectedSavedKwhPerDay,
  }));

  const projectedSaved = demoReport?.projectedSavingsKwhPerDay ?? 0;
  const fee = projectedMonthlyFee({
    projectedSavedKwhPerDay: projectedSaved,
    unitElectricityRate: input.unitElectricityRate,
    societyRevenueSharePct: input.revenueSharePct,
  });

  const offer = await db.offer.create({
    data: {
      pipelineId,
      version: (pipeline.offers[0]?.version ?? 0) + 1,
      status: "draft",
      benchmarkSource: input.benchmarkSource,
      circuitTerms,
      tolerancePct: input.tolerancePct,
      revenueSharePct: input.revenueSharePct,
      unitElectricityRate: input.unitElectricityRate,
      termMonths: input.termMonths,
      spareStockCount: input.spareStockCount,
      exclusions: splitList(input.exclusions),
      amcTerms: input.amcTerms.trim() ? { summary: input.amcTerms.trim() } : undefined,
      projectedMonthlyFee: fee,
      demoReportId: demoReport?.id ?? null,
    },
  });

  logger.info("offer.generated", {
    actorId: session.user.id,
    pipelineId,
    version: offer.version,
    benchmarkSource: input.benchmarkSource,
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/offer`);
  return {};
}

function splitList(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function issueOffer(pipelineId: string, offerId: string) {
  const session = await requireOfferActor();
  const offer = await db.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.pipelineId !== pipelineId) return { error: "Offer not found." };
  if (offer.status !== "draft") return { error: "Only a draft offer can be issued." };

  await db.$transaction([
    db.offer.update({
      where: { id: offerId },
      data: { status: "issued", issuedAt: new Date(), issuedById: session.user.id },
    }),
    db.pipeline.update({ where: { id: pipelineId }, data: { stage: "offered" } }),
  ]);

  logger.info("offer.issued", { actorId: session.user.id, pipelineId, offerId, version: offer.version });
  revalidatePath(`/admin/pipeline/${pipelineId}/offer`);
  revalidatePath("/portal");
  return {};
}

// FEAT-028-AC-1/AC-3 — an outcome recorded by the back office on the
// society's behalf (a decision relayed by phone). The society accepting in
// its own portal is the GATE-04 path and lives in src/app/portal/offer-actions.ts.
export async function recordOfferOutcome(
  pipelineId: string,
  offerId: string,
  outcome: "accepted" | "rejected",
  note: string,
) {
  const session = await requireOfferActor();
  if (outcome === "rejected" && !note.trim()) {
    return { error: "Record why it was rejected — a rejection is usually followed by a counter." };
  }

  const offer = await db.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.pipelineId !== pipelineId) return { error: "Offer not found." };
  if (offer.status !== "issued") return { error: OFFER_BLOCKER_MESSAGE["already-responded"] };

  await db.offer.update({
    where: { id: offerId },
    data: { status: outcome, respondedAt: new Date(), responseNote: note.trim() || null },
  });

  // AC-3 — a rejected offer leaves the pipeline flagged, not silently
  // closed: in practice a rejection is often followed by a counter-proposal.
  logger.info("offer.outcome_recorded", { actorId: session.user.id, pipelineId, offerId, outcome });
  revalidatePath(`/admin/pipeline/${pipelineId}/offer`);
  return {};
}

// FEAT-028-AC-5 — a counter produces a NEW version carrying the requested
// terms; the issued one is never edited, so the negotiation history stays
// exactly as each side saw it.
export async function counterOffer(pipelineId: string, offerId: string, input: OfferTermInput, note: string) {
  const session = await requireOfferActor();

  const previous = await db.offer.findUnique({ where: { id: offerId } });
  if (!previous || previous.pipelineId !== pipelineId) return { error: "Offer not found." };
  if (previous.status !== "issued") return { error: "Only an issued offer can be countered." };

  const blocker = refuseOffer({
    benchmarkSource: previous.benchmarkSource,
    demoReportId: previous.demoReportId,
    negotiatedBenchmarkPct: input.negotiatedBenchmarkPct,
    terms: input,
  });
  if (blocker) return { error: OFFER_BLOCKER_MESSAGE[blocker] };

  const latest = await db.offer.findFirst({ where: { pipelineId }, orderBy: { version: "desc" } });
  const snapshot = (previous.circuitTerms as OfferCircuitTerm[]) ?? [];
  const projectedSaved = snapshot.reduce((s, c) => s + c.projectedSavedKwhPerDay, 0);

  await db.$transaction([
    db.offer.update({ where: { id: offerId }, data: { status: "countered", respondedAt: new Date() } }),
    db.offer.create({
      data: {
        pipelineId,
        version: (latest?.version ?? 0) + 1,
        status: "draft",
        benchmarkSource: previous.benchmarkSource,
        circuitTerms: snapshot,
        tolerancePct: input.tolerancePct,
        revenueSharePct: input.revenueSharePct,
        unitElectricityRate: input.unitElectricityRate,
        termMonths: input.termMonths,
        spareStockCount: input.spareStockCount,
        exclusions: splitList(input.exclusions),
        amcTerms: input.amcTerms.trim() ? { summary: input.amcTerms.trim() } : undefined,
        projectedMonthlyFee: projectedMonthlyFee({
          projectedSavedKwhPerDay: projectedSaved,
          unitElectricityRate: input.unitElectricityRate,
          societyRevenueSharePct: input.revenueSharePct,
        }),
        demoReportId: previous.demoReportId,
        counteredFromId: previous.id,
        responseNote: note.trim() || null,
      },
    }),
  ]);

  logger.info("offer.countered", { actorId: session.user.id, pipelineId, fromOfferId: offerId });
  revalidatePath(`/admin/pipeline/${pipelineId}/offer`);
  return {};
}
