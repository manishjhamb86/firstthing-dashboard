import type { JobType } from "@prisma/client";
import { db } from "@/lib/db";

// ADR-003 — thin insert helper for the Postgres-backed job queue; the
// actual processing loop lives in scripts/job-worker.ts, a separate
// process, not something the Next.js request/response cycle runs itself.
export async function scheduleJob(type: JobType, runAt: Date, payload?: object) {
  await db.job.create({ data: { type, runAt, payload: payload ?? undefined } });
}
