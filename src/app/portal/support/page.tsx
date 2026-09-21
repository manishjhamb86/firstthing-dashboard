import { redirect } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { RaiseTicketCards, TicketStatusControl } from "./support-client";
import { KpiBubble } from "../kpi-tiles";
import { CheckCircle2, CircleDot, Clock, Timer } from "lucide-react";

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

      <div className="mb-6 grid gap-4 grid-cols-2 xl:grid-cols-4">
        <KpiBubble icon={CircleDot} tone={open > 0 ? "bad" : "ok"} value={String(open)} label="Open" detail="awaiting a first look" />
        <KpiBubble icon={Clock} tone="warn" value={String(inProgress)} label="In progress" detail="being worked on" />
        <KpiBubble icon={CheckCircle2} tone="ok" value={String(resolved)} label="Resolved" detail="closed out" />
        <KpiBubble
          icon={Timer}
          tone="info"
          value={medianDays !== null ? `${medianDays.toFixed(1)} days` : "—"}
          label="Median time to resolve"
          detail={medianDays !== null ? "across your resolved tickets" : "no resolved tickets yet"}
        />
      </div>

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
                      {formatDate(t.createdAt)}
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
