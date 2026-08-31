import { redirect } from "next/navigation";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { societyEvents } from "@/lib/portal-notifications";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { timeAgoShort } from "../portal-widgets";
import Link from "next/link";
import { MarkReadButton } from "./mark-read-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

// Everything worth the society's attention, derived from rows of record —
// alerts, filings, ticket updates. Read state is PER MEMBER, one timestamp
// (Profile.notificationsSeenAt): the feed has no event rows to key a read
// table against, and "seen up to here" is what a bell means anyway.
export default async function PortalNotificationsPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);

  const events = await societyEvents(viewer.societyId);
  const seenAt = viewer.notificationsSeenAt;
  const isUnseen = (at: Date) => seenAt === null || at > seenAt;
  const unseenCount = events.filter((e) => isUnseen(e.at)).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Reports filed, sensor trouble, ticket updates — newest first."
        action={unseenCount > 0 ? <MarkReadButton /> : undefined}
      />

      {events.length === 0 ? (
        <EmptyState title="Nothing yet">
          When FirsThing files a report, a sensor stops answering, or a ticket moves, it shows up
          here.
        </EmptyState>
      ) : (
        <Card className="max-w-3xl p-0">
          <div className="flex flex-col">
            {events.map((e, i) => (
              <div
                key={e.id}
                className="flex gap-3 px-5 py-4"
                style={{
                  ...(i < events.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : {}),
                  ...(isUnseen(e.at) ? { background: "var(--accent-subtle)" } : {}),
                }}
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{
                    opacity: isUnseen(e.at) ? 1 : 0.35,
                    background:
                      e.tone === "warn"
                        ? "var(--warn-fg)"
                        : e.tone === "ok"
                          ? "var(--ok-fg)"
                          : e.tone === "info"
                            ? "var(--accent)"
                            : "var(--neu-fg)",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold leading-snug">{e.title}</p>
                  <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {e.detail}
                  </p>
                  <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-subtle)" }} title={formatInstant(e.at)}>
                    {timeAgoShort(e.at)}
                  </p>
                </div>
                {e.href && (
                  <Link href={e.href} className="self-center text-[12.5px] font-semibold whitespace-nowrap">
                    Open →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
