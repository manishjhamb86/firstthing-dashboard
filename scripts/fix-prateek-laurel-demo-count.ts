/**
 * One-off data correction (2026-10-14, user-asked): Prateek Laurel's
 * Basement Parking circuit's demo (a migrated, pre-system record) carries
 * meteredLightCount 45 — the user's own words: "45 count was after demo not
 * during demo. so change it back to 39" — the inventory line (and its
 * replacementCount) already correctly reads 39, confirming 39 is the real
 * in-demo figure and 45 was typed in afterward, in error.
 *
 * This replicates exactly what setDemoLightCount() (demo-step-actions.ts)
 * does live (operations, with a reason, outside demo mode — 2026-10-12's own
 * addition for precisely this situation: "a demo's OWN historical count was
 * mistakenly typed over with the circuit's later, larger live count"),
 * because that action is session-bound and cannot be called directly from a
 * script: unlock the shared demo first, correct its count (moving the
 * full-installation/demo split the opposite way, per 2026-10-05's rule, so
 * the total actually installed society-wide is unchanged), re-derive the
 * circuit's figures through the real single-writer, then relock. The demo
 * report is then regenerated (a new version — FEAT-020-AC-5, never rewritten
 * in place) and shared, per the user's own explicit instruction.
 *
 * pnpm tsx scripts/fix-prateek-laurel-demo-count.ts --dry-run
 * pnpm tsx scripts/fix-prateek-laurel-demo-count.ts
 *
 * Run for real against production on 2026-10-14 (copied to the box directly
 * rather than deployed via git, so as not to also carry the day's other,
 * not-yet-stage-tested feature work — see the commit message). Verified:
 * demo meteredLightCount 45→39, circuit representedLightCount 2461→2467,
 * lightCountAtDemoLock 39, baseline/benchmark unchanged (they are frozen
 * demo facts, correctly untouched by a count correction); report version 3
 * generated (meteredLightCount 39, extrapolationFactor 64.10 vs v1's 55.56,
 * projectedSavingsKwhPerDay 810.06 vs v1's 700.37) and shared with the
 * society. See the revalidatePath note below for the one wrinkle hit along
 * the way — the underlying correction itself was unaffected by it.
 */
import "./load-env";
import { db } from "../src/lib/db";
import { logChange } from "../src/lib/change-log";
import { resyncCircuitFigures } from "../src/lib/circuit-figures";
import { representedCountAfterDemoCorrection } from "../src/lib/light-population";
import { refuseUnlock, unlockUntil } from "../src/lib/demo-lock";
import { generateDemoReportInternal } from "../src/app/admin/pipeline/[id]/report/actions";

const dryRun = process.argv.includes("--dry-run");

const CIRCUIT_ID = "cmtqrvhpr1i94piqsbg675uv1";
const DEMO_ID = "dm-cmtqrvhpr1i94piqsbg675uv1";
const PIPELINE_ID = "cmtpoh1fu1i8upiqscoi585vc";
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth
const NEW_COUNT = 39;
const REASON =
  "The demo's own recorded count (45) was typed in after the demo, not during it. The inventory's own 39 (and its already-set replacementCount of 39) is the real figure the demo was measured on.";

