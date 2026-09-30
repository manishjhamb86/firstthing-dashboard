import { requireAdminPage } from "@/lib/admin-permissions";
import { db } from "@/lib/db";
import { loadSocietyTimeline } from "@/lib/society-timeline-loader";
import { checkSocietyChronology } from "@/lib/society-chronology";
import { flattenTimelineForExport, rowsToCsv } from "@/lib/timeline-export";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * One CSV of every society's whole recorded chronology, long format — one
 * row per date, tagged with which society/deal/circuit it belongs to
 * (2026-09-30, user-asked: "export/download the timelines as a
 * csv/excelsheet... all the societies each circuit in a sheet"). Reads
 * access the same way `/admin/timeline` itself does — any admin who can see
 * the page can download what it shows.
 */
export async function GET() {
  await requireAdminPage();

  const societies = await db.society.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const today = new Date();
  const rows = (
    await Promise.all(
      societies.map(async (s) => {
        const loaded = await loadSocietyTimeline(s.id);
        if (!loaded) return [];
        const issues = checkSocietyChronology(loaded.root, today);
        return flattenTimelineForExport(s.name, loaded.root, issues);
      }),
    )
  ).flat();

  const csv = rowsToCsv(rows);
  const filename = `firsthing-timelines-${today.toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
