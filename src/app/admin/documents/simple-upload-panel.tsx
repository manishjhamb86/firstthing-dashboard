"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveReport } from "@/app/admin/reports/actions";
import { saveInspectionReport } from "@/app/admin/inspection-reports/actions";
import { uploadFileToS3 } from "@/lib/upload-to-s3";
import FileDropzone from "@/components/shell/FileDropzone";
import { TONE_VARS } from "@/components/shell/StatusChip";
import { DOC_TYPE_TONE } from "./doc-type-meta";

type Society = { id: number; name: string };
type DocType = "savingsReport" | "inspectionReport";

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

export default function SimpleUploadPanel({ docType, societies }: { docType: DocType; societies: Society[] }) {
  const router = useRouter();

  const [societyId, setSocietyId] = useState("");
  const [reportMonth, setReportMonth] = useState("");
  const [reportType, setReportType] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const societyName = societies.find((s) => s.id === Number(societyId))?.name ?? "";
  const month = docType === "savingsReport" ? reportMonth : reportDate.slice(0, 7);

  function resetForm() {
    setSocietyId("");
    setReportMonth("");
    setReportType("");
    setReportDate("");
    setFile(null);
  }

  async function handleSave() {
    if (!societyId) {
      alert("Please select a society");
      return;
    }
    if (!file) {
      alert("Please choose a file to upload");
      return;
    }
    if (docType === "savingsReport" && !reportMonth) {
      alert("Please select the report month");
      return;
    }
    if (docType === "inspectionReport" && (!reportType || !reportDate)) {
      alert("Please fill in the report type and date");
      return;
    }

    setSaving(true);
    try {
      const pdfUrl = await uploadFileToS3(file, {
        society: societyName,
        month,
        docType,
        dateLabel: docType === "inspectionReport" ? reportDate : reportMonth,
      });

      if (docType === "savingsReport") {
        await saveReport({ editingId: null, societyId: Number(societyId), reportMonth, pdfUrl });
      } else {
        await saveInspectionReport({ editingId: null, societyId: Number(societyId), reportType, reportDate, pdfUrl });
      }

      alert("Saved and is now available to the customer.");
      resetForm();
      router.push("/admin/documents");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Unable to save");
    } finally {
      setSaving(false);
    }
  }

  const tone = TONE_VARS[DOC_TYPE_TONE[docType]];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3.5 rounded-[12px] border border-border bg-card-2 p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold text-ink">Society</label>
          <select className={inputClass} value={societyId} onChange={(e) => setSocietyId(e.target.value)}>
            <option value="">Select Society</option>
            {societies.map((society) => (
              <option key={society.id} value={society.id}>
                {society.name}
              </option>
            ))}
          </select>
        </div>

        {docType === "savingsReport" && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-ink">Report Month</label>
            <input type="month" className={inputClass} value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          </div>
        )}

        {docType === "inspectionReport" && (
          <>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Report Type</label>
              <input
                placeholder="Pump Inspection"
                className={inputClass}
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Report Date</label>
              <input type="date" className={inputClass} value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
            </div>
          </>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-ink">Upload PDF</label>
        <FileDropzone file={file} onFileSelect={setFile} toneColor={tone.fg} hint="PDF document, up to 10MB" />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
