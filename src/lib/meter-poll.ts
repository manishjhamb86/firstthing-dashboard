import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { theoreticalDailyKwh } from "@/lib/circuit-load";
import { closeAlert, openAlert } from "@/lib/meter-alerts";
import { evaluateCapacity, evaluateMeterHealth, outageMessage, outageMinutes } from "@/lib/meter-health";
import { resolveMeterProvider, type MeterProvider } from "@/lib/meter-provider";
import { syncCircuitBandAlert } from "@/lib/savings-band-alerts";
import { LIVE_MONITORING_WHERE } from "@/lib/live-monitoring";
import { circuitLabelOf } from "@/lib/meter-view";

/**
 * One pass over every metering device in the account. It answers exactly two
 * questions, which are the only two the hourly job exists for:
 *
 *   1. Is this meter reachable? Two consecutive failures raise an alert.
 *   2. Is what it reports physically possible? A day's consumption above
 *      everything on the circuit running flat out raises another.
 *
 * Every meter is sampled; only an ASSIGNED one is alerted on. Sampling an
 * unbound device costs one call and buys the history it will need the day
 * somebody assigns it — alerting on one would raise work with no owner.
 *
 * It deliberately does NOT build an hourly series. The device holds its own
 * hourly buffer but no public endpoint returns it, and an hourly poll of a
 * counter would only ever give a counter — the hourly series comes from the
 * CSV exported off the meter (see MeterHourlyReading).
 *
 * A sample is TELEMETRY. It never becomes a MeterReading (the store a bill
 * is computed from) by this path: CON-45 requires those to be reviewed row
 * by row before they are stored, and INV-09 requires anomaly detection
 * before a month bills.
 *
 * The hourly job and the "Sync now" button both come through here, for the
 * reason `applyCommissioningReading` exists — two entry points that write
 * the same rows by two code paths drift, and the drift shows up as a figure
 * that depends on which button somebody pressed.
 */
export type PollResult = {
  polled: number;
  reporting: number;
  unhealthy: number;
  failed: number;
  alertsOpened: number;
  alertsClosed: number;
  alertsRearmed: number;
  /** Of those polled, how many are bound to a circuit or society. */
  assigned: number;
};

