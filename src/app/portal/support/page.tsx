import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { RaiseTicketCards, TicketStatusControl } from "./support-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

const TYPE_LABEL: Record<string, string> = {
  complaint: "Complaint",
  device_replacement: "Replacement",
  pickup: "Pickup",
};

// Raise it here, track it here. tickets_view sees the desk; tickets_manage
// raises and updates — the split the office-bearer's access editor offers.
export default async function PortalSupportPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "tickets_view")) redirect("/portal");
  const canManage = hasGrant(viewer, "tickets_manage");
  const societyId = viewer.societyId;

  const tickets = await db.ticket.findMany({
    where: { societyId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { raisedBy: { select: { name: true, email: true } } },
  });

  const open = tickets.filter((t) => t.status === "open").length;
  const inProgress = tickets.filter((t) => t.status === "in_progress").length;
  const resolved = tickets.filter((t) => t.status === "resolved").length;
  const resolvedWithTimes = tickets.filter((t) => t.resolvedAt);
  const medianDays = (() => {
    if (resolvedWithTimes.length === 0) return null;
    const days = resolvedWithTimes
      .map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 86_400_000)
      .sort((a, b) => a - b);
    return days[Math.floor(days.length / 2)];
  })();

  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Complaints & requests — raise it here, track it here."
        chip={
          open + inProgress > 0 ? (
            <StatusChip tone="warn">{open + inProgress} active</StatusChip>
          ) : undefined
        }
      />

      <StatRow>
        <Stat label="Open" value={String(open)} tone={open > 0 ? "warn" : undefined} />
        <Stat label="In progress" value={String(inProgress)} />
        <Stat label="Resolved" value={String(resolved)} />
        {medianDays !== null ? (
          <Stat label="Median time to resolve" value={`${medianDays.toFixed(1)} days`} detail="across your resolved tickets" />
        ) : (
          <Stat label="Median time to resolve" value="—" detail="no resolved tickets yet" />
        )}
      </StatRow>

      <RaiseTicketCards canManage={canManage} />

      <Card className="p-6">
        <CardTitle>Your tickets</CardTitle>
        {tickets.length === 0 ? (
          <EmptyState title="No requests yet">
            Anything your society raises — complaints, replacements, pickups — is tracked here with
            its status.
          </EmptyState>
        ) : (
          <div className="print-table-scroll">
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Raised by</th>
                  <th>Date</th>
                  <th>Status</th>
                  {canManage && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {TYPE_LABEL[t.type]}
                    </td>
                    <td>
                      <strong>{t.subject}</strong>
                      {t.status === "resolved" && t.resolutionNote && (
                        <span className="block text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                          {t.resolutionNote}
                        </span>
                      )}
                    </td>
                    <td className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {t.raisedBy.name ?? t.raisedBy.email}
                    </td>
                    <td className="num text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {t.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td>
                      {t.status === "open" ? (
                        <StatusChip tone="bad">Open</StatusChip>
                      ) : t.status === "in_progress" ? (
                        <StatusChip tone="warn">In progress</StatusChip>
                      ) : (
                        <StatusChip tone="ok">Resolved</StatusChip>
                      )}
                    </td>
                    {canManage && (
                      <td>
                        <TicketStatusControl ticketId={t.id} status={t.status} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
