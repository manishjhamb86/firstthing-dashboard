/**
 * One-time backfill (2026-10-05, user-asked): every stored `MeterReading`
 * day gets the new, circuit-aware `dayClass` the dashboards and the monthly
 * report now read (`src/lib/day-validity.ts`), rather than only new rows
 * going forward.
 *
 * INV-03 — never restate a billed figure: any row with `usedInCalculationId`
 * set is skipped outright, counted, never touched.
 *
 * Two paths, per circuit, neither reimplementing the real classification:
 *  - a circuit with meter-install history gets `projectCircuitMonitoring`
 *    re-run — the SAME authoritative writer that will classify its ongoing
 *    rows from here on, so a backfilled row and a freshly-projected one are
 *    computed by identical logic. It already respects INV-03, already
 *    builds the per-hour presence the hours-based check needs, and already
 *    applies (or, for an operator's existing override, correctly withholds)
 *    the auto-exclude.
 *  - a monthly-upload or legacy row with no meter behind it has no per-hour
 *    breakdown to re-derive, so it is classified directly, by COUNT against
 *    the circuit's own learned expected-hour total — written INFORMATIONALLY
 *    only (`dayClass` + the two hour counts). It does NOT gain a new
 *    auto-exclude from this script: that behaviour belongs to the live
 *    monitoring-projection path, and retroactively excluding historical
 *    monthly-upload days that have always counted is a materially bigger,
 *    unasked-for change than backfilling the classification itself.
 *
 * pnpm tsx scripts/backfill-day-validity.ts --dry-run
 * pnpm tsx scripts/backfill-day-validity.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { classifyDayHours, inferOperatingHours } from "../src/lib/day-validity";
import { circuitHourlySamples, projectCircuitMonitoring } from "../src/lib/monitoring-projection";

const dryRun = process.argv.includes("--dry-run");
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth — the import-style actor every prior one-off script in this repo uses

async function main() {
  const now = new Date();

  const unclassified = await db.meterReading.findMany({
    where: { dayClass: null },
    select: { id: true, circuitId: true, usedInCalculationId: true, origin: true },
  });
  const skippedBilled = unclassified.filter((r) => r.usedInCalculationId !== null).length;
  const circuitIds = [...new Set(unclassified.filter((r) => r.usedInCalculationId === null).map((r) => r.circuitId))];

  console.log(`${unclassified.length} unclassified rows across ${circuitIds.length} circuits; ${skippedBilled} already billed — skipped outright, never touched.`);

  if (dryRun) {
    console.log("--dry-run: would re-project meter-origin circuits and directly classify the rest. No writes made.");
    return;
  }

  let reprojected = 0;
  let directlyClassified = 0;

  for (const circuitId of circuitIds) {
    const hasMeterHistory = (await db.meterInstallation.count({ where: { circuitId } })) > 0;
    if (hasMeterHistory) {
      await projectCircuitMonitoring(circuitId, ACTOR_ID);
      reprojected++;
    }

    // Whatever the projection above did not reach (monthly-upload/legacy
    // rows, or any row still left unclassified for a voided/unbilled
    // circuit with no live meter binding) — classified directly, count only.
    const remaining = await db.meterReading.findMany({
      where: { circuitId, dayClass: null, usedInCalculationId: null },
      select: { id: true, intervalCount: true },
    });
    if (remaining.length === 0) continue;

    const meterInstallations = await db.meterInstallation.findMany({
      where: { circuitId },
      select: { meterId: true, installedAt: true, removedAt: true },
    });
    const operating = inferOperatingHours(await circuitHourlySamples(meterInstallations, now), now);

    for (const row of remaining) {
      const hourClass = classifyDayHours({ hourlyPresent: null, intervalCount: row.intervalCount }, operating);
      await db.meterReading.update({
        where: { id: row.id },
        data: {
          dayClass: hourClass.dayClass,
          dayClassHoursExpected: hourClass.hoursExpected,
          dayClassHoursPresent: hourClass.hoursPresent,
        },
      });
      directlyClassified++;
    }
  }

  const stillNull = await db.meterReading.count({ where: { dayClass: null, usedInCalculationId: null } });
  console.log({ reprojectedCircuits: reprojected, directlyClassified, stillUnclassifiedAndUnbilled: stillNull, skippedBilled });
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
