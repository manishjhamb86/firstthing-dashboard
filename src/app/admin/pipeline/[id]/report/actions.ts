"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-permissions";
import { logger } from "@/lib/logger";
import {
  BLOCKER_MESSAGE,
  buildDemoReport,
  resolveSocietyLightCount,
  type DemoReportCircuitInput,
} from "@/lib/demo-report";
import { circuitDailyFromDemos } from "@/lib/demo-readings-series";
import { deriveCircuitFigures } from "@/lib/circuit-demos";
import type { AcceptanceDay } from "@/lib/demo-acceptance";

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
            include: {
              demos: {
                where: { voidedAt: null },
                orderBy: { sequence: "asc" },
                include: { acceptances: { orderBy: { version: "desc" } } },
              },
            },
          },
        },
      },
    },
  });
  if (!pipeline) return null;

  const demoIds: string[] = [];
  const circuits: DemoReportCircuitInput[] = (pipeline.siteSurvey?.circuits ?? []).map((c) => {
    // The report is built from what each demo's reviewer ACCEPTED (2026-09-26):
    // the day sets frozen by "Accept these N days", nothing else. A demo that
    // is rejected, or not yet accepted after replacement, takes no part.
    // Latest version per phase (ordered newest first); an empty one is a withdrawal.
    const latest = (d: (typeof c.demos)[number], phase: "pre" | "post") => {
      const a = d.acceptances.find((x) => x.phase === phase);
      return a && a.averageKwh !== null ? a : null;
    };
    const counted = c.demos.filter((d) => !d.rejected && latest(d, "pre") && latest(d, "post"));
    for (const d of counted) demoIds.push(d.id);
    const accepted = (d: (typeof counted)[number], phase: "pre" | "post") =>
      ((latest(d, phase)?.days ?? []) as AcceptanceDay[])
        .filter((x) => !x.excluded)
        .map((x) => ({ date: x.date, kWh: x.kWh, phase }));
    const series = circuitDailyFromDemos(counted.map((d) => ({ rejected: false, readings: [...accepted(d, "pre"), ...accepted(d, "post")] })));
    const figures = deriveCircuitFigures(
      counted.map((d) => ({
        id: d.id,
        sequence: d.sequence,
        rejected: false,
        voided: false,
        combine: d.combine,
        meteredLightCount: d.meteredLightCount,
        preAverage: latest(d, "pre")?.averageKwh ?? null,
        postAverage: latest(d, "post")?.averageKwh ?? null,
      })),
    );
    return {
      id: c.id,
      lightType: c.lightType,
      location: c.location,
      // The lights the demos measured — the before and after figures are
      // theirs, so the extrapolation must divide by the same count. A later
      // light-count change on the circuit (French Apartment: 55 -> 76 from
      // 01-08-2026) does not reach back into a demo run before it.
      meteredLightCount: counted.length > 0 && (figures.meteredLightCount ?? 0) > 0 ? figures.meteredLightCount! : c.meteredLightCount,
      representedLightCount: c.representedLightCount,
      wattage: c.wattage,
      preInstallBaseline: counted.length > 0 ? figures.baseline : c.preInstallBaseline,
      postInstallAverage: counted.length > 0 ? figures.postAverage : null,
      benchmarkSavingsPct: c.benchmarkSavingsPct,
      state: counted.length > 0 || c.state === "ineligible" || c.state === "retired" ? c.state : "eligible",
      preInstallReadings: series.pre.map((r) => ({ date: r.date, consumptionKwh: r.kWh })),
      postInstallReadings: series.post.map((r) => ({ date: r.date, consumptionKwh: r.kWh })),
    };
  });

  const resolved = resolveSocietyLightCount({
    inventoryTotal: (pipeline.siteSurvey?.areas ?? []).reduce((s, a) => s + a.count, 0),
    circuits,
  });
  return {
    pipeline,
    circuits,
    demoIds,
    societyLightCount: resolved.count,
    lightCountSource: resolved.source,
  };
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
      // Which demos this version rests on — sharing it locks them.
      demoIds: collected.demoIds,
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
