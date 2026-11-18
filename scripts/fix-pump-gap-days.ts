/**
 * One-time repair (2026-11-18, user-caught on RG Residency): a pump-room day
 * stored with no report for the day before it was differenced against the
 * last register on record, so a gap in the vendor's emails landed on the
 * first day after it — RG's 17 Nov read 3,440 kWh / 6,166 KL, seven days on
 * one. The ingest no longer does that (pump-room-ingest.ts: it differences
 * only against the day before). This re-applies each such day's OWN stored
 * report through that corrected rule, so the figure becomes the day's own
 * opening-to-closing span. Reads the bytes back from S3 via applyIngestToMeter
 * — nothing is reimplemented here.
 *
 *   pnpm tsx scripts/fix-pump-gap-days.ts --dry-run
 *   pnpm tsx scripts/fix-pump-gap-days.ts
 */
import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true });

const DAY = 86_400_000;
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const { db } = await import("../src/lib/db");
  const { applyIngestToMeter } = await import("../src/lib/pump-room-ingest");
  const rows = await db.emsPumpReading.findMany({
    where: { origin: "ems_email" },
    orderBy: [{ pumpMeterId: "asc" }, { date: "asc" }],
    select: { id: true, pumpMeterId: true, date: true, dailyKwh: true, dailyKl: true, sourceIngestId: true },
  });
  let fixed = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const prev = rows[i - 1];
    if (prev.pumpMeterId !== r.pumpMeterId) continue; // the first day of a meter was always its own span
    if (r.date.getTime() - prev.date.getTime() === DAY) continue;
    const label = `${r.pumpMeterId} ${r.date.toISOString().slice(0, 10)} (previous report ${prev.date.toISOString().slice(0, 10)}) was ${r.dailyKwh} kWh / ${r.dailyKl} KL`;
    if (!r.sourceIngestId) {
      console.log("SKIP no source report:", label);
      continue;
    }
    if (dryRun) {
      console.log("WOULD FIX", label);
      continue;
    }
    // applyIngestToMeter treats a resend no later than what is stored as a
    // no-op; clearing the closing time is what lets it apply again.
    await db.emsPumpReading.update({ where: { id: r.id }, data: { lastTs: null } });
    await applyIngestToMeter(r.sourceIngestId, r.pumpMeterId);
    const after = await db.emsPumpReading.findUnique({ where: { id: r.id }, select: { dailyKwh: true, dailyKl: true } });
    console.log("FIXED", label, "→", after?.dailyKwh, "kWh /", after?.dailyKl, "KL");
    fixed++;
  }
  console.log(dryRun ? "dry run — nothing written" : `${fixed} day(s) re-derived`);
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
