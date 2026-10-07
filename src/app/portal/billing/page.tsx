import { redirect } from "next/navigation";
import { settledTotal } from "@/lib/payment";
import { db } from "@/lib/db";
import { STALE_SESSION_EXIT } from "@/lib/admin-permissions";
import { resolvePortalViewer } from "@/lib/portal-viewer";
import { hasGrant } from "@/lib/portal-access";
import { Card, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatDate, monthLabel } from "@/lib/format-date";
import { DownloadInvoiceButton } from "./download-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rupeesWhole = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

// The billed period, and — for a partial month — how many of its days this
// invoice actually covers (user-asked, 2026-09-30: "under every invoice
// section, number of days that invoice was billed for").
function periodLine(period: string, proratedDays: number | null, daysInMonth: number | null) {
  if (proratedDays === null || daysInMonth === null || proratedDays === daysInMonth) return monthLabel(period);
  return `${monthLabel(period)} · billed for ${proratedDays} of ${daysInMonth} days`;
}

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
    include: {
      calculation: { select: { period: true, proratedDays: true, daysInMonth: true } },
      payments: { select: { amount: true, tdsAmount: true } },
    },
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
                {/* Restructured (2026-10-07, user-caught — "upper space
                    un-utilised... right side showing blank"): every field
                    was a separate left-aligned line in a narrow column, with
                    the Download button floating alone on the right below
                    them. The amount and the due-date/status detail now sit
                    side by side (using the card's full width instead of
                    just its left edge), and Download is a full-width
                    primary action rather than an isolated right-aligned
                    button with empty space around it. */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold">Latest invoice</p>
                    <p className="text-[13px]" style={{ color: "var(--text-subtle)" }}>
                      <span className="num">{latest.number}</span> ·{" "}
                      {periodLine(latest.calculation.period, latest.calculation.proratedDays, latest.calculation.daysInMonth)}
                    </p>
                  </div>
                  <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                </div>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                  <p className="num text-[34px] font-extrabold leading-none tracking-[-0.02em]">
                    {rupees(latest.amount)}
                  </p>
                  <div className="text-right text-[13px]" style={{ color: "var(--text-subtle)" }}>
                    {latest.subtotal !== null && latest.taxAmount !== null && (
                      <p>{rupeesWhole(latest.subtotal)} + tax</p>
                    )}
                    <p>due by {formatDate(latest.dueDate)}</p>
                  </div>
                </div>
                {paidTotal > 0 && latest.status !== "paid" && (
                  <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                    {rupees(paidTotal)} recorded against this invoice so far.
                  </p>
                )}
                <div className="mt-4">
                  <DownloadInvoiceButton invoiceId={latest.id} fullWidth />
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
                      // flex-wrap left the chip+button pair stranded on its
                      // own line at the card's LEFT edge whenever the row
                      // didn't fit both halves side by side — justify-between
                      // only spaces items sharing one line, and a lone group
                      // wrapped onto its own line has nothing to space
                      // against (user-caught, 2026-10-07, with a screenshot:
                      // "still not fixed" — this list sat beside the Latest-
                      // invoice card I'd already fixed, untouched). That
                      // group is now its own full-width row below sm, with
                      // justify-between spanning the row's real width so the
                      // button reaches the same right edge the text above it
                      // does.
                      className="flex flex-col gap-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                      style={i < past.length - 1 ? { borderBottom: "1px solid var(--border-subtle)" } : undefined}
                    >
                      <div>
                        <p className="num text-[14px] font-semibold">{inv.number}</p>
                        <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                          {periodLine(inv.calculation.period, inv.calculation.proratedDays, inv.calculation.daysInMonth)}
                          {" · "}
                          {rupees(inv.amount)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:w-auto sm:justify-start">
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
