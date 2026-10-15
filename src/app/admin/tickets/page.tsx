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
  enquiry: "Sales enquiry",
};

// The desk behind the portal's Support tab (customer portal, 2026-08-31):
// every society's complaints, replacement and pickup requests in one queue.
// Any admin can read it; acting on a request is manage_users, re-checked in
// the action. Open requests first — the queue is the point.
//
// "Assigned to me" (2026-10-15, user-asked) narrows the SAME queue rather
// than being a separate screen — it combines with the status chips so an
// assignee can ask "my open ones" or "everything assigned to me" in one
// click, and still sees the whole desk the moment they clear the filter.
export default async function AdminTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mine?: string }>;
}) {
  await requireAdminPage();
  const admin = await resolveAdmin();
  const canAct = admin?.permissions.includes("manage_users") ?? false;
  const { status, mine } = await searchParams;
  const filter = ["open", "in_progress", "resolved"].includes(status ?? "") ? status : undefined;
  const mineOn = mine === "1" && !!admin;

  const where = {
    ...(filter ? { status: filter as never } : {}),
    ...(mineOn ? { assignedToId: admin!.id } : {}),
  };

  const [tickets, assignees] = await Promise.all([
    db.ticket.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        society: { select: { id: true, name: true } },
        raisedBy: { select: { name: true, email: true } },
        lastStatusByAdmin: { select: { name: true, email: true } },
        assignedTo: { select: { name: true, email: true } },
      },
    }),
    db.adminUser.findMany({
      where: { isActive: true, deletedAt: null, permissions: { has: "manage_users" } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const counts = {
    open: await db.ticket.count({ where: { status: "open" } }),
    in_progress: await db.ticket.count({ where: { status: "in_progress" } }),
    resolved: await db.ticket.count({ where: { status: "resolved" } }),
    assignedToMe: admin ? await db.ticket.count({ where: { assignedToId: admin.id } }) : 0,
  };

  function buildHref(params: { status?: string; mine?: boolean }) {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.mine) sp.set("mine", "1");
    const qs = sp.toString();
    return qs ? `/admin/tickets?${qs}` : "/admin/tickets";
  }

  const chip = (key: string | undefined, label: string, count: number) => (
    <Link
      key={label}
      href={buildHref({ status: key, mine: mineOn })}
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
        {admin && (
          <Stat
            label="Assigned to me"
            value={String(counts.assignedToMe)}
            tone={counts.assignedToMe > 0 ? "warn" : undefined}
            detail="to track and update"
          />
        )}
      </StatRow>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip(undefined, "All", counts.open + counts.in_progress + counts.resolved)}
        {chip("open", "Open", counts.open)}
        {chip("in_progress", "In progress", counts.in_progress)}
        {chip("resolved", "Resolved", counts.resolved)}
        {admin && (
          <Link
            href={buildHref({ status: filter, mine: !mineOn })}
            className="chip"
            style={
              mineOn
                ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" }
                : { background: "var(--surface)", color: "var(--text-muted)", borderColor: "var(--border)" }
            }
          >
            Assigned to me · {counts.assignedToMe}
          </Link>
        )}
      </div>

      <Card className="p-6">
        <CardTitle>Requests</CardTitle>
        {tickets.length === 0 ? (
          <EmptyState title="Nothing here">
            {mineOn
              ? "Nothing is assigned to you right now."
              : filter
                ? "No requests with this status."
                : "No society has raised a request yet."}
          </EmptyState>
        ) : (
          <>
            {/* Desktop/tablet table. Below sm, a stacked card per request
                (2026-10-07, user-caught — Type/Raised by/Date/Status/Actions
                ran off a phone's right edge): the society and status lead,
                the subject and its detail get the full card width they
                actually need, and everything else sits on one muted line. */}
            <div className="hidden print-table-scroll sm:block">
              <table className="tbl w-full">
                <thead>
                  <tr>
                    <th>Society</th>
                    <th>Type</th>
                    <th>Subject</th>
                    <th>Raised by</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Assigned to</th>
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
                      <td className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                        {t.assignedTo ? t.assignedTo.name ?? t.assignedTo.email : "—"}
                      </td>
                      {canAct && (
                        <td>
                          <AdminTicketControls
                            ticketId={t.id}
                            status={t.status}
                            assignedToId={t.assignedToId}
                            assignees={assignees}
                            subject={t.subject}
                            detail={t.detail}
                          />
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
                    <Link href={`/admin/societies/${t.society.id}`} className="min-w-0 font-semibold">
                      {t.society.name}
                    </Link>
                    <div className="shrink-0">
                      {t.status === "open" ? (
                        <StatusChip tone="bad">Open</StatusChip>
                      ) : t.status === "in_progress" ? (
                        <StatusChip tone="warn">In progress</StatusChip>
                      ) : (
                        <StatusChip tone="ok">Resolved</StatusChip>
                      )}
                    </div>
                  </div>
                  <p className="mt-1.5">
                    <strong>{t.subject}</strong>
                    <span className="block text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {t.detail}
                    </span>
                  </p>
                  {t.status === "resolved" && t.resolutionNote && (
                    <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
                      Resolved: {t.resolutionNote}
                      {t.lastStatusByAdmin && ` — ${t.lastStatusByAdmin.name ?? t.lastStatusByAdmin.email}`}
                    </p>
                  )}
                  <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {TYPE_LABEL[t.type]} · {t.raisedBy.name ?? t.raisedBy.email} ·{" "}
                    <span className="num">{formatDate(t.createdAt)}</span>
                  </p>
                  <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                    Assigned to {t.assignedTo ? t.assignedTo.name ?? t.assignedTo.email : "nobody yet"}
                  </p>
                  {canAct && (
                    <div className="mt-2.5 border-t pt-2" style={{ borderColor: "var(--border-subtle)" }}>
                      <AdminTicketControls
                        ticketId={t.id}
                        status={t.status}
                        assignedToId={t.assignedToId}
                        assignees={assignees}
                        subject={t.subject}
                        detail={t.detail}
                      />
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
