"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { logger } from "@/lib/logger";
import { movedRanges, planSpanAssignment, toUtcMidnight, type SpanPlan } from "@/lib/meter-installation";
import { afterHistoryChange, applySpanPlan, lockedDemosTouched, syncMeterCache } from "@/lib/meter-history";
import { logChange } from "@/lib/change-log";
import { isDemoMode } from "@/lib/demo-mode";
import { formatDate } from "@/lib/format-date";
import { authorizeUrl, EWELINK_STATE_COOKIE } from "@/lib/ewelink-sign";
import { resolveEwelinkConfig, syncMeterDevices, EwelinkNeedsAuthorisation } from "@/lib/ewelink";
import { resolveMeterProvider } from "@/lib/meter-provider";
import { pollMeters } from "@/lib/meter-poll";

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
 * Record where a meter is now (a forward move). The meter HISTORY is the one
 * record of where a meter was (2026-09-26): this closes the open entry on the
 * day given and opens the new one the same instant (a meter exchange leaves no
 * gap and no overlap), then re-files the readings of every circuit touched.
 *
 * Every entry names a circuit — the society follows from it. Rewriting past
 * history (a date inside an earlier entry) is the demo-mode span editor's job.
 */
export async function assignMeter(input: {
  meterId: string;
  circuitId: string | null;
  /** When it physically went in (or came out). Defaults to today. */
  installedOn?: string;
  /** Why it left the circuit it was on, when this is a move or a removal. */
  removalNote?: string;
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
  if (input.circuitId) {
    const circuit = await db.circuit.findUnique({ where: { id: input.circuitId }, select: { voidedAt: true } });
    if (!circuit) return { error: "That circuit no longer exists." };
    if (circuit.voidedAt) return { error: "That circuit has been removed." };
  }

  const today = toUtcMidnight(new Date());
  const at = input.installedOn ? new Date(`${input.installedOn}T00:00:00.000Z`) : today;
  if (Number.isNaN(at.getTime())) return { error: "That installation date could not be read." };
  if (at.getTime() > today.getTime()) return { error: "A meter cannot be recorded as installed in the future." };

  const open = await db.meterInstallation.findFirst({
    where: { meterId: meter.id, removedAt: null },
    select: { id: true, circuitId: true, installedAt: true },
  });
  if (open && at.getTime() <= open.installedAt.getTime()) {
    return {
      error: `This meter has been on its current circuit since ${formatDate(open.installedAt)} — a move has to be dated after that. Correcting earlier history is done in demo mode from the meter's page.`,
    };
  }
  if (open && input.circuitId === open.circuitId) return { error: "The meter is already on that circuit." };

  const stays = await db.meterInstallation.findMany({
    where: { OR: [{ meterId: meter.id }, ...(input.circuitId ? [{ circuitId: input.circuitId }] : [])] },
    select: { id: true, meterId: true, circuitId: true, societyId: true, installedAt: true, removedAt: true },
  });
  // A forward move only ever closes OPEN entries; anything else rewrites the past.
  if (input.circuitId) {
    const plan = planSpanAssignment({ meterId: meter.id, circuitId: input.circuitId, from: at, to: null, stays });
    if ("error" in plan) return { error: plan.error };
    const rewrites = plan.changes.some((c) => c.kind !== "trim-end" || c.stay.removedAt !== null);
    if (rewrites) {
      logger.warn("meter.assign_refused", { actorId: actor.id, meterId: meter.id, reason: "history_rewrite" });
      return { error: "That date falls inside earlier recorded history (this meter's or another meter's on that circuit). Correcting past history is done in demo mode from the meter's page." };
    }
    const locked = await lockedDemosTouched(plan.changes.map((c) => ({ circuitId: c.stay.circuitId, from: at, to: null })));
    if (locked.length > 0) return { error: `That would move readings under ${locked.join(", ")}, whose report has been shared. Unlock it first.` };
    const affected = await db.$transaction((tx) => applySpanPlan(tx, plan, { actorId: actor.id, reason: input.removalNote?.trim() || null }));
    await afterHistoryChange(affected.circuitIds, actor.id);
  } else if (open) {
    // Taking the meter off its circuit: close the open entry.
    await db.$transaction(async (tx) => {
      await tx.meterInstallation.update({ where: { id: open.id }, data: { removedAt: at, removedById: actor.id, removalNote: input.removalNote?.trim() || null } });
      await logChange(tx, { entity: "meter_installation", entityId: open.id, kind: "history_edit", field: "removedAt", meterId: meter.id, circuitId: open.circuitId, oldValue: { removedAt: null }, newValue: { removedAt: at.toISOString().slice(0, 10) }, reason: input.removalNote?.trim() || null, actorId: actor.id });
      await syncMeterCache(tx, [meter.id], actor.id);
    });
    await afterHistoryChange([open.circuitId], actor.id);
  } else {
    return { error: "The meter is not on any circuit." };
  }

  logger.info("meter.assigned", { actorId: actor.id, meterId: meter.id, circuitId: input.circuitId, installedAt: at.toISOString(), movedFromCircuitId: open?.circuitId ?? null });
  revalidatePath("/admin/meters");
  revalidatePath(`/admin/meters/${meter.id}`);
  return { assigned: true };
}

export type SpanPreview = {
  changes: Array<{ kind: string; meterName: string; circuitLabel: string; before: string; after: string }>;
  releasedDays: number;
  lockedDemos: string[];
};

async function describePlan(plan: SpanPlan): Promise<SpanPreview> {
  const meterIds = [...new Set(plan.changes.map((c) => c.stay.meterId))];
  const circuitIds = [...new Set(plan.changes.map((c) => c.stay.circuitId))];
  const [meters, circuits] = await Promise.all([
    db.meterDevice.findMany({ where: { id: { in: meterIds } }, select: { id: true, name: true } }),
    db.circuit.findMany({ where: { id: { in: circuitIds } }, select: { id: true, location: true, lightType: true, society: { select: { name: true } } } }),
  ]);
  const name = (id: string) => meters.find((m) => m.id === id)?.name ?? id;
  const label = (id: string) => {
    const c = circuits.find((x) => x.id === id);
    return c ? `${c.society.name} · ${c.location || c.lightType}` : id;
  };
  const span = (a: Date, b: Date | null) => `${formatDate(a)} → ${b ? formatDate(b) : "now"}`;
  const moved = movedRanges(plan);
  const releasedDays = await db.meterReading.count({
    where: {
      OR: moved.map((m) => ({ circuitId: m.stay.circuitId, date: { gte: m.from, ...(m.to ? { lt: m.to } : {}) } })),
      usedInCalculationId: { not: null },
    },
  });
  const lockedDemos = await lockedDemosTouched(moved.map((m) => ({ circuitId: m.stay.circuitId, from: m.from, to: m.to })));
  return {
    changes: plan.changes.map((c) => ({
      kind: c.kind,
      meterName: name(c.stay.meterId),
      circuitLabel: label(c.stay.circuitId),
      before: span(c.stay.installedAt, c.stay.removedAt),
      after:
        c.kind === "delete"
          ? "removed"
          : c.kind === "trim-end"
            ? span(c.stay.installedAt, c.removedAt)
            : c.kind === "trim-start"
              ? span(c.installedAt, c.stay.removedAt)
              : `${span(c.stay.installedAt, c.removedAt)} and ${span(c.tailFrom, c.stay.removedAt)}`,
    })),
    releasedDays,
    lockedDemos,
  };
}

async function spanPlanFor(input: { meterId: string; circuitId: string; from: string; to: string | null; ignoreStayId?: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || (input.to && !/^\d{4}-\d{2}-\d{2}$/.test(input.to))) {
    return { error: "Pick the dates in full." } as const;
  }
  const from = new Date(`${input.from}T00:00:00Z`);
  // The span's last day is inclusive on screen; the entry ends the day after.
  const to = input.to ? new Date(new Date(`${input.to}T00:00:00Z`).getTime() + 86_400_000) : null;
  const circuit = await db.circuit.findUnique({ where: { id: input.circuitId }, select: { voidedAt: true } });
  if (!circuit || circuit.voidedAt) return { error: "That circuit no longer exists." } as const;
  const stays = await db.meterInstallation.findMany({
    where: { OR: [{ meterId: input.meterId }, { circuitId: input.circuitId }], ...(input.ignoreStayId ? { id: { not: input.ignoreStayId } } : {}) },
    select: { id: true, meterId: true, circuitId: true, societyId: true, installedAt: true, removedAt: true },
  });
  const plan = planSpanAssignment({ meterId: input.meterId, circuitId: input.circuitId, from, to, stays });
  if ("error" in plan) return { error: plan.error } as const;
  return { plan } as const;
}

async function demoModeHistoryActor() {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." } as const;
  if (!actor.permissions.includes("manage_users")) return { error: "Changing a meter's history is a society-management action (Manage users)." } as const;
  if (!(await isDemoMode())) {
    logger.warn("meter.history_edit_refused", { actorId: actor.id, reason: "not_demo_mode" });
    return { error: "Correcting a meter's past history is a demo-mode action — after go-live the history only moves forward." } as const;
  }
  return { actor } as const;
}

/** Preview what assigning a span of this meter's readings would change. */
export async function previewMeterSpan(input: { meterId: string; circuitId: string; from: string; to: string | null }): Promise<{ error?: string; preview?: SpanPreview }> {
  const a = await demoModeHistoryActor();
  if ("error" in a) return { error: a.error };
  const r = await spanPlanFor(input);
  if ("error" in r) return { error: r.error };
  return { preview: await describePlan(r.plan) };
}

/**
 * Assign a span of this meter's readings to a circuit (demo mode). The readings
 * follow the history: the entry is written, neighbours trimmed, and every
 * circuit touched is re-filed — its monitoring days and its unlocked demos.
 */
export async function assignMeterSpan(input: { meterId: string; circuitId: string; from: string; to: string | null; reason: string }): Promise<{ error?: string; ok?: true }> {
  const a = await demoModeHistoryActor();
  if ("error" in a) return { error: a.error };
  if (!input.reason.trim()) return { error: "Say why the history is being corrected — the old entries are kept in the change log with it." };
  const meter = await db.meterDevice.findUnique({ where: { id: input.meterId }, select: { hasEnergySignal: true, name: true } });
  if (!meter) return { error: "That meter is no longer in the mirror." };
  if (!meter.hasEnergySignal) return { error: `${meter.name} reports no electricity datapoint.` };
  const r = await spanPlanFor(input);
  if ("error" in r) return { error: r.error };
  const preview = await describePlan(r.plan);
  if (preview.releasedDays > 0) return { error: `${preview.releasedDays} of the days this would move are on a released bill — they cannot move.` };
  if (preview.lockedDemos.length > 0) return { error: `That would move readings under ${preview.lockedDemos.join(", ")}, whose report has been shared. Unlock it first.` };
  const affected = await db.$transaction((tx) => applySpanPlan(tx, r.plan, { actorId: a.actor.id, reason: input.reason.trim() }));
  await afterHistoryChange(affected.circuitIds, a.actor.id);
  logger.info("meter.span_assigned", { actorId: a.actor.id, ...input, changes: r.plan.changes.length });
  revalidatePath(`/admin/meters/${input.meterId}`);
  revalidatePath("/admin/meters");
  return { ok: true };
}

/** Change one history entry's dates (demo mode) — its neighbours are trimmed to fit. */
export async function editMeterStay(input: { stayId: string; from: string; to: string | null; reason: string }): Promise<{ error?: string; ok?: true }> {
  const a = await demoModeHistoryActor();
  if ("error" in a) return { error: a.error };
  if (!input.reason.trim()) return { error: "Say why the history is being corrected." };
  const stay = await db.meterInstallation.findUnique({ where: { id: input.stayId } });
  if (!stay) return { error: "That history entry is no longer on record." };
  const r = await spanPlanFor({ meterId: stay.meterId, circuitId: stay.circuitId, from: input.from, to: input.to, ignoreStayId: stay.id });
  if ("error" in r) return { error: r.error };
  const preview = await describePlan(r.plan);
  if (preview.releasedDays > 0) return { error: `${preview.releasedDays} of the days this would move are on a released bill — they cannot move.` };
  if (preview.lockedDemos.length > 0) return { error: `That would move readings under ${preview.lockedDemos.join(", ")}, whose report has been shared. Unlock it first.` };
  const affected = await db.$transaction(async (tx) => {
    await tx.meterInstallation.delete({ where: { id: stay.id } });
    await logChange(tx, { entity: "meter_installation", entityId: stay.id, kind: "history_edit", field: "edited", meterId: stay.meterId, circuitId: stay.circuitId, oldValue: { installedAt: stay.installedAt.toISOString().slice(0, 10), removedAt: stay.removedAt?.toISOString().slice(0, 10) ?? null }, newValue: { from: input.from, to: input.to }, reason: input.reason.trim(), actorId: a.actor.id });
    const res = await applySpanPlan(tx, r.plan, { actorId: a.actor.id, reason: input.reason.trim() });
    return [...res.circuitIds, stay.circuitId];
  });
  await afterHistoryChange(affected, a.actor.id);
  revalidatePath(`/admin/meters/${stay.meterId}`);
  return { ok: true };
}

/** Remove one history entry (demo mode). Its days go back to unassigned. */
export async function deleteMeterStay(input: { stayId: string; reason: string }): Promise<{ error?: string; ok?: true }> {
  const a = await demoModeHistoryActor();
  if ("error" in a) return { error: a.error };
  if (!input.reason.trim()) return { error: "Say why the entry is being removed." };
  const stay = await db.meterInstallation.findUnique({ where: { id: input.stayId } });
  if (!stay) return { error: "That history entry is no longer on record." };
  const released = await db.meterReading.count({
    where: { circuitId: stay.circuitId, meterId: stay.meterId, date: { gte: stay.installedAt, ...(stay.removedAt ? { lt: stay.removedAt } : {}) }, usedInCalculationId: { not: null } },
  });
  if (released > 0) return { error: `${released} of this entry's days are on a released bill — it cannot be removed.` };
  const locked = await lockedDemosTouched([{ circuitId: stay.circuitId, from: stay.installedAt, to: stay.removedAt }]);
  if (locked.length > 0) return { error: `That would move readings under ${locked.join(", ")}, whose report has been shared. Unlock it first.` };
  await db.$transaction(async (tx) => {
    await tx.meterInstallation.delete({ where: { id: stay.id } });
    await tx.circuitDemo.updateMany({ where: { meterInstallationId: stay.id }, data: { meterInstallationId: null } });
    await logChange(tx, { entity: "meter_installation", entityId: stay.id, kind: "history_edit", field: "deleted", meterId: stay.meterId, circuitId: stay.circuitId, oldValue: { installedAt: stay.installedAt.toISOString().slice(0, 10), removedAt: stay.removedAt?.toISOString().slice(0, 10) ?? null }, reason: input.reason.trim(), actorId: a.actor.id });
    await syncMeterCache(tx, [stay.meterId], a.actor.id);
  });
  await afterHistoryChange([stay.circuitId], a.actor.id);
  revalidatePath(`/admin/meters/${stay.meterId}`);
  return { ok: true };
}

/**
 * Read a meter now, rather than waiting for the hourly pass. Goes through
 * the same `pollMeters` the job uses, so a manual sync and an automatic one
 * cannot produce different rows.
 */
export async function syncMeterNow(meterId: string): Promise<{
  error?: string;
  polled?: number;
  reporting?: number;
  unhealthy?: number;
  failed?: number;
}> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    return { error: "Reading a meter is a society-management action (Manage users)." };
  }
  const meter = await db.meterDevice.findUnique({ where: { id: meterId }, select: { id: true, circuitId: true, societyId: true } });
  if (!meter) return { error: "That meter is no longer in the mirror." };
  if (!meter.circuitId && !meter.societyId) {
    return { error: "Assign this meter to a circuit first — an unassigned meter has nothing to record against." };
  }
  const provider = await resolveMeterProvider();
  if (!provider) return { error: "The meter API is not configured yet — set it up under API settings." };
  try {
    const result = await pollMeters({ meterId, provider });
    logger.info("meter.sync_now", { actorId: actor.id, meterId, ...result });
    revalidatePath("/admin/meters");
    return result;
  } catch (err) {
    return { error: `The read failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}

/**
 * Who gets chased when this meter stops answering. Work in this codebase has
 * a named owner — the survey assignee, the installation onlooker — because an
 * alert addressed to nobody is an alert nobody acts on.
 */
export async function setMeterOwner(input: {
  meterId: string;
  ownerId: string | null;
}): Promise<{ error?: string; saved?: true }> {
  const actor = await resolveAdmin();
  if (!actor) return { error: "Your session is no longer valid. Sign in again." };
  if (!actor.permissions.includes("manage_users")) {
    return { error: "Naming a meter's owner is a society-management action (Manage users)." };
  }
  if (input.ownerId) {
    const owner = await db.adminUser.findFirst({
      where: { id: input.ownerId, isActive: true, deletedAt: null },
      select: { id: true, permissions: true },
    });
    if (!owner) return { error: "That account is no longer active." };
    // Fixing a meter is field work, so the owner has to be someone who can
    // actually act on it rather than merely receive the message.
    if (!owner.permissions.includes("manage_survey")) {
      return { error: "A meter's owner has to hold field access (Manage survey) — they are the one who goes and fixes it." };
    }
  }
  await db.meterDevice.update({ where: { id: input.meterId }, data: { ownerId: input.ownerId } });
  logger.info("meter.owner_set", { actorId: actor.id, meterId: input.meterId, ownerId: input.ownerId });
  revalidatePath("/admin/meters");
  return { saved: true };
}
