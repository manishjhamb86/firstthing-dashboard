"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUploader from "@/components/admin/FileUploader";
import { deleteReport, saveReport } from "./actions";
import { formatMonthLabel } from "@/lib/format-month";

type Society = { id: number; name: string };

type SavingsReport = {
  id: string;
  societyId: number;
  societyName: string;
  reportMonth: string;
  pdfUrl: string;
};

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

export default function ReportsClient({
  societies,
  reports,
}: {
  societies: Society[];
  reports: SavingsReport[];
}) {
  const router = useRouter();

  const [societyId, setSocietyId] = useState("");
  const societyName = societies.find((s) => s.id === Number(societyId))?.name ?? "";
  const [reportMonth, setReportMonth] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function cancelEdit() {
    setEditingId(null);
    setSocietyId("");
    setReportMonth("");
    setPdfUrl("");
  }

  async function handleSave() {
    if (!societyId || !reportMonth) {
      alert("Please select a society and enter the report month");
      return;
    }

    if (!pdfUrl) {
      alert("Please upload PDF first");
      return;
    }

    const result = await saveReport({
      editingId: editingId ? Number(editingId) : null,
      societyId: Number(societyId),
      reportMonth,
      pdfUrl,
    });

    if (!result.success) {
      alert("Unable to save report");
      return;
    }

    alert(editingId ? "Report updated" : "Report saved");
    cancelEdit();
    router.refresh();
  }

  function editReport(report: SavingsReport) {
    setEditingId(report.id);
    setSocietyId(String(report.societyId));
    setReportMonth(report.reportMonth || "");
    setPdfUrl(report.pdfUrl || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    const confirmDelete = confirm("Are you sure you want to delete this report?");
    if (!confirmDelete) return;

    await deleteReport(Number(id));
    if (editingId === id) cancelEdit();
    router.refresh();
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-3.5">
        <select className={inputClass} value={societyId} onChange={(e) => setSocietyId(e.target.value)}>
          <option value="">Select Society</option>
          {societies.map((society) => (
            <option key={society.id} value={society.id}>
              {society.name}
            </option>
          ))}
        </select>

        <input
          type="month"
          aria-label="Report Month"
          className={inputClass}
          value={reportMonth}
          onChange={(e) => setReportMonth(e.target.value)}
        />

        <FileUploader
          society={societyName}
          month={reportMonth}
          docType="savingsReport"
          dateLabel={reportMonth}
          onUploadComplete={(url) => setPdfUrl(url)}
        />

        {pdfUrl && (
          <div className="text-xs font-semibold" style={{ color: "var(--okf)" }}>
            ✓ PDF uploaded successfully
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleSave} className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac">
            {editingId ? "Update Report" : "Save Report"}
          </button>

          {editingId && (
            <button onClick={cancelEdit} className="rounded-[9px] border border-border px-4 py-2.5 text-sm font-semibold text-m1">
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3.5 text-sm font-bold text-ink">Existing Reports</div>

        <div className="hidden grid-cols-[2fr_1fr_1fr] gap-2 bg-card-2 px-5 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-m2 sm:grid">
          <div>Society</div>
          <div>Month</div>
          <div />
        </div>

        {reports.length === 0 && <div className="p-6 text-center text-xs text-m2">No reports found</div>}

        {reports.map((report) => (
          <div
            key={report.id}
            className="grid grid-cols-1 gap-2 border-t border-border px-5 py-3.5 sm:grid-cols-[2fr_1fr_1fr] sm:items-center"
          >
            <div className="text-xs font-semibold text-ink">{report.societyName}</div>
            <div className="text-xs text-m1">{formatMonthLabel(report.reportMonth)}</div>
            <div className="flex items-center gap-4 sm:justify-end">
              <a href={report.pdfUrl} target="_blank" className="text-xs font-semibold text-ac">
                View
              </a>
              <button onClick={() => editReport(report)} className="text-xs font-semibold text-ac">
                Edit
              </button>
              <button onClick={() => handleDelete(report.id)} className="text-xs font-semibold" style={{ color: "var(--bf)" }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
