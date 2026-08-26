"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import { authorizeUrl, EWELINK_STATE_COOKIE } from "@/lib/ewelink-sign";
import { resolveEwelinkConfig, syncMeterDevices, EwelinkNeedsAuthorisation } from "@/lib/ewelink";

/**
 * Save the eWeLink application credentials. Unlike the Tuya settings, this
 * cannot prove itself on save: eWeLink issues no token without a human
 * signing in to the account first, so saving and authorising are two acts
 * and the screen says which one is still outstanding.
 */
export async function saveEwelinkConfig(input: {
  region: string;
  appId: string;
  /** Empty means "keep the stored secret" on an edit. */
  appSecret: string;
  redirectUrl: string;
}): Promise<{ error?: string; saved?: true }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    logger.warn("ewelink.config_refused", { actorId: actor.id, actorTeam: actor.team });
    return { error: "The meter API configuration is an operations action." };
  }

  const region = input.region.trim().toLowerCase();
  if (!["as", "us", "eu", "cn"].includes(region)) return { error: "Region must be one of as, us, eu or cn." };
  const appId = input.appId.trim();
  if (!appId) return { error: "App ID is required." };
  const redirectUrl = input.redirectUrl.trim();
  if (!/^https?:\/\/.+/.test(redirectUrl)) {
    return { error: "The redirect URL must be a full URL, and must match the one registered against the app." };
  }

  let appSecret = input.appSecret.trim();
  if (!appSecret) {
    const existing = await db.ewelinkApiConfig.findUnique({ where: { id: "singleton" } });
    if (!existing) return { error: "App secret is required." };
    appSecret = existing.appSecret;
  }

  // Changing the application invalidates whoever was authorised under the
  // old one, so the tokens go with it rather than lingering as a session
  // nobody can explain.
  const prior = await db.ewelinkApiConfig.findUnique({ where: { id: "singleton" } });
  const appChanged = prior ? prior.appId !== appId || prior.appSecret !== appSecret || prior.region !== region : false;

  await db.ewelinkApiConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", region, appId, appSecret, redirectUrl, updatedById: actor.id },
    update: {
      region,
      appId,
      appSecret,
      redirectUrl,
      updatedById: actor.id,
      ...(appChanged
        ? {
            accessToken: null,
            accessTokenExpiresAt: null,
            refreshToken: null,
            refreshTokenExpiresAt: null,
            accountLabel: null,
          }
        : {}),
    },
  });
  logger.info("ewelink.config_saved", { actorId: actor.id, region, appChanged });
  revalidatePath("/admin/meters/settings");
  return { saved: true };
}

/**
 * Start the consent flow. Returns the URL for the browser to visit — the
 * operator signs in to the eWeLink account there, not here, so this app
 * never sees their eWeLink password.
 */
export async function beginEwelinkAuthorisation(): Promise<{ error?: string; url?: string }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!isOperations(actor.team)) {
    return { error: "Authorising the meter account is an operations action." };
  }
  const cfg = await resolveEwelinkConfig();
  if (!cfg) return { error: "Save the application credentials first." };
  if (!cfg.redirectUrl) return { error: "Set the redirect URL first — it must match the one registered against the app." };

  const state = `${actor.id}.${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const jar = await cookies();
  jar.set(EWELINK_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: cfg.redirectUrl.startsWith("https://"),
    path: "/",
    maxAge: 600,
  });
  logger.info("ewelink.authorisation_started", { actorId: actor.id });
  return {
    url: authorizeUrl({
      appId: cfg.appId,
      appSecret: cfg.appSecret,
      redirectUrl: cfg.redirectUrl,
      state,
      seq: Date.now(),
    }),
  };
}

/** Re-mirror the account on demand. */
export async function syncMetersNow(): Promise<{ error?: string; devices?: number; meters?: number }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    return { error: "Syncing the meter list is a society-management action (Manage users)." };
  }
  const cfg = await resolveEwelinkConfig();
  if (!cfg) return { error: "The meter API is not configured yet — set it up under API settings." };
  try {
    const synced = await syncMeterDevices(cfg);
    logger.info("ewelink.synced", { actorId: actor.id, ...synced });
    revalidatePath("/admin/meters");
    revalidatePath("/admin/meters/settings");
    return synced;
  } catch (err) {
    const message =
      err instanceof EwelinkNeedsAuthorisation
        ? err.message
        : `Sync failed: ${err instanceof Error ? err.message : "unknown error"}`;
    await db.ewelinkApiConfig.updateMany({ where: { id: "singleton" }, data: { lastError: message } });
    logger.warn("ewelink.sync_failed", { actorId: actor.id, error: message });
    return { error: message };
  }
}

/**
 * Bind a meter to the circuit it measures. CON-11 makes the circuit the
 * billing grain and the ask is explicitly the demo circuit, so the circuit
 * is the assignment; the society is carried alongside it for scoping and
 * may be set on its own while the circuit is still undecided.
 */
export async function assignMeter(input: {
  meterId: string;
  societyId: string | null;
  circuitId: string | null;
}): Promise<{ error?: string; assigned?: true }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    logger.warn("meter.assign_refused", { actorId: actor.id, reason: "permission" });
    return { error: "Assigning a meter is a society-management action (Manage users)." };
  }

  const meter = await db.meterDevice.findUnique({ where: { id: input.meterId } });
  if (!meter) return { error: "That meter is no longer in the mirror." };
  if (!meter.hasEnergySignal && input.circuitId) {
    return { error: `${meter.name} reports no electricity datapoint — only a metering device can measure a circuit.` };
  }

  let societyId = input.societyId;
  if (input.circuitId) {
    const circuit = await db.circuit.findUnique({
      where: { id: input.circuitId },
      select: { id: true, societyId: true, voidedAt: true, meterDevice: { select: { id: true, name: true } } },
    });
    if (!circuit) return { error: "That circuit no longer exists." };
    if (circuit.voidedAt) return { error: "That circuit has been removed." };
    // One meter per circuit: two meters silently measuring one circuit is
    // two sources for one billed figure, which INV-02 has no way to resolve.
    if (circuit.meterDevice && circuit.meterDevice.id !== meter.id) {
      return { error: `That circuit is already metered by ${circuit.meterDevice.name}. Unassign it first.` };
    }
    if (societyId && societyId !== circuit.societyId) {
      return { error: "That circuit belongs to a different society." };
    }
    societyId = circuit.societyId;
  }
  if (societyId) {
    const society = await db.society.findUnique({ where: { id: societyId }, select: { id: true } });
    if (!society) return { error: "That society no longer exists." };
  }

  await db.meterDevice.update({
    where: { id: meter.id },
    data: {
      societyId,
      circuitId: input.circuitId,
      assignedAt: societyId || input.circuitId ? new Date() : null,
      assignedById: societyId || input.circuitId ? actor.id : null,
    },
  });
  logger.info("meter.assigned", {
    actorId: actor.id,
    meterId: meter.id,
    societyId,
    circuitId: input.circuitId,
  });
  revalidatePath("/admin/meters");
  if (societyId) revalidatePath(`/admin/societies/${societyId}`);
  if (input.circuitId) revalidatePath(`/admin/circuits/${input.circuitId}`);
  return { assigned: true };
}
