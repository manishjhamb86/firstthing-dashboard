import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import EmptyState from "@/components/shell/EmptyState";
import { formatMonthLabel } from "@/lib/format-month";

export default async function InvoicesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const invoices = session.user.societyId
    ? await db.invoice.findMany({
        where: { societyId: session.user.societyId },
        orderBy: { id: "desc" },
      })
    : [];

  return (
    <div>

      <div className="flex justify-between items-center mb-8">

        <div>
          <h1 className="text-2xl font-bold text-ink">
            Invoices
          </h1>

          <p className="text-m2 mt-2">
            Monthly billing & savings invoices
          </p>
        </div>

      </div>

      <div className="space-y-6">

        {!session.user.societyId && (
          <EmptyState
            title="No society linked"
            description="Your account isn't linked to a society yet. Contact your admin."
          />
        )}

        {session.user.societyId && invoices.length === 0 && (
          <EmptyState
            title="No invoices yet"
            description="No invoices are available for your society yet."
          />
        )}

        {invoices.map((invoice) => (

          <div
            key={invoice.id.toString()}
            className="bg-card rounded-2xl p-6 border border-border flex justify-between items-center"
          >

            <div>

              <h2 className="text-2xl font-bold text-ink">
                {invoice.invoiceNumber}
              </h2>

              <p className="text-m2 mt-2">
                {formatMonthLabel(invoice.invoiceMonth)}
              </p>

              <p className="text-m2 mt-1">
                Due Date: {invoice.dueDate ? invoice.dueDate.toLocaleDateString() : "-"}
              </p>

            </div>

            <div className="text-right">

              <p className="text-3xl font-bold text-ac">
                ₹ {(invoice.totalAmount?.toNumber() ?? 0).toLocaleString()}
              </p>

              <div
                className="mt-3 inline-block px-4 py-2 rounded-xl text-sm font-medium"
                style={{
                  background: invoice.status === "Paid" ? "var(--okb)" : "var(--wb)",
                  color: invoice.status === "Paid" ? "var(--okf)" : "var(--wf)",
                }}
              >
                {invoice.status}
              </div>

              {invoice.pdfUrl && (
                <div>
                  <a
                    href={invoice.pdfUrl}
                    target="_blank"
                    className="inline-block mt-4 bg-ac text-onac px-5 py-2 rounded-xl"
                  >
                    Download Invoice
                  </a>
                </div>
              )}

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}
