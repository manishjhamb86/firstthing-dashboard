/**
 * One-off correction (2026-11-03, user-caught): the Lift Lobby & Staircase
 * circuit's light-replacement record showed "16 x Surface Light 9W ->
 * Replaced 16, Kept 0" -- claiming all 16 original fixtures were replaced
 * 1:1 with the new Motion-Enabled Dimmable Surface Light 12W type. The user
 * confirmed: all 16 old fixtures were in fact removed, but only 8 new 12W
 * motion lights were installed in their place (a genuine consolidation --
 * fewer, wider-coverage fixtures), not 16.
 *
 * The replacement TYPE (seed-dt-dimsurf12, "Motion-Enabled Dimmable Surface
 * Light 12W") and wattage (12W) were already correct -- only the COUNT was
 * wrong. `replacementCount` is read everywhere as "how many physical units
 * of the replacement type," with `count - replacementCount` as "kept,
 * still drawing the old wattage" -- there is no field for "fewer new units
 * than old, zero kept." Flagged to the user; their explicit call: set
 * replacementCount to 8 anyway, accepting that this understates the real
 * saving by a phantom 8x9W "kept" deduction the formula will apply (a
 * conservative/safe-direction error for billing, not an overstatement).
 *
 * This circuit's benchmark is NOT an override -- it is measured directly
 * from this demo's own savings%, and is the live basis for three ALREADY
 * RELEASED invoice-first months (Aug/Sep/Oct 2026). Correcting the device
 * line is not a rescale event, so the standard reading/rescale-triggered
 * re-derivation hooks would not touch those months on their own --
 * `rederiveInvoiceMonthsAfterRescale` is called explicitly afterward (its
 * `linesMateriallyChanged` check catches any real change regardless of
 * trigger), from 2026-08 (the earliest released, measured-basis month).
 *
 * pnpm tsx scripts/fix-aditya-urban-casa-lift-lobby-replacement-count.ts --dry-run
 * pnpm tsx scripts/fix-aditya-urban-casa-lift-lobby-replacement-count.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { resyncCircuitFigures } from "../src/lib/circuit-figures";
import { rederiveInvoiceMonthsAfterRescale } from "../src/lib/invoice-rederive";

const dryRun = process.argv.includes("--dry-run");

const CIRCUIT_ID = "cmvb9f8ku0009r6p7cygtlwf6";
const LINE_ID = "cmvb9f8l4000ar6p7va61tjtk";
const DEMO_ID = "cmvb9funo000br6p77zm4rjya";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth
const NEW_REPLACEMENT_COUNT = 8;
const FROM_PERIOD = "2026-08";

async function main() {
  const line = await db.circuitDevice.findUnique({
    where: { id: LINE_ID },
    select: { id: true, circuitId: true, demoId: true, count: true, wattage: true, replacementCount: true, replacementTypeId: true, replacementWattage: true, excludedFromCalculation: true },
  });
  if (!line || line.circuitId !== CIRCUIT_ID) throw new Error("Device line not found or circuit mismatch — aborting.");
  if (line.count !== 16) throw new Error(`Expected the line's original count to be 16, found ${line.count} — state has moved, aborting.`);
  if (line.replacementCount !== 16) throw new Error(`Expected replacementCount to be 16, found ${line.replacementCount} — state has moved, aborting.`);
  if (line.replacementTypeId !== "seed-dt-dimsurf12") throw new Error(`Expected replacementTypeId seed-dt-dimsurf12, found ${line.replacementTypeId} — aborting.`);

  const circuitBefore = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { benchmarkSavingsPct: true, benchmarkOverridePct: true, preInstallBaseline: true } });
  const demoBefore = await db.circuitDemo.findUnique({ where: { id: DEMO_ID }, select: { preInstallBaseline: true, postInstallAverage: true, savingsPct: true } });

  console.log("=== Before ===");
  console.log("Line:", line);
  console.log("Circuit:", circuitBefore);
  console.log("Demo:", demoBefore);
  console.log(`\nPlanned: replacementCount ${line.replacementCount} -> ${NEW_REPLACEMENT_COUNT} (type and wattage unchanged: ${line.replacementTypeId}, ${line.replacementWattage}W)`);

  if (dryRun) {
    console.log("--dry-run: would write the line correction, resync figures, and re-derive released months from", FROM_PERIOD, ". No writes made.");
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.circuitDevice.update({ where: { id: LINE_ID }, data: { replacementCount: NEW_REPLACEMENT_COUNT } });
    await tx.changeLog.create({
      data: {
        entity: "circuit_device", entityId: LINE_ID, kind: "edit", field: "replacementCount",
        circuitId: CIRCUIT_ID, demoId: DEMO_ID,
        oldValue: line.replacementCount, newValue: NEW_REPLACEMENT_COUNT,
        reason: "All 16 original 9W Surface Lights were removed, but only 8 new 12W motion-enabled fixtures were installed (a consolidation, not a 1:1 replacement) — the record had incorrectly shown 16 replaced.",
        actorId: ACTOR_ID,
      },
    });
    await resyncCircuitFigures(tx, CIRCUIT_ID, ACTOR_ID);
  });
  console.log(`\nLine corrected: replacementCount ${line.replacementCount} -> ${NEW_REPLACEMENT_COUNT}`);

  const { rederivedCalculationIds } = await rederiveInvoiceMonthsAfterRescale(CIRCUIT_ID, FROM_PERIOD, ACTOR_ID);
  console.log("Re-derived calculation ids:", rederivedCalculationIds);

  console.log("\n=== After ===");
  const circuitAfter = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { benchmarkSavingsPct: true, benchmarkOverridePct: true, preInstallBaseline: true } });
  const demoAfter = await db.circuitDemo.findUnique({ where: { id: DEMO_ID }, select: { preInstallBaseline: true, postInstallAverage: true, savingsPct: true } });
  console.log("Circuit:", circuitAfter);
  console.log("Demo:", demoAfter);

  const feeLines = await db.circuitFeeLine.findMany({
    where: { circuitId: CIRCUIT_ID, calculation: { period: { gte: FROM_PERIOD }, status: "released" } },
    select: { baselineKwhPerDay: true, basis: true, measuredSavingsPct: true, benchmarkSavingsPct: true, amount: true, calculation: { select: { period: true, status: true, rederivedAt: true } } },
  });
  feeLines.sort((a, b) => a.calculation.period.localeCompare(b.calculation.period));
  console.log("\nReleased fee lines from", FROM_PERIOD, "on, after re-derivation:");
  console.log(JSON.stringify(feeLines, null, 2));
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
