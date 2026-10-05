/**
 * Follow-up to backfill-day-validity.ts (2026-10-06, user-caught on stage):
 * that backfill deliberately left historical monthly-upload/legacy days
 * classified-but-not-excluded, reasoning that retroactively excluding a day
 * that has "always counted" is a bigger change than backfilling the
 * classification alone — but that caution was for a day already billed on,
 * and none of these are. Reported directly: "the default behaviour should
 * be exclude automatically... not the other way around" — which is exactly
 * what the live monitoring-projection path already does for new days; this
 * applies the same rule, once, to the rows the first backfill left stored
 * as partial but still counted.
 *
 * Never touches a billed row (usedInCalculationId), an already-excluded
 * row, or one an operator has explicitly marked valid (validOverrideAt) —
 * that override is exactly the "act to include" the user asked for, and
 * must not be undone by a backfill run after it.
 *
 * pnpm tsx scripts/backfill-partial-day-exclude.ts --dry-run
 * pnpm tsx scripts/backfill-partial-day-exclude.ts
 */
import "./load-env";
import { db } from "../src/lib/db";
import { PARTIAL_REASON_PREFIX } from "../src/lib/monitoring-projection";

const dryRun = process.argv.includes("--dry-run");
const ACTOR_ID = "cmt9ocs8l0000nnqsiztkadmc"; // yogesh@firsthing.earth — the import-style actor every prior one-off script in this repo uses

async function main() {
  const rows = await db.meterReading.findMany({
    where: { dayClass: "partial", excludedAt: null, validOverrideAt: null, usedInCalculationId: null },
    select: { id: true, dayClassHoursPresent: true, dayClassHoursExpected: true },
  });
  console.log(`${rows.length} partial, uncounted, unbilled rows to exclude.`);
  if (dryRun) {
    console.log("--dry-run: no writes made.");
    return;
  }
  const now = new Date();
  for (const r of rows) {
    await db.meterReading.update({
      where: { id: r.id },
      data: {
        excludedAt: now,
        excludedById: ACTOR_ID,
        excludedReason: `${PARTIAL_REASON_PREFIX}${r.dayClassHoursPresent} of ${r.dayClassHoursExpected} expected hours`,
      },
    });
  }
  console.log(`Excluded ${rows.length} rows.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await db.$disconnect();
    process.exit(1);
  });
