// One place that turns a Pipeline row into the facts dealProgress() needs.
//
// Extracted when the KYC screen had to show its own next step (user-asked
// 2026-08-20: "once both document uploaded and verified ... at top a button
// should appear to go to next step"). Two pages deriving the same facts from
// two hand-written includes is how they start disagreeing about where a deal
// is — the sequencing already lives in one module, and now so does the query
// that feeds it.

import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { dealProgress, type DealProgress } from "./deal-progress";
import { bestKycAcross, kycCounts, kycStarted } from "./kyc-society";

export const DEAL_PROGRESS_INCLUDE = {
  // team as well: the deal page names which team is holding the survey.
  surveyOwner: { select: { id: true, name: true, email: true, team: true } },
  siteSurvey: { include: { areas: { select: { id: true } } } },
  demoReports: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
  // KYC is a society fact (kyc-society.ts): every deal's rows, not just this one's.
  // `include`, not `select`: pages spread this alongside their own use of the society row.
  society: { include: { pipelines: { select: { kycRequirements: { select: { pipelineId: true, type: true, status: true, updatedAt: true } } } } } },
  offers: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
  contract: { select: { status: true } },
  installationProject: { select: { state: true, certificate: { select: { id: true } } } },
} satisfies Prisma.PipelineInclude;

type PipelineWithProgress = Prisma.PipelineGetPayload<{ include: typeof DEAL_PROGRESS_INCLUDE }>;

/**
 * The candidate fields `toDealProgress` actually reads.
 *
 * Shared, not copied, because copying it silently broke the map: the deal
 * page selected `replacementOwnerId` and the booked `installation_day` while
 * `loadDealProgress` below selected neither — so `replacementScheduled`
 * evaluated false on every page that used the loader (the society page, the
 * circuit page, the KYC screen, the installation screen), and all four told
 * an operator to "schedule the replacement and assign it to a crew" for work
 * that was already assigned AND booked, while the deal page correctly said to
 * record it. One question, two answers, decided by which query the caller
 * happened to write — the exact drift `deal-progress.ts` exists to prevent.
 */
export const DEAL_CANDIDATE_SELECT = {
  id: true,
  state: true,
  location: true,
  lightType: true,
  replacementOwnerId: true,
  scheduledEvents: {
    where: { kind: "installation_day" as const, status: "scheduled" as const },
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.CircuitSelect;

/**
 * Typed from the select above rather than hand-written: the previous
 * hand-written shape made `replacementOwnerId` and `scheduledEvents`
 * OPTIONAL, so a caller that simply forgot them type-checked cleanly and
 * silently produced `replacementScheduled: false`. Required now — a query
 * missing either field fails the build instead of the screen.
 */
export type DealCandidateRow = Prisma.CircuitGetPayload<{ select: typeof DEAL_CANDIDATE_SELECT }>;

export function toDealProgress(
  pipeline: PipelineWithProgress,
  candidates: DealCandidateRow[],
): DealProgress {
  return dealProgress({
    pipelineId: pipeline.id,
    societyId: pipeline.societyId,
    stage: pipeline.stage,
    authoritative: pipeline.authoritative,
    surveyOwnerName: pipeline.surveyOwner?.name ?? pipeline.surveyOwner?.email ?? null,
    demoSkipped: pipeline.demoSkipped,
    surveyExists: !!pipeline.siteSurvey,
    areaCount: pipeline.siteSurvey?.areas.length ?? 0,
    candidates: candidates.map((c) => ({
      ...c,
      // Both halves: handed to a crew AND booked with the society.
      replacementScheduled: c.replacementOwnerId != null && (c.scheduledEvents?.length ?? 0) > 0,
    })),
    reportStatus: pipeline.demoReports[0]?.status ?? null,
    kyc: (() => {
      const best = bestKycAcross(pipeline.society.pipelines.flatMap((p) => p.kycRequirements), pipeline.id);
      const facts = { gstNumber: pipeline.society.gstNumber, electricityUnitRate: pipeline.society.electricityUnitRate };
      return { ...kycCounts(best, facts), started: kycStarted(best, facts) };
    })(),
    offerStatus: pipeline.offers[0]?.status ?? null,
    contractStatus: pipeline.contract?.status ?? null,
    installationState: pipeline.installationProject?.state ?? null,
    certificateSigned: !!pipeline.installationProject?.certificate,
  });
}

/** The same thing for a page that doesn't already hold the pipeline row. */
export async function loadDealProgress(pipelineId: string): Promise<DealProgress | null> {
  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: DEAL_PROGRESS_INCLUDE,
  });
  if (!pipeline) return null;
  const candidates = pipeline.siteSurvey
    ? await db.circuit.findMany({
        where: { siteSurveyId: pipeline.siteSurvey.id, voidedAt: null },
        select: DEAL_CANDIDATE_SELECT,
      })
    : [];
  return toDealProgress(pipeline, candidates);
}
