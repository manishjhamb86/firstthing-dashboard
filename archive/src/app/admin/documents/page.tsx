import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMonthLabel } from "@/lib/format-month";
import DocumentsListClient, { type DocumentRow } from "./documents-list-client";

export default async function AdminDocumentsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") redirect("/login");

  const [invoices, reports, inspectionReports, societies] = await Promise.all([
    db.invoice.findMany({ orderBy: { createdAt: "desc" } }),
    db.savingsReport.findMany({ orderBy: { createdAt: "desc" } }),
    db.inspectionReport.findMany({ orderBy: { createdAt: "desc" }, include: { society: true } }),
    db.society.findMany({ orderBy: { name: "asc" } }),
  ]);

  const documents: DocumentRow[] = [
    ...invoices
      .filter((inv) => inv.pdfUrl)
      .map((inv) => ({
        id: `invoice-${inv.id}`,
        docType: "invoice" as const,
        title: inv.invoiceNumber,
        societyId: inv.societyId,
        societyName: inv.societyName ?? "",
        month: inv.invoiceMonth ? formatMonthLabel(inv.invoiceMonth) : "",
        date: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : "",
        pdfUrl: inv.pdfUrl ?? "",
        createdAt: inv.createdAt.toISOString(),
      })),
    ...reports
      .filter((r) => r.pdfUrl)
      .map((r) => {
        const society = societies.find((s) => s.id === r.societyId);
        return {
          id: `savingsReport-${r.id}`,
          docType: "savingsReport" as const,
          title: r.reportMonth ? `Savings Report — ${formatMonthLabel(r.reportMonth)}` : "Savings Report",
          societyId: r.societyId,
          societyName: society?.name ?? "",
          month: r.reportMonth ? formatMonthLabel(r.reportMonth) : "",
          date: "",
          pdfUrl: r.pdfUrl ?? "",
          createdAt: r.createdAt.toISOString(),
        };
      }),
    ...inspectionReports
      .filter((r) => r.pdfUrl)
      .map((r) => ({
        id: `inspectionReport-${r.id}`,
        docType: "inspectionReport" as const,
        title: r.reportType ?? "Inspection Report",
        societyId: r.societyId,
        societyName: r.society.name,
        month: r.reportDate ? r.reportDate.toISOString().slice(0, 7) : "",
        date: r.reportDate ? r.reportDate.toISOString().slice(0, 10) : "",
        pdfUrl: r.pdfUrl ?? "",
        createdAt: r.createdAt.toISOString(),
      })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <DocumentsListClient
      documents={documents}
      societies={societies.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
