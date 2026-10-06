import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireBillingOps } from "../billing/access";
import { retailInvoicePaidTotal } from "@/lib/retail-customer";
import { NewRetailCustomerButton } from "./new-retail-customer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Retail customers" };

/**
 * Customers FirsThing sells items to directly (2026-09-25) — a society or
 * not. Back office only; no portal access. Most arrive from an invoice's own
 * bill-to on the intake review; this page lists them with their invoices.
 */
export default async function RetailCustomersPage() {
  const gate = await requireBillingOps();
  if (!gate.ok) redirect("/admin/billing");
  const [customers, societies] = await Promise.all([
    db.retailCustomer.findMany({
      orderBy: { name: "asc" },
      include: {
        society: { select: { name: true } },
        invoices: { where: { voidedAt: null }, select: { total: true, advanceAmount: true, payments: { select: { amount: true } } } },
      },
    }),
    db.society.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

  return (
    <>
      <PageHeader
        title="Retail customers"
        subtitle="Customers billed for items sold directly — a society or not. Not a savings month, no portal access."
        action={<NewRetailCustomerButton societies={societies} />}
      />
      {customers.length === 0 ? (
        <EmptyState title="No retail customers yet">
          Mark an invoice as a retail sale on the intake review and create the customer from its bill-to — or add one here.
        </EmptyState>
      ) : (
        <>
          {/* Desktop/tablet table. Below sm, a stacked card per customer
              (2026-10-07, user-caught — GSTIN/Society/the three figures ran
              off a phone's right edge): the name leads, GSTIN and society sit
              together as a muted line, and the three figures close the card
              on one row where "still owed" keeps its warn colour when it
              matters. */}
          <Card className="hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>GSTIN</th>
                    <th>Society</th>
                    <th className="text-right">Invoices</th>
                    <th className="text-right">Billed</th>
                    <th className="text-right">Still owed</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const billed = c.invoices.reduce((n, i) => n + i.total, 0);
                    const unpaid = c.invoices.reduce((n, i) => n + Math.max(0, i.total - retailInvoicePaidTotal(i, i.payments)), 0);
                    return (
                      <tr key={c.id}>
                        <td>
                          <Link href={`/admin/retail-customers/${c.id}`} className="font-semibold">
                            {c.name}
                          </Link>
                        </td>
                        <td className="num">{c.gstin ?? "—"}</td>
                        <td>{c.society?.name ?? "—"}</td>
                        <td className="num text-right">{c.invoices.length}</td>
                        <td className="num text-right">{rupees(billed)}</td>
                        <td className="num text-right" style={unpaid > 0 ? { color: "var(--warn-fg)" } : undefined}>
                          {unpaid > 0 ? rupees(unpaid) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-col gap-2.5 sm:hidden">
            {customers.map((c) => {
              const billed = c.invoices.reduce((n, i) => n + i.total, 0);
              const unpaid = c.invoices.reduce((n, i) => n + Math.max(0, i.total - retailInvoicePaidTotal(i, i.payments)), 0);
              return (
                <Card key={c.id} className="p-3.5">
                  <Link href={`/admin/retail-customers/${c.id}`} className="font-semibold">
                    {c.name}
                  </Link>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {c.gstin ?? "No GSTIN"} · {c.society?.name ?? "No society"}
                  </p>
                  <p className="mt-1.5 text-[12.5px]">
                    <span className="num font-medium">{c.invoices.length}</span> invoice{c.invoices.length === 1 ? "" : "s"} ·{" "}
                    <span className="num font-medium">{rupees(billed)}</span> billed
                    {unpaid > 0 && (
                      <>
                        {" · "}
                        <span className="num font-medium" style={{ color: "var(--warn-fg)" }}>
                          {rupees(unpaid)}
                        </span>{" "}
                        owed
                      </>
                    )}
                  </p>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
