import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { DownloadInvoiceButton } from "./download-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "bad" }> = {
  released: { label: "Pending", tone: "warn" },
  overdue: { label: "Overdue", tone: "bad" },
  warning: { label: "Overdue", tone: "bad" },
  suspended: { label: "Overdue", tone: "bad" },
  paid: { label: "Paid", tone: "ok" },
};

// The society's own bills, and nobody else's (INV-05 — scoped by the
// viewer's own societyId). Only a RELEASED invoice is shown at all: CON-33
// exists precisely so a figure reaches a society only once something other
// than the process that produced it says so, and an "attached" invoice is
// still mid-reconciliation on the back office's own screen.
export default async function PortalBillingPage() {
  const viewer = await resolvePortalViewer();
  if (!viewer?.societyId) redirect(STALE_SESSION_EXIT);
  if (!hasGrant(viewer, "billing")) redirect("/portal");

  const invoices = await db.billingInvoice.findMany({
    where: { calculation: { societyId: viewer.societyId }, status: { not: "attached" } },
    include: { calculation: { select: { period: true } }, payments: { select: { amount: true } } },
    orderBy: { issueDate: "desc" },
  });

  return (
    <>
      <PageHeader title="Billing" subtitle="Your invoices, as issued by FirsThing." />

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet">
          Your first invoice appears here once a month is billed and released.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {invoices.map((inv) => {
            const paidTotal = inv.payments.reduce((n, p) => n + p.amount, 0);
            const meta = STATUS_META[inv.status] ?? { label: inv.status, tone: "warn" as const };
            return (
              <Card key={inv.id} className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="lbl">{inv.calculation.period}</p>
                    <p className="mt-1 flex items-baseline gap-2.5">
                      <span className="num text-[28px] font-bold leading-none tracking-[-0.02em]">
                        {rupees(inv.amount)}
                      </span>
                      <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                    </p>
                    <p className="mt-2 text-[13px]" style={{ color: "var(--text-subtle)" }}>
                      Invoice {inv.number} · issued {formatDate(inv.issueDate)} · due {formatDate(inv.dueDate)}
                    </p>
                    {paidTotal > 0 && inv.status !== "paid" && (
                      <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                        {rupees(paidTotal)} recorded against this invoice so far.
                      </p>
                    )}
                  </div>
                  <DownloadInvoiceButton invoiceId={inv.id} />
                </div>
              </Card>
            );
          })}
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            Pay by bank transfer using the details printed on the invoice itself. Once FirsThing
            confirms a payment it is reflected here — there is no online payment on this portal.
          </p>
        </div>
      )}
    </>
  );
}
