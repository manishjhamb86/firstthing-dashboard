import "dotenv/config";
import { db } from "../src/lib/db";
import { logger } from "../src/lib/logger";
import { resolveTuyaConfig, syncTankDevices } from "../src/lib/tuya";
import { pollMeters } from "../src/lib/meter-poll";

// ADR-003 — the dedicated worker process for the Postgres-backed job queue.
// Run alongside the Next.js app (`pnpm worker`, its own pm2 process in
// deployment) rather than inside a request handler, since these jobs are
// time-driven, not request-triggered.
const POLL_INTERVAL_MS = 15_000;

// ADR-006 — a `submitted` GatePass older than this is provisional-release
// eligible: PER-04 can proceed without an indefinite wait on backend
// approval. Evaluated here, server-side, against GatePass.submittedAt —
// never a client-side timer (device clock can't be trusted).
const GATEPASS_PROVISIONAL_AFTER_MS = 30 * 60 * 1000;

// The sweep re-schedules itself on every run — a self-perpetuating
// recurring job, since this queue has no separate cron primitive.
const GATEPASS_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Water tank levels are sampled on the half hour (user-specified 2026-08-25:
// "record the water levels every half an hour and keep that record") — the
// history charts and portal sparklines read the resulting store, so stats
// survive a sensor going offline.
const TANK_SAMPLE_INTERVAL_MS = 30 * 60 * 1000;
/** Hourly, per the user's own cadence for meter readings (2026-08-26). */
const METER_POLL_INTERVAL_MS = 60 * 60 * 1000;

// A job left `running` by a process that died mid-run would otherwise sit
// there forever: it is not `done`, so it never schedules a successor, and it
// still looks scheduled to `ensureGatepassSweepScheduled`, which would then
// never re-seed. A recurring chain would go silently dead. Anything claimed
// longer ago than this is treated as abandoned.
const STALE_RUNNING_MS = 10 * 60 * 1000;

async function runGatepassSweep() {
  const cutoff = new Date(Date.now() - GATEPASS_PROVISIONAL_AFTER_MS);
  const result = await db.gatePass.updateMany({
    where: { status: "submitted", submittedAt: { lt: cutoff } },
    data: { status: "provisional" },
  });
  if (result.count > 0) {
    logger.info("job.gatepass_sweep_flipped", { count: result.count });
  }
  await scheduleGatepassSweep(new Date(Date.now() + GATEPASS_SWEEP_INTERVAL_MS));
}

/**
 * The chain has exactly one link at a time.
 *
 * An unconditional create here is how a recurring chain *forks*: two sweeps
 * pending at once means two successors, then four, and every fork is
 * permanent. Observed on stage — three concurrent `gatepass_sweep` chains at
 * 5-minute cadence, each internally consistent, traced to overlapping worker
 * processes during a pm2 restart both claiming the same job. `claimJob`
 * below closes that race; this guard is the second line, and the one that
 * keeps a chain single even if some future path schedules by hand.
 */
async function scheduleGatepassSweep(runAt: Date) {
  const existing = await db.job.findFirst({
    where: { type: "gatepass_sweep", status: "pending" },
  });
  if (existing) {
    logger.warn("job.gatepass_sweep_duplicate_suppressed", { existingJobId: existing.id });
    return;
  }
  await db.job.create({ data: { type: "gatepass_sweep", runAt } });
}

/**
 * Claims a job by compare-and-set, so only one worker can ever run it.
 *
 * `findMany` then `update` is not a claim: two processes read the same
 * pending row and both proceed. That is not hypothetical here — `pm2 restart`
 * genuinely overlaps the outgoing and incoming process for a moment, which is
 * exactly when both are polling. `updateMany` with the status in the `where`
 * is a single atomic UPDATE; the loser matches zero rows and moves on.
 */
async function claimJob(id: string): Promise<boolean> {
  const claimed = await db.job.updateMany({
    where: { id, status: "pending" },
    data: { status: "running" },
  });
  return claimed.count === 1;
}

async function processJob(job: { id: string; type: string }) {
  switch (job.type) {
    case "gatepass_sweep":
      await runGatepassSweep();
      break;
    case "meter_poll":
      await runMeterPoll();
      break;
    case "tank_level_sample":
      await runTankLevelSample();
      break;
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

/**
 * One half-hourly pass: mirror the Smart Life account into water_tanks, then
 * file one TankLevelReading per level-bearing tank. Same single-link chain
 * discipline as the gate-pass sweep — a forked chain here would double the
 * sampling rate silently.
 */
async function runTankLevelSample() {
  try {
    const cfg = await resolveTuyaConfig();
    if (!cfg) {
      // Not configured yet is a normal state, not a failure — the chain keeps
      // ticking so sampling starts the moment operations saves credentials.
      logger.info("job.tank_sample_skipped", { reason: "no_config" });
      return;
    }
    const synced = await syncTankDevices(cfg);
    const tanks = await db.waterTank.findMany({
      where: { hasLevelSignal: true },
      select: { id: true, lastLevelPercent: true, lastOnline: true, lastReportedAt: true },
    });
    const now = new Date();
    for (const t of tanks) {
      if (t.lastLevelPercent === null) continue;
      await db.tankLevelReading.create({
        data: {
          tankId: t.id,
          recordedAt: now,
          levelPercent: t.lastLevelPercent,
          online: t.lastOnline,
          reportedAt: t.lastReportedAt,
        },
      });
    }
    logger.info("job.tank_sample_done", { devices: synced.devices, tanks: tanks.length });
  } finally {
    // Reschedule even after a failed pass — a Tuya outage must not kill the
    // chain, only skip the sample.
    await scheduleTankSample(new Date(Date.now() + TANK_SAMPLE_INTERVAL_MS));
  }
}

/**
 * One hourly pass over every assigned meter (the user's own cadence,
 * 2026-08-26): read it, file a sample, and notice when it stops answering.
 * Same single-link chain discipline as every other recurring job here — a
 * forked chain would double the polling rate and, worse, double-count the
 * transition that fires an alert.
 */
async function runMeterPoll() {
  try {
    const result = await pollMeters();
    logger.info("job.meter_poll_done", result);
  } finally {
    // Reschedule even after a failed pass: a vendor outage must skip a
    // sample, never kill the chain that would notice the outage ending.
    await scheduleMeterPoll(new Date(Date.now() + METER_POLL_INTERVAL_MS));
  }
}

async function scheduleMeterPoll(runAt: Date) {
  const existing = await db.job.findFirst({ where: { type: "meter_poll", status: "pending" } });
  if (existing) {
    logger.warn("job.meter_poll_duplicate_suppressed", { existingJobId: existing.id });
    return;
  }
  await db.job.create({ data: { type: "meter_poll", runAt } });
}

async function ensureMeterPollScheduled() {
  const existing = await db.job.findFirst({
    where: { type: "meter_poll", status: { in: ["pending", "running"] } },
  });
  if (!existing) {
    await db.job.create({ data: { type: "meter_poll", runAt: new Date() } });
    logger.info("job.meter_poll_seeded", {});
  }
}

async function scheduleTankSample(runAt: Date) {
  const existing = await db.job.findFirst({
    where: { type: "tank_level_sample", status: "pending" },
  });
  if (existing) {
    logger.warn("job.tank_sample_duplicate_suppressed", { existingJobId: existing.id });
    return;
  }
  await db.job.create({ data: { type: "tank_level_sample", runAt } });
}

async function ensureTankSampleScheduled() {
  const existing = await db.job.findFirst({
    where: { type: "tank_level_sample", status: { in: ["pending", "running"] } },
  });
  if (!existing) {
    await db.job.create({ data: { type: "tank_level_sample", runAt: new Date() } });
    logger.info("job.tank_sample_seeded", {});
  }
}

/** Releases anything a dead process left claimed, so the chain can resume. */
async function reclaimStaleJobs() {
  const released = await db.job.updateMany({
    where: { status: "running", updatedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
    data: { status: "pending" },
  });
  if (released.count > 0) {
    logger.warn("job.reclaimed_stale", { count: released.count });
  }
}

async function ensureGatepassSweepScheduled() {
  const existing = await db.job.findFirst({
    where: { type: "gatepass_sweep", status: { in: ["pending", "running"] } },
  });
  if (!existing) {
    await db.job.create({ data: { type: "gatepass_sweep", runAt: new Date() } });
    logger.info("job.gatepass_sweep_seeded", {});
  }
}

async function tick() {
  await reclaimStaleJobs();

  const due = await db.job.findMany({
    where: { status: "pending", runAt: { lte: new Date() } },
    take: 10,
  });

  for (const job of due) {
    if (!(await claimJob(job.id))) continue; // another worker got there first
    try {
      await processJob(job);
      await db.job.update({ where: { id: job.id }, data: { status: "done" } });
    } catch (err) {
      logger.error("job.failed", { jobId: job.id, type: job.type, error: String(err) });
      await db.job.update({
        where: { id: job.id },
        data: { status: "failed", attempts: { increment: 1 } },
      });
    }
  }
}

async function main() {
  logger.info("job.worker_started", {});
  await reclaimStaleJobs();
  await ensureGatepassSweepScheduled();
  await ensureTankSampleScheduled();
  await ensureMeterPollScheduled();
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  logger.error("job.worker_crashed", { error: String(err) });
  process.exit(1);
});
