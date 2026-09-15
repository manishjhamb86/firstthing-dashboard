"use server";

import { revalidatePath } from "next/cache";
import type { BenchmarkSource } from "@prisma/client";
import { db } from "@/lib/db";
import { generateDemoReportInternal } from "../report/actions";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import {
  ALLOWED_TOLERANCE_PCT,
  BENCHMARK_MAX_PCT,
  BENCHMARK_MIN_PCT,
  OFFER_BLOCKER_MESSAGE,
  type OfferCircuitTerm,
  type PricingModel,
} from "@/lib/offer";
import {
  deriveWorksheet,
  refuseWorksheet,
  WORKSHEET_BLOCKER_MESSAGE,
  type WorksheetCircuitInput,
} from "@/lib/offer-worksheet";
import { offerBaseRows, worksheetInputsFromTerms } from "@/lib/offer-base";
import { applyOfferPopulation } from "@/lib/offer-population";

// FEAT-027-AC-4 / FEAT-028-AC-4 — offer work is PER-01/PER-07's. Both hold
// manage_pipeline; the PER-01 proxy (both permissions) would wrongly exclude
// a pure PER-07 sales account, which FEAT-027 explicitly names as an actor.
async function requireOfferActor() {
  return requireAdminPermission("manage_pipeline");
}

export type OfferCircuitInput = {
  circuitId: string;
  /** Lights to install as per the agreement — the population the fee is priced on. Omitted = the circuit's current represented count. */
  agreedLightCount?: number;
  /** The benchmark the offer carries — the demo's figure unless negotiated. */
  agreedBenchmarkSavingsPct: number;
  /** Demo-skip only: what the agreed lights burn today, kWh/day. */
  preInstallKwhPerDay?: number | null;
};

/**
 * The worksheet's inputs (2026-09-15). Everything else on the offer — the
 * pre-install consumption, the projected saving in kWh and rupees, the
 * society's share — is DERIVED from these on the server through
 * offer-worksheet.ts; the browser's preview is never trusted.
 */
export type OfferTermInput = {
  benchmarkSource: BenchmarkSource;
  tolerancePct: number;
  pricingModel: PricingModel;
  circuits: OfferCircuitInput[];
  unitElectricityRate: number;
  /** ₹/month payable to FirsThing. */
  monthlyFee: number;
  termMonths: number;
  spareStockCount: number;
  exclusions: string;
  amcTerms: string;
};

type Built =
  | { error: string; reason: string; data?: undefined }
  | {
      error?: undefined;
      reason?: undefined;
      data: {
        benchmarkSource: BenchmarkSource;
        circuitTerms: OfferCircuitTerm[];
        tolerancePct: number;
        pricingModel: PricingModel;
        revenueSharePct: number | null;
        lumpSumMonthlyFee: number | null;
        unitElectricityRate: number;
        termMonths: number;
        spareStockCount: number;
        exclusions: string[];
        amcTerms: { summary: string } | undefined;
        projectedMonthlyFee: number;
        projectedSavedKwhPerMonth: number;
        projectedSavedValue: number;
        demoReportId: string | null;
      };
    };

/**
 * Turn the worksheet's inputs into the record an offer stores, from the
 * pipeline's own base rows. One function for generate, edit and counter, so
 * the three cannot derive the same figures differently.
 */
