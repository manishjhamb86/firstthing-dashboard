import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { UnmarkDefaulterButton } from "@/components/mark-defaulter-dialog";
import {
  NOTIFICATION_KIND_LABEL,
  isAcknowledgeableKind,
  notificationActionLabel,
  notificationCategory,
  notificationTone,
  defaulterNotifications,
} from "@/lib/notifications";
import { NotificationsClient } from "../notifications/notifications-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Defaulter societies" };

/**
 * Societies marked a defaulter (2026-10-21, user-asked), and their own
 * section of the notification feed. Rejecting/terminating a society is a
 * different act (close-actions.ts) — this is purely "has stopped paying",
 * and the only consequence anywhere else in this app is that these
 * societies' notifications live here instead of the main window.
 */
export default async function DefaultersPage() {
  const actor = await requireAdminPage();
  if (!actor) redirect("/api/session-ended");
  const viewer = await resolveAdmin();
  const isOps = !!viewer && viewer.permissions.includes("manage_pipeline") && viewer.permissions.includes("manage_survey");
  const canAck = actor.user.adminPermissions.includes("manage_users");

  const [societies, notes] = await Promise.all([
    db.society.findMany({
      where: { markedDefaulterAt: { not: null } },
      orderBy: { markedDefaulterAt: "desc" },
      select: { id: true, name: true, location: true, markedDefaulterAt: true, markedDefaulterReason: true },
    }),
    defaulterNotifications(),
  ]);

  const items = notes.map((n) => ({
    ...n,
    label: NOTIFICATION_KIND_LABEL[n.kind] ?? n.kind,
    tone: notificationTone(n.kind),
    category: notificationCategory(n.kind),
    actionLabel: notificationActionLabel(n.kind),
    acknowledgeable: canAck && isAcknowledgeableKind(n.kind),
  }));

  return (
    <>
      <PageHeader
        title="Defaulter societies"
        subtitle="Societies marked as having stopped paying, or never having paid at all — and their notifications, moved out of the main window."
        chip={<StatusChip tone={societies.length > 0 ? "bad" : "ok"}>{societies.length} marked</StatusChip>}
      />

      <Card className="p-6">
        <CardTitle>Marked a defaulter</CardTitle>
        {societies.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No society is marked a defaulter">
              Mark one from its own page — the control sits beside its status in the header.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {societies.map((s) => (
              <div key={s.id} className="card flex flex-wrap items-start justify-between gap-3 p-3.5">
                <div>
                  <Link href={`/admin/societies/${s.id}`} className="font-medium underline">
                    {s.name}
                  </Link>
                  <p className="text-xs text-[var(--text-subtle)]">{s.location}</p>
                  <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    Marked {formatDate(s.markedDefaulterAt!)}
                    {s.markedDefaulterReason ? ` — ${s.markedDefaulterReason}` : ""}
                  </p>
                </div>
                {isOps && <UnmarkDefaulterButton societyId={s.id} />}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6">
        <h2 className="mb-2 text-[15px] font-semibold">Their notifications</h2>
        {items.length === 0 ? (
          <Card className="p-6">
            <EmptyState title="Nothing open for a defaulter society right now">
              A defaulter society&rsquo;s meter, billing, inspection, request and follow-up notifications all land here
              instead of the main notification window.
            </EmptyState>
          </Card>
        ) : (
          <NotificationsClient items={items} />
        )}
      </div>
    </>
  );
}
