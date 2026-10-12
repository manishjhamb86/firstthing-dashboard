import "./load-env";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rederiveInvoiceMonthsAfterRescale } from "@/lib/invoice-rederive";

const CIRCUIT_ID = "cmu5bji2s0aq2ioqsoapmfqi7";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth
const DRY_RUN = process.env.DRY_RUN === "1";

/**
 * User-asked (2026-10-12): remove every rescale event this circuit has
 * accumulated while troubleshooting the demo-count issue — none of them
 * represent anything real — and reset the circuit's own metered count to
 * the one figure that is currently trustworthy: 42, the same as the demo
 * it was measured on. The user will re-enter the real history (the two
 * genuine light-count changes) themselves once this is clean.
 */
async function main() {
  const events = await db.benchmarkRescaleEvent.findMany({
    where: { circuitId: CIRCUIT_ID },
    orderBy: { recordedAt: "asc" },
  });
  console.log(
    "events to remove:",
    events.map((e) => ({ id: e.id, previous: e.previousLightCount, new: e.newLightCount, effectiveDate: e.effectiveDate, voidedAt: e.voidedAt })),
  );
  if (events.some((e) => e.correctedByEventId)) {
    throw new Error("an event links to another via correctedByEventId — stopping, this needs manual review");
  }
  if (events.length === 0) {
    console.log("no rescale events on this circuit, nothing to remove");
    return;
  }

  const circuit = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { meteredLightCount: true } });
  console.log("circuit.meteredLightCount before:", circuit?.meteredLightCount);

  if (DRY_RUN) {
    console.log("[dry run] would delete", events.length, "rescale events and set meteredLightCount to 42");
    return;
  }

  const earliestEffectiveDate = events.reduce((min, e) => (e.effectiveDate < min ? e.effectiveDate : min), events[0].effectiveDate);

  await db.$transaction([
    db.benchmarkRescaleEvent.deleteMany({ where: { circuitId: CIRCUIT_ID } }),
    db.circuit.update({ where: { id: CIRCUIT_ID }, data: { meteredLightCount: 42 } }),
  ]);
  logger.info("circuit.rescale_events_cleared", { actorId: ACTOR_ID, circuitId: CIRCUIT_ID, removed: events.length, restoredCount: 42 });

  const r = await rederiveInvoiceMonthsAfterRescale(CIRCUIT_ID, earliestEffectiveDate.toISOString().slice(0, 7), ACTOR_ID);
  console.log("rederiveInvoiceMonthsAfterRescale result:", r);

  const after = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { meteredLightCount: true, representedLightCount: true } });
  const remaining = await db.benchmarkRescaleEvent.count({ where: { circuitId: CIRCUIT_ID } });
  console.log("FINAL circuit state:", after, "remaining rescale events:", remaining);
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
