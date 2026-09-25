import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { calendarFake } from "@/lib/google-calendar";
import { CalendarSettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google Calendar" };

// Operations only: this key can write to the calendar of anyone on the domain.
export default async function GoogleCalendarSettingsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor || !isOperations(actor.team)) redirect("/admin");
  const [config, failing, pushed] = await Promise.all([
    db.googleCalendarConfig.findUnique({ where: { id: "singleton" }, include: { updatedBy: { select: { name: true, email: true } } } }),
    db.scheduledEvent.count({ where: { calendarSyncError: { not: null }, status: "scheduled" } }),
    db.scheduledEvent.count({ where: { googleEventId: { not: null } } }),
  ]);
  return (
    <>
      <PageHeader
        backHref="/admin"
        title="Google Calendar"
        subtitle="Tasks, site visits and meetings go onto people's Google calendars, with Meet links for meetings. Operations only."
        chip={
          !config ? (
            <StatusChip tone="neu">{calendarFake() ? "Stand-in (no Google)" : "Not connected"}</StatusChip>
          ) : !config.enabled ? (
            <StatusChip tone="warn">Paused</StatusChip>
          ) : failing > 0 ? (
            <StatusChip tone="bad">{failing} not reaching Google</StatusChip>
          ) : (
            <StatusChip tone="ok">Connected</StatusChip>
          )
        }
      />
      <div className="grid max-w-5xl items-start gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <CardTitle>Connection</CardTitle>
          {config && (
            <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
              Acting as <span className="num">{config.clientEmail}</span>
              {config.lastOkAt && <> · last tested {formatInstant(config.lastOkAt)}</>}
              {config.updatedBy && <> by {config.updatedBy.name ?? config.updatedBy.email}</>} · {pushed} entries on Google Calendar.
            </p>
          )}
          <CalendarSettingsForm
            current={{
              workspaceDomain: config?.workspaceDomain ?? "firsthing.earth",
              fallbackOrganizer: config?.fallbackOrganizer ?? "",
              hasKey: config !== null,
              enabled: config?.enabled ?? true,
            }}
          />
        </Card>
        <Card className="p-6">
          <CardTitle>Setting it up (once, by the Workspace admin)</CardTitle>
          <ol className="list-decimal space-y-2 pl-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            <li>In Google Cloud console, create (or pick) a project and enable the <strong>Google Calendar API</strong>.</li>
            <li>IAM &amp; Admin → Service accounts → create one (no roles needed). Open it → Keys → Add key → JSON. Keep the file safe.</li>
            <li>Copy the service account&apos;s <strong>Client ID</strong> (a long number, on its details page).</li>
            <li>
              In <strong>admin.google.com</strong> → Security → Access and data control → API controls → Manage domain-wide delegation → Add new: that Client ID, scope{" "}
              <span className="num">https://www.googleapis.com/auth/calendar.events</span>.
            </li>
            <li>Paste the JSON file here, with the domain and an organizer account (e.g. an operations mailbox), and Save and test.</li>
          </ol>
          <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            How it behaves: the person who sets a task or meeting organizes it on their own Google calendar; whoever it is assigned to, and anyone invited, get Google&apos;s own invitation email and see it on their calendar. Changes made here update Google; changes made in Google are not read back, except who has accepted or declined.
          </p>
        </Card>
      </div>
    </>
  );
}
