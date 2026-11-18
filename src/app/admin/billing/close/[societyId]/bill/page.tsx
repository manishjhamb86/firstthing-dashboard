import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { formatDate, formatInstant, monthLabel } from "@/lib/format-date";
import { defaultClosePeriod, inr } from "@/lib/monthly-close";
import { loadCloseRows } from "@/lib/monthly-close-loader";
import { canRelease, isOps, requireBillingReader } from "../../../access";
import { BillChip, validPeriod } from "../../close-ui";
import { FetchBillButton } from "./fetch-bill-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Monthly bill — monthly close" };

/**
 * Step 2: the month's bill (2026-11-18). Where the Zoho invoice stands, and
 * the one next act: fetch it, check it in Invoice intake, or release it. The
 * checking and the release are the screens that already own them — the
 * usual bill process — reached from here and returning here.
 */
export default async function CloseBillPage({
  params,
  searchParams,
}: {
  params: Promise<{ societyId: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const gate = await requireBillingReader();
  if (!gate.ok) redirect("/admin");
  const { societyId } = await params;
  const period = validPeriod((await searchParams).period, defaultClosePeriod());
  const [row] = await loadCloseRows(period, societyId);
  if (!row) notFound();
  const back = `/admin/billing/close/${societyId}?period=${period}`;
  const invoice = row.invoice
    ? await db.billingInvoice.findUnique({
        where: { id: row.invoice.id },
        select: { number: true, amount: true, subtotal: true, taxAmount: true, issueDate: true, dueDate: true, status: true, releasedAt: true, payments: { select: { amount: true, tdsAmount: true } } },
      })
    : null;
  const paid = invoice ? invoice.payments.reduce((s, p) => s + p.amount + (p.tdsAmount ?? 0), 0) : 0;
  const zoho = await db.zohoInvoiceConfig.findUnique({ where: { id: "singleton" }, select: { lastSyncAt: true } }).catch(() => null);

  return (
    <>
      <PageHeader backHref={back} title={`${monthLabel(period)} bill`} subtitle={`${row.name} · step 2 of 3`} chip={<BillChip state={row.bill} />} />

      {row.bill === "not_fetched" && (
        <section className="card flex flex-col items-center gap-3 p-8 text-center sm:p-12">
          <h2 className="text-[19px] font-bold">No {monthLabel(period)} invoice fetched yet</h2>
          <p className="max-w-[540px] text-[14px] text-[var(--text-muted)]">
            New invoices are fetched from Zoho every 6 hours{zoho?.lastSyncAt ? ` — last at ${formatInstant(zoho.lastSyncAt)}` : ""}. If the invoice was raised since, fetch it now.
          </p>
          {isOps(gate.actor) ? (
            <FetchBillButton societyId={societyId} period={period} />
          ) : (
            <p className="text-[13px] text-[var(--text-muted)]">Fetching from Zoho is an operations lead action.</p>
          )}
          <p className="text-[12.5px] text-[var(--text-muted)]">
            Raised outside Zoho? <Link href="/admin/billing/intake" className="font-semibold" style={{ color: "var(--accent)" }}>Upload the PDF in Invoice intake</Link>
          </p>
        </section>
      )}

      {row.bill === "to_review" && row.intakeId && (
        <section className="card flex flex-col gap-3 p-6">
          <h2 className="text-[17px] font-bold">The invoice is in — check it</h2>
          <p className="text-[14px] text-[var(--text-muted)]">
            It has been read from Zoho. Check the society, the month and each line against the circuits, choose the payment status, and submit it. Then come back here.
          </p>
          <Link href={`/admin/billing/intake/${row.intakeId}`} className="btn-primary self-start">Review the invoice</Link>
        </section>
      )}

      {invoice && (
        <section className="card p-6">
          <dl className="grid gap-4 text-[13px]" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            <div><dt className="text-[var(--text-muted)]">Invoice</dt><dd className="mt-1 text-[15px] font-bold">{invoice.number}</dd></div>
            <div><dt className="text-[var(--text-muted)]">Total</dt><dd className="num mt-1 text-[15px] font-bold">{inr(invoice.amount)}</dd></div>
            <div><dt className="text-[var(--text-muted)]">Before GST</dt><dd className="num mt-1 text-[15px] font-bold">{invoice.subtotal !== null ? inr(invoice.subtotal) : "—"}</dd></div>
            <div><dt className="text-[var(--text-muted)]">Invoice date</dt><dd className="mt-1 text-[15px] font-bold">{formatDate(invoice.issueDate)}</dd></div>
            <div><dt className="text-[var(--text-muted)]">Due</dt><dd className="mt-1 text-[15px] font-bold">{formatDate(invoice.dueDate)}</dd></div>
            <div><dt className="text-[var(--text-muted)]">Paid</dt><dd className="mt-1 text-[15px] font-bold">{paid >= invoice.amount - 1 ? "Yes" : paid > 0 ? inr(paid) : "Not yet"}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
            {row.bill === "awaiting_release" ? (
              <>
                {canRelease(gate.actor) ? (
                  <Link href={`/admin/billing/${row.calculationId}`} className="btn-primary">Open the bill to release it</Link>
                ) : (
                  <Link href={`/admin/billing/${row.calculationId}`} className="btn-secondary">Open the bill</Link>
                )}
                <p className="text-[13px] text-[var(--text-muted)]">
                  Releasing is the accountant&apos;s act. Once released it shows on the society&apos;s portal and payment follow-up starts from the due date.
                </p>
              </>
            ) : (
              <>
                <span className="text-[13.5px] font-semibold" style={{ color: "var(--ok-fg)" }}>
                  Released to {row.name}{invoice.releasedAt ? ` on ${formatDate(invoice.releasedAt)}` : ""}.
                </span>
                <Link href={back} className="btn-primary">Back to {row.name}</Link>
                <Link href={`/admin/billing/${row.calculationId}`} className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>Open the bill</Link>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}
