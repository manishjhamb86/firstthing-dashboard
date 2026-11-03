/**
 * Immediate revert (2026-11-03) of
 * fix-aditya-urban-casa-lift-lobby-replacement-count.ts: setting
 * replacementCount to 8 (with the kept-fixture deduction formula implying
 * 8 fixtures "kept" at the old 9W) produced an impossible 155.95% saving
 * once run for real — my earlier framing ("conservative understatement")
 * was wrong, computed only after the fact. Restores replacementCount to
 * 16 and re-derives, putting the circuit and its three released months
 * back to exactly their pre-correction state (benchmarkSavingsPct ~77.98%)
 * while a correct representation of "16 old removed, 8 new installed,
 * zero kept" is worked out.
 *
 * pnpm tsx scripts/revert-aditya-urban-casa-lift-lobby-replacement-count.ts --dry-run
 * pnpm tsx scripts/revert-aditya-urban-casa-lift-lobby-replacement-count.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { resyncCircuitFigures } from "../src/lib/circuit-figures";
import { rederiveInvoiceMonthsAfterRescale } from "../src/lib/invoice-rederive";

const dryRun = process.argv.includes("--dry-run");

const CIRCUIT_ID = "cmvb9f8ku0009r6p7cygtlwf6";
const LINE_ID = "cmvb9f8l4000ar6p7va61tjtk";
const DEMO_ID = "cmvb9funo000br6p77zm4rjya";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc";
const FROM_PERIOD = "2026-08";

async function main() {
  const line = await db.circuitDevice.findUnique({ where: { id: LINE_ID }, select: { id: true, circuitId: true, replacementCount: true } });
  if (!line || line.circuitId !== CIRCUIT_ID) throw new Error("Line not found or circuit mismatch — aborting.");
  if (line.replacementCount !== 8) throw new Error(`Expected replacementCount 8 (the broken state), found ${line.replacementCount} — state has moved, aborting.`);

  console.log("=== Before revert ===");
  const circuitBefore = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { benchmarkSavingsPct: true } });
  console.log("Circuit benchmarkSavingsPct (the broken 155.95%):", circuitBefore?.benchmarkSavingsPct);

  if (dryRun) {
    console.log("--dry-run: would restore replacementCount to 16, resync, and re-derive released months from", FROM_PERIOD, ". No writes made.");
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.circuitDevice.update({ where: { id: LINE_ID }, data: { replacementCount: 16 } });
    await tx.changeLog.create({
      data: {
        entity: "circuit_device", entityId: LINE_ID, kind: "edit", field: "replacementCount",
        circuitId: CIRCUIT_ID, demoId: DEMO_ID,
        oldValue: 8, newValue: 16,
        reason: "Reverting: replacementCount=8 (implying 8 fixtures kept at the old 9W) produced an impossible 155.95% saving once computed for real. Restoring to 16 while a correct representation of the real consolidation (16 old removed, 8 new installed, zero kept) is worked out.",
        actorId: ACTOR_ID,
      },
    });
    await resyncCircuitFigures(tx, CIRCUIT_ID, ACTOR_ID);
  });
  console.log("Reverted replacementCount to 16.");

  const { rederivedCalculationIds } = await rederiveInvoiceMonthsAfterRescale(CIRCUIT_ID, FROM_PERIOD, ACTOR_ID);
  console.log("Re-derived calculation ids:", rederivedCalculationIds);

  console.log("\n=== After revert ===");
  const circuitAfter = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { benchmarkSavingsPct: true, preInstallBaseline: true } });
  console.log("Circuit:", circuitAfter);
  const feeLines = await db.circuitFeeLine.findMany({
    where: { circuitId: CIRCUIT_ID, calculation: { period: { gte: FROM_PERIOD }, status: "released" } },
    select: { basis: true, measuredSavingsPct: true, amount: true, calculation: { select: { period: true } } },
  });
  feeLines.sort((a, b) => a.calculation.period.localeCompare(b.calculation.period));
  console.log("Released fee lines after revert:", JSON.stringify(feeLines, null, 2));
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
