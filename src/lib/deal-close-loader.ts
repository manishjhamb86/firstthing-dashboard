// What the close/reject dialog previews, read from the database (server only).

import { db } from "@/lib/db";
import { dealLabel } from "@/lib/deal-scope";
import { describePlan, planClose } from "@/lib/deal-close";

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
