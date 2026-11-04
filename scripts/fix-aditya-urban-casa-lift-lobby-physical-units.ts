/**
 * The correct fix, once replacementUnitsInstalled existed (2026-11-04):
 * the lift-lobby line's physical fixture count is 8 (not 16), shown only
 * in the inventory/report display. replacementCount stays 16 — the
 * savings formula is untouched, so this cannot repeat the 155.95%
 * impossible result the first attempt produced.
 *
 * pnpm tsx scripts/fix-aditya-urban-casa-lift-lobby-physical-units.ts --dry-run
 * pnpm tsx scripts/fix-aditya-urban-casa-lift-lobby-physical-units.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { logChange } from "../src/lib/change-log";

const dryRun = process.argv.includes("--dry-run");

const CIRCUIT_ID = "cmvb9f8ku0009r6p7cygtlwf6";
const LINE_ID = "cmvb9f8l4000ar6p7va61tjtk";
const DEMO_ID = "cmvb9funo000br6p77zm4rjya";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc";
const PHYSICAL_UNITS = 8;

async function main() {
  const line = await db.circuitDevice.findUnique({
    where: { id: LINE_ID },
    select: { id: true, circuitId: true, count: true, replacementCount: true, replacementUnitsInstalled: true },
  });
  if (!line || line.circuitId !== CIRCUIT_ID) throw new Error("Line not found or circuit mismatch — aborting.");
  if (line.count !== 16 || line.replacementCount !== 16) {
    throw new Error(`Expected count=16, replacementCount=16; found count=${line.count}, replacementCount=${line.replacementCount} — state has moved, aborting.`);
  }

  console.log("Before:", line);
  if (dryRun) {
    console.log(`--dry-run: would set replacementUnitsInstalled to ${PHYSICAL_UNITS}. replacementCount (16) is untouched. No writes made.`);
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.circuitDevice.update({ where: { id: LINE_ID }, data: { replacementUnitsInstalled: PHYSICAL_UNITS } });
    await logChange(tx, {
      entity: "circuit_device", entityId: LINE_ID, kind: "edit", field: "replacementUnitsInstalled",
      circuitId: CIRCUIT_ID, demoId: DEMO_ID,
      oldValue: line.replacementUnitsInstalled, newValue: PHYSICAL_UNITS,
      reason: "All 16 original 9W Surface Lights were removed, but only 8 physical 12W motion-enabled fixtures were installed (a consolidation). Display only — replacementCount (16) and the savings formula are unaffected.",
      actorId: ACTOR_ID,
    });
  });
  console.log(`Set replacementUnitsInstalled to ${PHYSICAL_UNITS}.`);

  const after = await db.circuitDevice.findUnique({ where: { id: LINE_ID }, select: { count: true, replacementCount: true, replacementUnitsInstalled: true } });
  const circuitAfter = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { benchmarkSavingsPct: true } });
  console.log("After:", after, "Circuit benchmarkSavingsPct (should be unchanged):", circuitAfter?.benchmarkSavingsPct);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
