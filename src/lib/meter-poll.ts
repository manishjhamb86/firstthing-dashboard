import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { evaluateMeterHealth, outageMessage, outageMinutes } from "@/lib/meter-health";
import { resolveMeterProvider, type MeterProvider } from "@/lib/meter-provider";

/**
 * One pass over the assigned meters: read each, file a sample, and decide
 * whether it is healthy.
 *
 * The hourly job and the "Sync now" button both come through here, for the
 * reason `applyCommissioningReading` exists — two entry points that write
 * the same rows by two code paths drift, and the drift shows up as a figure
 * that depends on which button somebody pressed.
 *
 * A sample is TELEMETRY. It never becomes a MeterReading (the store a bill
 * is computed from) by this path: CON-45 requires those to be reviewed row
 * by row before they are stored, and INV-09 requires anomaly detection
 * before a month bills. What this gives is the live picture and the
 * online/offline signal.
 */
export type PollResult = {
  polled: number;
  reporting: number;
  unhealthy: number;
  failed: number;
};

export async function pollMeters(opts?: { meterId?: string; provider?: MeterProvider }): Promise<PollResult> {
  const provider = opts?.provider ?? (await resolveMeterProvider());
  if (!provider) {
    logger.info("meter.poll_skipped", { reason: "no_provider" });
    return { polled: 0, reporting: 0, unhealthy: 0, failed: 0 };
  }

  if (provider.name === "fake") {
    logger.warn("meter.fake_provider_active", { reason: "EWELINK_FAKE_METERS=1" });
  }

  const meters = await db.meterDevice.findMany({
    where: {
      hasEnergySignal: true,
      // Only meters somebody has bound to something are polled: an unassigned
      // device in the account is not yet this product's problem, and polling
      // it would raise alerts nobody owns.
      ...(opts?.meterId ? { id: opts.meterId } : { OR: [{ circuitId: { not: null } }, { societyId: { not: null } }] }),
    },
    include: {
      circuit: { select: { location: true, lightType: true } },
      society: { select: { name: true } },
      owner: { select: { email: true } },
    },
  });

  const now = new Date();
  const result: PollResult = { polled: 0, reporting: 0, unhealthy: 0, failed: 0 };

  for (const m of meters) {
    result.polled++;
    let read;
    try {
      read = await provider.readNow(m.ewelinkDeviceId);
    } catch (err) {
      // A failed read is evidence about the meter, not a reason to abandon
      // the pass — one unreachable device must not stop the other 199.
      result.failed++;
      read = { online: false, powerW: null, energyKwh: null, reportedAt: null };
      logger.warn("meter.read_failed", { meterId: m.id, error: String(err) });
    }

    // When the vendor cannot date the device's own report, a successful read
    // is the freshest fact available — and it is recorded as OUR read time,
    // not claimed as the device's.
    const reportedAt = read.reportedAt ?? (read.online ? now : m.lastReportedAt);
    const health = evaluateMeterHealth({
      online: read.online,
      reportedAt,
      offlineSince: m.offlineSince,
      now,
    });
    if (health.state === "reporting") result.reporting++;
    else result.unhealthy++;

    await db.meterSample.create({
      data: {
        meterId: m.id,
        recordedAt: now,
        online: read.online,
        powerW: read.powerW,
        energyKwh: read.energyKwh,
        reportedAt: read.reportedAt,
      },
    });
    await db.meterDevice.update({
      where: { id: m.id },
      data: {
        online: read.online,
        lastPowerW: read.powerW ?? m.lastPowerW,
        lastEnergyKwh: read.energyKwh ?? m.lastEnergyKwh,
        lastReportedAt: reportedAt,
        lastSampleAt: now,
        offlineSince: health.offlineSince,
      },
    });

    // Fire on the TRANSITION only. An alert that repeats every hour is an
    // alert people filter out, and then the one that matters goes with it.
    if (health.becameUnhealthy) {
      logger.warn("meter.went_offline", {
        meterId: m.id,
        state: health.state,
        ownerEmail: m.owner?.email ?? null,
        message: outageMessage({
          meterName: m.name,
          circuitLabel: m.circuit ? `${m.circuit.location ?? "Unnamed"} · ${m.circuit.lightType}` : null,
          societyName: m.society?.name ?? null,
          state: health.state,
          minutes: outageMinutes(health.offlineSince, now),
        }),
      });
    }
    if (health.recovered) {
      logger.info("meter.recovered", { meterId: m.id, ownerEmail: m.owner?.email ?? null });
    }
  }

  logger.info("meter.poll_done", { ...result, provider: provider.name });
  return result;
}
