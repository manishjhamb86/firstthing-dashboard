import { redirect } from "next/navigation";
import { settledTotal } from "@/lib/payment";
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
const rupeesWhole = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

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
    // Released MONTHS only — an invoice recorded as paid at intake carries
    // status `paid` before the accountant has published anything, and
    // `status != attached` let it through (user-caught 2026-09-16: "bills
    // show up whether released to society or not").
    where: { calculation: { societyId: viewer.societyId, releasedAt: { not: null } }, voidedAt: null },
    include: { calculation: { select: { period: true } }, payments: { select: { amount: true, tdsAmount: true } } },
    orderBy: { issueDate: "desc" },
  });

  const [latest, ...past] = invoices;

  return (
    <>
      <PageHeader title="Billing" subtitle="Your invoices, as issued by FirsThing." />

      {invoices.length === 0 ? (
        <EmptyState title="No invoices yet">
          Your first invoice appears here once a month is billed and released.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          {/* The most recent invoice, highlighted (design canvas fidelity,
              2026-09-21) — the same real fields every card below carries,
              just given the mockup's own prominence for the one that
              actually needs a decision (pay it, or note it's already
              paid). */}
          {(() => {
            const paidTotal = settledTotal(latest.payments);
            const meta = STATUS_META[latest.status] ?? { label: latest.status, tone: "warn" as const };
            return (
              <Card className="p-6">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[15px] font-extrabold">Latest invoice</p>
                  <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                </div>
                <p className="num text-[13.5px]" style={{ color: "var(--text-subtle)" }}>
                  {latest.number} · {latest.calculation.period}
                </p>
                <p className="num mt-1 text-[34px] font-extrabold leading-none tracking-[-0.02em]">
                  {rupees(latest.amount)}
                </p>
                <p className="mt-2 text-[13px]" style={{ color: "var(--text-subtle)" }}>
                  {latest.subtotal !== null && latest.taxAmount !== null
                    ? `${rupeesWhole(latest.subtotal)} + tax · due by ${formatDate(latest.dueDate)}`
                    : `Issued ${formatDate(latest.issueDate)} · due by ${formatDate(latest.dueDate)}`}
                </p>
                {paidTotal > 0 && latest.status !== "paid" && (
                  <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                    {rupees(paidTotal)} recorded against this invoice so far.
                  </p>
                )}
                <div className="mt-4">
                  <DownloadInvoiceButton invoiceId={latest.id} />
                </div>
                <p className="mt-3 text-center text-[11.5px] leading-snug" style={{ color: "var(--text-subtle)" }}>
                  Pay by bank transfer using the details printed on the invoice — FirsThing confirms
                  it manually. There is no online payment on this portal.
                </p>
              </Card>
            );
          })()}

          {past.length > 0 && (
            <Card className="p-6">
              <p className="mb-1 text-[15px] font-extrabold">Past invoices</p>
              <div className="flex flex-col">
                {past.map((inv, i) => {
                  const meta = STATUS_META[inv.status] ?? { label: inv.status, tone: "warn" as const };
                  return (
                    <div
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                      style={i < past.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : undefined}
                    >
                      <div>
                        <p className="num text-[14px] font-semibold">{inv.number}</p>
                        <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                          {inv.calculation.period} · {rupees(inv.amount)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                        <DownloadInvoiceButton invoiceId={inv.id} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
