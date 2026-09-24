"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { buildMonthlySnapshot, loadCircuitReport, sameSnapshot, type SavingsReportSnapshot } from "../report-data";

type Result = { error: string } | { version: number };

/**
 * Publish this circuit's monthly savings report to the society's portal
 * (user-asked 2026-09-24). The report is frozen as a snapshot, so what the
 * society downloads is exactly what was published. Re-publishing an
 * unchanged report is refused — nothing would change for the reader; a
 * report whose figures moved (a corrected reading, a month released for
 * billing since) becomes the next version, and the previous one is kept.
 */
export async function publishSavingsReport(circuitId: string, month: string): Promise<Result> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_pipeline")) {
    logger.warn("savings_report.publish_refused", { actorId: actor.id, circuitId, month, reason: "permission" });
    return { error: "Publishing to a society is a pipeline action (Manage pipeline)." };
  }
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: "Choose a month first." };

  const report = await loadCircuitReport(circuitId);
  if (!report) return { error: "That circuit has no report yet." };
  const snapshot = await buildMonthlySnapshot(report, month);
  if (snapshot.days.filter((d) => !d.excluded).length === 0) {
    logger.warn("savings_report.publish_refused", { actorId: actor.id, circuitId, month, reason: "no_days" });
    return { error: "This month has no counted days — there is nothing to publish." };
  }

  const latest = await db.publishedSavingsReport.findFirst({
    where: { circuitId, period: month, voidedAt: null },
    orderBy: { version: "desc" },
    select: { version: true, snapshot: true },
  });
  if (latest && sameSnapshot(latest.snapshot as unknown as SavingsReportSnapshot, snapshot)) {
    return { error: `Already published as version ${latest.version} — nothing has changed since.` };
  }

  // Numbers count past withdrawn versions, so a number is never reused.
  const last = await db.publishedSavingsReport.findFirst({
    where: { circuitId, period: month },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const version = (last?.version ?? 0) + 1;
  await db.publishedSavingsReport.create({
    data: {
      societyId: report.society.id,
      circuitId,
      period: month,
      version,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      publishedById: actor.id,
    },
  });
  logger.info("savings_report.published", { actorId: actor.id, circuitId, month, version, withRupees: snapshot.fee !== null });
  revalidatePath(`/admin/societies/${report.society.id}/circuits/${circuitId}/reports/monthly`);
  revalidatePath("/portal/documents");
  return { version };
}
