"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import FileUploader from "@/components/admin/FileUploader";
import StatusChip from "@/components/shell/StatusChip";
import { deleteFieldInspection, deleteInspectionReport, saveInspectionReport } from "./actions";

type Society = { id: number; name: string };

type UploadedInspectionReport = {
  id: string;
  societyId: number;
  societyName: string;
  reportType: string;
  reportDate: string;
  pdfUrl: string;
};

type InspectionHistoryItem = {
  id: string;
  area: string;
  inspectionDate: string;
  inspectorName: string;
  totalLightsChecked: number;
  faultyLights: number;
  societyName: string;
};

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

export default function InspectionReportsClient({
  societies,
  uploadedReports,
  inspectionHistory,
}: {
  societies: Society[];
  uploadedReports: UploadedInspectionReport[];
  inspectionHistory: InspectionHistoryItem[];
}) {
  const router = useRouter();

  const [societyId, setSocietyId] = useState("");
  const societyName = societies.find((s) => s.id === Number(societyId))?.name ?? "";
  const [reportType, setReportType] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function cancelEdit() {
    setEditingId(null);
    setSocietyId("");
    setReportType("");
    setReportDate("");
    setPdfUrl("");
  }

  async function saveInspection() {
    if (!societyId || !reportType || !reportDate) {
      alert("Please complete the society, report type, and report date fields");
      return;
    }

    if (!pdfUrl) {
      alert("Please upload PDF first");
      return;
    }

    const result = await saveInspectionReport({
      editingId: editingId ? Number(editingId) : null,
      societyId: Number(societyId),
      reportType,
      reportDate,
      pdfUrl,
    });

    if (!result.success) {
      alert("Unable to save inspection report");
      return;
    }

    alert(editingId ? "Inspection report updated" : "Inspection report saved");
    cancelEdit();
    router.refresh();
  }

  function editUploadedReport(report: UploadedInspectionReport) {
    setEditingId(report.id);
    setSocietyId(String(report.societyId));
    setReportType(report.reportType || "");
    setReportDate(report.reportDate || "");
    setPdfUrl(report.pdfUrl || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDeleteUploadedReport(id: string) {
    if (!confirm("Are you sure you want to delete this inspection report?")) return;

    await deleteInspectionReport(Number(id));
    if (editingId === id) cancelEdit();
    router.refresh();
  }

  async function handleDeleteFieldInspection(id: string) {
    if (!confirm("Are you sure you want to delete this field inspection and its checklist items?")) return;

    await deleteFieldInspection(Number(id));
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
          placeholder="Pump Inspection"
          className={inputClass}
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
        />

        <input type="date" className={inputClass} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />

        <FileUploader
          society={societyName}
          month={reportDate.slice(0, 7)}
          docType="inspectionReport"
          dateLabel={reportDate}
          onUploadComplete={(url) => setPdfUrl(url)}
        />

        <div className="flex gap-3">
          <button onClick={saveInspection} className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac">
            {editingId ? "Update Inspection Report" : "Save Inspection Report"}
          </button>

          {editingId && (
            <button onClick={cancelEdit} className="rounded-[9px] border border-border px-4 py-2.5 text-sm font-semibold text-m1">
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3.5 text-sm font-bold text-ink">Uploaded Inspection Reports</div>

        <div className="hidden grid-cols-[2fr_1.2fr_1fr_1fr] gap-2 bg-card-2 px-5 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-m2 sm:grid">
          <div>Society</div>
          <div>Report Type</div>
          <div>Date</div>
          <div />
        </div>

        {uploadedReports.length === 0 && (
          <div className="p-6 text-center text-xs text-m2">No uploaded inspection reports found</div>
        )}

        {uploadedReports.map((report) => (
          <div
            key={report.id}
            className="grid grid-cols-1 gap-2 border-t border-border px-5 py-3.5 sm:grid-cols-[2fr_1.2fr_1fr_1fr] sm:items-center"
          >
            <div className="text-xs font-semibold text-ink">{report.societyName || "-"}</div>
            <div className="text-xs text-m1">{report.reportType}</div>
            <div className="text-xs text-m1">{new Date(`${report.reportDate}T00:00:00`).toLocaleDateString()}</div>
            <div className="flex items-center gap-4 sm:justify-end">
              <a href={report.pdfUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ac">
                View
              </a>
              <button onClick={() => editUploadedReport(report)} className="text-xs font-semibold text-ac">
                Edit
              </button>
              <button
                onClick={() => handleDeleteUploadedReport(report.id)}
                className="text-xs font-semibold"
                style={{ color: "var(--bf)" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3.5 text-sm font-bold text-ink">Field Inspection History</div>

        {inspectionHistory.length === 0 ? (
          <div className="p-6 text-center text-xs text-m2">No field inspections found</div>
        ) : (
          <>
            <div className="hidden grid-cols-[1fr_1fr_1fr_1.2fr_1fr_1fr] gap-2 bg-card-2 px-5 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-m2 sm:grid">
              <div>Date</div>
              <div>Inspector</div>
              <div>Area</div>
              <div>Society</div>
              <div>Faulty / Total</div>
              <div />
            </div>

            {inspectionHistory.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-2 gap-2 border-t border-border px-5 py-3.5 sm:grid-cols-[1fr_1fr_1fr_1.2fr_1fr_1fr] sm:items-center"
              >
                <div className="text-xs text-m1">
                  {new Date(`${item.inspectionDate}T00:00:00`).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </div>
                <div className="text-xs font-semibold text-ink">{item.inspectorName}</div>
                <div className="text-xs text-m1">{item.area}</div>
                <div className="text-xs text-m1">{item.societyName || "-"}</div>
                <div>
                  <StatusChip tone={item.faultyLights > 0 ? "critical" : "good"}>
                    {item.faultyLights} / {item.totalLightsChecked}
                  </StatusChip>
                </div>
                <div className="col-span-2 flex items-center gap-4 sm:col-span-1 sm:justify-end">
                  <Link href={`/inspection-reports/${item.id}`} className="flex items-center gap-1 text-xs font-semibold text-ac">
                    <Eye size={14} />
                    View
                  </Link>
                  <button
                    onClick={() => handleDeleteFieldInspection(item.id)}
                    className="text-xs font-semibold"
                    style={{ color: "var(--bf)" }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