export async function pollMeters(opts?: { meterId?: string; provider?: MeterProvider }): Promise<PollResult> {
  const provider = opts?.provider ?? (await resolveMeterProvider());
  const result: PollResult = {
    polled: 0,
    reporting: 0,
    unhealthy: 0,
    failed: 0,
    alertsOpened: 0,
    alertsClosed: 0,
    alertsRearmed: 0,
    assigned: 0,
  };
  if (!provider) {
    logger.info("meter.poll_skipped", { reason: "no_provider" });
    return result;
  }

  if (provider.name === "fake") {
    logger.warn("meter.fake_provider_active", { reason: "EWELINK_FAKE_METERS=1" });
  }

  const meters = await db.meterDevice.findMany({
    where: {
      // Every metering device in the account, assigned or not (user's call,
      // 2026-08-29: "i want every meter to be fetched assigned or not. we can
      // map that later when user assigns that meter to some circuit").
      //
      // The point is the HISTORY. A meter's samples are keyed by its own id,
      // so a device bound to a circuit in November already has months of
      // readings and reliability behind it rather than starting from the day
      // somebody happened to assign it. That is not recoverable after the
      // fact — the vendor serves the present, never the past.
      //
      // Non-metering devices stay out: they report no electrical parameters
      // at all, so a sample would be a row of nulls.
      hasEnergySignal: true,
      ...(opts?.meterId ? { id: opts.meterId } : {}),
    },
    include: {
      circuit: {
        select: {
          location: true,
          lightType: true,
          devices: { select: { count: true, wattage: true, hoursPerDay: true } },
        },
      },
      society: { select: { name: true } },
      owner: { select: { email: true } },
    },
  });

  // One account-wide connectivity read per pass, before any device is polled:
  // the per-device status call carries no connectivity at all. A failure here
  // is not fatal — an unknown map simply leaves the per-device read to decide,
  // which is exactly the old behaviour rather than a fleet-wide false alarm.
  let connected = new Map<string, boolean>();
  try {
    connected = await provider.connectivity();
  } catch (err) {
    logger.warn("meter.connectivity_read_failed", { error: String(err) });
  }

  const now = new Date();

  for (const m of meters) {
    result.polled++;
    let read;
    let readOk = true;
    try {
      read = await provider.readNow(m.ewelinkDeviceId, m.uiid);
    } catch (err) {
      // A failed read is evidence about the meter, not a reason to abandon
      // the pass — one unreachable device must not stop the other 44.
      readOk = false;
      result.failed++;
      read = {
        online: false,
        powerW: null,
        voltageV: null,
        currentA: null,
        dayKwh: null,
        monthKwh: null,
        scaleKnown: true,
        reportedAt: null,
      };
      logger.warn("meter.read_failed", { meterId: m.id, error: String(err) });
    }

    // The vendor's own connectivity answer wins when it has one; a thrown
    // read is offline regardless. Absent both, the meter is treated as
    // reachable — it answered with figures.
    const vendorOnline = connected.get(m.ewelinkDeviceId);
    const isOnline = readOk && (vendorOnline === undefined ? read.online : vendorOnline);

    // When the vendor cannot date the device's own report, a successful read
    // is the freshest fact available — and it is recorded as OUR read time,
    // not claimed as the device's.
    const reportedAt = read.reportedAt ?? (isOnline ? now : m.lastReportedAt);
    const health = evaluateMeterHealth({
      online: isOnline,
      readOk,
      reportedAt,
      offlineSince: m.offlineSince,
      consecutiveFailures: m.consecutiveFailures,
      now,
    });
    if (health.state === "reporting") result.reporting++;
    else result.unhealthy++;

    await db.meterSample.create({
      data: {
        meterId: m.id,
        recordedAt: now,
        online: isOnline,
        powerW: read.powerW,
        voltageV: read.voltageV,
        currentA: read.currentA,
        dayKwh: read.dayKwh,
        monthKwh: read.monthKwh,
        reportedAt: read.reportedAt,
      },
    });
    await db.meterDevice.update({
      where: { id: m.id },
      data: {
        online: isOnline,
        // Keep the last KNOWN value when a read fails — a screen showing
        // "last known, 3 hours ago" is more use than a blank one, provided it
        // says so, which is what lastReadAt is for.
        ...(readOk
          ? {
              lastPowerW: read.powerW ?? m.lastPowerW,
              lastVoltageV: read.voltageV ?? m.lastVoltageV,
              lastCurrentA: read.currentA ?? m.lastCurrentA,
              lastDayKwh: read.dayKwh ?? m.lastDayKwh,
              lastMonthKwh: read.monthKwh ?? m.lastMonthKwh,
              lastReadAt: now,
            }
          : {}),
        lastReportedAt: reportedAt,
        lastSampleAt: now,
        offlineSince: health.offlineSince,
        consecutiveFailures: health.consecutiveFailures,
      },
    });

    const circuitLabel = m.circuit ? circuitLabelOf(m.circuit.location, m.circuit.lightType) : null;
    const meterName = m.name;

    // Every meter is SAMPLED; only a bound one is ALERTED on. An unassigned
    // device has no circuit, no society and no owner, so an alert for it
    // would name nothing, reach nobody, and sit in the notification centre
    // as work no one can do — and thirty of those would bury the ones that
    // matter. Its history is still recorded above, which is the whole reason
    // for polling it: the moment it is assigned, the reliability record is
    // already there.
    const assigned = m.circuitId !== null || m.societyId !== null;
    if (assigned) result.assigned++;

    // --- 1. Reachability. Fires on the SECOND consecutive failure only. ---
    if (health.shouldAlert && assigned) {
      const message = outageMessage({
        meterName,
        circuitLabel,
        societyName: m.society?.name ?? null,
        state: health.state,
        minutes: outageMinutes(health.offlineSince, now),
      });
      const { opened } = await openAlert({
        meterId: m.id,
        kind: "offline",
        message,
        detail: {
          state: health.state,
          consecutiveFailures: health.consecutiveFailures,
          offlineSince: health.offlineSince?.toISOString() ?? null,
          ownerEmail: m.owner?.email ?? null,
        },
      });
      if (opened) result.alertsOpened++;
      logger.warn("meter.went_offline", {
        meterId: m.id,
        state: health.state,
        ownerEmail: m.owner?.email ?? null,
        message,
      });
    }
    if (health.recovered && assigned) {
      const { closed } = await closeAlert({ meterId: m.id, kind: "offline", reason: "The meter is reporting again." });
      result.alertsClosed += closed;
      logger.info("meter.recovered", { meterId: m.id, ownerEmail: m.owner?.email ?? null });
    }

    // --- 2. Is the day's consumption physically possible? ---
    // The ceiling is the ORIGINAL fixture load: it is what the circuit could
    // ever draw, so a partly-completed retrofit cannot make this alert fire.
    const devices = m.circuit?.devices ?? [];
    const capacity = evaluateCapacity({
      dayKwh: read.dayKwh,
      theoreticalDailyKwh: devices.length > 0 ? theoreticalDailyKwh(devices) : null,
      meterName,
    });
    if (capacity.verdict === "over" && assigned) {
      const { opened } = await openAlert({
        meterId: m.id,
        kind: "out_of_range",
        message: capacity.message,
        detail: {
          dayKwh: read.dayKwh,
          ceilingKwh: capacity.ceilingKwh,
          overBy: capacity.overBy,
          circuitLabel,
        },
      });
      if (opened) result.alertsOpened++;
    } else if (capacity.verdict === "within" && assigned) {
      const { closed } = await closeAlert({
        meterId: m.id,
        kind: "out_of_range",
        reason: "The day's consumption is back inside what the circuit can draw.",
      });
      result.alertsClosed += closed;
    }
    // `unknown` deliberately neither opens nor closes: not knowing whether a
    // reading is possible is not evidence that it is.

    if (!read.scaleKnown) {
      // A device type whose scale has never been established reports nulls
      // rather than raw figures. Loud, because it is silently unmonitored.
      logger.warn("meter.scale_unknown", { meterId: m.id, uiid: m.uiid, productModel: m.productModel });
    }
  }

  // Every live-monitoring circuit's commercial band, once per pass. This is
  // what brings an acknowledged-but-still-short circuit back to the badge
  // after the cool-off — without it, acknowledging would silence a real
  // shortfall permanently.
  if (!opts?.meterId) {
    const live = await db.circuit.findMany({ where: LIVE_MONITORING_WHERE, select: { id: true } });
    for (const c of live) {
      try {
        const r = await syncCircuitBandAlert(c.id, now);
        if (r.opened) result.alertsOpened++;
        if (r.closed) result.alertsClosed++;
        if (r.rearmed) result.alertsRearmed++;
      } catch (err) {
        logger.warn("circuit.band_sync_failed", { circuitId: c.id, error: String(err) });
      }
    }
  }

  logger.info("meter.poll_done", { ...result, provider: provider.name });
  return result;
}
