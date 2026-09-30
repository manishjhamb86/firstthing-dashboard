import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardTitle, PageHeader, StatusChip } from "@/components/ui";
import { publicS3Url } from "@/lib/s3";
import { requireBillingOps } from "../../billing/access";
import { taskState } from "@/lib/tasks";
import { retailInvoicePaidTotal, retailInvoiceSettled } from "@/lib/retail-customer";
import { EditCustomerButton } from "./edit-customer";
import { NewInvoiceButton } from "./new-invoice";
import { InvoicesList, type InvoiceRow } from "./invoices-list";
import { CustomerTasksCard } from "./tasks-card";

export const dynamic = "force-dynamic";

export default async function RetailCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const gate = await requireBillingOps();
  if (!gate.ok) redirect("/admin/billing");
  const { id } = await params;
  const [customer, societies, people] = await Promise.all([
    db.retailCustomer.findUnique({
      where: { id },
      include: {
        society: { select: { id: true, name: true } },
        invoices: {
          orderBy: [{ period: "desc" }, { createdAt: "desc" }],
          include: { payments: { orderBy: { paidOn: "asc" } }, voidedBy: { select: { name: true, email: true } } },
        },
        scheduledEvents: {
          where: { kind: "task" },
          orderBy: { startAt: "asc" },
          include: { assignee: { select: { name: true, email: true } } },
        },
      },
    }),
    db.society.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.adminUser.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  if (!customer) notFound();

  const today = new Date();
  const invoiceRows: InvoiceRow[] = customer.invoices.map((i) => {
    const paidTotal = retailInvoicePaidTotal(i, i.payments);
    return {
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      period: i.period,
      invoiceDate: i.invoiceDate?.toISOString() ?? null,
      total: i.total,
      paid: i.paid,
      paidOn: i.paidOn?.toISOString() ?? null,
      advanceAmount: i.advanceAmount,
      advanceOn: i.advanceOn?.toISOString() ?? null,
      s3Key: i.s3Key,
      fileName: i.fileName,
      fileUrl: i.s3Key ? publicS3Url(i.s3Key) : null,
      voidedAt: i.voidedAt?.toISOString() ?? null,
      voidedByName: i.voidedBy?.name ?? i.voidedBy?.email ?? null,
      voidReason: i.voidReason,
      payments: i.payments.map((p) => ({ id: p.id, amount: p.amount, method: p.method, paidOn: p.paidOn.toISOString(), reference: p.reference })),
      paidTotal,
      settled: retailInvoiceSettled(i, i.payments),
    };
  });

  const taskRows = customer.scheduledEvents
    .filter((t) => t.status === "scheduled")
    .map((t) => ({
      id: t.id,
      title: t.title,
      due: t.startAt.toISOString(),
      assignee: t.assignee.name ?? t.assignee.email,
      state: taskState({ status: t.status, startAt: t.startAt }, today),
    }));

  const liveInvoices = customer.invoices.filter((i) => !i.voidedAt);
  const billed = liveInvoices.reduce((n, i) => n + i.total, 0);
  const unpaid = liveInvoices.reduce((n, i) => {
    const paidTotal = retailInvoicePaidTotal(i, i.payments);
    return n + Math.max(0, i.total - paidTotal);
  }, 0);

  return (
    <>
      <PageHeader
        backHref="/admin/retail-customers"
        title={customer.name}
        chip={<StatusChip tone="info">Retail customer</StatusChip>}
        subtitle={[customer.gstin ? `GSTIN ${customer.gstin}` : null, customer.address].filter(Boolean).join(" · ") || "No GSTIN or address on record"}
        action={<NewInvoiceButton customerId={customer.id} />}
      />
      <div className="grid gap-5 sm:grid-cols-3 mb-5">
        <Card className="p-4">
          <p className="lbl">Billed</p>
          <p className="num text-[22px] font-semibold">₹{billed.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </Card>
        <Card className="p-4">
          <p className="lbl">Still owed</p>
          <p className="num text-[22px] font-semibold" style={unpaid > 0 ? { color: "var(--warn-fg)" } : undefined}>
            {unpaid > 0 ? `₹${unpaid.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "₹0"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="lbl">Invoices</p>
          <p className="num text-[22px] font-semibold">{liveInvoices.length}</p>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5 min-w-0">
          <InvoicesList invoices={invoiceRows} />
          <CustomerTasksCard customerId={customer.id} tasks={taskRows} me={gate.actor.id} people={people.map((p) => ({ id: p.id, name: p.name ?? p.email }))} today={today.toISOString().slice(0, 10)} />
        </div>
        <Card className="p-5 text-[13.5px] h-fit">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="mb-0">Details</CardTitle>
            <EditCustomerButton
              customer={{
                id: customer.id,
                name: customer.name,
                gstin: customer.gstin,
                address: customer.address,
                phone: customer.phone,
                email: customer.email,
                societyId: customer.societyId,
                notes: customer.notes,
              }}
              societies={societies}
            />
          </div>
          <dl className="space-y-2 mt-3">
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
            {customer.notes && (
              <div>
                <dt className="lbl">Notes</dt>
                <dd className="whitespace-pre-wrap">{customer.notes}</dd>
              </div>
            )}
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
