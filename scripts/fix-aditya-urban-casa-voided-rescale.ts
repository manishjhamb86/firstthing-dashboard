/**
 * One-off data correction (2026-11-03, user-caught): Aditya Urban Casa's
 * circuit carried one voided BenchmarkRescaleEvent (22 -> 49, recorded
 * 2026-10-04, effective 2026-08-01) — the same stray test correction whose
 * paired ChangeLog rows were removed in
 * `fix-aditya-urban-casa-light-history.ts`. It is already voided (its own
 * voidReason says exactly this: the demos' own light counts, 100 and 22,
 * now carry this circuit's real light-count history, so the event no
 * longer reflects anything real) and already excluded from the baseline
 * replay (`effectiveBaselineAt`/`effectiveLightCountAt` skip voided rows).
 * Nothing points at it via `correctedByEventId` — confirmed before writing
 * this script. Deleting it changes no live figure; it is pure audit
 * clutter from the same data-entry mistake.
 *
 * Same direct-production-deletion call already made once this session for
 * two other voided rescale rows on a different circuit.
 *
 * pnpm tsx scripts/fix-aditya-urban-casa-voided-rescale.ts --dry-run
 * pnpm tsx scripts/fix-aditya-urban-casa-voided-rescale.ts
 */
import "./load-env";
import { db } from "../src/lib/db";

const dryRun = process.argv.includes("--dry-run");

const CIRCUIT_ID = "bf-aditya-urban-casa-ckt-1";
const EVENT_ID = "cmuu05jo003sek5qs0j8v6888";

async function main() {
  const event = await db.benchmarkRescaleEvent.findUnique({
    where: { id: EVENT_ID },
    select: {
      id: true, circuitId: true, previousLightCount: true, newLightCount: true,
      voidedAt: true, correctedByEventId: true,
    },
  });
  if (!event || event.circuitId !== CIRCUIT_ID) throw new Error("Event not found or circuit mismatch — aborting.");
  if (!event.voidedAt) throw new Error("This event is not voided — state has moved, aborting rather than guessing.");

  const pointingAtIt = await db.benchmarkRescaleEvent.findMany({ where: { correctedByEventId: EVENT_ID }, select: { id: true } });
  if (pointingAtIt.length > 0) throw new Error(`Another event points at this one as its correction target (${pointingAtIt.map((e) => e.id).join(", ")}) — aborting.`);

  const circuit = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: { benchmarkSavingsPct: true, benchmarkOverridePct: true, meteredLightCount: true },
  });
  console.log("Event to delete:", event);
  console.log("Circuit (unaffected — voided rows already count for nothing):", circuit);

  if (dryRun) {
    console.log("--dry-run: would delete this event. No writes made.");
    return;
  }

  await db.benchmarkRescaleEvent.delete({ where: { id: EVENT_ID } });
  const remaining = await db.benchmarkRescaleEvent.count({ where: { circuitId: CIRCUIT_ID } });
  console.log(`Deleted. Remaining rescale events on this circuit: ${remaining}`);

  const circuitAfter = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: { benchmarkSavingsPct: true, benchmarkOverridePct: true, meteredLightCount: true },
  });
  console.log("Circuit after (should match before):", circuitAfter);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
