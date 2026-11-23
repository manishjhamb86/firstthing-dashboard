"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { refuseTankInterval } from "@/lib/tank-sample-interval";
import { logger } from "@/lib/logger";
import { resolveTuyaAccounts, listTuyaDevices, syncTankDevices, type TuyaConfig } from "@/lib/tuya";

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
  /** The account to save: "singleton" (the first), another row's id, or "new" to add one (2026-11-19). */
  accountId?: string;
  label?: string;
  baseUrl: string;
  accessId: string;
  /** Empty string means "keep the stored secret" on an edit. */
  accessSecret: string;
}): Promise<{ error?: string; devices?: number; tanks?: number; accountId?: string }> {
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

  const accountCount = await db.tankApiConfig.count();
  // The first account is always "singleton" (it also carries the alert thresholds).
  const accountId = input.accountId === "new" || !input.accountId ? (accountCount === 0 ? "singleton" : `acct-${Date.now().toString(36)}`) : input.accountId;
  const label = input.label?.trim() || null;
  const isNew = input.accountId === "new" || !(await db.tankApiConfig.findUnique({ where: { id: accountId }, select: { id: true } }));

  // The same project twice would list every device twice and fight over which account each belongs to.
  const sameProject = await db.tankApiConfig.findFirst({ where: { accessId, id: { not: accountId } }, select: { label: true, id: true } });
  if (sameProject) return { error: `That Access ID is already saved as ${sameProject.label ? `"${sameProject.label}"` : sameProject.id === "singleton" ? "the first account" : "another account"}.` };

  let accessSecret = input.accessSecret.trim();
  if (!accessSecret) {
    const existing = isNew ? null : await db.tankApiConfig.findUnique({ where: { id: accountId } });
    if (!existing) return { error: "Access secret is required." };
    accessSecret = existing.accessSecret;
  }

  // Prove the credentials before storing them as the truth: a bad secret
  // saved silently would kill the level sampler with nothing on screen.
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
    where: { id: accountId },
    create: { id: accountId, label, baseUrl, accessId, accessSecret, updatedById: actor.id },
    update: { label, baseUrl, accessId, accessSecret, updatedById: actor.id },
  });
  const synced = await syncTankDevices(cfg, accountId);
  logger.info("tank.config_saved", { actorId: actor.id, accountId, created: isNew, devices: synced.devices });
  revalidatePath("/admin/water-tanks");
  revalidatePath("/admin/water-tanks/settings");
  return { ...synced, accountId };
}

/**
 * Remove a further Tuya account (2026-11-19). The first account stays — it
 * carries the alert thresholds — so it is replaced by editing, never removed.
 * Its tanks stay listed with their history; they are simply not refreshed
 * until an account that lists them is saved again.
 */
export async function removeTankApiAccount(accountId: string): Promise<{ error?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    logger.warn("tank.account_remove_refused", { actorId: actor.id, accountId });
    return { error: "The tank API configuration is an operations action." };
  }
  if (accountId === "singleton") return { error: "The first account cannot be removed — edit its credentials instead." };
  const row = await db.tankApiConfig.findUnique({ where: { id: accountId }, select: { id: true } });
  if (!row) return {};
  await db.tankApiConfig.delete({ where: { id: accountId } });
  logger.info("tank.account_removed", { actorId: actor.id, accountId });
  revalidatePath("/admin/water-tanks");
  revalidatePath("/admin/water-tanks/settings");
  return {};
}

/**
 * The alert thresholds (2026-10-14, user-asked): a tank at or below "low" is
 * critically low, at or above "high" is critically high / overflow risk —
 * tunable without a redeploy, same reason TankApiConfig already lives here.
 * Separate save from the credentials above: this never tests a connection,
 * it just stores two numbers, and conflating the two save semantics would
 * make a bad threshold look like a connection failure.
 */
