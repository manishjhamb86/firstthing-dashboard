import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { requestQueue } from "@/lib/date-change-request-loader";
import { RequestCard } from "@/app/admin/societies/[id]/timeline/request-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Date change requests" };

/**
 * Every open date change request across societies, and the latest decisions
 * (2026-09-28). Readable by any admin so a requester can follow theirs;
 * Accept and Reject appear only for "Approve date changes", and the server
 * refuses both for anyone else — and for the requester themself.
 */
export default async function DateChangeRequestsPage() {
  await requireAdminPage();
  const viewer = (await resolveAdmin())!;
  const canApprove = viewer.permissions.includes("approve_date_changes");
  const { pending, decided } = await requestQueue(viewer.id);

  return (
    <>
      <PageHeader
        backHref="/admin/societies"
        title="Date change requests"
        subtitle="After go-live a recorded date changes only when another admin accepts the request."
        chip={pending.length > 0 ? <StatusChip tone="warn">{pending.length} waiting</StatusChip> : undefined}
      />
      {!canApprove && (
        <p className="mb-4 text-[13px] text-[var(--text-muted)]">
          You can follow and withdraw your own requests here. Deciding them needs the “Approve date changes” permission.
        </p>
      )}
      <section className="flex flex-col gap-3" aria-label="Waiting">
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting">No date change is waiting for a decision.</EmptyState>
        ) : (
          pending.map((r) => <RequestCard key={r.id} r={r} canApprove={canApprove} showSociety />)
        )}
      </section>
      {decided.length > 0 && (
        <section className="mt-8 flex flex-col gap-3" aria-label="Decided">
          <h2 className="text-[17px] font-bold">Recently decided</h2>
          {decided.map((r) => (
            <RequestCard key={r.id} r={r} canApprove={false} showSociety />
          ))}
        </section>
      )}
    </>
  );
}
