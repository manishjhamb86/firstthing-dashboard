/**
 * One-time backfill (2026-10-06, user-caught on stage: a circuit rescaled
 * 34 -> 76 after its demo already confirmed still showed 76 on the survey
 * page, even after the lightCountAtDemoLock fix deployed).
 *
 * `resyncCircuitFigures` now captures `lightCountAtDemoLock` the first time
 * a demo is accepted at all (src/lib/circuit-figures.ts) — but it only ever
 * WRITES on a resync that actually runs, and a circuit that reached its
 * locked state before this column existed has no resync reason to run
 * again. This backfill is the one-time catch-up: for every circuit with an
 * accepted demo and no lock value yet, reconstruct what the count was
 * before anything ever moved it.
 *
 * A rescale event's own `previousLightCount` on the EARLIEST live event is
 * exactly that reconstruction (a rescale never touches the demo's own
 * count, only the circuit's `meteredLightCount` — so the oldest event's
 * "before" value is what the circuit read before any rescale ever fired).
 * A circuit with no rescale on record has never had its count moved this
 * way at all, so its current meteredLightCount already IS the locked value.
 *
 * pnpm tsx scripts/backfill-light-count-at-demo-lock.ts --dry-run
 * pnpm tsx scripts/backfill-light-count-at-demo-lock.ts
 */
import "./load-env";
import { db } from "../src/lib/db";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const circuits = await db.circuit.findMany({
    where: { lightCountAtDemoLock: null, benchmarkSavingsPct: { not: null } },
    select: {
      id: true,
      meteredLightCount: true,
      rescaleEvents: {
        where: { voidedAt: null },
        orderBy: { effectiveDate: "asc" },
        take: 1,
        select: { previousLightCount: true, effectiveDate: true },
      },
    },
  });

  console.log(`${circuits.length} circuits with a benchmark already on record and no survey-page lock yet.`);

  for (const c of circuits) {
    const value = c.rescaleEvents[0]?.previousLightCount ?? c.meteredLightCount;
    console.log(
      `  ${c.id}: ${c.rescaleEvents.length > 0 ? `from its first rescale (${c.rescaleEvents[0].effectiveDate.toISOString().slice(0, 10)})` : "no rescale on record — current count stands"} -> ${value}`,
    );
    if (!dryRun) {
      await db.circuit.update({ where: { id: c.id }, data: { lightCountAtDemoLock: value } });
    }
  }

  if (dryRun) {
    console.log("--dry-run: no writes made.");
  } else {
    console.log(`Backfilled ${circuits.length} circuits.`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
