import { db } from "@/lib/db";
import { circuitLabelOf } from "@/lib/meter-view";
import type { RemainingLine } from "@/lib/demo-replacement-followup";

export type PortalFollowUpRow = {
  id: string;
  circuitLabel: string;
  remainingTotal: number;
  reason: string;
  raisedAt: string;
};

/**
 * The society's own "finish these lights yourselves" handoffs still open
 * (2026-10-06) — scoped by societyId alone (INV-05), same as every other
 * portal query.
 */
export async function openReplacementFollowUps(societyId: string): Promise<PortalFollowUpRow[]> {
  const rows = await db.demoReplacementFollowUp.findMany({
    where: { societyId, plan: "society_completes", completedAt: null, voidedAt: null },
    orderBy: { raisedAt: "asc" },
    select: { id: true, reason: true, remaining: true, raisedAt: true, circuit: { select: { location: true, lightType: true } } },
  });
  return rows.map((r) => {
    const remaining = (r.remaining as unknown as RemainingLine[] | null) ?? [];
    return {
      id: r.id,
      circuitLabel: circuitLabelOf(r.circuit.location, r.circuit.lightType),
      remainingTotal: remaining.reduce((n, l) => n + l.remainingCount, 0),
      reason: r.reason,
      raisedAt: r.raisedAt.toISOString(),
    };
  });
}
