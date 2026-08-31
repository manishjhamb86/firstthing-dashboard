import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, Stat, StatRow, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { AdminTicketControls } from "./ticket-controls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Support tickets" };

const TYPE_LABEL: Record<string, string> = {
  complaint: "Complaint",
  device_replacement: "Replacement",
  pickup: "Pickup",
};

// The desk behind the portal's Support tab (customer portal, 2026-08-31):
// every society's complaints, replacement and pickup requests in one queue.
// Any admin can read it; acting on a request is manage_users, re-checked in
// the action. Open requests first — the queue is the point.
export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdminPage();
  const admin = await resolveAdmin();
  const canAct = admin?.permissions.includes("manage_users") ?? false;
  const { status } = await searchParams;
  const filter = ["open", "in_progress", "resolved"].includes(status ?? "") ? status : undefined;

  const tickets = await db.ticket.findMany({
    where: filter ? { status: filter as never } : undefined,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      society: { select: { id: true, name: true } },
      raisedBy: { select: { name: true, email: true } },
      lastStatusByAdmin: { select: { name: true, email: true } },
    },
  });
  const counts = {
    open: await db.ticket.count({ where: { status: "open" } }),
    in_progress: await db.ticket.count({ where: { status: "in_progress" } }),
    resolved: await db.ticket.count({ where: { status: "resolved" } }),
  };

  const chip = (key: string | undefined, label: string, count: number) => (
    <Link
      key={label}
      href={key ? `/admin/tickets?status=${key}` : "/admin/tickets"}
      className="chip"
      style={
        filter === key
          ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
          : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
      }
    >
      {label} · {count}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Support tickets"
        subtitle="What societies have raised — complaints, device replacements, pickups."
        chip={
          counts.open > 0 ? <StatusChip tone="warn">{counts.open} open</StatusChip> : undefined
        }
      />

      <StatRow>
        <Stat label="Open" value={String(counts.open)} tone={counts.open > 0 ? "warn" : undefined} detail="nobody has taken these up" />
        <Stat label="In progress" value={String(counts.in_progress)} />
        <Stat label="Resolved" value={String(counts.resolved)} />
      </StatRow>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip(undefined, "All", counts.open + counts.in_progress + counts.resolved)}
        {chip("open", "Open", counts.open)}
        {chip("in_progress", "In progress", counts.in_progress)}
        {chip("resolved", "Resolved", counts.resolved)}
      </div>

      <Card className="p-6">
        <CardTitle>Requests</CardTitle>
        {tickets.length === 0 ? (
          <EmptyState title="Nothing here">
            {filter ? "No requests with this status." : "No society has raised a request yet."}
          </EmptyState>
        ) : (
          <div className="print-table-scroll">
            <table className="tbl w-full">
              <thead>
                <tr>
                  <th>Society</th>
                  <th>Type</th>
                  <th>Subject</th>
                  <th>Raised by</th>
                  <th>Date</th>
                  <th>Status</th>
                  {canAct && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/admin/societies/${t.society.id}`} className="font-semibold">
                        {t.society.name}
                      </Link>
                    </td>
                    <td className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {TYPE_LABEL[t.type]}
                    </td>
                    <td>
                      <strong>{t.subject}</strong>
                      <span className="block max-w-[420px] text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {t.detail}
                      </span>
                      {t.status === "resolved" && t.resolutionNote && (
                        <span className="block text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                          Resolved: {t.resolutionNote}
                          {t.lastStatusByAdmin &&
                            ` — ${t.lastStatusByAdmin.name ?? t.lastStatusByAdmin.email}`}
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
                    {canAct && (
                      <td>
                        <AdminTicketControls ticketId={t.id} status={t.status} />
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
