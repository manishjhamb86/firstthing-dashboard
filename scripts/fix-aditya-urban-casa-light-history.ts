/**
 * One-off data correction (2026-11-03, user-caught): Aditya Urban Casa's
 * circuit showed "7 light-count corrections on record" — a back-and-forth
 * chain of test edits (122<->100<->22<->49, each paired with a compensating
 * move on the circuit's own full-installation count) that netted to zero
 * real change. The user confirmed: the demo counts have always genuinely
 * been 100 and 22 (matching the circuit's own two accepted demos, sequence 1
 * at 100 lights/48.22% and sequence 2 at 22 lights/85.16%, both still
 * correctly stored) — none of these 7 entries describes a real event.
 *
 * `ChangeLog` rows are pure audit trail — `CircuitDemo.meteredLightCount`
 * and `Circuit.representedLightCount` are independently stored columns, so
 * deleting these rows changes nothing about the circuit's live figures.
 * Confirmed before running: both demos already read 100 and 22.
 *
 * The 7 displayed entries are built by pairing up to 11 raw rows
 * (`src/lib/circuit-light-history.ts`'s `pair()`) — some entries pair a
 * `circuit_demo` row with a `circuit` row (the "the full installation moved
 * X -> Y the other way" clause), others stand alone. Verified by hand that
 * these 11 ids are exactly, and only, what produces the 7 entries shown —
 * no row outside this set and no row of this set left over.
 *
 * This repo's own `deleteLightHistoryEntries` (inventory-actions.ts) does
 * the identical delete, gated to demo mode only ("we are not live yet").
 * This circuit is live in production, so that in-app control refuses —
 * this script does the same delete directly, the same "direct production
 * DB deletion of invalid audit rows" call already made once this session.
 *
 * pnpm tsx scripts/fix-aditya-urban-casa-light-history.ts --dry-run
 * pnpm tsx scripts/fix-aditya-urban-casa-light-history.ts
 */
import "./load-env";
import { db } from "../src/lib/db";

const dryRun = process.argv.includes("--dry-run");

const CIRCUIT_ID = "bf-aditya-urban-casa-ckt-1";
const ROW_IDS = [
  "cmuu0e3tc03slk5qsmlthsyu0",
  "cmvbkpkj30000eup7nrrtgx98",
  "cmvbkpkjm0001eup79bp3x7o3",
  "cmvbkpkmn0002eup7li5l2v2w",
  "cmvblektq0014e2p7wcx6lotv",
  "cmvblektu0015e2p7t77wk8d7",
  "cmvblep5q0017e2p7xij115b4",
  "cmvblfc3m001ae2p7txy20907",
  "cmvblfc3r001be2p78p6gtxwe",
  "cmvblfjhl001ce2p7ot75y3gl",
  "cmvblfjhp001de2p7layb3aug",
];

async function main() {
  const circuit = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: { id: true, meteredLightCount: true, representedLightCount: true },
  });
  if (!circuit) throw new Error("Circuit not found — aborting.");

  const demos = await db.circuitDemo.findMany({
    where: { circuitId: CIRCUIT_ID },
    select: { id: true, sequence: true, meteredLightCount: true },
    orderBy: { sequence: "asc" },
  });
  if (demos.map((d) => d.meteredLightCount).join(",") !== "100,22") {
    throw new Error(`Expected demos at 100 and 22, found ${demos.map((d) => d.meteredLightCount).join(",")} — state has moved, aborting rather than guessing.`);
  }

  const rows = await db.changeLog.findMany({
    where: { id: { in: ROW_IDS } },
    select: { id: true, entity: true, field: true, oldValue: true, newValue: true, demoId: true, at: true },
  });
  if (rows.length !== ROW_IDS.length) {
    throw new Error(`Expected ${ROW_IDS.length} rows, found ${rows.length} — aborting.`);
  }

  console.log("Circuit (unchanged by this run):", circuit);
  console.log("Demos (unchanged by this run):", demos);
  console.log(`Rows to delete (${rows.length}):`, JSON.stringify(rows, null, 2));

  if (dryRun) {
    console.log("--dry-run: would delete these rows. No writes made.");
    return;
  }

  const result = await db.changeLog.deleteMany({ where: { id: { in: ROW_IDS } } });
  console.log(`Deleted ${result.count} rows.`);

  const remaining = await db.changeLog.count({
    where: {
      circuitId: CIRCUIT_ID,
      OR: [
        { entity: "circuit_demo", field: "meteredLightCount" },
        { entity: "circuit", field: "representedLightCount" },
      ],
    },
  });
  console.log(`Remaining light-count-correction rows for this circuit: ${remaining}`);

  const circuitAfter = await db.circuit.findUnique({
    where: { id: CIRCUIT_ID },
    select: { meteredLightCount: true, representedLightCount: true },
  });
  console.log("Circuit after (should match before):", circuitAfter);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
