import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-permissions";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { loadSocietyTimeline } from "@/lib/society-timeline-loader";
import { checkSocietyChronology, summarise, FIRST_INVOICE_SLOT, forEachStep } from "@/lib/society-chronology";
import { summaryLine } from "@/lib/society-timeline-view";
import { formatDate } from "@/lib/format-date";

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
export default async function TimelineIndexPage() {
  await requireAdminPage();
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

      {list.length === 0 ? (
        <EmptyState title="No societies yet">A society&rsquo;s timeline appears here once it is added.</EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th>Dates</th>
                <th>Billed from</th>
                <th className="text-right">Requests</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const bad = r.summary.order + r.summary.future;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/societies/${r.id}/timeline`} className="font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-[12px] text-[var(--text-subtle)]">{r.location}</div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {bad > 0 && <span className="chip chip-bad">✕ {bad} out of order</span>}
                        {r.summary.check > 0 && <span className="chip chip-warn">! {r.summary.check} to check</span>}
                        {r.summary.missing > 0 && <span className="chip chip-warn">– {r.summary.missing} not recorded</span>}
                        {r.line.tone === "ok" && <span className="chip chip-ok">✓ {r.summary.inOrder} in order</span>}
                      </div>
                    </td>
                    <td className="num whitespace-nowrap">{r.billedFrom ? formatDate(r.billedFrom) : <span className="text-[var(--text-subtle)]">Not billed</span>}</td>
                    <td className="num text-right">{r.pending > 0 ? <span className="chip chip-warn">{r.pending} waiting</span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
