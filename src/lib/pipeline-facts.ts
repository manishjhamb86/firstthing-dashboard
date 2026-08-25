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

export const DEAL_PROGRESS_INCLUDE = {
  // team as well: the deal page names which team is holding the survey.
  surveyOwner: { select: { id: true, name: true, email: true, team: true } },
  siteSurvey: { include: { areas: { select: { id: true } } } },
  demoReports: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
  kycRequirements: { select: { status: true } },
  offers: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
  contract: { select: { status: true } },
  installationProject: { select: { state: true, certificate: { select: { id: true } } } },
} satisfies Prisma.PipelineInclude;

type PipelineWithProgress = Prisma.PipelineGetPayload<{ include: typeof DEAL_PROGRESS_INCLUDE }>;

export function toDealProgress(
  pipeline: PipelineWithProgress,
  candidates: { id: string; state: string; location: string | null; lightType: string }[],
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
    candidates,
    reportStatus: pipeline.demoReports[0]?.status ?? null,
    kyc: {
      total: pipeline.kycRequirements.length,
      resolved: pipeline.kycRequirements.filter(
        (k) => k.status === "verified" || k.status === "not_applicable",
      ).length,
    },
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
        select: { id: true, state: true, location: true, lightType: true },
      })
    : [];
  return toDealProgress(pipeline, candidates);
}