async function main() {
  const demo = await db.circuitDemo.findUnique({
    where: { id: DEMO_ID },
    select: {
      id: true,
      circuitId: true,
      sequence: true,
      meteredLightCount: true,
      unlockedUntil: true,
      voidedAt: true,
      circuit: { select: { id: true, voidedAt: true, representedLightCount: true, lightCountAtDemoLock: true, benchmarkSavingsPct: true, preInstallBaseline: true, siteSurveyId: true } },
    },
  });
  if (!demo || demo.circuitId !== CIRCUIT_ID) throw new Error("Demo not found or circuit mismatch — aborting.");
  if (demo.voidedAt || demo.circuit.voidedAt) throw new Error("Demo or circuit has been voided since — aborting.");
  if (demo.meteredLightCount !== 45) throw new Error(`Expected the demo's count to still be 45, found ${demo.meteredLightCount} — state has moved, aborting rather than guessing.`);
  if (demo.sequence !== 1) throw new Error(`Expected this to be the circuit's only/initial demo (sequence 1), found sequence ${demo.sequence} — aborting, the split logic below assumes it is.`);

  const line = await db.circuitDevice.findFirst({ where: { circuitId: CIRCUIT_ID }, select: { id: true, count: true, replacementCount: true } });
  console.log("Inventory line (for reference, untouched by this script):", line);

  const shared = await db.demoReport.count({ where: { pipelineId: PIPELINE_ID, status: "shared", demoIds: { has: DEMO_ID } } });
  console.log("Before:", {
    demoMeteredLightCount: demo.meteredLightCount,
    circuitRepresentedLightCount: demo.circuit.representedLightCount,
    circuitLightCountAtDemoLock: demo.circuit.lightCountAtDemoLock,
    circuitBenchmarkSavingsPct: demo.circuit.benchmarkSavingsPct,
    circuitPreInstallBaseline: demo.circuit.preInstallBaseline,
    sharedInReport: shared > 0,
  });

  const refusal = refuseUnlock({ isOps: true, reason: REASON, sharedInReport: shared > 0 });
  if (refusal) throw new Error(`Unlock would be refused: ${refusal} — aborting.`);

  const adjustment = representedCountAfterDemoCorrection({
    isInitialDemo: true,
    representedLightCount: demo.circuit.representedLightCount,
    oldDemoCount: demo.meteredLightCount,
    newDemoCount: NEW_COUNT,
  });
  if ("error" in adjustment) throw new Error(`Correction would be refused: ${adjustment.error} — aborting.`);
  console.log("Represented-count split adjustment:", adjustment);

  if (dryRun) {
    console.log("--dry-run: would unlock the demo, set meteredLightCount to", NEW_COUNT, ", move the represented-count split as above, re-derive the circuit's figures, relock, regenerate the demo report (new version) and share it. No writes made.");
    return;
  }

  const until = unlockUntil(new Date());
  await db.$transaction(async (tx) => {
    // 1. Unlock (unlockDemo's own body).
    await tx.circuitDemo.update({ where: { id: DEMO_ID }, data: { unlockedUntil: until, unlockedById: ACTOR_ID, unlockReason: REASON } });
    await logChange(tx, { entity: "circuit_demo", entityId: DEMO_ID, kind: "unlock", circuitId: CIRCUIT_ID, demoId: DEMO_ID, newValue: { until: until.toISOString() }, reason: REASON, actorId: ACTOR_ID });

    // 2. Correct the count (setDemoLightCount's own body).
    await tx.circuitDemo.update({ where: { id: DEMO_ID }, data: { meteredLightCount: NEW_COUNT } });
    await logChange(tx, { entity: "circuit_demo", entityId: DEMO_ID, kind: "edit", field: "meteredLightCount", circuitId: CIRCUIT_ID, demoId: DEMO_ID, oldValue: demo.meteredLightCount, newValue: NEW_COUNT, reason: REASON, actorId: ACTOR_ID });
    if (adjustment.changed) {
      await tx.circuit.update({ where: { id: CIRCUIT_ID }, data: { representedLightCount: adjustment.newRepresentedLightCount } });
      await logChange(tx, {
        entity: "circuit",
        entityId: CIRCUIT_ID,
        kind: "edit",
        field: "representedLightCount",
        circuitId: CIRCUIT_ID,
        demoId: DEMO_ID,
        oldValue: demo.circuit.representedLightCount,
        newValue: adjustment.newRepresentedLightCount,
        reason: `The demo's own light count was corrected ${demo.meteredLightCount} → ${NEW_COUNT} — the full installation moved by the same amount the other way, so the total installed stays unchanged.`,
        actorId: ACTOR_ID,
      });
    }
    if (demo.circuit.lightCountAtDemoLock === demo.meteredLightCount) {
      await tx.circuit.update({ where: { id: CIRCUIT_ID }, data: { lightCountAtDemoLock: NEW_COUNT } });
      await logChange(tx, {
        entity: "circuit",
        entityId: CIRCUIT_ID,
        kind: "edit",
        field: "lightCountAtDemoLock",
        circuitId: CIRCUIT_ID,
        demoId: DEMO_ID,
        oldValue: demo.circuit.lightCountAtDemoLock,
        newValue: NEW_COUNT,
        reason: "The demo's own light count was corrected — the survey page's frozen record of what was recorded at demo-lock follows the correction, since it was the wrong figure that got frozen.",
        actorId: ACTOR_ID,
      });
    }
    await resyncCircuitFigures(tx, CIRCUIT_ID, ACTOR_ID);

    // 3. Relock immediately (relockDemo's own body) — nothing is left open.
    await tx.circuitDemo.update({ where: { id: DEMO_ID }, data: { unlockedUntil: null } });
    await logChange(tx, { entity: "circuit_demo", entityId: DEMO_ID, kind: "relock", circuitId: CIRCUIT_ID, demoId: DEMO_ID, actorId: ACTOR_ID });
  });

  const demoAfter = await db.circuitDemo.findUnique({ where: { id: DEMO_ID }, select: { meteredLightCount: true, unlockedUntil: true } });
  const circuitAfter = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: { representedLightCount: true, lightCountAtDemoLock: true, benchmarkSavingsPct: true, preInstallBaseline: true },
  });
  console.log("After correction:", { demo: demoAfter, circuit: circuitAfter });

  // 4. Regenerate the demo report (a new version, per FEAT-020-AC-5) and share it.
  //
  // Run for real (2026-10-14): generateDemoReportInternal's own DB write
  // (the new DemoReport row) committed correctly, but the function ALSO
  // calls revalidatePath() at the end — a Next.js cache-invalidation call
  // that assumes a live request context, which a bare script has none of.
  // It threw "Invariant: static generation store missing" AFTER the write
  // had already landed — confirmed by the row existing with the right
  // figures. Not a product bug: every real caller of this function (the
  // Server Action, or the BenchmarkConfirmed-triggered internal path) runs
  // inside a request. Caught here so a future run of this script doesn't
  // stop short of sharing the report it just generated.
  let latest: { id: string; version: number; measuredSavingsPct: number } | null = null;
  try {
    const gen = await generateDemoReportInternal(PIPELINE_ID, ACTOR_ID);
    if ("error" in gen) throw new Error(`Report generation failed: ${gen.error}`);
  } catch (err) {
    if (!/static generation store missing/.test(String(err))) throw err;
    console.warn("revalidatePath failed outside a request context (expected when run as a script) — continuing, the report row itself was already written.");
  }
  latest = await db.demoReport.findFirst({ where: { pipelineId: PIPELINE_ID }, orderBy: { version: "desc" } });
  if (!latest) throw new Error("No report found after generation — aborting before sharing.");
  console.log("Generated report version", latest.version, "measuredSavingsPct", latest.measuredSavingsPct);

  await db.demoReport.update({ where: { id: latest.id }, data: { status: "shared", sharedAt: new Date(), sharedById: ACTOR_ID } });
  console.log("Shared report version", latest.version, "with the society.");
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
