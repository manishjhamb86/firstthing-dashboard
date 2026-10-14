import type { TankAlertKind, Prisma } from "@prisma/client";
import { notifyTankAlert } from "@/lib/push-notify";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Raising and clearing water-tank alerts (2026-10-14, user-asked: real push
 * to every portal account with Water access). Same shape as meter-alerts.ts
 * on purpose — one OPEN alert per tank per kind, enforced by a partial
 * unique index (`tank_alerts_open_unique`) rather than the checks below,
 * because the half-hourly sampler racing itself must never file the same
 * outage twice. An alert is never deleted; it closes with a stated reason.
 */

/** Which conditions are true THIS pass, from one sample. Pure — no DB. */
export function evaluateTankConditions(input: {
  online: boolean;
  /** Null when the tank has never reported a level at all. */
  levelPercent: number | null;
  lowPct: number;
  highPct: number;
}): TankAlertKind[] {
  const out: TankAlertKind[] = [];
  if (!input.online) {
    out.push("offline");
    // A level read while offline is the sensor's LAST report, not a fresh
    // one (the schema's own rule for TankLevelReading) — judging it against
    // the low/high bounds this pass would be a stale reading presented as
    // current, so level conditions are only ever checked while reporting.
    return out;
  }
  if (input.levelPercent === null) return out;
  if (input.levelPercent <= input.lowPct) out.push("level_low");
  if (input.levelPercent >= input.highPct) out.push("level_high");
  return out;
}

/** Raise an alert, or leave the existing open one exactly as it is. */
export async function openTankAlert(input: {
  tankId: string;
  kind: TankAlertKind;
  message: string;
  detail?: Prisma.InputJsonValue;
}): Promise<{ opened: boolean }> {
  const existing = await db.tankAlert.findFirst({
    where: { tankId: input.tankId, kind: input.kind, closedAt: null },
    select: { id: true },
  });
  if (existing) return { opened: false };

  try {
    await db.tankAlert.create({
      data: { tankId: input.tankId, kind: input.kind, message: input.message, detail: input.detail },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      logger.info("tank.alert_already_open", { tankId: input.tankId, kind: input.kind });
      return { opened: false };
    }
    throw err;
  }
  logger.warn("tank.alert_opened", { tankId: input.tankId, kind: input.kind, message: input.message });
  // Only on the transition — a tank staying low does not re-notify every
  // half hour (that is reraisedAt's job, after a cool-off).
  await notifyTankAlert({ tankId: input.tankId, kind: input.kind });
  return { opened: true };
}

/** Close whatever is open of this kind, with a reason. */
export async function closeTankAlert(input: {
  tankId: string;
  kind: TankAlertKind;
  reason: string;
}): Promise<{ closed: number }> {
  const { count } = await db.tankAlert.updateMany({
    where: { tankId: input.tankId, kind: input.kind, closedAt: null },
    data: { closedAt: new Date(), closedReason: input.reason },
  });
  if (count > 0) {
    logger.info("tank.alert_closed", { tankId: input.tankId, kind: input.kind, reason: input.reason });
  }
  return { closed: count };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
