/**
 * One-off data correction (2026-10-02, user-caught): Amrapali Princely
 * Estate's Basement circuit was imported with its load inventory recorded as
 * 140 Tube light 20W, when the circuit genuinely only ever had 40 — the
 * demo's own measured readings (baseline 19.14 kWh/day, ~800 W) match 40
 * lights almost exactly (40 × 20 W × 24h ÷ 1000 = 19.2) and are nowhere near
 * what 140 would draw (67.2 kWh/day). The demo's own meteredLightCount and
 * the inventory line's replacementCount were already corrected to 40
 * through the app (setDemoLightCount, then the Light-replacement form's
 * "Save the correction") — only the inventory line's own `count` was left
 * at 140, which produced a visible, self-evident bug: the circuit's "kept
 * lights" deduction (100 kept = 140 - 40) dragged the saving to a reported
 * 227.83%, over 100% and plainly wrong.
 *
 * This replicates exactly what correctLockedCount() (inventory-actions.ts)
 * would do given the circuit's CURRENT state — verified by hand first:
 * planCountCorrection's own rule means circuit.meteredLightCount (already
 * 40) and the demo's meteredLightCount (already 40) are untouched (they no
 * longer "carry" the old 140 figure), and replacementCount (already 40,
 * not equal to the old count of 140) is also left alone — so this touches
 * ONLY the inventory line's own `count` column, then re-derives the
 * circuit's figures through the real single-writer function.
 *
 * pnpm tsx scripts/fix-amrapali-princely-inventory-count.ts --dry-run
 * pnpm tsx scripts/fix-amrapali-princely-inventory-count.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { logChange } from "../src/lib/change-log";
import { resyncCircuitFigures } from "../src/lib/circuit-figures";

const dryRun = process.argv.includes("--dry-run");

const CIRCUIT_ID = "bf-amrapali-princely-estate-ckt-1";
const LINE_ID = "bf-amrapali-princely-estate-ckt-1-dev-1";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth
const NEW_COUNT = 40;
const REASON = "Inventory imported with 140 lights; the circuit's demo readings and the already-corrected demo/replacement counts (40) confirm the circuit only ever had 40 — corrected to match.";

async function main() {
  const line = await db.circuitDevice.findUnique({
    where: { id: LINE_ID },
    select: { id: true, circuitId: true, count: true, replacementCount: true },
  });
  if (!line || line.circuitId !== CIRCUIT_ID) throw new Error("Inventory line not found or circuit mismatch — aborting.");
  const circuit = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: { id: true, meteredLightCount: true, benchmarkSavingsPct: true, preInstallBaseline: true },
  });
  if (!circuit) throw new Error("Circuit not found — aborting.");

  console.log("Before:", { lineCount: line.count, lineReplacementCount: line.replacementCount, circuitMeteredCount: circuit.meteredLightCount, benchmarkSavingsPct: circuit.benchmarkSavingsPct });

  if (line.count !== 140) throw new Error(`Expected the line's count to still be 140, found ${line.count} — state has moved, aborting rather than guessing.`);
  if (circuit.meteredLightCount !== 40) throw new Error(`Expected the circuit's meteredLightCount to already be 40, found ${circuit.meteredLightCount} — aborting.`);

  if (dryRun) {
    console.log("--dry-run: would set circuit_devices.count to", NEW_COUNT, "and re-derive the circuit's figures. No writes made.");
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.circuitDevice.update({ where: { id: LINE_ID }, data: { count: NEW_COUNT } });
    await logChange(tx, {
      entity: "circuit_device",
      entityId: LINE_ID,
      kind: "edit",
      field: "count",
      circuitId: CIRCUIT_ID,
      oldValue: line.count,
      newValue: NEW_COUNT,
      reason: REASON,
      actorId: ACTOR_ID,
    });
    await resyncCircuitFigures(tx, CIRCUIT_ID, ACTOR_ID);
  });

  const after = await db.circuitDevice.findUnique({ where: { id: LINE_ID }, select: { count: true, replacementCount: true } });
  const circuitAfter = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: { meteredLightCount: true, benchmarkSavingsPct: true, preInstallBaseline: true },
  });
  console.log("After:", { line: after, circuit: circuitAfter });
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
