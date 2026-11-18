import Link from "next/link";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { EmptyState, PageHeader, Stat, StatRow } from "@/components/ui";
import { formatDate, monthLabel } from "@/lib/format-date";
import { PURPOSE_LABEL } from "@/lib/customer-visits";
import { istToday, loadVisitBoard, type BoardRow } from "@/lib/customer-visits-loader";
import { MonthPicker, recentMonths, validPeriod } from "@/app/admin/billing/close/close-ui";
import { MonthStateChip } from "./visit-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer visits" };

const VIEWS = [
  { id: "all", label: "All" },
  { id: "missing", label: "No feedback visit yet" },
  { id: "pending", label: "Waiting for approval" },
  { id: "done", label: "Done for the month" },
] as const;
type View = (typeof VIEWS)[number]["id"];

const inView = (r: BoardRow, v: View) =>
  v === "all" ? true : v === "done" ? r.state === "approved" : v === "pending" ? r.state === "pending" : r.state === "missing" || r.state === "sent_back";

/**
 * Customer visits (2026-11-18, user-specified): every billing society's
 * month — its required feedback & upselling visit and any others — with
 * what is still owed. Visits count only once someone else approves them.
 */
export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ period?: string; view?: string }> }) {
  await requireAdminPage();
  const actor = await resolveAdmin();
  const today = istToday();
  const sp = await searchParams;
  const period = validPeriod(sp.period, today.slice(0, 7));
  const view: View = (VIEWS.find((x) => x.id === sp.view)?.id ?? "all") as View;
  const board = await loadVisitBoard(period);
  const rows = board.rows.filter((r) => inView(r, view));
  const canApprove = actor?.permissions.includes("approve_visits") ?? false;
  const q = (v: View) => `/admin/visits?period=${period}${v === "all" ? "" : `&view=${v}`}`;

  return (
    <>
      <PageHeader
        title={`${monthLabel(period)} visits`}
        subtitle="Every society needs one approved feedback & upselling visit each month. Other visits are logged too."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <MonthPicker period={period} months={recentMonths(today.slice(0, 7))} basePath="/admin/visits" />
            <Link href="/admin/visits/new" className="btn-primary">Log a visit</Link>
          </div>
        }
      />

      <StatRow>
        <Stat label="Feedback visits approved" value={`${board.counts.approved} of ${board.counts.societies}`} />
        <Stat label="Waiting for approval" value={board.counts.waiting} detail={canApprove && board.counts.waiting > 0 ? "Review them in Visit approvals" : undefined} />
        <Stat
          label="No feedback visit yet"
          value={board.counts.missing}
          tone={board.counts.missing > 0 && board.rows.some((r) => r.late) ? "bad" : board.counts.missing > 0 ? "warn" : undefined}
          detail={board.isCurrent ? `${board.daysLeft} day${board.daysLeft === 1 ? "" : "s"} left in the month` : "the month has ended"}
        />
        <Stat
          label="All visits this month"
          value={board.counts.visits}
          detail={`${board.counts.leads} upsell lead${board.counts.leads === 1 ? "" : "s"}${board.counts.averageRating !== null ? ` · rating ${board.counts.averageRating.toFixed(1)} / 5` : ""}`}
        />
      </StatRow>

      <section className="card mt-5 overflow-hidden">
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] p-4" role="group" aria-label="Filter societies">
          {VIEWS.map((v) => {
            const n = board.rows.filter((r) => inView(r, v.id)).length;
            const on = view === v.id;
            return (
              <Link
                key={v.id}
                href={q(v.id)}
                aria-current={on ? "page" : undefined}
                className="inline-flex min-h-[40px] items-center rounded-full px-3.5 text-[13px] font-semibold"
                style={on ? { background: "var(--text)", color: "var(--surface)" } : { border: "1px solid var(--field-border)", color: "var(--text-muted)" }}
              >
                {v.label} <span className="num ml-1 opacity-75">{n}</span>
              </Link>
            );
          })}
        </div>
        {board.rows.length === 0 ? (
          <div className="p-5"><EmptyState title="No society is billing yet">A society appears here once its billing has started.</EmptyState></div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-[var(--text-muted)]">Nothing in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Feedback &amp; upselling visit</th>
                  <th>Other visits</th>
                  <th>Last visit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.societyId}>
                    <td>
                      <span className="font-semibold">{r.name}</span>
                      {r.feedback && <div className="text-[12px] text-[var(--text-muted)]">{r.feedback.loggedBy}</div>}
                    </td>
                    <td>
                      <MonthStateChip state={r.state} late={r.late} />
                      <div className="mt-1 text-[12px] text-[var(--text-muted)]">
                        {r.feedback
                          ? `${formatDate(r.feedback.visitedAt)}${r.feedback.rating ? ` · rating ${r.feedback.rating}/5` : ""}${r.feedback.interests.length ? ` · ${r.feedback.interests.length} upsell interest${r.feedback.interests.length === 1 ? "" : "s"}` : ""}`
                          : board.isCurrent
                            ? `${board.daysLeft} day${board.daysLeft === 1 ? "" : "s"} left`
                            : "Missed this month"}
                      </div>
                    </td>
                    <td className="text-[13px]">
                      {r.others.length === 0 ? "—" : `${r.others.length} · ${[...new Set(r.others.map((o) => PURPOSE_LABEL[o.purpose].toLowerCase()))].join(", ")}`}
                    </td>
                    <td className="num text-[13px]">{r.lastVisitAt ? formatDate(r.lastVisitAt) : "Never"}</td>
                    <td style={{ textAlign: "right" }}>
                      {r.feedback ? (
                        <Link href={`/admin/visits/${r.feedback.id}`} className="btn-secondary" style={{ display: "inline-flex", minHeight: 40, alignItems: "center" }}>
                          {r.state === "pending" && canApprove ? "Review" : "Open"}
                        </Link>
                      ) : (
                        <Link href={`/admin/visits/new?societyId=${r.societyId}`} className="btn-secondary" style={{ display: "inline-flex", minHeight: 40, alignItems: "center" }}>
                          Log a visit
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
