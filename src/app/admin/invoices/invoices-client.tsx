"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import FileUploader from "@/components/admin/FileUploader";
import StatusChip, { type StatusTone } from "@/components/shell/StatusChip";
import { deleteInvoice, saveInvoice } from "./actions";
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
  dueDate: string;
  status: InvoiceStatus;
  pdfUrl: string;
};

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

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

  const [societyId, setSocietyId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<InvoiceStatus>("Issued");
  const [pdfUrl, setPdfUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totalAmount = String(Number(amount || 0) + Number(gst || 0));

  function resetForm() {
    setEditingId(null);
    setSocietyId("");
    setInvoiceNumber("");
    setInvoiceMonth("");
    setAmount("");
    setGst("");
    setDueDate("");
    setStatus("Issued");
    setPdfUrl("");
  }

  async function handleSave() {
    if (!societyId) {
      alert("Please select a society");
      return;
    }

    if (!pdfUrl) {
      alert("Please upload PDF first");
      return;
    }

    setSaving(true);

    try {
      const result = await saveInvoice({
        editingId: editingId ? Number(editingId) : null,
        societyId: Number(societyId),
        invoiceNumber,
        invoiceMonth,
        amount: Number(amount),
        gst: Number(gst),
        dueDate,
        status,
        pdfUrl,
      });

      if (!result.success) {
        alert(result.error || "Unable to save invoice");
        return;
      }

      alert(editingId ? "Invoice updated." : "Invoice saved and is now available to the customer.");
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  function editInvoice(invoice: AdminInvoice) {
    setEditingId(invoice.id);
    setSocietyId(String(invoice.societyId));
    setInvoiceNumber(invoice.invoiceNumber || "");
    setInvoiceMonth(invoice.invoiceMonth || "");
    setAmount(String(invoice.amount ?? ""));
    setGst(String(invoice.gst ?? ""));
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
        <select className={inputClass} value={societyId} onChange={(e) => setSocietyId(e.target.value)}>
          <option value="">Select Society</option>
          {societies.map((society) => (
            <option key={society.id} value={society.id}>
              {society.name}
            </option>
          ))}
        </select>

        <input
          placeholder="Invoice Number"
          className={inputClass}
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
        />

        <input
          placeholder="Invoice Month (Example: June 2026)"
          className={inputClass}
          value={invoiceMonth}
          onChange={(e) => setInvoiceMonth(e.target.value)}
        />

        <input type="number" placeholder="Amount" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />

        <input type="number" placeholder="GST" className={inputClass} value={gst} onChange={(e) => setGst(e.target.value)} />

        <input placeholder="Total Amount" className={`${inputClass} bg-card-2`} value={totalAmount} readOnly />

        <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as InvoiceStatus)}>
          <option value="Issued">Issued</option>
          <option value="Paid">Paid</option>
        </select>

        <FileUploader folder="invoices" onUploadComplete={(url) => setPdfUrl(url)} />

        {pdfUrl && (
          <div className="text-xs font-semibold" style={{ color: "var(--okf)" }}>
            ✓ PDF uploaded. Click Save Invoice to make it available to the customer.
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
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
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-3.5 text-sm font-bold text-ink">Existing Invoices</div>

        <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_1fr_.8fr] gap-2 bg-card-2 px-5 py-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-m2 sm:grid">
          <div>Society</div>
          <div>Invoice</div>
          <div>Month</div>
          <div>Total</div>
          <div>Status</div>
          <div />
        </div>

        {invoices.length === 0 && <div className="p-6 text-center text-xs text-m2">No invoices found</div>}

        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="grid grid-cols-2 gap-2 border-t border-border px-5 py-3.5 sm:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_.8fr] sm:items-center"
          >
            <div className="col-span-2 text-xs font-semibold text-ink sm:col-span-1">{invoice.societyName}</div>
            <div className="text-xs text-m1">{invoice.invoiceNumber}</div>
            <div className="text-xs text-m1">{invoice.invoiceMonth}</div>
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
