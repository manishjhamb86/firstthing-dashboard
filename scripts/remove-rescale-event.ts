/**
 * One-off cleanup (2026-10-06, user-asked) — the THIRD artefact from the
 * same testing session, found only after the two ChangeLog rows were
 * removed: a `BenchmarkRescaleEvent` (34 -> 76, effective 2026-09-01) still
 * live on the circuit, recorded five minutes after the correction pair
 * already cleaned up. This is the exact event the user's very first report
 * in this thread described ("it was changed from 34 to 76 on 01-sep-2026")
 * — a separate mechanism from the demo-count correction (CircuitDemo.
 * meteredLightCount), so deleting the ChangeLog pair never touched it, and
 * it kept Circuit.meteredLightCount sitting at 76 while the demo's own
 * count had already gone back to 34 — the disagreement behind "everything
 * else is wrong now".
 *
 * Replicates `removeRescaleEvent` (rescale-actions.ts) exactly — the real,
 * already-built, demo-mode-only "remove completely" action — rather than
 * reimplementing the logic, since that action itself cannot run outside a
 * real request (it calls resolveAdmin(), which needs cookies()). Imports
 * the same `rederiveInvoiceMonthsAfterRescale` it calls, so a released
 * invoice month depending on this event's effect re-derives the same way
 * the UI action would.
 *
 * pnpm tsx scripts/remove-rescale-event.ts --dry-run <eventId>
 * pnpm tsx scripts/remove-rescale-event.ts <eventId>
 */
import "./load-env";
import { db } from "../src/lib/db";
import { rederiveInvoiceMonthsAfterRescale } from "../src/lib/invoice-rederive";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const eventId = args.find((a) => a !== "--dry-run");
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth — the import-style actor every prior one-off script in this repo uses

async function main() {
  if (!eventId) {
    console.log("Usage: pnpm tsx scripts/remove-rescale-event.ts [--dry-run] <eventId>");
    process.exitCode = 1;
    return;
  }

  const event = await db.benchmarkRescaleEvent.findUnique({
    where: { id: eventId },
    include: { circuit: { select: { id: true, societyId: true, meteredLightCount: true } } },
  });
  if (!event) {
    console.log(`Not found (already gone?): ${eventId}`);
    return;
  }
  console.log(
    `  ${event.id} — circuit ${event.circuitId}: ${event.previousLightCount} -> ${event.newLightCount}, effective ${event.effectiveDate.toISOString().slice(0, 10)}, recorded ${event.recordedAt.toISOString()}`,
  );
  console.log(`  circuit currently reads meteredLightCount = ${event.circuit.meteredLightCount}`);

  const survivors = await db.benchmarkRescaleEvent.findMany({
    where: { circuitId: event.circuitId, voidedAt: null, id: { not: eventId } },
    orderBy: { effectiveDate: "asc" },
  });
  const earliest = await db.benchmarkRescaleEvent.findFirst({
    where: { circuitId: event.circuitId },
    orderBy: { effectiveDate: "asc" },
    select: { previousLightCount: true },
  });
  const restoredCount = survivors.length ? survivors[survivors.length - 1].newLightCount : (earliest?.previousLightCount ?? event.previousLightCount);
  console.log(`  ${survivors.length} other live event(s) on this circuit; would restore meteredLightCount to ${restoredCount}`);

  if (dryRun) {
    console.log("--dry-run: no writes made.");
    return;
  }

  await db.$transaction([
    db.benchmarkRescaleEvent.updateMany({ where: { correctedByEventId: eventId }, data: { correctedByEventId: null } }),
    db.benchmarkRescaleEvent.delete({ where: { id: eventId } }),
    db.circuit.update({ where: { id: event.circuitId }, data: { meteredLightCount: restoredCount } }),
  ]);
  console.log(`  removed; circuit.meteredLightCount now ${restoredCount}`);

  try {
    await rederiveInvoiceMonthsAfterRescale(event.circuitId, event.effectiveDate.toISOString().slice(0, 7), ACTOR_ID);
    console.log("  published invoice months re-derived (if any needed it)");
  } catch (err) {
    console.log(`  WARNING: re-deriving published months failed — ${String(err)}`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
