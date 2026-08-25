"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import { resolveTuyaConfig, listTuyaDevices, syncTankDevices, type TuyaConfig } from "@/lib/tuya";

/**
 * Assign tanks to a society — the act that makes them visible in that
 * society's portal (INV-05's scoping key), from the list's bulk bar or a
 * tank's own page. societyId null un-assigns.
 */
export async function assignTanks(input: {
  tankIds: string[];
  societyId: string | null;
}): Promise<{ error?: string; assigned?: number }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    logger.warn("tank.assign_refused", { actorId: actor.id, reason: "permission" });
    return { error: "Assigning tanks is a society-management action (Manage users)." };
  }
  if (input.tankIds.length === 0) return { error: "Select at least one tank." };

  if (input.societyId) {
    const society = await db.society.findUnique({ where: { id: input.societyId } });
    if (!society) return { error: "That society no longer exists." };
  }

  // Only level-bearing devices are assignable — an energy meter attached to
  // a society would render as a tank with no water in it, forever.
  const tanks = await db.waterTank.findMany({
    where: { id: { in: input.tankIds } },
    select: { id: true, hasLevelSignal: true, name: true },
  });
  const noSignal = tanks.filter((t) => !t.hasLevelSignal);
  if (noSignal.length > 0) {
    return {
      error: `${noSignal[0].name} has no water-level signal — only tank sensors can be assigned to a society.`,
    };
  }

  const result = await db.waterTank.updateMany({
    where: { id: { in: input.tankIds } },
    data: {
      societyId: input.societyId,
      assignedAt: input.societyId ? new Date() : null,
      assignedById: input.societyId ? actor.id : null,
    },
  });
  logger.info("tank.assigned", {
    actorId: actor.id,
    tankIds: input.tankIds,
    societyId: input.societyId,
    count: result.count,
  });
  revalidatePath("/admin/water-tanks");
  if (input.societyId) revalidatePath(`/admin/societies/${input.societyId}`);
  return { assigned: result.count };
}

/**
 * Save the Tuya credentials and prove them in the same act: a config that
 * never fetched a device list is not saved as "connected". Operations only —
 * this is the account the whole feature reads from.
 */
export async function saveTankApiConfig(input: {
  baseUrl: string;
  accessId: string;
  /** Empty string means "keep the stored secret" on an edit. */
  accessSecret: string;
}): Promise<{ error?: string; devices?: number; tanks?: number }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    logger.warn("tank.config_refused", { actorId: actor.id, actorTeam: actor.team });
    return { error: "The tank API configuration is an operations action." };
  }

  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  const accessId = input.accessId.trim();
  if (!/^https:\/\/openapi\.tuya/.test(baseUrl)) {
    return { error: "The data center URL must be a Tuya OpenAPI endpoint (https://openapi.tuya…)." };
  }
  if (!accessId) return { error: "Access ID is required." };

  let accessSecret = input.accessSecret.trim();
  if (!accessSecret) {
    const existing = await db.tankApiConfig.findUnique({ where: { id: "singleton" } });
    if (!existing) return { error: "Access secret is required." };
    accessSecret = existing.accessSecret;
  }

  // Prove the credentials before storing them as the truth: a bad secret
  // saved silently would kill the half-hourly sampler with nothing on screen.
  const cfg: TuyaConfig = { baseUrl, accessId, accessSecret };
  try {
    await listTuyaDevices(cfg);
  } catch (err) {
    logger.warn("tank.config_test_failed", { actorId: actor.id, error: String(err) });
    return {
      error: `The connection test failed — nothing was saved. ${err instanceof Error ? err.message : "Unknown error."}`,
    };
  }

  await db.tankApiConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", baseUrl, accessId, accessSecret, updatedById: actor.id },
    update: { baseUrl, accessId, accessSecret, updatedById: actor.id },
  });
  const synced = await syncTankDevices(cfg);
  logger.info("tank.config_saved", { actorId: actor.id, devices: synced.devices });
  revalidatePath("/admin/water-tanks");
  revalidatePath("/admin/water-tanks/settings");
  return synced;
}

/** Re-mirror the account on demand, from the settings or list page. */
export async function syncTanksNow(): Promise<{ error?: string; devices?: number; tanks?: number }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    return { error: "Syncing the device list is a society-management action (Manage users)." };
  }
  const cfg = await resolveTuyaConfig();
  if (!cfg) return { error: "The tank API is not configured yet — set it up under API settings." };
  try {
    const synced = await syncTankDevices(cfg);
    logger.info("tank.synced", { actorId: actor.id, ...synced });
    revalidatePath("/admin/water-tanks");
    revalidatePath("/admin/water-tanks/settings");
    return synced;
  } catch (err) {
    await db.tankApiConfig.updateMany({
      where: { id: "singleton" },
      data: { lastError: err instanceof Error ? err.message : String(err) },
    });
    return { error: `Sync failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}
