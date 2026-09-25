import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { requireBillingOps } from "../billing/access";
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
        invoices: { where: { voidedAt: null }, select: { total: true, paid: true, advanceAmount: true } },
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
        <Card className="overflow-hidden">
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
                  const unpaid = c.invoices.filter((i) => !i.paid).reduce((n, i) => n + i.total - (i.advanceAmount ?? 0), 0);
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
      )}
    </>
  );
}
