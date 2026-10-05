/**
 * One-time backfill (2026-10-06, user-caught on stage: a circuit's demo
 * count was corrected but "951 installed · 911 full installation + 40
 * demo" kept showing the stale split on the portal).
 *
 * `setDemoLightCount`/`correctLockedCount` have always logged a
 * `circuit_demo`/`meteredLightCount` ChangeLog row for every correction to a
 * demo's own count — but only the version shipped 2026-10-05
 * (representedCountAfterDemoCorrection) started moving
 * `Circuit.representedLightCount` the OPPOSITE way to keep the installed
 * total fixed. A correction made before that existed left the demo's count
 * changed with nothing compensating it — the portal's full+demo split has
 * been wrong (by exactly the uncompensated delta) ever since, silently,
 * because `demoLightsInstalled()`/`totalLights()` are always read live with
 * no caching to go stale in the first place — the STORED representedLightCount
 * itself was simply never moved.
 *
 * This reconstructs the shortfall from the log already on record: sum every
 * historical correction to the circuit's current initial live demo's own
 * count, sum every historical correction already applied to the circuit's
 * representedLightCount, and apply whatever is missing so the two cancel
 * out exactly as they always should have. Conservative on purpose — a
 * circuit with more than one live demo is skipped and named, since an
 * earlier correction might have been logged against a demo that is no
 * longer the initial one (the identity the split actually reads), and
 * guessing there risks writing a wrong number into a figure a society
 * reads.
 *
 * pnpm tsx scripts/backfill-represented-count-reconcile.ts --dry-run
 * pnpm tsx scripts/backfill-represented-count-reconcile.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { logChange } from "../src/lib/change-log";
import { refuseFullInstallationCount } from "../src/lib/light-population";

const dryRun = process.argv.includes("--dry-run");
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth — the import-style actor every prior one-off script in this repo uses

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

async function main() {
  const circuits = await db.circuit.findMany({
    where: { voidedAt: null, demos: { some: { voidedAt: null } } },
    select: {
      id: true,
      representedLightCount: true,
      demos: { where: { voidedAt: null }, orderBy: { sequence: "asc" }, select: { id: true } },
    },
  });

  let skippedMultiDemo = 0;
  let checked = 0;
  let fixed = 0;

  for (const c of circuits) {
    if (c.demos.length > 1) {
      skippedMultiDemo++;
      console.log(`  SKIP ${c.id}: ${c.demos.length} live demos — correction history can't be safely attributed, review by hand.`);
      continue;
    }
    const initialDemoId = c.demos[0]?.id;
    if (!initialDemoId) continue;
    checked++;

    const [demoRows, circuitRows] = await Promise.all([
      db.changeLog.findMany({ where: { entity: "circuit_demo", entityId: initialDemoId, field: "meteredLightCount" }, select: { oldValue: true, newValue: true } }),
      db.changeLog.findMany({ where: { entity: "circuit", entityId: c.id, field: "representedLightCount" }, select: { oldValue: true, newValue: true } }),
    ]);
    if (demoRows.length === 0) continue; // never corrected, nothing to reconcile

    const netDemoChange = demoRows.reduce((n, r) => n + (num(r.newValue) - num(r.oldValue)), 0);
    const netFullChange = circuitRows.reduce((n, r) => n + (num(r.newValue) - num(r.oldValue)), 0);
    const shortfall = -netDemoChange - netFullChange;
    if (shortfall === 0) continue;

    const next = c.representedLightCount + shortfall;
    const err = refuseFullInstallationCount(next);
    if (err) {
      console.log(`  SKIP ${c.id}: applying the missed ${shortfall} would leave the full installation at ${next} — ${err}`);
      continue;
    }

    console.log(`  ${c.id}: representedLightCount ${c.representedLightCount} -> ${next} (missed adjustment ${shortfall}, from ${demoRows.length} unreconciled demo correction(s))`);
    fixed++;
    if (!dryRun) {
      await db.$transaction(async (tx) => {
        await tx.circuit.update({ where: { id: c.id }, data: { representedLightCount: next } });
        await logChange(tx, {
          entity: "circuit",
          entityId: c.id,
          kind: "edit",
          field: "representedLightCount",
          circuitId: c.id,
          demoId: initialDemoId,
          oldValue: c.representedLightCount,
          newValue: next,
          reason: "Backfill: an earlier demo-count correction never adjusted the full installation to compensate — applying the missed adjustment now so the total installed matches what it always should have.",
          actorId: ACTOR_ID,
        });
      });
    }
  }

  console.log({ circuitsWithACorrectedDemo: checked, skippedMultiDemo, fixed, dryRun });
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
