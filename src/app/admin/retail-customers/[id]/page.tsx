import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardTitle, EmptyState, PageHeader, StatusChip } from "@/components/ui";
import { formatDate, monthLabel } from "@/lib/format-date";
import { publicS3Url } from "@/lib/s3";
import { requireBillingOps } from "../../billing/access";

export const dynamic = "force-dynamic";

export default async function RetailCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireBillingOps();
  if (!gate.ok) redirect("/admin/billing");
  const { id } = await params;
  const customer = await db.retailCustomer.findUnique({
    where: { id },
    include: {
      society: { select: { id: true, name: true } },
      invoices: { where: { voidedAt: null }, orderBy: [{ period: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!customer) notFound();
  const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <>
      <PageHeader
        backHref="/admin/retail-customers"
        title={customer.name}
        chip={<StatusChip tone="info">Retail customer</StatusChip>}
        subtitle={[customer.gstin ? `GSTIN ${customer.gstin}` : null, customer.address].filter(Boolean).join(" · ") || "No GSTIN or address on record"}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Card className="overflow-hidden">
          <div className="p-5 pb-0">
            <CardTitle>Invoices</CardTitle>
          </div>
          {customer.invoices.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No invoices yet">Retail invoices filed from invoice intake appear here.</EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Month</th>
                    <th>Date</th>
                    <th className="text-right">Total</th>
                    <th>Payment</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {customer.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="font-medium">{i.invoiceNumber}</td>
                      <td>{monthLabel(i.period)}</td>
                      <td>{i.invoiceDate ? formatDate(i.invoiceDate) : "—"}</td>
                      <td className="num text-right">{rupees(i.total)}</td>
                      <td>
                        {i.paid ? (
                          <StatusChip tone="ok">Paid{i.paidOn ? ` ${formatDate(i.paidOn)}` : ""}</StatusChip>
                        ) : i.advanceAmount ? (
                          <span className="flex flex-col gap-0.5">
                            <StatusChip tone="warn">Advance {rupees(i.advanceAmount)}</StatusChip>
                            <span className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                              {i.advanceOn ? `on ${formatDate(i.advanceOn)} · ` : ""}
                              {rupees(i.total - i.advanceAmount)} still owed
                            </span>
                          </span>
                        ) : (
                          <StatusChip tone="warn">Unpaid</StatusChip>
                        )}
                      </td>
                      <td className="text-right">
                        <a href={publicS3Url(i.s3Key)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                          Download
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="p-5 text-[13.5px]">
          <CardTitle>Details</CardTitle>
          <dl className="space-y-2">
            <div>
              <dt className="lbl">Phone</dt>
              <dd>{customer.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="lbl">Email</dt>
              <dd>{customer.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="lbl">Society</dt>
              <dd>
                {customer.society ? <Link href={`/admin/societies/${customer.society.id}`}>{customer.society.name}</Link> : "Not a society on record"}
              </dd>
            </div>
            <div>
              <dt className="lbl">Portal access</dt>
              <dd>None — back-office record only.</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
