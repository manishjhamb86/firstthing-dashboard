/**
 * One-off cleanup (2026-10-06, user-asked): a specific pair of `ChangeLog`
 * rows, confirmed as a real but pure testing mistake — two real accounts,
 * five minutes apart, exactly cancelling (34 → 76, then 76 → 34), leaving
 * no lasting change — read as nonsensical junk on the customer portal. The
 * user's own words: "it was a mistake and we are not live yet" — the same
 * exception this codebase's own `deleteLightHistoryEntries` action makes
 * for a demo-mode-only hard delete, applied here directly since this is
 * pre-existing stage data from before that action existed, not something
 * to toggle demo mode just to reach.
 *
 * Deletes ONLY the exact row ids passed on the command line — never a
 * broader query — so this script can be safely reused for a similar
 * one-off cleanup without risking an unrelated row.
 *
 * pnpm tsx scripts/delete-changelog-entries.ts --dry-run <id> [<id> ...]
 * pnpm tsx scripts/delete-changelog-entries.ts <id> [<id> ...]
 */
import "./load-env";
import { db } from "../src/lib/db";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const ids = args.filter((a) => a !== "--dry-run");

async function main() {
  if (ids.length === 0) {
    console.log("Usage: pnpm tsx scripts/delete-changelog-entries.ts [--dry-run] <id> [<id> ...]");
    process.exitCode = 1;
    return;
  }

  const rows = await db.changeLog.findMany({
    where: { id: { in: ids } },
    select: { id: true, entity: true, field: true, oldValue: true, newValue: true, at: true, reason: true, actorId: true },
  });
  for (const r of rows) {
    console.log(`  ${r.id} — ${r.entity}.${r.field}: ${JSON.stringify(r.oldValue)} -> ${JSON.stringify(r.newValue)}, at ${r.at.toISOString()}, by ${r.actorId}`);
  }
  const missing = ids.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length) console.log(`  not found (already gone?): ${missing.join(", ")}`);

  if (dryRun) {
    console.log(`--dry-run: would delete ${rows.length} row(s). No writes made.`);
    return;
  }

  const result = await db.changeLog.deleteMany({ where: { id: { in: ids } } });
  console.log({ deleted: result.count });
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
