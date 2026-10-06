import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import {
  NOTIFICATION_KIND_LABEL,
  isAcknowledgeableKind,
  notificationActionLabel,
  notificationCategory,
  notificationTone,
  openNotifications,
  pastNotifications,
} from "@/lib/notifications";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

/**
 * One place for everything that has asked for attention — open now, and the
 * ones that opened and closed while nobody was looking.
 *
 * The history half is the point: an alert that resolved itself overnight
 * used to leave no trace anybody would find, so "it has been offline several
 * times" was a thing the operator knew and the product did not.
 *
 * 2026-10-07, user-caught: a flat 25-item list is exhausting to read and
 * gives no way to jump to what matters. The server side now does nothing
 * but attach display fields (tone/label/category/action) to each row; every
 * bit of grouping, filtering and search lives in `NotificationsClient`,
 * which also folds the ticket feed in as one more category instead of a
 * separately hardcoded card — one list, navigable, rather than two.
 */
export default async function NotificationsPage() {
  const actor = await requireAdminPage();
  if (!actor) redirect("/api/session-ended");
  const [open, past] = await Promise.all([openNotifications(), pastNotifications()]);
  const canAck = actor.user.adminPermissions.includes("manage_users");
  const unattended = open.filter((n) => n.acknowledgedAt === null).length;

  const items = open.map((n) => ({
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
        title="Notifications"
        subtitle="Everything that has asked for attention — open now, and everything that has resolved."
        chip={
          unattended > 0 ? (
            <StatusChip tone="bad">{unattended} unattended</StatusChip>
          ) : (
            <StatusChip tone="ok">Nothing unattended</StatusChip>
          )
        }
      />

      <NotificationsClient items={items} />

      <Card className="mt-6 p-6">
        <CardTitle>Resolved</CardTitle>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          Kept so a meter that dropped out overnight and came back is still on record afterwards.
        </p>
        {past.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Nothing has resolved yet">
              When an alert closes, it stays here with the reason it closed.
            </EmptyState>
          </div>
        ) : (
          <>
            {/* Desktop/tablet table. Below sm, a stacked card per row —
                What/Meter/Opened/Closed/How ran off a phone's right edge on
                a plain `.tbl`, same shape as every other listing swept in
                the 2026-10-07 mobile pass. */}
            <div className="mt-3 hidden overflow-x-auto sm:block">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>Meter</th>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th>How it ended</th>
                  </tr>
                </thead>
                <tbody>
                  {past.map((n) => (
                    <tr key={n.id}>
                      <td>
                        <StatusChip tone={notificationTone(n.kind)}>
                          {NOTIFICATION_KIND_LABEL[n.kind] ?? n.kind}
                        </StatusChip>
                      </td>
                      <td className="text-[13px]">
                        <Link href={n.href} className="font-medium underline">
                          {n.subject}
                        </Link>
                        <div className="text-xs text-[var(--text-subtle)]">
                          {[n.societyName, n.circuitLabel].filter(Boolean).join(" · ") || "not assigned"}
                        </div>
                      </td>
                      <td className="num whitespace-nowrap text-[13px]">
                        {n.openedAt.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="num whitespace-nowrap text-[13px]">
                        {n.closedAt?.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="text-[13px] text-[var(--text-muted)]">{n.closedReason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-col gap-2.5 sm:hidden">
              {past.map((n) => (
                <div key={n.id} className="card p-3.5">
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <StatusChip tone={notificationTone(n.kind)}>
                      {NOTIFICATION_KIND_LABEL[n.kind] ?? n.kind}
                    </StatusChip>
                  </div>
                  <Link href={n.href} className="font-medium underline">
                    {n.subject}
                  </Link>
                  <p className="text-xs text-[var(--text-subtle)]">
                    {[n.societyName, n.circuitLabel].filter(Boolean).join(" · ") || "not assigned"}
                  </p>
                  <p className="mt-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    <span className="num">{n.openedAt.slice(0, 16).replace("T", " ")}</span>
                    {" → "}
                    <span className="num">{n.closedAt?.slice(0, 16).replace("T", " ")}</span>
                    {" · "}
                    {n.closedReason ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </>
  );
}
