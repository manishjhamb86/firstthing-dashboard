"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import { BLOCKER_MESSAGE, buildDemoReport, type DemoReportCircuitInput } from "@/lib/demo-report";

async function requirePer01() {
  await requireAdminPermission("manage_survey");
  return requireAdminPermission("manage_pipeline");
}

// Gathers exactly what buildDemoReport() needs. Kept separate from the
// action so the page can call it to explain *why* no report exists yet
// (FEAT-020-AC-3) without duplicating the query.
export async function collectDemoReportInput(pipelineId: string) {
  const pipeline = await db.pipeline.findUnique({
    where: { id: pipelineId },
    include: {
      society: true,
      siteSurvey: {
        include: {
          areas: true,
          // The demo's circuits are the ones selected during this survey
          // (FEAT-007) — not every circuit the society has.
          circuits: {
            where: { voidedAt: null },
            include: { commissioningReadings: { orderBy: { date: "asc" } } },
          },
        },
      },
    },
  });
  if (!pipeline) return null;

  const circuits: DemoReportCircuitInput[] = (pipeline.siteSurvey?.circuits ?? []).map((c) => ({
      id: c.id,
      lightType: c.lightType,
      location: c.location,
      meteredLightCount: c.meteredLightCount,
      representedLightCount: c.representedLightCount,
      wattage: c.wattage,
      preInstallBaseline: c.preInstallBaseline,
      benchmarkSavingsPct: c.benchmarkSavingsPct,
      state: c.state,
      preInstallReadings: c.commissioningReadings
        .filter((r) => r.windowType === "pre_install" && r.status === "valid" && r.consumptionKwh != null)
        .map((r) => ({ date: r.date.toISOString().slice(0, 10), consumptionKwh: r.consumptionKwh! })),
      postInstallReadings: c.commissioningReadings
        .filter((r) => r.windowType === "post_install" && r.status === "valid" && r.consumptionKwh != null)
        .map((r) => ({ date: r.date.toISOString().slice(0, 10), consumptionKwh: r.consumptionKwh! })),
  }));

  const societyLightCount = (pipeline.siteSurvey?.areas ?? []).reduce((s, a) => s + a.count, 0);
  return { pipeline, circuits, societyLightCount };
}

// FEAT-020-AC-1. The spec says generation is automatic on
// `BenchmarkConfirmed`; in practice a deal's circuits confirm one at a time,
// so this is idempotent and safe to call whenever that happens — it refuses
// while any circuit is still commissioning, and does nothing if the current
// figures already match the latest version.
export async function generateDemoReport(pipelineId: string) {
  const session = await requirePer01();
  return generateDemoReportInternal(pipelineId, session.user.id);
}

// 03-features.md's own permission line for FEAT-020 is "PER-01 (view draft),
// **system** (generate)" — so the automatic path fired by BenchmarkConfirmed
// must NOT carry the PER-01 gate: the actor completing that window is PER-04,
// who legitimately cannot issue offers. The exported action above is the
// manual/regeneration path and does check.
export async function generateDemoReportInternal(pipelineId: string, actorId: string | null) {
  const collected = await collectDemoReportInput(pipelineId);
  if (!collected) return { error: "Deal not found." };

  const result = buildDemoReport({
    circuits: collected.circuits,
    societyLightCount: collected.societyLightCount,
  });
  if (!result.ok) {
    logger.warn("demo_report.generation_blocked", { actorId, pipelineId, blocker: result.blocker });
    return { error: BLOCKER_MESSAGE[result.blocker] };
  }

  const latest = await db.demoReport.findFirst({
    where: { pipelineId },
    orderBy: { version: "desc" },
  });

  const f = result.figures;
  // FEAT-020-AC-5 — an existing report is never rewritten in place. A
  // regeneration (e.g. after a verified light-count rescale) is a new
  // version, and the old one stands as the record of what was measured then.
  const report = await db.demoReport.create({
    data: {
      pipelineId,
      version: (latest?.version ?? 0) + 1,
      preInstallBaselineTotal: f.preInstallBaselineTotal,
      postInstallAverageTotal: f.postInstallAverageTotal,
      measuredSavingsPct: f.measuredSavingsPct,
      societyLightCount: f.societyLightCount,
      meteredLightCount: f.meteredLightCount,
      extrapolationFactor: f.extrapolationFactor,
      projectedSavingsKwhPerDay: f.projectedSavingsKwhPerDay,
      circuitSnapshot: f.circuits,
    },
  });

  // 04-flows-system-map.md: the Pipeline reaches `demo-reported` when all
  // circuits are benchmarked, which is exactly the condition just checked.
  if (collected.pipeline.stage === "survey_pending") {
    await db.pipeline.update({ where: { id: pipelineId }, data: { stage: "demo_reported" } });
  }

  logger.info("demo_report.generated", {
    actorId,
    pipelineId,
    version: report.version,
    measuredSavingsPct: f.measuredSavingsPct,
  });
  revalidatePath(`/admin/pipeline/${pipelineId}/report`);
  revalidatePath(`/admin/pipeline/${pipelineId}`);
  return {};
}

// FEAT-020-AC-6 (R0 scope addition, 2026-08-14 — see docs/backlog.yaml).
// The draft is internal-only; sharing is the single act that makes it
// portal-visible, and it records who did it and when.
export async function shareDemoReport(pipelineId: string, reportId: string) {
  const session = await requirePer01();

  const report = await db.demoReport.findUnique({ where: { id: reportId } });
  if (!report || report.pipelineId !== pipelineId) return { error: "Report not found." };
  if (report.status === "shared") return { error: "This report has already been shared." };

  await db.demoReport.update({
    where: { id: reportId },
    data: { status: "shared", sharedAt: new Date(), sharedById: session.user.id },
  });

  logger.info("demo_report.shared", { actorId: session.user.id, pipelineId, reportId, version: report.version });
  revalidatePath(`/admin/pipeline/${pipelineId}/report`);
  revalidatePath("/portal");
  return {};
}
