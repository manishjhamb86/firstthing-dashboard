import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ReportsClient from "./reports-client";

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const [societies, reports] = await Promise.all([
    db.society.findMany({ orderBy: { name: "asc" } }),
    db.savingsReport.findMany({
      orderBy: { id: "desc" },
      include: { society: true },
    }),
  ]);

  return (
    <ReportsClient
      societies={societies.map((s) => ({ id: s.id, name: s.name }))}
      reports={reports.map((report) => ({
        id: report.id.toString(),
        societyId: report.societyId,
        societyName: report.society.name,
        reportMonth: report.reportMonth ?? "",
        pdfUrl: report.pdfUrl ?? "",
      }))}
    />
  );
}
