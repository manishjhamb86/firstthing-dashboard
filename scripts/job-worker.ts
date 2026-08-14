import "dotenv/config";
import { db } from "../src/lib/db";
import { logger } from "../src/lib/logger";

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

async function runGatepassSweep() {
  const cutoff = new Date(Date.now() - GATEPASS_PROVISIONAL_AFTER_MS);
  const result = await db.gatePass.updateMany({
    where: { status: "submitted", submittedAt: { lt: cutoff } },
    data: { status: "provisional" },
  });
  if (result.count > 0) {
    logger.info("job.gatepass_sweep_flipped", { count: result.count });
  }
  await db.job.create({
    data: { type: "gatepass_sweep", runAt: new Date(Date.now() + GATEPASS_SWEEP_INTERVAL_MS) },
  });
}

async function processJob(job: { id: string; type: string }) {
  switch (job.type) {
    case "gatepass_sweep":
      await runGatepassSweep();
      break;
    default:
      throw new Error(`Unknown job type: ${job.type}`);
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
  const due = await db.job.findMany({
    where: { status: "pending", runAt: { lte: new Date() } },
    take: 10,
  });

  for (const job of due) {
    await db.job.update({ where: { id: job.id }, data: { status: "running" } });
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
  await ensureGatepassSweepScheduled();
  for (;;) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  logger.error("job.worker_crashed", { error: String(err) });
  process.exit(1);
});
