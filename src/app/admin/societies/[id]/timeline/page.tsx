import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isDemoMode } from "@/lib/demo-mode";
import { PageHeader, StatusChip } from "@/components/ui";
import { loadSocietyTimeline } from "@/lib/society-timeline-loader";
import { checkSocietyChronology, summarise } from "@/lib/society-chronology";
import { buildTimelineView, summaryLine } from "@/lib/society-timeline-view";
import { societyRequests } from "@/lib/date-change-request-loader";
import { TimelineTree } from "./timeline-client";
import { RequestCard } from "./request-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timeline" };

/**
 * A society's whole chronology on one screen, checked as one object
 * (2026-09-28; docs/research/reports/Society lifecycle timeline design.md).
 * The tree follows the society's own shape — service line, deal, circuit,
 * demo — with every recorded date on a left rail and the summary answering
 * the first question: are all the dates in order?
 */
export default async function SocietyTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const viewer = (await resolveAdmin())!;
  const { id } = await params;
  const loaded = await loadSocietyTimeline(id);
  if (!loaded) notFound();

  const demo = await isDemoMode();
  const issues = checkSocietyChronology(loaded.root, new Date());
  const summary = summarise(loaded.root, issues);
  const line = summaryLine(summary);
  const requests = await societyRequests(id, loaded.root, viewer.id);
  const tree = buildTimelineView(loaded.root, issues, requests.byRef);
  const canApprove = viewer.permissions.includes("approve_date_changes");

  // Each count jumps to the first row it counts.
  const first = (kind: string) => issues.find((i) => i.kind === kind)?.stepId;
  const counts: { kind: string; n: number; text: string; tone: string }[] = [
    { kind: "order", n: summary.order, text: `✕ ${summary.order} out of order`, tone: "bad" },
    { kind: "future", n: summary.future, text: `✕ ${summary.future} in the future`, tone: "bad" },
    { kind: "check", n: summary.check, text: `! ${summary.check} to check`, tone: "warn" },
    { kind: "missing", n: summary.missing, text: `– ${summary.missing} not recorded`, tone: "warn" },
    { kind: "borrowed", n: summary.borrowed, text: `≈ ${summary.borrowed} taken from another record`, tone: "info" },
  ];

  return (
    <>
      <PageHeader
        backHref={`/admin/societies/${id}`}
        title={loaded.society.name}
        subtitle="Timeline — every recorded date, step by step"
        chip={demo ? <StatusChip tone="info">Demo mode</StatusChip> : undefined}
        action={
          <Link href="/admin/timeline/requests" className="btn-outline btn-sm">
            Date change requests
          </Link>
        }
      />

      <p className="mb-4 max-w-[760px] text-[13px] text-[var(--text-muted)]">
        {demo
          ? "Before go-live, a date is edited in place. The whole timeline is checked before it saves, and the old value is kept."
          : "After go-live, nobody edits a date directly. Raise a request with a reason, and another admin accepts or rejects it."}
      </p>

      <section className="card flex flex-col gap-4">
        <div className="tl-summary" data-tone={line.tone} role="status">
          <strong>{line.headline}</strong>
          <div className="flex flex-wrap gap-2">
            {counts
              .filter((c) => c.n > 0)
              .map((c) => (
                <a key={c.kind} href={`#${first(c.kind)}`}>
                  <span className={`chip chip-${c.tone}`}>{c.text}</span>
                </a>
              ))}
            {line.tone !== "ok" && <span className="chip chip-neu">{summary.inOrder} in order</span>}
          </div>
        </div>
        <TimelineTree societyId={id} root={tree} demo={demo} />
      </section>

      {requests.cards.length > 0 && (
        <section className="card mt-6 flex flex-col gap-3" aria-label="Date change requests">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[17px] font-bold">Date change requests</h2>
            <StatusChip tone="warn">{requests.cards.length} waiting</StatusChip>
            <span className="text-[12.5px] text-[var(--text-subtle)]">Nobody accepts their own request.</span>
          </div>
          {requests.cards.map((r) => (
            <RequestCard key={r.id} r={r} canApprove={canApprove} />
          ))}
        </section>
      )}
    </>
  );
}
