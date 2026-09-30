// What the close/reject dialog previews, read from the database (server only).

import { db } from "@/lib/db";
import { dealLabel } from "@/lib/deal-scope";
import { describePlan, planClose, refuseReopen } from "@/lib/deal-close";

export async function closePreview(where: { societyId: string } | { id: string }, today: Date) {
  const deals = await db.pipeline.findMany({
    where,
    select: { id: true, societyId: true, serviceLine: true, dealScope: true, stage: true, contract: { select: { id: true, status: true } } },
  });
  const plan = planClose(deals.map((d) => ({ id: d.id, label: dealLabel(d.serviceLine, d.dealScope), stage: d.stage, contract: d.contract })));
  const hasContract = plan.some((p) => p.action === "terminate");
  const societyIds = [...new Set(deals.map((d) => d.societyId))];
  const unpaidInvoices = hasContract
    ? await db.billingInvoice.count({
        where: { voidedAt: null, releasedAt: { not: null }, status: { not: "paid" }, calculation: { societyId: { in: societyIds } } },
      })
    : 0;
  return {
    planLines: plan.length > 0 ? plan.map((p) => describePlan(p, today)) : ["No deal is on record — only the society is marked rejected."],
    hasContract,
    unpaidInvoices,
  };
}

/** Why a closed deal cannot be reopened, reading its contract's released
 *  months — exported so a page can decide *before* rendering the button
 *  whether reopening will actually work, rather than the operator finding
 *  out by clicking a control that can only ever refuse (user-reported dead
 *  end, 2026-09-30: a deal page offering Reopen when the whole society was
 *  rejected, then a society page offering Reopen when one of its own deals
 *  had a released month past its termination — "don't offer what can only
 *  refuse", the rule this codebase already applies to exclusion controls). */
export async function reopenRefusal(pipelineId: string): Promise<string | null> {
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

/** Why a rejected society cannot be reopened as a whole — the first blocker
 *  among the deals its own rejection closed (the same set reopenSociety()
 *  itself reopens, matched by the closing instant). Null once every one of
 *  them is free to reopen. */
export async function societyReopenBlocker(societyId: string, closedAt: Date | null): Promise<string | null> {
  if (!closedAt) return null;
  const closedByIt = await db.pipeline.findMany({
    where: { societyId, stage: "closed_lost", closedLostAt: { gte: new Date(closedAt.getTime() - 60_000) } },
    select: { id: true },
  });
  for (const d of closedByIt) {
    const refusal = await reopenRefusal(d.id);
    if (refusal) return refusal;
  }
  return null;
}
