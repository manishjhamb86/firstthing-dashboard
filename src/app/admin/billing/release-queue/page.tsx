import { redirect } from "next/navigation";
import { EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { requireAccountant } from "../access";
import { loadReleaseQueue } from "@/lib/release-queue-loader";
import { ReleaseQueueClient } from "./release-queue-client";

// SCR-092 / CON-47 — the accountant's own screen, not ops'. FEAT-054-AC-4 is
// explicit that release is unavailable to anyone who isn't PER-08, including
// PER-01 — so this redirects rather than rendering read-only, matching the
// deviations queue's own PER-01-only redirect in the other direction.
export const dynamic = "force-dynamic";

export default async function ReleaseQueuePage() {
  const acc = await requireAccountant();
  if (!acc.ok) redirect("/admin/billing");

  const rows = await loadReleaseQueue();
  const routine = rows.filter((r) => r.triage.routine);
  const needsReview = rows.filter((r) => !r.triage.routine);

  return (
    <>
      <PageHeader
        backHref="/admin/billing"
        title="Release queue"
        subtitle="Months ops has submitted, waiting to be published to their society."
        chip={
          rows.length === 0 ? undefined : needsReview.length > 0 ? (
            <StatusChip tone="warn">{needsReview.length} need review</StatusChip>
          ) : (
            <StatusChip tone="ok">All routine</StatusChip>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting">Months appear here once ops submits an invoice — Invoice intake →</EmptyState>
      ) : (
        <>
          <StatRow>
            <Stat label="Awaiting release" value={rows.length} detail={`${routine.length} routine · ${needsReview.length} need review`} />
            <Stat
              label="Total value"
              value={`₹${Math.round(rows.reduce((s, r) => s + r.invoiceTotal, 0)).toLocaleString("en-IN")}`}
              detail="across every row shown"
            />
            <Stat
              label="Already paid"
              value={rows.filter((r) => r.paid).length}
              detail="release starts no clock for these"
            />
          </StatRow>

          <ReleaseQueueClient rows={rows} />
        </>
      )}
    </>
  );
}
