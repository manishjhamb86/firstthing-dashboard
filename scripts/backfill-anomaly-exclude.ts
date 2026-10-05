/**
 * One-time backfill (2026-10-06, user-caught: a day the system had already
 * flagged with a blocking ReadingAnomaly was still counted toward every
 * average, with no visible reason and no indication an exclusion was even
 * warranted — "the system is asking to manually exclude the partial
 * readings. Instead the default behaviour should be exclude automatically").
 *
 * `src/app/admin/readings/actions.ts` now auto-excludes a blocking
 * anomaly's own day at commit time, going forward. This is the catch-up
 * for every blocking anomaly already on record from before that existed.
 *
 * Never touches a billed row, an already-excluded row, or one an operator
 * has already confirmed valid (validOverrideAt) — exactly the same guards
 * the live write path now applies.
 *
 * pnpm tsx scripts/backfill-anomaly-exclude.ts --dry-run
 * pnpm tsx scripts/backfill-anomaly-exclude.ts
 */
import "./load-env";
import { db } from "../src/lib/db";

const dryRun = process.argv.includes("--dry-run");
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth — the import-style actor every prior one-off script in this repo uses

async function main() {
  const anomalies = await db.readingAnomaly.findMany({
    where: { blocksBilling: true, status: "open", date: { not: null } },
    select: { circuitId: true, date: true, detail: true },
  });
  console.log(`${anomalies.length} open, blocking anomalies to reconcile.`);

  let excluded = 0;
  for (const a of anomalies) {
    const where = {
      circuitId: a.circuitId,
      date: a.date!,
      source: "csv" as const,
      excludedAt: null,
      validOverrideAt: null,
      usedInCalculationId: null,
    };
    if (dryRun) {
      const count = await db.meterReading.count({ where });
      if (count > 0) {
        excluded += count;
        console.log(`  ${a.circuitId} ${a.date!.toISOString().slice(0, 10)}: ${a.detail}`);
      }
      continue;
    }
    const { count } = await db.meterReading.updateMany({
      where,
      data: { excludedAt: new Date(), excludedById: ACTOR_ID, excludedReason: a.detail },
    });
    if (count > 0) {
      excluded += count;
      console.log(`  ${a.circuitId} ${a.date!.toISOString().slice(0, 10)}: ${a.detail}`);
    }
  }
  console.log({ excluded, dryRun });
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
