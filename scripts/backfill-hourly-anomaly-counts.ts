/**
 * One-time backfill (2026-10-06, user-asked): every meter-origin
 * `MeterReading` day gets the new per-hour red/yellow/green anomaly counts
 * (`src/lib/hourly-anomaly.ts`) the live-monitoring readings table now
 * shows, rather than only rows projected from here on.
 *
 * The real writer is `projectCircuitMonitoring` — the SAME authoritative
 * function every ongoing import already runs through, now also re-running
 * for any circuit whose stored rows are still missing their hourly counts
 * (monitoring-projection.ts's own "unchanged" skip path was widened for
 * exactly this: a day whose value hasn't moved still gets written if its
 * hourly counts are null). This script never reimplements the
 * classification itself — it only decides WHICH circuits to re-project.
 *
 * A row with no bound meter (a monthly-upload/legacy day, with no hourly
 * breakdown to classify) correctly stays null — there is nothing to count.
 * A row on a released calculation is untouched by the projection itself
 * (INV-03), so nothing here can restate a billed figure.
 *
 * pnpm tsx scripts/backfill-hourly-anomaly-counts.ts --dry-run
 * pnpm tsx scripts/backfill-hourly-anomaly-counts.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { projectCircuitMonitoring } from "../src/lib/monitoring-projection";

const dryRun = process.argv.includes("--dry-run");
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth — the import-style actor every prior one-off script in this repo uses

async function main() {
  const missing = await db.meterReading.findMany({
    where: { origin: "meter", hourlyNormalCount: null },
    select: { id: true, circuitId: true, usedInCalculationId: true },
  });
  const skippedBilled = missing.filter((r) => r.usedInCalculationId !== null).length;
  const circuitIds = [...new Set(missing.filter((r) => r.usedInCalculationId === null).map((r) => r.circuitId))];

  console.log(
    `${missing.length} meter-origin rows missing their hourly counts, across ${circuitIds.length} circuits; ${skippedBilled} already billed — projectCircuitMonitoring itself skips those (INV-03), never touched.`,
  );

  if (dryRun) {
    console.log("--dry-run: would re-project every listed circuit. No writes made.");
    return;
  }

  let reprojected = 0;
  for (const circuitId of circuitIds) {
    await projectCircuitMonitoring(circuitId, ACTOR_ID);
    reprojected++;
  }

  const stillNull = await db.meterReading.count({ where: { origin: "meter", hourlyNormalCount: null, usedInCalculationId: null } });
  console.log({ reprojectedCircuits: reprojected, stillMissingAndUnbilled: stillNull, skippedBilled });
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
