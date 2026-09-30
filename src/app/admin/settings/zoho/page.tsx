import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage, resolveAdmin } from "@/lib/admin-permissions";
import { isOperations } from "@/lib/admin-teams";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { ZOHO_SCOPES } from "@/lib/zoho-invoice";
import { ZohoSettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zoho Invoice" };

// Operations only: the connection reads every invoice in the company's account.
export default async function ZohoSettingsPage() {
  await requireAdminPage();
  const actor = await resolveAdmin();
  if (!actor || !isOperations(actor.team)) redirect("/admin");
  const [config, fetched] = await Promise.all([
    db.zohoInvoiceConfig.findUnique({ where: { id: "singleton" }, include: { updatedBy: { select: { name: true, email: true } } } }),
    db.invoiceIntake.count({ where: { zohoInvoiceId: { not: null } } }),
  ]);
  const accounts = config?.dataCenter === "com" ? "api-console.zoho.com" : config?.dataCenter === "eu" ? "api-console.zoho.eu" : "api-console.zoho.in";
  return (
    <>
      <PageHeader
        backHref="/admin"
        title="Zoho Invoice"
        subtitle="Invoices raised in Zoho Invoice are fetched into Invoice intake with their PDFs, every 6 hours or on request. Read only. Operations only."
        chip={
          !config ? (
            <StatusChip tone="neu">Not connected</StatusChip>
          ) : !config.enabled ? (
            <StatusChip tone="warn">Paused</StatusChip>
          ) : config.lastError ? (
            <StatusChip tone="bad">Last fetch had a problem</StatusChip>
          ) : (
            <StatusChip tone="ok">Connected</StatusChip>
          )
        }
      />
      <div className="grid max-w-5xl items-start gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <CardTitle>Connection</CardTitle>
          {config && (
            <div className="mb-4 space-y-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
              <p>
                {config.organizationName ?? "Organisation"} <span className="num">({config.organizationId})</span>
                {config.updatedBy && <> · connected by {config.updatedBy.name ?? config.updatedBy.email}</>}
              </p>
              <p>
                {fetched} invoices fetched so far
                {config.lastSyncAt && <> · last fetch {formatInstant(config.lastSyncAt)}</>}.{" "}
                <Link href="/admin/billing/intake" className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                  Open Invoice intake →
                </Link>
              </p>
              {config.lastSyncSummary && <p>{config.lastSyncSummary}</p>}
              {config.lastError && <p style={{ color: "var(--bad-fg)" }}>{config.lastError}</p>}
            </div>
          )}
          <ZohoSettingsForm
            current={{
              dataCenter: config?.dataCenter ?? "in",
              organizationId: config?.organizationId ?? "60070829320",
              clientId: config?.clientId ?? "",
              importFrom: config?.importFrom ? config.importFrom.toISOString().slice(0, 10) : "",
              connected: config !== null,
              enabled: config?.enabled ?? true,
            }}
          />
        </Card>
        <Card className="p-6">
          <CardTitle>Setting it up (once)</CardTitle>
          <ol className="list-decimal space-y-2 pl-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            <li>
              Signed in to Zoho as an admin of the organisation, open <strong>{accounts}</strong> → Get started → <strong>Self Client</strong> → Create.
            </li>
            <li>Its <strong>Client Secret</strong> tab shows the client id and secret — paste both here.</li>
            <li>
              Its <strong>Generate Code</strong> tab: scope <span className="num">{ZOHO_SCOPES}</span>, time 10 minutes, any description → Create, and choose the organisation if asked.
            </li>
            <li>Paste the code here straight away and Save and test. The code works once; the connection it makes lasts until it is revoked in Zoho.</li>
          </ol>
          <p className="mt-4 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            How it behaves: drafts and void invoices are left in Zoho. Every other invoice arrives in Invoice intake with its PDF and its lines, totals, dates and payment
            status already filled from Zoho — no upload and no document reading. It still waits for your review, submit and release. An invoice already entered from its
            PDF is matched by number, not fetched twice. A change made in Zoho after fetching is flagged on the row, never applied over your review silently. Nothing is ever
            written to Zoho.
          </p>
        </Card>
      </div>
    </>
  );
}
