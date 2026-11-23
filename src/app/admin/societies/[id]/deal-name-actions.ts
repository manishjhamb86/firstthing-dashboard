"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isSuperAdmin } from "@/lib/super-admin";
import { logger } from "@/lib/logger";
import { renameDealAndCircuit } from "@/lib/circuit-name";

/**
 * Rename a deal from the society page's Service lines card (2026-11-23,
 * user-asked, for the yogesh account only). The card names a deal by its demo
 * circuit, so the name is written to both: the circuit's own name (what the
 * survey shows) and the deal's scope (what every other screen shows). A deal
 * with several circuits is renamed circuit by circuit on its survey instead;
 * a deal with none has only its scope. Two deals of one line at a society
 * must stay tellable apart, so a name another one already uses is refused.
 */
export async function renameDeal(pipelineId: string, name: string): Promise<{ error?: string }> {
  const actor = await resolveAdmin();
  if (!actor || !isSuperAdmin(actor.email)) {
    logger.warn("pipeline.rename_refused", { actorId: actor?.id ?? null, pipelineId, reason: "not_super_admin" });
    return { error: "Renaming a deal here is limited to the main admin account." };
  }
  const deal = await db.pipeline.findUnique({ where: { id: pipelineId }, select: { id: true, societyId: true, dealScope: true } });
  if (!deal) return { error: "That deal is no longer on record." };
  const refusal = await db.$transaction((tx) => renameDealAndCircuit(tx, pipelineId, name));
  if (refusal) return { error: refusal };
  const next = name.trim().replace(/\s+/g, " ");
  logger.info("pipeline.renamed", { actorId: actor.id, pipelineId: deal.id, from: deal.dealScope, to: next, via: "society_card" });
  revalidatePath(`/admin/societies/${deal.societyId}`);
  revalidatePath(`/admin/pipeline/${deal.id}`);
  revalidatePath(`/admin/pipeline/${deal.id}/survey`);
  revalidatePath(`/admin/societies/${deal.societyId}/circuits`);
  return {};
}
