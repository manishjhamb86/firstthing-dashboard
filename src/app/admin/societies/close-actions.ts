"use server";

// Reject a society, close one deal, terminate a contract — and undo it
// (2026-09-25, user-asked). The rules live in src/lib/deal-close.ts; these
// are thin DB/logging shells around them. Operations only (the PER-01 proxy:
// both manage_pipeline and manage_survey), typed { error } on refusal.

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { dealLabel } from "@/lib/deal-scope";
import { planClose, refuseClose, refuseReopen, type ClosingDeal } from "@/lib/deal-close";

type Result = { error?: string; done?: string };

async function requireOps() {
  const admin = await resolveAdmin();
  if (!admin) return null;
  return admin.permissions.includes("manage_pipeline") && admin.permissions.includes("manage_survey") ? admin : null;
}

function parseDay(s: string): Date | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null;
}

async function closingDeals(where: { societyId: string } | { id: string }): Promise<ClosingDeal[]> {
  const deals = await db.pipeline.findMany({
    where,
    select: { id: true, serviceLine: true, dealScope: true, stage: true, contract: { select: { id: true, status: true } } },
  });
  return deals.map((d) => ({ id: d.id, label: dealLabel(d.serviceLine, d.dealScope), stage: d.stage, contract: d.contract }));
}

/** Apply a close plan in one transaction. */
async function applyClose(deals: ClosingDeal[], reason: string, lastServedDay: Date, actorId: string) {
  const now = new Date();
  const plan = planClose(deals);
  const writes = plan.flatMap((p) => {
    if (p.action === "already_closed") return [];
    const deal = deals.find((d) => d.id === p.dealId)!;
    const ops = [
      db.pipeline.update({
        where: { id: p.dealId },
        data: {
          stage: "closed_lost",
          closedLostStage: deal.stage as never,
          closedLostAt: now,
          closedLostById: actorId,
          closedLostReason: reason,
        },
      }),
    ];
    if (p.action === "terminate" && deal.contract) {
      ops.push(
        db.contract.update({
          where: { id: deal.contract.id },
          data: { status: "terminated", terminatedOn: lastServedDay, terminatedAt: now, terminatedById: actorId, terminationReason: reason },
        }) as never,
      );
    }
    return ops;
  });
  await db.$transaction(writes);
  return plan;
}

/** Close one deal — before or after the demo, or with its contract terminated. */
export async function closeDeal(pipelineId: string, reason: string, lastServedDayIso: string): Promise<Result> {
  const admin = await requireOps();
  if (!admin) {
    logger.warn("deal.close_refused", { pipelineId, why: "not_operations" });
    return { error: "Closing a deal is an operations action." };
  }
  const lastServedDay = parseDay(lastServedDayIso);
  const refusal = refuseClose({ reason, lastServedDay, now: new Date() });
  if (refusal) {
    logger.warn("deal.close_refused", { pipelineId, actorId: admin.id, why: refusal });
    return { error: refusal };
  }
  const deals = await closingDeals({ id: pipelineId });
  if (deals.length === 0) return { error: "That deal no longer exists." };
  if (deals[0].stage === "closed_lost") return { error: "This deal is already closed." };
  const [p] = await applyClose(deals, reason.trim(), lastServedDay!, admin.id);
  logger.info("deal.closed", { pipelineId, actorId: admin.id, action: p.action, reason: reason.trim(), lastServedDay: lastServedDayIso });
  const society = await db.pipeline.findUnique({ where: { id: pipelineId }, select: { societyId: true } });
  revalidatePath(`/admin/pipeline/${pipelineId}`);
  if (society) revalidatePath(`/admin/societies/${society.societyId}`);
  return { done: p.action === "terminate" ? "Deal closed and its contract terminated." : "Deal closed as lost." };
}

/** Reject / terminate the society: every open deal closed, every running contract terminated. */
export async function rejectSociety(societyId: string, reason: string, lastServedDayIso: string): Promise<Result> {
  const admin = await requireOps();
  if (!admin) {
    logger.warn("society.reject_refused", { societyId, why: "not_operations" });
    return { error: "Rejecting a society is an operations action." };
  }
  const lastServedDay = parseDay(lastServedDayIso);
  const refusal = refuseClose({ reason, lastServedDay, now: new Date() });
  if (refusal) {
    logger.warn("society.reject_refused", { societyId, actorId: admin.id, why: refusal });
    return { error: refusal };
  }
  const society = await db.society.findUnique({ where: { id: societyId }, select: { status: true, closedAt: true } });
  if (!society) return { error: "That society no longer exists." };
  if (society.closedAt) return { error: "This society is already rejected." };
  const plan = await applyClose(await closingDeals({ societyId }), reason.trim(), lastServedDay!, admin.id);
  await db.society.update({
    where: { id: societyId },
    data: { status: "terminated", closedAt: new Date(), closedById: admin.id, closedReason: reason.trim() },
  });
  logger.info("society.rejected", {
    societyId,
    actorId: admin.id,
    reason: reason.trim(),
    lastServedDay: lastServedDayIso,
    closed: plan.filter((p) => p.action === "close").length,
    terminated: plan.filter((p) => p.action === "terminate").length,
  });
  revalidatePath(`/admin/societies/${societyId}`);
  revalidatePath("/admin/societies");
  return { done: "Society rejected." };
}