export async function saveTankAlertThresholds(input: { lowPct: number; highPct: number }): Promise<{ error?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    logger.warn("tank.thresholds_refused", { actorId: actor.id, actorTeam: actor.team });
    return { error: "Alert thresholds are an operations action." };
  }
  const low = Math.round(input.lowPct);
  const high = Math.round(input.highPct);
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high > 100 || low >= high) {
    return { error: "The low threshold must be below the high threshold, and both between 0 and 100." };
  }
  const existing = await db.tankApiConfig.findUnique({ where: { id: "singleton" } });
  if (!existing) return { error: "Set up the API connection first — there is nothing to tune thresholds on yet." };
  await db.tankApiConfig.update({ where: { id: "singleton" }, data: { lowLevelPct: low, highLevelPct: high, updatedById: actor.id } });
  logger.info("tank.thresholds_saved", { actorId: actor.id, low, high });
  revalidatePath("/admin/water-tanks/settings");
  return {};
}

/**
 * How often every tank's level is read (2026-11-23, user-asked: 10 minutes,
 * configurable). The worker reads it on each reschedule; a pending pass
 * further away than the new interval is brought forward so a shorter
 * interval takes effect now rather than after the old wait.
 */
export async function saveTankSampleInterval(minutes: number): Promise<{ error?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    logger.warn("tank.sample_interval_refused", { actorId: actor.id, actorTeam: actor.team });
    return { error: "The sampling interval is an operations action." };
  }
  const refusal = refuseTankInterval(minutes);
  if (refusal) return { error: refusal };
  const existing = await db.tankApiConfig.findUnique({ where: { id: "singleton" }, select: { sampleIntervalMinutes: true } });
  if (!existing) return { error: "Set up the API connection first — there is nothing to sample yet." };
  const soonest = new Date(Date.now() + minutes * 60_000);
  await db.$transaction([
    db.tankApiConfig.update({ where: { id: "singleton" }, data: { sampleIntervalMinutes: minutes, updatedById: actor.id } }),
    db.job.updateMany({ where: { type: "tank_level_sample", status: "pending", runAt: { gt: soonest } }, data: { runAt: soonest } }),
  ]);
  logger.info("tank.sample_interval_saved", { actorId: actor.id, from: existing.sampleIntervalMinutes, to: minutes });
  revalidatePath("/admin/water-tanks/settings");
  return {};
}

/** Re-mirror the account on demand, from the settings or list page. */
export async function syncTanksNow(): Promise<{ error?: string; devices?: number; tanks?: number }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    return { error: "Syncing the device list is a society-management action (Manage users)." };
  }
  const accounts = await resolveTuyaAccounts();
  if (accounts.length === 0) return { error: "The tank API is not configured yet — set it up under API settings." };
  // Every account; one failing is recorded on its row and named, the rest still sync.
  const total = { devices: 0, tanks: 0 };
  const failed: string[] = [];
  for (const acct of accounts) {
    try {
      const r = await syncTankDevices(acct, acct.id);
      total.devices += r.devices;
      total.tanks += r.tanks;
    } catch (err) {
      failed.push(`${acct.label ?? (acct.id === "singleton" ? "First account" : acct.id)}: ${err instanceof Error ? err.message : "unknown error"}`);
      await db.tankApiConfig.updateMany({ where: { id: acct.id }, data: { lastError: err instanceof Error ? err.message : String(err) } });
    }
  }
  logger.info("tank.synced", { actorId: actor.id, ...total, failed: failed.length });
  revalidatePath("/admin/water-tanks");
  revalidatePath("/admin/water-tanks/settings");
  if (failed.length === accounts.length) return { error: `Sync failed — ${failed.join("; ")}` };
  return failed.length ? { ...total, error: `Some accounts failed — ${failed.join("; ")}` } : total;
}

/**
 * Classify what a tank supplies — Domestic / Flush / STP — so the portal can
 * group it the way a resident thinks about supply (customer portal,
 * 2026-08-29). Operations-gated like assignment: it changes what a society
 * is shown about its own water.
 */
