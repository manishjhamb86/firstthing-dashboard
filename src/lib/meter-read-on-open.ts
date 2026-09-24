import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { pollMeters } from "@/lib/meter-poll";
import { shouldReadLive, type Surface } from "@/lib/meter-live";

/**
 * Read a meter live when somebody opens it — but only when the stored
 * reading is older than the surface's floor (an hour on the portal). Uses the
 * same `pollMeters` as the hourly job and the admin's "read now", so a read
 * on open cannot produce a different row from either. Never throws into a
 * page render: a failed vendor call leaves the last stored reading on screen,
 * shown with its age, which is what the page does anyway.
 */
export async function readMeterIfDue(meterId: string, surface: Surface): Promise<"read" | "fresh" | "failed"> {
  const m = await db.meterDevice.findUnique({ where: { id: meterId }, select: { lastReadAt: true, hasEnergySignal: true } });
  if (!m || !m.hasEnergySignal) return "fresh";
  if (!shouldReadLive({ lastReadAt: m.lastReadAt, surface, now: new Date() })) return "fresh";
  try {
    await pollMeters({ meterId });
    logger.info("meter.read_on_open", { meterId, surface });
    return "read";
  } catch (err) {
    logger.warn("meter.read_on_open_failed", { meterId, surface, error: err instanceof Error ? err.message : String(err) });
    return "failed";
  }
}
