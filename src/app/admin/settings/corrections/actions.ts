"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";

function isOps(permissions: string[]): boolean {
  return permissions.includes("manage_survey") && permissions.includes("manage_pipeline");
}

/**
 * The one toggle this page offers (2026-10-12, user-asked): whether a demo's
 * historical light count can be corrected outside demo mode. Same gate as
 * the capability itself (`setDemoLightCount`'s own `actor("ops")`), so
 * turning it off is exactly as privileged as using it.
 */
export async function setLiveDemoCountCorrectionAllowed(allowed: boolean): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOps(admin.permissions as string[])) {
    logger.warn("operations_flag.set_refused", { actorId: admin.id, flag: "allowLiveDemoCountCorrection" });
    return { error: "Changing this is an operations lead action." };
  }
  await db.operationsFlag.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", allowLiveDemoCountCorrection: allowed, updatedById: admin.id },
    update: { allowLiveDemoCountCorrection: allowed, updatedById: admin.id },
  });
  logger.info("operations_flag.set", { actorId: admin.id, flag: "allowLiveDemoCountCorrection", value: allowed });
  revalidatePath("/admin/settings/corrections");
  return {};
}
