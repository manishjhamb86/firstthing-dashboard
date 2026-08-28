import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-permissions";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { openNotifications, pastNotifications } from "@/lib/notifications";
import { AcknowledgeButton } from "./acknowledge-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

/**
 * One place for everything that has asked for attention — open now, and the
 * ones that opened and closed while nobody was looking.
 *
 * The history half is the point: an alert that resolved itself overnight
 * used to leave no trace anybody would find, so "it has been offline several
 * times" was a thing the operator knew and the product did not.
 */
export default async function NotificationsPage() {
  const actor = await requireAdminPage();
  if (!actor) redirect("/api/session-ended");
  const [open, past] = await Promise.all([openNotifications(), pastNotifications()]);
  const canAck = actor.user.adminPermissions.includes("manage_users");
  const unattended = open.filter((n) => n.acknowledgedAt === null).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Meters that have asked for attention — open now, and everything that has resolved."
        chip={
          unattended > 0 ? (
            <StatusChip tone="bad">{unattended} unattended</StatusChip>
          ) : (
            <StatusChip tone="ok">Nothing unattended</StatusChip>
          )
        }
      />

      <div className="space-y-6">
        <Card className="p-6">
          <CardTitle>Open</CardTitle>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            These conditions are still true. Acknowledging takes one off the badge without closing
            it — only the meter reporting again, or reading back inside its ceiling, does that.
          </p>
          {open.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="Nothing open">
                Every meter is reporting, and every day is inside what its circuit can draw.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {open.map((n) => (
                <li
                  key={n.id}
                  className="rounded-[var(--r-sm)] p-3"
                  style={{
                    background: n.kind === "offline" ? "var(--bad-bg)" : "var(--warn-bg)",
                    border: `1px solid ${n.kind === "offline" ? "var(--bad-line)" : "var(--warn-line)"}`,
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <StatusChip tone={n.kind === "offline" ? "bad" : "warn"}>
                          {n.kind === "offline" ? "Not reachable" : "Out of range"}
                        </StatusChip>
                        <span className="num text-xs text-[var(--text-subtle)]">
                          since {n.openedAt.slice(0, 16).replace("T", " ")}
                        </span>
                        {n.acknowledgedAt && (
                          <span className="text-xs text-[var(--text-subtle)]">
                            · acknowledged {n.acknowledgedAt.slice(0, 16).replace("T", " ")}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px]">{n.message}</p>
                      <p className="mt-1 text-xs text-[var(--text-subtle)]">
                        {[n.societyName, n.circuitLabel].filter(Boolean).join(" · ") || "not assigned"}
                        {n.ownerLabel ? ` · ${n.ownerLabel} to chase` : " · nobody named to chase it"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {canAck && !n.acknowledgedAt && <AcknowledgeButton alertId={n.id} />}
                      <Link href={n.href} className="text-[13px] font-semibold underline">
                        Open meter →
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
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
            <div className="mt-3 overflow-x-auto">
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
                        <StatusChip tone={n.kind === "offline" ? "bad" : "warn"}>
                          {n.kind === "offline" ? "Not reachable" : "Out of range"}
                        </StatusChip>
                      </td>
                      <td className="text-[13px]">
                        <Link href={n.href} className="font-medium underline">
                          {n.meterName}
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
          )}
        </Card>
      </div>
    </>
  );
}
