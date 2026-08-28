import type { MeterAlertKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Raising and clearing the alerts that appear in the notification section.
 *
 * The rule the whole design rests on: ONE OPEN ALERT per meter per kind. It
 * is enforced by a partial unique index (`meter_alerts_open_unique`), not by
 * the checks below — an hourly job racing itself would otherwise file a
 * second row, and a notification list that repeats the same outage every
 * hour is one nobody reads.
 *
 * An alert is never deleted. It closes with a stated reason and stays as the
 * record that the meter was out, which is the fact a society's own figures
 * may later have to be explained against.
 */

/** Raise an alert, or leave the existing open one exactly as it is. */
export async function openAlert(input: {
  meterId: string;
  kind: MeterAlertKind;
  message: string;
  detail?: Prisma.InputJsonValue;
}): Promise<{ opened: boolean }> {
  const existing = await db.meterAlert.findFirst({
    where: { meterId: input.meterId, kind: input.kind, closedAt: null },
    select: { id: true },
  });
  if (existing) return { opened: false };

  try {
    await db.meterAlert.create({
      data: {
        meterId: input.meterId,
        kind: input.kind,
        message: input.message,
        detail: input.detail,
      },
    });
  } catch (err) {
    // The index won the race. That is the index doing its job, not a fault:
    // an alert already stands for this meter and kind.
    if (isUniqueViolation(err)) {
      logger.info("meter.alert_already_open", { meterId: input.meterId, kind: input.kind });
      return { opened: false };
    }
    throw err;
  }
  logger.warn("meter.alert_opened", { meterId: input.meterId, kind: input.kind, message: input.message });
  return { opened: true };
}

/** Close whatever is open of this kind, with a reason. */
export async function closeAlert(input: {
  meterId: string;
  kind: MeterAlertKind;
  reason: string;
}): Promise<{ closed: number }> {
  const { count } = await db.meterAlert.updateMany({
    where: { meterId: input.meterId, kind: input.kind, closedAt: null },
    data: { closedAt: new Date(), closedReason: input.reason },
  });
  if (count > 0) {
    logger.info("meter.alert_closed", { meterId: input.meterId, kind: input.kind, reason: input.reason });
  }
  return { closed: count };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
