import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isSuperAdmin } from "@/lib/super-admin";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { gmailFake } from "@/lib/google-gmail";
import { GmailSettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google Gmail" };

// Bound to one named account (2026-11, same rule as Google Calendar): this
// key reads the dedicated pump-room mailbox.
export default async function GoogleGmailSettingsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor || !isSuperAdmin(actor.email)) redirect("/admin");
  const [config, needsAssignment, applied] = await Promise.all([
    db.googleGmailConfig.findUnique({ where: { id: "singleton" }, include: { updatedBy: { select: { name: true, email: true } } } }),
    db.emsPumpEmailIngest.count({ where: { status: "needs_assignment" } }),
    db.emsPumpEmailIngest.count({ where: { status: "applied" } }),
  ]);
  return (
    <>
      <PageHeader
        backHref="/admin"
        title="Google Gmail"
        subtitle="Reads the dedicated pump-room mailbox only — the EMS vendor's daily reports are forwarded here and ingested automatically. Operations only."
        chip={
          !config ? (
            <StatusChip tone="neu">{gmailFake() ? "Stand-in (no Google)" : "Not connected"}</StatusChip>
          ) : !config.enabled ? (
            <StatusChip tone="warn">Paused</StatusChip>
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
              Acting as <span className="num">{config.clientEmail}</span> on <span className="num">{config.mailbox}</span>
              {config.lastOkAt && <> · last tested {formatInstant(config.lastOkAt)}</>}
              {config.updatedBy && <> by {config.updatedBy.name ?? config.updatedBy.email}</>}.
            </p>
          )}
          <GmailSettingsForm
            current={{
              mailbox: config?.mailbox ?? "ems-reports@firsthing.earth",
              hasKey: config !== null,
              enabled: config?.enabled ?? true,
            }}
          />
          <p className="mt-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {applied} days applied so far · {needsAssignment} email{needsAssignment === 1 ? "" : "s"} waiting on a pump room to be classified —
            see <Link href="/admin/pump-rooms" className="underline">Pump rooms</Link>.
          </p>
        </Card>
        <Card className="p-6">
          <CardTitle>Setting it up (once, by the Workspace admin)</CardTitle>
          <ol className="list-decimal space-y-2 pl-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            <li>Create the dedicated mailbox (e.g. ems-reports@firsthing.earth) and set up a Gmail forwarding rule from the vendor&apos;s sender to it.</li>
            <li>In Google Cloud console, create (or pick) a project and enable the <strong>Gmail API</strong>.</li>
            <li>
              IAM &amp; Admin → Service accounts → create one, or reuse the Calendar integration&apos;s (no roles needed). Open it → Keys → Add key → JSON. Keep the file safe.
            </li>
            <li>Copy the service account&apos;s <strong>Client ID</strong> (a long number, on its details page).</li>
            <li>
              In <strong>admin.google.com</strong> → Security → Access and data control → API controls → Manage domain-wide delegation → Add new (or edit the existing one): that Client ID, scope{" "}
              <span className="num">https://www.googleapis.com/auth/gmail.readonly</span>.
            </li>
            <li>Paste the JSON file here, with the dedicated mailbox address, and Save and test.</li>
          </ol>
          <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            How it behaves: this key can only READ messages in the one dedicated mailbox above — it cannot send, delete, or touch anything else, on this mailbox or any other. A subject whose society label has never been classified waits on the Pump rooms screen rather than being guessed at.
          </p>
        </Card>
      </div>
    </>
  );
}
