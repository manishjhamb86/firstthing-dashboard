import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-permissions";
import { db } from "@/lib/db";
import { PageHeader, StatusChip } from "@/components/ui";
import { loadSocietyTimeline } from "@/lib/society-timeline-loader";
import { checkSocietyChronology, summarise, FIRST_INVOICE_SLOT, forEachStep } from "@/lib/society-chronology";
import { summaryLine } from "@/lib/society-timeline-view";
import { TimelineTable } from "./timeline-table";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timeline" };

/**
 * Every society's chronology at a glance (2026-09-28, user-asked: the timeline
 * in the Societies menu). A society's own timeline lives at its id, so the menu
 * lands here: each society with what its checked dates say, the ones with the
 * most out-of-order dates first, and the date change requests waiting.
 *
 * Each row runs the same check the society's own timeline does, so the counts
 * here and on that page cannot disagree.
 */
export default async function TimelineIndexPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage();
  const { q } = await searchParams;
  const [societies, pendingRequests] = await Promise.all([
    db.society.findMany({ select: { id: true, name: true, location: true }, orderBy: { name: "asc" } }),
    db.dateChangeRequest.groupBy({ by: ["societyId"], where: { status: "pending" }, _count: { _all: true } }),
  ]);
  const pendingBySociety = new Map(pendingRequests.map((r) => [r.societyId, r._count._all]));
  const pendingTotal = pendingRequests.reduce((n, r) => n + r._count._all, 0);

  const today = new Date();
  const rows = await Promise.all(
    societies.map(async (s) => {
      const loaded = await loadSocietyTimeline(s.id);
      if (!loaded) return null;
      const summary = summarise(loaded.root, checkSocietyChronology(loaded.root, today));
      let billedFrom: Date | null = null;
      forEachStep(loaded.root, (step) => {
        if (step.slot === FIRST_INVOICE_SLOT && step.date && (!billedFrom || step.date < billedFrom)) billedFrom = step.date;
      });
      return { ...s, summary, line: summaryLine(summary), billedFrom: billedFrom as Date | null, pending: pendingBySociety.get(s.id) ?? 0 };
    }),
  );
  const list = rows
    .filter((r) => r !== null)
    .sort(
      (a, b) =>
        b.summary.order + b.summary.future - (a.summary.order + a.summary.future) ||
        b.summary.check + b.summary.missing - (a.summary.check + a.summary.missing) ||
        a.name.localeCompare(b.name),
    );
  const withProblems = list.filter((r) => r.line.tone !== "ok").length;

  return (
    <>
      <PageHeader
        title="Timeline"
        subtitle="Every society's recorded dates, checked in order — back from the first invoice once a deal is billed."
        chip={withProblems > 0 ? <StatusChip tone="bad">{withProblems} with dates to fix</StatusChip> : undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a href="/admin/timeline/export" className="btn-outline btn-sm">
              Download all (CSV)
            </a>
            <Link href="/admin/timeline/requests" className="btn-secondary btn-sm">
              Date change requests{pendingTotal > 0 ? ` · ${pendingTotal} waiting` : ""}
            </Link>
          </div>
        }
      />

      <TimelineTable rows={list} initialQuery={q ?? ""} />
    </>
  );
}
