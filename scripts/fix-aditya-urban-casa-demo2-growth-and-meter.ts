/**
 * One-off correction (2026-11-03, user-specified), replacing the earlier
 * stray attempt at this exact change (see fix-aditya-urban-casa-light-history.ts
 * and fix-aditya-urban-casa-voided-rescale.ts, which cleared the invalid
 * 2026-10-04/2026-10-16 test chain this circuit was left carrying).
 *
 * The real-world facts (user-confirmed): demo-1 and demo-2 were run on two
 * physically separate circuits, sharing one physical meter. Demo-1 (100
 * lights) was commissioned first; the meter then moved to demo-2's circuit
 * (22 lights) to commission it. After both demos, the meter stayed on
 * demo-2's circuit for ongoing monitoring — demo-1's circuit has had no live
 * meter since. The agreed benchmark (66.72%) is the fixed average of both
 * demos' own measured savings % and does NOT change. What changes is the
 * COMPARISON baseline used for ongoing monitoring, because only a portion
 * of the combined 122-light commissioned population is actually being
 * metered: "x/122*22 previously and x/122*49 now since 1st apr" (the user's
 * own words) — exactly the standard `rescaleBaseline()` formula,
 * `(baseline/previousLightCount)*newLightCount`, with newLightCount set to
 * the MONITORED SUBSET's count (49), not the combined total (149).
 *
 * Three parts, each mirroring the real application logic it corresponds to:
 *  1. A circuit-level BenchmarkRescaleEvent (INV-07), effective 01-Apr-2026,
 *     previousLightCount 122 -> newLightCount 49, using the real
 *     `rescaleBaseline` pure function — identical math to
 *     `recordLightCountChange`'s own transaction (rescale-actions.ts),
 *     minus the resolveAdmin()/requireSuperApproval() request-context
 *     plumbing a plain script cannot run.
 *  2. Demo-2's own `meteredLightCount` 22 -> 49 (a direct field write +
 *     ChangeLog, NOT via setDemoLightCount — that action also adjusts
 *     Circuit.representedLightCount under the assumption of a
 *     RECLASSIFICATION between demo-metered and full-installation lights,
 *     which does not apply here: this is a genuine population growth on
 *     demo-2's own circuit, representedLightCount is untouched).
 *  3. The meter reassignment: demo-1 loses its live meter reference but
 *     keeps its historical meterInstalledAt/displayedLoad record; demo-2
 *     gets bound to the SAME, already-existing MeterInstallation row (no
 *     deletion, no new span — the meter never physically left the circuit
 *     it's on, only which demo references it changes). Demo-2's own load
 *     reading (980W) is recorded against its new 49-light population —
 *     which happens to match theoretical exactly (49*20W=980W, 0%
 *     discrepancy), independently confirming the reading is real.
 *
 * Then: rederiveInvoiceMonthsAfterRescale(circuitId, "2026-04", actorId) —
 * the SAME re-derivation hook recordLightCountChange always calls after a
 * rescale. This re-examines every released, invoice-first month from April
 * 2026 on (Apr/May/Jul/Aug/Sep/Oct), and — as a byproduct of simply running
 * the real mechanism against the now-corrected state — repairs September's
 * own corrupted released calculation (23.528 baseline / 73.64% measured),
 * confirmed by timestamp to be a direct artifact of the same invalid test
 * chain already cleaned up, rather than anything genuine.
 *
 * pnpm tsx scripts/fix-aditya-urban-casa-demo2-growth-and-meter.ts --dry-run
 * pnpm tsx scripts/fix-aditya-urban-casa-demo2-growth-and-meter.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { resyncCircuitFigures } from "../src/lib/circuit-figures";
import { rescaleBaseline, refuseRescale, REFUSAL_MESSAGE } from "../src/lib/benchmark-rescale";
import { rederiveInvoiceMonthsAfterRescale } from "../src/lib/invoice-rederive";
import { expectedDisplayedLoadW } from "../src/lib/circuit-load";

const dryRun = process.argv.includes("--dry-run");

const CIRCUIT_ID = "bf-aditya-urban-casa-ckt-1";
const DEMO_1_ID = "cmutzpyo103rhk5qszl7jbemo"; // sequence 1, 100 lights
const DEMO_2_ID = "cmuu0fawh03snk5qscgz8x5t2"; // sequence 2, 22 -> 49 lights
const METER_ID = "cmtcrhmv7000g32qs7y7i76az";
// The meter's real history on this circuit is NOT a single continuous stay:
// cmutzsiei... (demo-1's own reference) was a one-day stay, 13->14-Dec-2025,
// closed "Demo 1 meter install"; the meter then spent ~10 months wrongly
// attached to a DIFFERENT circuit entirely (closed "Incorrect Circuit was
// attached"); it has been back on THIS circuit, live, since 17-Oct-2026 —
// cmvbumutp001nagp757hk4e9l, still open (removedAt: null). THAT is the row
// demo-2 is bound to — not the old 2025 one-day stay.
const CURRENT_INSTALLATION_ID = "cmvbumutp001nagp757hk4e9l";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth
const NEW_DEMO2_COUNT = 49;
const EFFECTIVE_DATE = new Date("2026-04-01T00:00:00.000Z");
const DEMO2_DISPLAYED_LOAD_W = 980;

async function main() {
  const circuit = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: {
      id: true, societyId: true, wattage: true,
      meteredLightCount: true, preInstallBaseline: true,
      benchmarkSavingsPct: true, benchmarkOverridePct: true,
      rescaleEvents: { where: { voidedAt: null }, select: { id: true } },
      devices: { select: { count: true, wattage: true } },
    },
  });
  if (!circuit) throw new Error("Circuit not found — aborting.");
  if (circuit.rescaleEvents.length > 0) throw new Error(`Circuit already has ${circuit.rescaleEvents.length} live rescale event(s) — state has moved since this script was written, aborting.`);

  const demo1 = await db.circuitDemo.findUnique({
    where: { id: DEMO_1_ID },
    select: { id: true, circuitId: true, sequence: true, meteredLightCount: true, meterId: true, meterInstallationId: true, meterSkipped: true, meterInstalledAt: true, meterDisplayedLoad: true, loadDiscrepancyPct: true },
  });
  const demo2 = await db.circuitDemo.findUnique({
    where: { id: DEMO_2_ID },
    select: { id: true, circuitId: true, sequence: true, meteredLightCount: true, meterId: true, meterInstallationId: true, meterSkipped: true, meterInstalledAt: true, meterDisplayedLoad: true, loadDiscrepancyPct: true },
  });
  if (!demo1 || demo1.circuitId !== CIRCUIT_ID) throw new Error("Demo-1 not found or circuit mismatch — aborting.");
  if (!demo2 || demo2.circuitId !== CIRCUIT_ID) throw new Error("Demo-2 not found or circuit mismatch — aborting.");
  if (demo1.meterId !== METER_ID) {
    throw new Error("Demo-1's meter state has moved from what this script expects — aborting rather than guessing.");
  }
  if (demo2.meterId !== null || !demo2.meterSkipped) {
    throw new Error("Demo-2 already has a meter bound — state has moved, aborting.");
  }
  if (demo2.meteredLightCount !== 22) {
    throw new Error(`Demo-2's light count is ${demo2.meteredLightCount}, not the expected 22 — state has moved, aborting.`);
  }

  const installation = await db.meterInstallation.findUnique({ where: { id: CURRENT_INSTALLATION_ID }, select: { id: true, meterId: true, circuitId: true, installedAt: true, removedAt: true } });
  if (!installation || installation.circuitId !== CIRCUIT_ID || installation.meterId !== METER_ID || installation.removedAt !== null) {
    throw new Error("The current live meter installation is missing, closed, or doesn't match — aborting.");
  }

  console.log("=== Before ===");
  console.log("Circuit:", circuit);
  console.log("Demo-1:", demo1);
  console.log("Demo-2:", demo2);
  console.log("Installation (unchanged throughout):", installation);

  // --- 1. The rescale event ---
  const refusal = refuseRescale({
    commissionedBaseline: circuit.preInstallBaseline,
    currentLightCount: circuit.meteredLightCount,
    newLightCount: NEW_DEMO2_COUNT,
    verificationNote: "placeholder",
    effectiveDate: EFFECTIVE_DATE,
    compositionHandled: true,
  });
  if (refusal) throw new Error(`Rescale refused: ${REFUSAL_MESSAGE[refusal]}`);
  const previousBaseline = circuit.preInstallBaseline!;
  const rescaledBaseline = rescaleBaseline(previousBaseline, circuit.meteredLightCount, NEW_DEMO2_COUNT);
  const verificationNote =
    "Demo-1 and demo-2 were commissioned on two physically separate circuits sharing one meter; the meter now lives permanently on demo-2's circuit, which grew from 22 to 49 lights. The agreed benchmark (the average of both demos' measured savings) is unchanged -- only the comparison baseline for the monitored subset moves, proportional to the combined 122-light commissioned total: (59.9233/122)*49, the standard rescale formula.";

  console.log("\n=== Planned rescale ===");
  console.log({ previousLightCount: circuit.meteredLightCount, newLightCount: NEW_DEMO2_COUNT, previousBaseline, rescaledBaseline, effectiveDate: EFFECTIVE_DATE.toISOString() });

  // --- 2. Demo-2's own count field ---
  console.log("\n=== Planned demo-2 count change ===");
  console.log({ demoId: DEMO_2_ID, from: demo2.meteredLightCount, to: NEW_DEMO2_COUNT });

  // --- 3. The meter move ---
  const theoretical = expectedDisplayedLoadW({ meteredLightCount: NEW_DEMO2_COUNT, wattage: circuit.wattage, devices: circuit.devices }).watts;
  const discrepancyPct = (Math.abs(DEMO2_DISPLAYED_LOAD_W - theoretical) / theoretical) * 100;
  console.log("\n=== Planned meter move ===");
  console.log({
    demo1: { from: { meterId: demo1.meterId, meterInstallationId: demo1.meterInstallationId, meterSkipped: false }, to: { meterId: null, meterInstallationId: null, meterSkipped: true } },
    demo2: { from: { meterId: null, meterInstallationId: null, meterSkipped: true }, to: { meterId: METER_ID, meterInstallationId: CURRENT_INSTALLATION_ID, meterSkipped: false, meterInstalledAt: "unchanged (demo-2's own commissioning pivot, Dec 2025)", displayedLoad: DEMO2_DISPLAYED_LOAD_W } },
    theoreticalW: theoretical,
    discrepancyPct,
  });

  if (dryRun) {
    console.log("\n--dry-run: would write the above and re-derive invoice-first months from 2026-04 on. No writes made.");
    return;
  }

  // --- Write: rescale event ---
  await db.$transaction(async (tx) => {
    const event = await tx.benchmarkRescaleEvent.create({
      data: {
        circuitId: CIRCUIT_ID,
        previousLightCount: circuit.meteredLightCount,
        newLightCount: NEW_DEMO2_COUNT,
        previousBaseline,
        rescaledBaseline,
        verificationNote,
        effectiveDate: EFFECTIVE_DATE,
        recordedById: ACTOR_ID,
      },
    });
    await tx.circuit.update({ where: { id: CIRCUIT_ID }, data: { meteredLightCount: NEW_DEMO2_COUNT } });
    console.log("\nRescale event created:", event.id);
  });

  // --- Write: demo-2's own count ---
  await db.$transaction(async (tx) => {
    await tx.circuitDemo.update({ where: { id: DEMO_2_ID }, data: { meteredLightCount: NEW_DEMO2_COUNT } });
    await tx.changeLog.create({
      data: {
        entity: "circuit_demo", entityId: DEMO_2_ID, kind: "edit", field: "meteredLightCount",
        circuitId: CIRCUIT_ID, demoId: DEMO_2_ID,
        oldValue: demo2.meteredLightCount, newValue: NEW_DEMO2_COUNT,
        reason: "The physical lights on demo-2's own circuit grew from 22 to 49, effective 01-Apr-2026 -- recorded alongside the circuit-level light-count rescale (same date, same reason).",
        actorId: ACTOR_ID,
      },
    });
    await resyncCircuitFigures(tx, CIRCUIT_ID, ACTOR_ID);
  });
  console.log("Demo-2 light count updated to", NEW_DEMO2_COUNT);

  // --- Write: the meter move ---
  await db.$transaction(async (tx) => {
    await tx.changeLog.create({
      data: {
        entity: "circuit_demo", entityId: DEMO_1_ID, kind: "edit", field: "meter",
        circuitId: CIRCUIT_ID, demoId: DEMO_1_ID, meterId: METER_ID,
        oldValue: { meterId: demo1.meterId, meterInstallationId: demo1.meterInstallationId, meterSkipped: false },
        newValue: { meterId: null, meterInstallationId: null, meterSkipped: true },
        reason: "The meter moved permanently to demo-2's circuit after both demos were commissioned -- demo-1's circuit has had no live meter since.",
        actorId: ACTOR_ID,
      },
    });
    await tx.circuitDemo.update({
      where: { id: DEMO_1_ID },
      data: { meterId: null, meterInstallationId: null, meterSkipped: true },
    });

    await tx.changeLog.create({
      data: {
        entity: "circuit_demo", entityId: DEMO_2_ID, kind: "edit", field: "meter",
        circuitId: CIRCUIT_ID, demoId: DEMO_2_ID, meterId: METER_ID,
        oldValue: { meterId: null, meterInstallationId: null, meterSkipped: true },
        newValue: { meterId: METER_ID, meterInstallationId: CURRENT_INSTALLATION_ID, meterSkipped: false, displayedLoad: DEMO2_DISPLAYED_LOAD_W },
        reason: "Demo-2's circuit is now served by this meter, via its current live installation (open since 17-Oct-2026, after ~10 months wrongly attached elsewhere). Demo-2's own historical meterInstalledAt/periods (Dec 2025) are left untouched -- they record when this demo was actually commissioned, which this installation row does not retroactively change.",
        actorId: ACTOR_ID,
      },
    });
    await tx.circuitDemo.update({
      where: { id: DEMO_2_ID },
      data: {
        meterId: METER_ID,
        meterInstallationId: CURRENT_INSTALLATION_ID,
        meterSkipped: false,
        meterDisplayedLoad: DEMO2_DISPLAYED_LOAD_W,
        loadDiscrepancyPct: discrepancyPct,
        loadValidationOverrideById: null,
        loadValidationOverrideReason: null,
      },
    });
    await resyncCircuitFigures(tx, CIRCUIT_ID, ACTOR_ID);
  });
  console.log("Meter moved from demo-1 to demo-2 (same installation row, unchanged).");

  // --- Re-derive affected invoice-first months ---
  const { rederivedCalculationIds } = await rederiveInvoiceMonthsAfterRescale(CIRCUIT_ID, "2026-04", ACTOR_ID);
  console.log("\nRe-derived calculation ids:", rederivedCalculationIds);

  console.log("\n=== After ===");
  const circuitAfter = await db.circuit.findUnique({ where: { id: CIRCUIT_ID }, select: { meteredLightCount: true, preInstallBaseline: true, benchmarkSavingsPct: true, benchmarkOverridePct: true, rescaleEvents: { select: { id: true, previousLightCount: true, newLightCount: true, previousBaseline: true, rescaledBaseline: true, effectiveDate: true, voidedAt: true } } } });
  console.log("Circuit:", JSON.stringify(circuitAfter, null, 2));
  const demo1After = await db.circuitDemo.findUnique({ where: { id: DEMO_1_ID }, select: { meteredLightCount: true, meterId: true, meterInstallationId: true, meterSkipped: true } });
  const demo2After = await db.circuitDemo.findUnique({ where: { id: DEMO_2_ID }, select: { meteredLightCount: true, meterId: true, meterInstallationId: true, meterSkipped: true, meterDisplayedLoad: true, loadDiscrepancyPct: true } });
  console.log("Demo-1:", demo1After);
  console.log("Demo-2:", demo2After);

  const feeLines = await db.circuitFeeLine.findMany({
    where: { circuitId: CIRCUIT_ID, calculation: { period: { gte: "2026-04" }, status: "released" } },
    select: { baselineKwhPerDay: true, basis: true, measuredSavingsPct: true, benchmarkSavingsPct: true, amount: true, calculation: { select: { period: true, status: true, rederivedAt: true } } },
  });
  feeLines.sort((a, b) => a.calculation.period.localeCompare(b.calculation.period));
  console.log("\nReleased fee lines from 2026-04 on, after re-derivation:");
  console.log(JSON.stringify(feeLines, null, 2));
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