export async function setTankSetup(input: {
  tankId: string;
  setup: "domestic" | "flush" | "stp" | null;
}): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_users")) {
    logger.warn("tank.setup_refused", { tankId: input.tankId, actorId: admin.id, reason: "permission" });
    return { error: "Classifying tanks is a society-management action (Manage users)." };
  }
  if (input.setup !== null && !["domestic", "flush", "stp"].includes(input.setup)) {
    return { error: "That is not a tank setup." };
  }
  await db.waterTank.update({
    where: { id: input.tankId },
    data: { setupType: input.setup },
  });
  logger.info("tank.setup_set", { tankId: input.tankId, setup: input.setup, actorId: admin.id });
  revalidatePath("/admin/water-tanks");
  return {};
}

/**
 * Name which tower or building a tank serves — "Tower D", "Block B" — so
 * the portal can group tanks the way a resident actually navigates a
 * multi-tower complex, within each setup-type group. Same gate and shape
 * as setTankSetup; a free label rather than an enum because building names
 * vary by society and there is no fixed set to choose from.
 */
export async function setTankLocation(input: {
  tankId: string;
  location: string;
}): Promise<{ error?: string }> {
  const admin = await resolveAdmin();
  if (!admin) return { error: "Your session is no longer valid. Sign in again." };
  if (!admin.permissions.includes("manage_users")) {
    logger.warn("tank.location_refused", {
      tankId: input.tankId,
      actorId: admin.id,
      reason: "permission",
    });
    return { error: "Labelling tanks is a society-management action (Manage users)." };
  }
  const location = input.location.trim();
  await db.waterTank.update({
    where: { id: input.tankId },
    data: { location: location === "" ? null : location },
  });
  logger.info("tank.location_set", { tankId: input.tankId, location, actorId: admin.id });
  revalidatePath("/admin/water-tanks");
  revalidatePath(`/admin/water-tanks/${input.tankId}`);
  return {};
}

/**
 * The tank page's one save (2026-09-15, user-caught: "assign button should
 * be after all the fields shown and all the values should save on
 * assign/submit button click"). Society, setup and tower/building were
 * three separate actions firing on three separate controls — a form that
 * saved on blur and a button sitting between fields. One act, one
 * transaction, one gate; the same checks as the three it replaces.
 */
export async function saveTankAssignment(input: {
  tankId: string;
  societyId: string | null;
  setup: "domestic" | "flush" | "stp" | null;
  location: string;
}): Promise<{ error?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    logger.warn("tank.assign_refused", { actorId: actor.id, tankId: input.tankId, reason: "permission" });
    return { error: "Assigning tanks is a society-management action (Manage users)." };
  }
  if (input.setup !== null && !["domestic", "flush", "stp"].includes(input.setup)) {
    return { error: "That is not a tank setup." };
  }
  const tank = await db.waterTank.findUnique({
    where: { id: input.tankId },
    select: { id: true, hasLevelSignal: true, name: true, societyId: true },
  });
  if (!tank) return { error: "That device no longer exists." };
  if (input.societyId && !tank.hasLevelSignal) {
    return { error: `${tank.name} has no water-level signal — only tank sensors can be assigned to a society.` };
  }
  if (input.societyId) {
    const society = await db.society.findUnique({ where: { id: input.societyId }, select: { id: true } });
    if (!society) return { error: "That society no longer exists." };
  }
  const location = input.location.trim();
  const societyChanged = input.societyId !== tank.societyId;
  await db.waterTank.update({
    where: { id: tank.id },
    data: {
      societyId: input.societyId,
      ...(societyChanged
        ? { assignedAt: input.societyId ? new Date() : null, assignedById: input.societyId ? actor.id : null }
        : {}),
      setupType: input.setup,
      location: location === "" ? null : location,
    },
  });
  logger.info("tank.assignment_saved", {
    actorId: actor.id,
    tankId: tank.id,
    societyId: input.societyId,
    societyChanged,
    setup: input.setup,
    location,
  });
  revalidatePath("/admin/water-tanks");
  revalidatePath(`/admin/water-tanks/${tank.id}`);
  if (input.societyId) revalidatePath(`/admin/societies/${input.societyId}`);
  if (tank.societyId && tank.societyId !== input.societyId) revalidatePath(`/admin/societies/${tank.societyId}`);
  return {};
}
