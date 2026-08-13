"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import StatusChip, { type StatusTone } from "@/components/shell/StatusChip";
import { checkPossibleDuplicateInvoice, deleteInvoice, extractInvoiceFields, saveInvoice } from "./actions";
import { createSocietyQuick } from "../societies/actions";
import { formatMonthLabel } from "@/lib/format-month";
import { uploadFileToS3 } from "@/lib/upload-to-s3";
import type { InvoiceStatus } from "@prisma/client";

type Society = { id: number; name: string };

type AdminInvoice = {
  id: string;
  societyId: number;
  societyName: string;
  invoiceNumber: string;
  invoiceMonth: string;
  amount: number;
  gst: number;
  totalAmount: number;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  pdfUrl: string;
};

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

function formatShortDate(value: string): string {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function statusTone(status: InvoiceStatus): StatusTone {
  if (status === "Paid") return "good";
  if (status === "Overdue") return "critical";
  if (status === "Due") return "info";
  if (status === "Disputed") return "warning";
  return "neutral"; // Issued
}

export default function InvoicesClient({
  societies,
  invoices,
}: {
  societies: Society[];
  invoices: AdminInvoice[];
}) {
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
  const [status, setStatus] = useState<InvoiceStatus>("Issued");
  const [pdfUrl, setPdfUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totalAmount = String(Number(amount || 0) + Number(gst || 0));
  const societyName = localSocieties.find((s) => s.id === Number(societyId))?.name ?? "";
  const showFields = !!editingId || (!!file && !extracting);

  function resetForm() {
    setEditingId(null);
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
    setStatus("Issued");
    setPdfUrl("");
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    const filenamePrefix = selected.name.slice(0, 15);
    const dupCheck = await checkPossibleDuplicateInvoice(filenamePrefix);

    if (dupCheck.duplicate) {
      const reupload = confirm(
        `This looks like it may already be uploaded — it matches invoice "${dupCheck.invoiceNumber}" for ${dupCheck.societyName}. Re-upload anyway?`
      );
      if (!reupload) {
        e.target.value = "";
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
      const match = data.matchedSocietyName
        ? localSocieties.find((s) => s.name === data.matchedSocietyName)
        : undefined;

      if (match) {
        setSocietyId(String(match.id));
      } else if (data.billedToName) {
        setExtractedSocietyName(data.billedToName);
      }
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

      setLocalSocieties((prev) =>
        prev.some((s) => s.id === result.societyId) ? prev : [...prev, { id: result.societyId, name: result.name }]
      );
      setSocietyId(String(result.societyId));
      setExtractedSocietyName("");
      router.refresh();
    } finally {
      setCreatingSociety(false);
    }
  }

  async function handleSave() {
    if (!societyId) {
      alert("Please select a society");
      return;
    }

    if (!file && !pdfUrl) {
      alert("Please upload the invoice PDF");
      return;
    }

    setSaving(true);

    try {
      let finalPdfUrl = pdfUrl;

      if (file) {
        finalPdfUrl = await uploadFileToS3(file, {
          society: societyName,
          month: invoiceMonth,
          docType: "invoice",
          dateLabel: issueDate || invoiceMonth,
          identifier: invoiceNumber,
        });
      }

      const result = await saveInvoice({
        editingId: editingId ? Number(editingId) : null,
        societyId: Number(societyId),
        invoiceNumber,
        invoiceMonth,
        amount: Number(amount),
        gst: Number(gst),
        issueDate,
        dueDate,
        status,
        pdfUrl: finalPdfUrl,
      });

      if (!result.success) {
        alert(result.error || "Unable to save invoice");
        return;
      }

      alert(editingId ? "Invoice updated." : "Invoice saved and is now available to the customer.");
      resetForm();
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Unable to save invoice");
    } finally {
      setSaving(false);
    }
  }

  function editInvoice(invoice: AdminInvoice) {
    setEditingId(invoice.id);
    setFile(null);
    setExtractionNote("");
    setExtractedSocietyName("");
    setSocietyId(String(invoice.societyId));
    setInvoiceNumber(invoice.invoiceNumber || "");
    setInvoiceMonth(invoice.invoiceMonth || "");
    setAmount(String(invoice.amount ?? ""));
    setGst(String(invoice.gst ?? ""));
    setIssueDate(invoice.issueDate || "");
    setDueDate(invoice.dueDate || "");
    setStatus(invoice.status || "Issued");
    setPdfUrl(invoice.pdfUrl || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this invoice?")) return;

    await deleteInvoice(Number(id));
    if (editingId === id) resetForm();
    router.refresh();
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-3.5">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">
            {editingId ? "Replace Invoice PDF (optional)" : "Upload Invoice PDF"}
          </label>
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="w-full cursor-pointer rounded-[10px] border border-border bg-card p-2.5 text-xs text-ink file:mr-3 file:cursor-pointer file:rounded-[8px] file:border-0 file:bg-ac file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-onac"
          />
          {extracting && <p className="mt-1.5 text-xs text-m2">Reading invoice with AI…</p>}
          {!extracting && extractionNote && (
            <p className="mt-1.5 text-xs font-semibold" style={{ color: "var(--okf)" }}>
              {extractionNote}
            </p>
          )}
          {!file && pdfUrl && (
            <p className="mt-1.5 text-xs text-m2">
              Current file:{" "}
              <a href={pdfUrl} target="_blank" rel="noreferrer" className="font-semibold text-ac">
                View
              </a>
            </p>
          )}
        </div>

        {showFields && (
          <>
            {extractedSocietyName && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-card-2 px-3.5 py-2.5">
                <div className="text-xs text-ink">
                  AI found <span className="font-semibold">&quot;{extractedSocietyName}&quot;</span> but no matching society
                  exists.
                </div>
                <button
                  onClick={handleCreateSociety}
                  disabled={creatingSociety}
                  className="rounded-[8px] bg-ac px-3 py-1.5 text-xs font-bold text-onac disabled:opacity-60"
                >
                  {creatingSociety ? "Creating..." : `Create Society "${extractedSocietyName}"`}
                </button>
              </div>
            )}

            <div>
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
              <input
                placeholder="Invoice Number"
                className={inputClass}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Invoice Month</label>
              <input
                type="month"
                className={inputClass}
                value={invoiceMonth}
                onChange={(e) => setInvoiceMonth(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Amount (before GST)</label>
              <input
                type="number"
                placeholder="Amount"
                className={inputClass}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">GST</label>
              <input type="number" placeholder="GST" className={inputClass} value={gst} onChange={(e) => setGst(e.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Total Amount</label>
              <input placeholder="Total Amount" className={`${inputClass} bg-card-2`} value={totalAmount} readOnly />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Issue Date</label>
              <input type="date" className={inputClass} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Due Date</label>
              <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Status</label>
              <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}>
                <option value="Issued">Issued</option>
                <option value="Paid">Paid</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving || extracting}
                className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac disabled:opacity-60"
              >
                {saving ? "Saving Invoice..." : editingId ? "Update Invoice" : "Save Invoice"}
              </button>

              {editingId && (
                <button onClick={resetForm} className="rounded-[9px] border border-border px-4 py-2.5 text-sm font-semibold text-m1">
                  Cancel Edit
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3.5 text-sm font-bold text-ink">Existing Invoices</div>

        <div className="hidden grid-cols-[1.3fr_.9fr_.8fr_.85fr_.85fr_.9fr_.8fr_.8fr] gap-2 bg-card-2 px-5 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-m2 sm:grid">
          <div>Society</div>
          <div>Invoice</div>
          <div>Month</div>
          <div>Issue Date</div>
          <div>Due Date</div>
          <div>Total</div>
          <div>Status</div>
          <div />
        </div>

        {invoices.length === 0 && <div className="p-6 text-center text-xs text-m2">No invoices found</div>}

        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="grid grid-cols-2 gap-2 border-t border-border px-5 py-3.5 sm:grid-cols-[1.3fr_.9fr_.8fr_.85fr_.85fr_.9fr_.8fr_.8fr] sm:items-center"
          >
            <div className="col-span-2 text-xs font-semibold text-ink sm:col-span-1">{invoice.societyName}</div>
            <div className="text-xs text-m1">{invoice.invoiceNumber}</div>
            <div className="text-xs text-m1">{formatMonthLabel(invoice.invoiceMonth)}</div>
            <div className="text-xs text-m1">{formatShortDate(invoice.issueDate)}</div>
            <div className="text-xs text-m1">{formatShortDate(invoice.dueDate)}</div>
            <div className="font-mono text-xs font-bold text-ac">₹ {invoice.totalAmount.toLocaleString()}</div>
            <div>
              <StatusChip tone={statusTone(invoice.status)}>{invoice.status.toUpperCase()}</StatusChip>
            </div>
            <div className="col-span-2 flex items-center gap-4 sm:col-span-1 sm:justify-end">
              <a href={invoice.pdfUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ac">
                View
              </a>
              <button onClick={() => editInvoice(invoice)} className="text-xs font-semibold text-ac">
                Edit
              </button>
              <button onClick={() => handleDelete(invoice.id)} className="text-xs font-semibold" style={{ color: "var(--bf)" }}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
