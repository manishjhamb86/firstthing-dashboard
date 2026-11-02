/**
 * One-off data correction (2026-11-02, user-caught): Amrapali Princely
 * Estate's circuit showed its demos measuring 73.86%, where it had correctly
 * read a lower figure before. Traced to an orphaned `CircuitDevice` line —
 * 27 × a 15W surface-light type, `excludedFromCalculation: true` — created
 * alongside a since-voided, mistaken light-count change (152 -> 148
 * lights). That rescale event (and a sibling mistaken one, 121 -> 148) were
 * voided through the app, then both voided rows were removed directly from
 * the database as invalid audit clutter (the user's own call, matching this
 * repo's standing "void stays on record, demo-mode-only removal is for
 * before go-live" rule — these were pure data-entry mistakes, not real
 * history). `CircuitDevice.addedViaRescaleEventId` is `onDelete: SetNull`,
 * so removing the voided rescale event left this device line behind,
 * disconnected from its own provenance but still counted in every demo's
 * savings deduction (exclusionFromDevices): its own 27 x 15W x 24h / 1000 =
 * 9.72 kWh/day theoretical draw, applied as "a different item kept on the
 * circuit," is exactly what turned the correct ~57% figure into 73.86% —
 * (43.07 - 18.43875) / (43.07 - 9.72) = 0.7386...
 *
 * This replicates exactly what the in-app "Remove" control on an excluded
 * line does (removeExcludedDeviceLine, rescale-actions.ts) once its own
 * missing resyncCircuitFigures call is fixed (the same session, same commit
 * this script accompanies) — delete the line, then re-derive the circuit's
 * figures through the real single-writer function. That code fix itself is
 * held for tonight's deploy window; this script only touches data, which is
 * safe to run anytime.
 *
 * pnpm tsx scripts/fix-amrapali-princely-orphaned-excluded-line.ts --dry-run
 * pnpm tsx scripts/fix-amrapali-princely-orphaned-excluded-line.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { resyncCircuitFigures } from "../src/lib/circuit-figures";

const dryRun = process.argv.includes("--dry-run");

const CIRCUIT_ID = "cmv897nxz0028ufp7ue60nqhk";
const LINE_ID = "cmvz4233w21tr1sp7t4e64uqo";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth

async function main() {
  const line = await db.circuitDevice.findUnique({
    where: { id: LINE_ID },
    select: { id: true, circuitId: true, count: true, wattage: true, hoursPerDay: true, excludedFromCalculation: true, addedViaRescaleEventId: true },
  });
  if (!line || line.circuitId !== CIRCUIT_ID) throw new Error("Device line not found or circuit mismatch — aborting.");
  if (!line.excludedFromCalculation) throw new Error("This line is not marked excludedFromCalculation — state has moved, aborting rather than guessing.");

  const demo = await db.circuitDemo.findFirst({
    where: { circuitId: CIRCUIT_ID, voidedAt: null, rejected: false },
    select: { id: true, savingsPct: true, preInstallBaseline: true, postInstallAverage: true },
  });
  const circuit = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: { id: true, benchmarkSavingsPct: true, benchmarkOverridePct: true },
  });
  if (!circuit) throw new Error("Circuit not found — aborting.");

  console.log("Before:", { line, demo, circuit });

  if (dryRun) {
    console.log("--dry-run: would delete the device line and re-derive the circuit's figures. No writes made.");
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.circuitDevice.delete({ where: { id: LINE_ID } });
    await resyncCircuitFigures(tx, CIRCUIT_ID, ACTOR_ID);
  });

  const lineAfter = await db.circuitDevice.findUnique({ where: { id: LINE_ID } });
  const demoAfter = await db.circuitDemo.findFirst({
    where: { circuitId: CIRCUIT_ID, voidedAt: null, rejected: false },
    select: { id: true, savingsPct: true, preInstallBaseline: true, postInstallAverage: true },
  });
  const circuitAfter = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: { benchmarkSavingsPct: true, benchmarkOverridePct: true },
  });
  console.log("After:", { lineDeleted: lineAfter === null, demo: demoAfter, circuit: circuitAfter });
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
