"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { resolveAdmin } from "@/lib/admin-permissions";
import { demoModeAvailable } from "@/lib/demo-mode";

/**
 * Turns this admin's own demo switch on or off.
 *
 * The env var is still the master gate and is re-checked here, not just in
 * the component that renders the toggle: a hidden control is not a
 * permission, and an action reachable by id has to refuse on its own.
 */
export async function setDemoMode(on: boolean): Promise<{ error?: string }> {
  if (!demoModeAvailable()) {
    return { error: "Demo mode is not enabled on this environment." };
  }
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid." };

  await db.adminUser.update({ where: { id: admin.id }, data: { demoMode: on } });
  logger.warn("demo.mode_toggled", { actorId: admin.id, email: admin.email, on });
  revalidatePath("/", "layout");
  return {};
}
