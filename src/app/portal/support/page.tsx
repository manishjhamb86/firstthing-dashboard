import { redirect } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { RaiseTicketCards, TicketStatusControl } from "./support-client";
import { CompactTile, KpiBubble } from "../kpi-tiles";
import { CheckCircle2, CircleDot, Clock, Timer } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support" };

const TYPE_LABEL: Record<string, string> = {
  complaint: "Complaint",
  device_replacement: "Replacement",
  pickup: "Pickup",
  enquiry: "Sales enquiry",
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

      {/* Below sm: four full KPI tiles stacked into 2 rows pushed the actual
          ticket list below the fold (user-caught, 2026-10-07) — a compact
          2x2 grid carries the same four figures at a fraction of the height. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:hidden">
        <CompactTile tone={open > 0 ? "bad" : "ok"} value={String(open)} label="Open" />
        <CompactTile tone="warn" value={String(inProgress)} label="In progress" />
        <CompactTile tone="ok" value={String(resolved)} label="Resolved" />
        <CompactTile tone="info" value={medianDays !== null ? `${medianDays.toFixed(1)}d` : "—"} label="Median to resolve" />
      </div>

      <div className="mb-6 hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-4">
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
          <>
            {/* Desktop/tablet table. Below sm, a stacked card per ticket
                (2026-10-07, user-caught) — matching the admin side's own
                table/card pairing (e.g. src/app/admin/tickets/page.tsx),
                which this page had never adopted. */}
            <div className="hidden print-table-scroll sm:block">
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

            <div className="flex flex-col gap-2.5 sm:hidden">
              {tickets.map((t) => (
                <div key={t.id} className="card p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="min-w-0">{t.subject}</strong>
                    {t.status === "open" ? (
                      <StatusChip tone="bad">Open</StatusChip>
                    ) : t.status === "in_progress" ? (
                      <StatusChip tone="warn">In progress</StatusChip>
                    ) : (
                      <StatusChip tone="ok">Resolved</StatusChip>
                    )}
                  </div>
                  {t.status === "resolved" && t.resolutionNote && (
                    <p className="mt-1 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                      {t.resolutionNote}
                    </p>
                  )}
                  <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {TYPE_LABEL[t.type]} · {t.raisedBy.name ?? t.raisedBy.email} ·{" "}
                    <span className="num">{formatDate(t.createdAt)}</span>
                  </p>
                  {canManage && (
                    <div className="mt-2.5 border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
                      <TicketStatusControl ticketId={t.id} status={t.status} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
