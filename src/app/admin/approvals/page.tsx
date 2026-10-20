import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isSuperAdmin } from "@/lib/super-admin";
import { db } from "@/lib/db";
import { EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { PENDING_APPROVAL_KIND_LABEL } from "@/lib/pending-approval";
import { ApprovalCard } from "./approval-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pending approvals" };

/**
 * Corrections to the demo process, benchmark, light-count change and
 * agreement, queued because someone other than the one named account made
 * them (2026-10-20, user-asked). Readable by any admin, same transparency as
 * the date-change queue, so a requester can follow their own; deciding one
 * is restricted to that one account, enforced again on the server.
 */
export default async function PendingApprovalsPage() {
  await requireAdminPage();
  const viewer = (await resolveAdmin())!;
  const canDecide = isSuperAdmin(viewer.email);

  const [pending, decided] = await Promise.all([
    db.pendingApproval.findMany({
      where: { status: "pending" },
      orderBy: { requestedAt: "asc" },
      include: { requestedBy: { select: { name: true, email: true } }, society: { select: { name: true } } },
    }),
    db.pendingApproval.findMany({
      where: { status: { not: "pending" } },
      orderBy: { decidedAt: "desc" },
      take: 30,
      include: {
        requestedBy: { select: { name: true, email: true } },
        decidedBy: { select: { name: true, email: true } },
        society: { select: { name: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Pending approvals"
        subtitle="Corrections to the demo process, benchmark, light-count change and agreement — anyone else's are queued here until the named account approves them."
        chip={pending.length > 0 ? <StatusChip tone="warn">{pending.length} waiting</StatusChip> : undefined}
      />
      {!canDecide && (
        <p className="mb-4 text-[13px] text-[var(--text-muted)]">
          You can follow and withdraw your own requests here. Deciding them is restricted to one account.
        </p>
      )}
      <section className="flex flex-col gap-3" aria-label="Waiting">
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting">No correction is waiting for a decision.</EmptyState>
        ) : (
          pending.map((r) => (
            <ApprovalCard
              key={r.id}
              r={{
                id: r.id,
                kindLabel: PENDING_APPROVAL_KIND_LABEL[r.kind as keyof typeof PENDING_APPROVAL_KIND_LABEL] ?? r.kind,
                summary: r.summary,
                society: r.society.name,
                by: r.requestedBy.name ?? r.requestedBy.email,
                at: formatInstant(r.requestedAt),
                mine: r.requestedById === viewer.id,
                appliedError: r.appliedError,
              }}
              canDecide={canDecide}
            />
          ))
        )}
      </section>
      {decided.length > 0 && (
        <section className="mt-8 flex flex-col gap-3" aria-label="Decided">
          <h2 className="text-[17px] font-bold">Recently decided</h2>
          {decided.map((r) => (
            <ApprovalCard
              key={r.id}
              r={{
                id: r.id,
                kindLabel: PENDING_APPROVAL_KIND_LABEL[r.kind as keyof typeof PENDING_APPROVAL_KIND_LABEL] ?? r.kind,
                summary: r.summary,
                society: r.society.name,
                by: r.requestedBy.name ?? r.requestedBy.email,
                at: formatInstant(r.requestedAt),
                mine: false,
                appliedError: null,
                decided: {
                  status: r.status,
                  by: r.decidedBy?.name ?? r.decidedBy?.email ?? "someone",
                  at: r.decidedAt ? formatInstant(r.decidedAt) : "",
                  note: r.decisionNote,
                },
              }}
              canDecide={false}
            />
          ))}
        </section>
      )}
    </>
  );
}
