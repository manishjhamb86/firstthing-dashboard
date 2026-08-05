import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import InspectionReportsClient from "./inspection-reports-client";

export default async function AdminInspectionReportsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const [societies, uploadedReports, inspectionHistory] = await Promise.all([
    db.society.findMany({ orderBy: { name: "asc" } }),
    db.inspectionReport.findMany({
      orderBy: { reportDate: "desc" },
      include: { society: true },
    }),
    db.inspectionForm.findMany({
      orderBy: { inspectionDate: "desc" },
      include: { society: true },
    }),
  ]);

  return (
    <InspectionReportsClient
      societies={societies.map((s) => ({ id: s.id, name: s.name }))}
      uploadedReports={uploadedReports.map((report) => ({
        id: report.id.toString(),
        societyId: report.societyId,
        societyName: report.society.name,
        reportType: report.reportType ?? "",
        reportDate: report.reportDate ? report.reportDate.toISOString().slice(0, 10) : "",
        pdfUrl: report.pdfUrl ?? "",
      }))}
      inspectionHistory={inspectionHistory.map((item) => ({
        id: item.id.toString(),
        area: item.area,
        inspectionDate: item.inspectionDate.toISOString().slice(0, 10),
        inspectorName: item.inspectorName,
        totalLightsChecked: item.totalLightsChecked,
        faultyLights: item.faultyLights,
        societyName: item.society.name,
      }))}
    />
  );
}
