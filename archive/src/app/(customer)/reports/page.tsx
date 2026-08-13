import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import EmptyState from "@/components/shell/EmptyState";
import { formatMonthLabel } from "@/lib/format-month";

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const reports = session.user.societyId
    ? await db.savingsReport.findMany({
        where: { societyId: session.user.societyId },
        orderBy: { id: "desc" },
      })
    : [];

  return (
    <div>

      <h1 className="text-2xl font-bold text-ink mb-8">
        Savings Reports
      </h1>

      {!session.user.societyId && (
        <EmptyState
          title="No society linked"
          description="Your account isn't linked to a society yet. Contact your admin."
        />
      )}

      {session.user.societyId && reports.length === 0 && (
        <EmptyState
          title="No reports available"
          description="No savings reports are available for your society yet."
        />
      )}

      <div className="space-y-6">

        {reports.map((report) => (

          <div
            key={report.id.toString()}
            className="bg-card rounded-2xl p-6 border border-border flex justify-between items-center"
          >

            <div>
              <h2 className="text-2xl font-bold text-ink">
                {formatMonthLabel(report.reportMonth)}
              </h2>

              <p className="text-m2 mt-2">
                Monthly Energy Savings Report
              </p>
            </div>

            {report.pdfUrl && (
              <a
                href={report.pdfUrl}
                target="_blank"
                className="bg-ac text-onac px-5 py-3 rounded-xl"
              >
                Download Report
              </a>
            )}

          </div>

        ))}

      </div>

    </div>
  );
}