/** Why a deal cannot be reopened, reading its contract's released months. */
async function reopenRefusal(pipelineId: string): Promise<string | null> {
  const deal = await db.pipeline.findUnique({
    where: { id: pipelineId },
    select: { societyId: true, serviceLine: true, contract: { select: { terminatedOn: true } } },
  });
  if (!deal?.contract?.terminatedOn) return null;
  const released = await db.monthlyCalculation.findMany({
    where: { societyId: deal.societyId, serviceLine: deal.serviceLine, status: "released" },
    select: { period: true },
  });
  return refuseReopen({ terminatedOn: deal.contract.terminatedOn, releasedPeriods: released.map((r) => r.period) });
}

async function reopenOne(pipelineId: string) {
  const deal = await db.pipeline.findUnique({ where: { id: pipelineId }, select: { closedLostStage: true, contract: { select: { id: true, activatedAt: true } } } });
  if (!deal) return;
  await db.$transaction([
    db.pipeline.update({
      where: { id: pipelineId },
      // A deal closed before this record existed has no stage kept; it
      // reopens as a lead, the earliest honest place to resume.
      data: { stage: deal.closedLostStage ?? "lead", closedLostStage: null, closedLostAt: null, closedLostById: null, closedLostReason: null },
    }),
    ...(deal.contract
      ? [
          db.contract.update({
            where: { id: deal.contract.id },
            data: { status: deal.contract.activatedAt ? "active" : "draft", terminatedOn: null, terminatedAt: null, terminatedById: null, terminationReason: null },
          }),
        ]
      : []),
  ]);
}

export async function reopenDeal(pipelineId: string): Promise<Result> {
  const admin = await requireOps();
  if (!admin) return { error: "Reopening a deal is an operations action." };
  const deal = await db.pipeline.findUnique({ where: { id: pipelineId }, select: { stage: true, societyId: true, society: { select: { closedAt: true } } } });
  if (!deal || deal.stage !== "closed_lost") return { error: "This deal is not closed." };
  if (deal.society.closedAt) return { error: "The whole society is rejected — reopen the society instead." };
  const refusal = await reopenRefusal(pipelineId);
  if (refusal) return { error: refusal };
  await reopenOne(pipelineId);
  logger.info("deal.reopened", { pipelineId, actorId: admin.id });
  revalidatePath(`/admin/pipeline/${pipelineId}`);
  revalidatePath(`/admin/societies/${deal.societyId}`);
  return { done: "Deal reopened." };
}

/** Undo a rejection: the deals it closed reopen; deals closed separately stay closed. */
export async function reopenSociety(societyId: string): Promise<Result> {
  const admin = await requireOps();
  if (!admin) return { error: "Reopening a society is an operations action." };
  const society = await db.society.findUnique({ where: { id: societyId }, select: { closedAt: true } });
  if (!society?.closedAt) return { error: "This society is not rejected." };
  // Only the deals this rejection closed — same instant, same act.
  const closedByIt = await db.pipeline.findMany({
    where: { societyId, stage: "closed_lost", closedLostAt: society.closedAt ? { gte: new Date(society.closedAt.getTime() - 60_000) } : undefined },
    select: { id: true },
  });
  for (const d of closedByIt) {
    const refusal = await reopenRefusal(d.id);
    if (refusal) return { error: refusal };
  }
  for (const d of closedByIt) await reopenOne(d.id);
  const running = await db.contract.count({ where: { societyId, status: "active" } });
  await db.society.update({
    where: { id: societyId },
    data: { status: running > 0 ? "active" : "prospect", closedAt: null, closedById: null, closedReason: null },
  });
  logger.info("society.reopened", { societyId, actorId: admin.id, dealsReopened: closedByIt.length });
  revalidatePath(`/admin/societies/${societyId}`);
  revalidatePath("/admin/societies");
  return { done: "Society reopened." };
}
