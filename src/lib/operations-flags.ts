import { db } from "@/lib/db";

/**
 * Temporary, admin-toggleable switches (2026-10-12, user-asked) — for a
 * capability built to fix one specific batch of data and meant to be
 * switched off again once that is done, without a redeploy either way. No
 * row yet reads as the default ON, same as the column's own default: the
 * flag ships already enabled for the cleanup it exists for.
 */
export async function liveDemoCountCorrectionAllowed(): Promise<boolean> {
  const row = await db.operationsFlag.findUnique({ where: { id: "singleton" }, select: { allowLiveDemoCountCorrection: true } });
  return row?.allowLiveDemoCountCorrection ?? true;
}