async function buildOfferRecord(pipelineId: string, input: OfferTermInput): Promise<Built> {
  const base = await offerBaseRows(pipelineId);
  if (input.benchmarkSource === "measured" && !base.demoReportId) {
    return { error: OFFER_BLOCKER_MESSAGE["no-demo-report"], reason: "no-demo-report" };
  }
  if (!ALLOWED_TOLERANCE_PCT.includes(input.tolerancePct)) {
    return { error: OFFER_BLOCKER_MESSAGE["invalid-tolerance"], reason: "invalid-tolerance" };
  }
  if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) {
    return { error: OFFER_BLOCKER_MESSAGE["invalid-term"], reason: "invalid-term" };
  }

  const byId = new Map(input.circuits.map((c) => [c.circuitId, c]));
  const rows: WorksheetCircuitInput[] = base.rows.map((r) => {
    const c = byId.get(r.circuitId);
    return {
      circuitId: r.circuitId,
      lightType: r.lightType,
      location: r.location,
      meteredLightCount: r.meteredLightCount,
      preInstallBaseline: r.preInstallBaseline,
      demoBenchmarkSavingsPct: r.demoBenchmarkSavingsPct,
      agreedLightCount: c?.agreedLightCount ?? r.representedLightCount,
      agreedBenchmarkSavingsPct: c?.agreedBenchmarkSavingsPct ?? r.demoBenchmarkSavingsPct ?? NaN,
      preInstallKwhPerDayOverride: c?.preInstallKwhPerDay ?? null,
    };
  });
  const ws = deriveWorksheet({ circuits: rows, unitElectricityRate: input.unitElectricityRate, monthlyFee: input.monthlyFee });
  const blocker = refuseWorksheet(ws, { benchmarkMinPct: BENCHMARK_MIN_PCT, benchmarkMaxPct: BENCHMARK_MAX_PCT });
  if (blocker) return { error: WORKSHEET_BLOCKER_MESSAGE[blocker], reason: blocker };

  // The per-circuit table is snapshotted onto the offer (CON-11): it must keep
  // saying what it was priced on even if a circuit is later rescaled (INV-07).
  const circuitTerms: OfferCircuitTerm[] = ws.circuits.map((c) => ({
    circuitId: c.circuitId,
    lightType: c.lightType,
    location: c.location,
    meteredLightCount: c.meteredLightCount,
    representedLightCount: c.agreedLightCount,
    benchmarkSavingsPct: c.agreedBenchmarkSavingsPct,
    demoBenchmarkSavingsPct: c.demoBenchmarkSavingsPct,
    preInstallBaseline: c.preInstallBaseline ?? 0,
    preInstallKwhPerDay: c.preInstallKwhPerDay,
    projectedSavedKwhPerDay: c.savedKwhPerDay,
  }));
  const lump = input.pricingModel === "lump_sum";
  return {
    data: {
      benchmarkSource: input.benchmarkSource,
      circuitTerms,
      tolerancePct: input.tolerancePct,
      pricingModel: input.pricingModel,
      // The SOCIETY's share, derived from the fee — the split is a consequence
      // of the figures, never an input, and it is stored unrounded so billing
      // reproduces the agreed fee exactly.
      revenueSharePct: lump ? null : ws.totals.societySharePct,
      lumpSumMonthlyFee: lump ? ws.totals.monthlyFee : null,
      unitElectricityRate: ws.totals.unitElectricityRate,
      termMonths: input.termMonths,
      spareStockCount: Number.isInteger(input.spareStockCount) && input.spareStockCount >= 0 ? input.spareStockCount : 0,
      exclusions: splitList(input.exclusions),
      amcTerms: input.amcTerms.trim() ? { summary: input.amcTerms.trim() } : undefined,
      projectedMonthlyFee: ws.totals.monthlyFee,
      projectedSavedKwhPerMonth: ws.totals.savedKwhPerMonth,
      projectedSavedValue: ws.totals.savedValuePerMonth,
      demoReportId: base.demoReportId,
    },
  };
}

