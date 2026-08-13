"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, PlusCircle } from "lucide-react";
import {
  checkPossibleDuplicateInvoice,
  extractInvoiceFields,
  saveInvoice,
} from "@/app/admin/invoices/actions";
import { createSocietyQuick } from "@/app/admin/societies/actions";
import { uploadFileToS3 } from "@/lib/upload-to-s3";
import FileDropzone from "@/components/shell/FileDropzone";
import type { InvoiceStatus } from "@prisma/client";

type Society = { id: number; name: string };

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

export default function InvoiceUploadPanel({ societies }: { societies: Society[] }) {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractionNote, setExtractionNote] = useState("");
  const [extractedSocietyName, setExtractedSocietyName] = useState("");
  const [creatingSociety, setCreatingSociety] = useState(false);
  const [localSocieties, setLocalSocieties] = useState(societies);

  const [societyId, setSocietyId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const societyName = localSocieties.find((s) => s.id === Number(societyId))?.name ?? "";
  const showFields = !!file && !extracting;

  function resetForm() {
    setFile(null);
    setExtractionNote("");
    setExtractedSocietyName("");
    setSocietyId("");
    setInvoiceNumber("");
    setInvoiceMonth("");
    setAmount("");
    setGst("");
    setIssueDate("");
    setDueDate("");
  }

  async function handleFileSelect(selected: File) {
    const filenamePrefix = selected.name.slice(0, 15);
    const dupCheck = await checkPossibleDuplicateInvoice(filenamePrefix);
    if (dupCheck.duplicate) {
      const reupload = confirm(
        `This looks like it may already be uploaded — it matches invoice "${dupCheck.invoiceNumber}" for ${dupCheck.societyName}. Re-upload anyway?`
      );
      if (!reupload) {
        return;
      }
    }

    setFile(selected);
    setExtracting(true);
    setExtractionNote("");
    setExtractedSocietyName("");

    try {
      const result = await extractInvoiceFields(selected);
      if (!result.success) {
        setExtractionNote(result.error);
        return;
      }

      const data = result.data;
      const match = data.matchedSocietyName ? localSocieties.find((s) => s.name === data.matchedSocietyName) : undefined;

      if (match) setSocietyId(String(match.id));
      else if (data.billedToName) setExtractedSocietyName(data.billedToName);
      if (data.invoiceNumber) setInvoiceNumber(data.invoiceNumber);
      if (data.invoiceMonth) setInvoiceMonth(data.invoiceMonth);
      if (data.amount) setAmount(String(data.amount));
      if (data.gst) setGst(String(data.gst));
      if (data.issueDate) setIssueDate(data.issueDate);
      if (data.dueDate) setDueDate(data.dueDate);

      setExtractionNote(
        match
          ? "Read successfully — review the fields below before saving."
          : "Read the invoice, but couldn't match it to an existing society — create it below, or select one manually."
      );
    } catch (err) {
      console.error(err);
      setExtractionNote("Could not read the invoice automatically. Please fill in the fields manually.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleCreateSociety() {
    if (!extractedSocietyName) return;
    setCreatingSociety(true);
    try {
      const result = await createSocietyQuick(extractedSocietyName);
      if (!result.success) {
        alert(result.error);
        return;
      }
      setLocalSocieties((prev) => (prev.some((s) => s.id === result.societyId) ? prev : [...prev, { id: result.societyId, name: result.name }]));
      setSocietyId(String(result.societyId));
      setExtractedSocietyName("");
    } finally {
      setCreatingSociety(false);
    }
  }

  async function handleSave() {
    if (!societyId) {
      alert("Please select a society");
      return;
    }
    if (!file) {
      alert("Please upload the invoice PDF");
      return;
    }

    setSaving(true);
    try {
      const pdfUrl = await uploadFileToS3(file, {
        society: societyName,
        month: invoiceMonth,
        docType: "invoice",
        dateLabel: issueDate || invoiceMonth,
        identifier: invoiceNumber,
      });

      const result = await saveInvoice({
        editingId: null,
        societyId: Number(societyId),
        invoiceNumber,
        invoiceMonth,
        amount: Number(amount),
        gst: Number(gst),
        issueDate,
        dueDate,
        status: "Issued" as InvoiceStatus,
        pdfUrl,
      });

      if (!result.success) {
        alert(result.error || "Unable to save invoice");
        return;
      }

      alert("Invoice saved and is now available to the customer.");
      resetForm();
      router.push("/admin/documents");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Unable to save invoice");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ac font-mono text-[9px] text-onac">1</span>
          Upload Invoice PDF
        </div>
        <FileDropzone
          file={file}
          onFileSelect={handleFileSelect}
          toneColor="var(--if)"
          hint="PDF invoice, up to 10MB"
          statusText={extracting ? "Reading invoice with AI…" : "Click to choose a different file"}
        />
        {extracting && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-m1">
            <Sparkles size={12} className="animate-pulse" style={{ color: "var(--if)" }} />
            Reading invoice with AI…
          </p>
        )}
        {!extracting && extractionNote && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--okf)" }}>
            <Sparkles size={12} />
            {extractionNote}
          </p>
        )}
      </div>

      {showFields && (
        <div className="space-y-3.5 rounded-[12px] border border-border bg-card-2 p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ac font-mono text-[9px] text-onac">2</span>
            Confirm the details
          </div>

          {extractedSocietyName && (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] px-3.5 py-2.5"
              style={{ background: "var(--ib)" }}
            >
              <div className="text-xs" style={{ color: "var(--if)" }}>
                AI found <span className="font-semibold">&quot;{extractedSocietyName}&quot;</span> but no matching society
                exists yet.
              </div>
              <button
                onClick={handleCreateSociety}
                disabled={creatingSociety}
                className="flex items-center gap-1.5 rounded-[8px] bg-ac px-3 py-1.5 text-xs font-bold text-onac disabled:opacity-60"
              >
                <PlusCircle size={13} />
                {creatingSociety ? "Creating..." : `Create "${extractedSocietyName}"`}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink">Society</label>
              <select
                className={inputClass}
                value={societyId}
                onChange={(e) => {
                  setSocietyId(e.target.value);
                  setExtractedSocietyName("");
                }}
              >
                <option value="">Select Society</option>
                {localSocieties.map((society) => (
                  <option key={society.id} value={society.id}>
                    {society.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Invoice Number</label>
              <input className={inputClass} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Invoice Month</label>
              <input type="month" className={inputClass} value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Amount (before GST)</label>
              <input type="number" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">GST</label>
              <input type="number" className={inputClass} value={gst} onChange={(e) => setGst(e.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Issue Date</label>
              <input type="date" className={inputClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Due Date</label>
              <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || extracting}
            className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac disabled:opacity-60"
          >
            {saving ? "Saving Invoice..." : "Save Invoice"}
          </button>
        </div>
      )}
    </div>
  );
}
