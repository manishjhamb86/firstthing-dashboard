import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import EmptyState from "@/components/shell/EmptyState";

export default async function CustomerHomePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const societyId = session.user.societyId;

  if (!societyId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-ink mb-8">
          Dashboard
        </h1>

        <EmptyState
          title="No society linked"
          description="Your account isn't linked to a society yet. Contact your admin."
        />
      </div>
    );
  }

  const [society, invoiceCount, unpaidInvoiceCount, reportCount, tankCount] = await Promise.all([
    db.society.findUnique({ where: { id: societyId } }),
    db.invoice.count({ where: { societyId } }),
    db.invoice.count({ where: { societyId, NOT: { status: "Paid" } } }),
    db.savingsReport.count({ where: { societyId } }),
    db.tankConfiguration.count({ where: { societyId } }),
  ]);

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-2xl font-bold text-ink">
          Welcome, {society?.name ?? "your society"}
        </h1>

        <p className="text-m2 mt-2">
          {society?.city ?? ""}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <Link
          href="/invoices"
          className="bg-card rounded-2xl p-6 border border-border hover:shadow-md transition block"
        >
          <div className="text-m2 text-sm">
            Invoices
          </div>

          <div className="text-3xl font-bold text-ink mt-2">
            {invoiceCount}
          </div>

          {unpaidInvoiceCount > 0 && (
            <div className="text-sm mt-1" style={{ color: "var(--wf)" }}>
              {unpaidInvoiceCount} unpaid
            </div>
          )}
        </Link>

        <Link
          href="/reports"
          className="bg-card rounded-2xl p-6 border border-border hover:shadow-md transition block"
        >
          <div className="text-m2 text-sm">
            Savings Reports
          </div>

          <div className="text-3xl font-bold text-ink mt-2">
            {reportCount}
          </div>
        </Link>

        <Link
          href="/water-tanks"
          className="bg-card rounded-2xl p-6 border border-border hover:shadow-md transition block"
        >
          <div className="text-m2 text-sm">
            Water Tanks
          </div>

          <div className="text-3xl font-bold text-ink mt-2">
            {tankCount}
          </div>
        </Link>

        <Link
          href="/profile"
          className="bg-card rounded-2xl p-6 border border-border hover:shadow-md transition block"
        >
          <div className="text-m2 text-sm">
            Savings Percentage
          </div>

          <div className="text-3xl font-bold text-ac mt-2">
            {society ? society.savingsPercentage.toNumber() : 0}%
          </div>
        </Link>

      </div>

    </div>
  );
}