export async function generateOffer(pipelineId: string, input: OfferTermInput) {
  const session = await requireOfferActor();

  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: { offers: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!pipeline) return { error: "Deal not found." };

  const built = await buildOfferRecord(pipelineId, input);
  if (!built.data) {
    logger.warn("offer.generation_refused", { actorId: session.user.id, pipelineId, reason: built.reason });
    return { error: built.error };
  }

  const offer = await db.offer.create({
    data: { pipelineId, version: (pipeline.offers[0]?.version ?? 0) + 1, status: "draft", ...built.data },
  });

  logger.info("offer.generated", {
    actorId: session.user.id,
    pipelineId,
    version: offer.version,
    benchmarkSource: input.benchmarkSource,
    monthlyFee: built.data.projectedMonthlyFee,
    societySharePct: built.data.revenueSharePct,
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/offer`);
  return {};
}

/**
 * Edit a DRAFT in place (user-asked 2026-09-15: "keep the offer editable").
 *
 * A draft is a working document nobody outside has seen, so it is edited
 * where it stands — the same rule as a draft inspection. The moment it is
 * issued it becomes what the society was shown, and from then on a change is
 * a counter, which is a new version (FEAT-028-AC-5).
 */
export async function updateOffer(pipelineId: string, offerId: string, input: OfferTermInput) {
  const session = await requireOfferActor();
  const offer = await db.offer.findUnique({ where: { id: offerId } });
  if (!offer || offer.pipelineId !== pipelineId) return { error: "Offer not found." };
  if (offer.status !== "draft") {
    logger.warn("offer.edit_refused", { actorId: session.user.id, pipelineId, offerId, status: offer.status });
    return { error: "Only a draft can be edited. This offer has been issued — record a counter as a new version instead." };
  }
  const built = await buildOfferRecord(pipelineId, input);
  if (!built.data) {
    logger.warn("offer.edit_refused", { actorId: session.user.id, pipelineId, offerId, reason: built.reason });
    return { error: built.error };
  }
  await db.offer.update({ where: { id: offerId }, data: built.data });
  logger.info("offer.draft_updated", {
    actorId: session.user.id,
    pipelineId,
    offerId,
    monthlyFee: built.data.projectedMonthlyFee,
    societySharePct: built.data.revenueSharePct,
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

  await db.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id: offerId },
      data: { status: outcome, respondedAt: new Date(), responseNote: note.trim() || null },
    });
    // Acceptance is when the agreed light count becomes the record's count —
    // otherwise the month would be billed on a population the agreement does
    // not say (offer-population.ts).
    if (outcome === "accepted") {
      await applyOfferPopulation(tx, offer, session.user.id, currentPeriod(), "back_office");
    }
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

  const built = await buildOfferRecord(pipelineId, { ...input, benchmarkSource: previous.benchmarkSource });
  if (!built.data) {
    logger.warn("offer.counter_refused", { actorId: session.user.id, pipelineId, offerId, reason: built.reason });
    return { error: built.error };
  }

  const latest = await db.offer.findFirst({ where: { pipelineId }, orderBy: { version: "desc" } });

  await db.$transaction([
    db.offer.update({ where: { id: offerId }, data: { status: "countered", respondedAt: new Date() } }),
    db.offer.create({
      data: {
        pipelineId,
        version: (latest?.version ?? 0) + 1,
        status: "draft",
        ...built.data,
        // A counter keeps the evidence the issued version was priced on.
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

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Re-price a draft offer after its extrapolation base changed.
 *
 * An offer's per-circuit table is a SNAPSHOT (INV-02) — it keeps saying what
 * it was priced on, and correcting a circuit's represented count therefore
 * changes nothing on the offer. That is right, and it also read as a save that
 * had not worked ("Even after updating its not reflecting", 2026-09-08): the
 * correction had landed on the circuit and the offer, correctly, had not moved.
 *
 * The re-price is two acts and both are needed, which is exactly why it is one
 * control rather than an instruction to go and find them: the demo report
 * holds CON-11's extrapolation (`represented / metered`), so regenerating the
 * offer alone would re-read the OLD projection. The report is regenerated
 * first, then a new offer version is drawn from it carrying this draft's own
 * terms — nothing about the commercial terms is re-decided here.
 *
 * A new VERSION, never an edit in place: the superseded draft stays exactly as
 * it was, the same rule as every other versioned document in this codebase.
 */
export async function repriceOffer(pipelineId: string) {
  const session = await requireOfferActor();

  const current = await db.offer.findFirst({
    where: { pipelineId },
    orderBy: { version: "desc" },
  });
  if (!current) return { error: "There is no offer to re-price." };
  if (current.status !== "draft") {
    return {
      error:
        "Only a draft offer can be re-priced. This one has been issued — counter it with the corrected terms instead, so the society's copy is versioned rather than changed underneath them.",
    };
  }

  const regenerated = await generateDemoReportInternal(pipelineId, session.user.id);
  if (regenerated && "error" in regenerated && regenerated.error) return { error: regenerated.error };

  const result = await generateOffer(pipelineId, {
    benchmarkSource: current.benchmarkSource as OfferTermInput["benchmarkSource"],
    tolerancePct: current.tolerancePct,
    pricingModel: current.pricingModel as PricingModel,
    // The agreed benchmark and any typed consumption carry across unchanged;
    // the light count follows the corrected circuit record, which is the
    // point of re-pricing.
    circuits: worksheetInputsFromTerms(current.circuitTerms as OfferCircuitTerm[]).map(
      ({ circuitId, agreedBenchmarkSavingsPct, preInstallKwhPerDay }) => ({ circuitId, agreedBenchmarkSavingsPct, preInstallKwhPerDay }),
    ),
    unitElectricityRate: current.unitElectricityRate,
    monthlyFee: current.projectedMonthlyFee ?? 0,
    termMonths: current.termMonths,
    spareStockCount: current.spareStockCount,
    exclusions: Array.isArray(current.exclusions) ? (current.exclusions as string[]).join("\n") : "",
    amcTerms: amcSummary(current.amcTerms),
  });
  if (result && "error" in result && result.error) return { error: result.error };

  logger.info("offer.repriced", {
    actorId: session.user.id,
    pipelineId,
    fromVersion: current.version,
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/offer`);
  return {};
}

function amcSummary(raw: unknown): string {
  return raw && typeof raw === "object" && "summary" in raw ? String((raw as { summary: unknown }).summary ?? "") : "";
}
