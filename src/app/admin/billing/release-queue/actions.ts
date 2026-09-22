"use server";

// SCR-092 / CON-47 — the accountant's batch release. A single row still
// releases through `releaseCalculation` (the exact same transaction, same
// refusal checks) — this only adds the layer the spec requires on top:
// nothing here bulk-releases a row that isn't routine, re-checked fresh
// against the database, not against whatever the client happened to render.

import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { requireAccountant } from "../access";
import { computeQueueRow } from "@/lib/release-queue-loader";
import { releaseCalculation } from "../[calculationId]/invoice-actions";

export type BatchReleaseResult = {
  released: string[];
  failed: { calculationId: string; societyName: string; error: string }[];
};

export async function releaseRoutineBatch(calculationIds: string[]): Promise<BatchReleaseResult> {
  const acc = await requireAccountant();
  if (!acc.ok) {
    return { released: [], failed: calculationIds.map((id) => ({ calculationId: id, societyName: "", error: acc.error })) };
  }
  const ids = [...new Set(calculationIds)];
  const released: string[] = [];
  const failed: BatchReleaseResult["failed"] = [];

  for (const id of ids) {
    const row = await computeQueueRow(id);
    if (!row) {
      failed.push({ calculationId: id, societyName: "", error: "This month is no longer awaiting release." });
      continue;
    }
    if (!row.triage.routine) {
      // The refusal SCR-092 exists to guarantee: needs-review is never
      // bulk-releasable, whatever the client's own selection said.
      failed.push({ calculationId: id, societyName: row.societyName, error: `Needs review: ${row.triage.reasons.join(" · ")}` });
      continue;
    }
    const result = await releaseCalculation(id);
    if (result.error) failed.push({ calculationId: id, societyName: row.societyName, error: result.error });
    else released.push(id);
  }

  logger.info("billing.batch_release_completed", {
    actorId: acc.actor.id,
    requested: ids.length,
    released: released.length,
    failed: failed.length,
  });
  revalidatePath("/admin/billing/release-queue");
  revalidatePath("/admin/billing");
  return { released, failed };
}
