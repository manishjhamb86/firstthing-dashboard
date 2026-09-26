/**
 * One-off, after migration 20260926100000 (per-demo commissioning):
 *   1. every circuit's figures and state are re-derived by the single writer
 *      (resyncCircuitFigures) — any drift from the stored value is printed;
 *   2. every circuit's monitoring rows are rebuilt from the meter's hourly
 *      store through its history entries, from the billing start.
 *
 * pnpm tsx scripts/rebuild-demos-and-monitoring.ts --dry-run   (prints, writes nothing)
 * pnpm tsx scripts/rebuild-demos-and-monitoring.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { resyncCircuitFigures } from "../src/lib/circuit-figures";
import { projectCircuitMonitoring } from "../src/lib/monitoring-projection";

const dryRun = process.argv.includes("--dry-run");
class Rollback extends Error {}

const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(4));

async function main() {
  const circuits = await db.circuit.findMany({
    where: { voidedAt: null },
    select: { id: true, preInstallBaseline: true, benchmarkSavingsPct: true, state: true, society: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  let drift = 0;
  for (const c of circuits) {
    let after: { preInstallBaseline: number | null; benchmarkSavingsPct: number | null; state: string } | null = null;
    try {
      await db.$transaction(
        async (tx) => {
          await resyncCircuitFigures(tx, c.id, null);
          after = await tx.circuit.findUniqueOrThrow({
            where: { id: c.id },
            select: { preInstallBaseline: true, benchmarkSavingsPct: true, state: true },
          });
          if (dryRun) throw new Rollback();
        },
        { timeout: 60_000 },
      );
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    const a = after as { preInstallBaseline: number | null; benchmarkSavingsPct: number | null; state: string } | null;
    if (!a) continue;
    const moved =
      Math.abs((a.preInstallBaseline ?? -1) - (c.preInstallBaseline ?? -1)) > 1e-6 ||
      Math.abs((a.benchmarkSavingsPct ?? -1) - (c.benchmarkSavingsPct ?? -1)) > 1e-6 ||
      a.state !== c.state;
    if (moved) {
      drift++;
      console.log(
        `${c.id} ${c.society.name}: baseline ${fmt(c.preInstallBaseline)} → ${fmt(a.preInstallBaseline)} · ` +
          `benchmark ${fmt(c.benchmarkSavingsPct)} → ${fmt(a.benchmarkSavingsPct)} · state ${c.state} → ${a.state}`,
      );
    }
  }
  console.log(`${circuits.length} circuits, ${drift} with a changed figure or state${dryRun ? " (dry run — nothing written)" : ""}.`);

  if (dryRun) return;
  let created = 0;
  let updated = 0;
  let removed = 0;
  for (const c of circuits) {
    const s = await projectCircuitMonitoring(c.id, null);
    created += s.created;
    updated += s.updated;
    removed += s.removed;
  }
  console.log(`Monitoring rebuilt: ${created} created, ${updated} updated, ${removed} removed.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
