"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import FileUploader from "../../../components/admin/FileUploader";

type Society = {
  id: number;
  name: string;
};

type AdminInvoice = {
  id: number;
  society_id: number;
  society_name: string;
  invoice_number: string;
  invoice_month: string;
  amount: number;
  gst: number;
  total_amount: number;
  due_date: string;
  status: string;
  pdf_url: string;
};

export default function AdminInvoicesPage() {

  const [societies, setSocieties] = useState<Society[]>([]);
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);

  const [societyId, setSocietyId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("Pending");
  const [pdfUrl, setPdfUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    loadSocieties();
    loadInvoices();
  }, []);

  const totalAmount = String(Number(amount || 0) + Number(gst || 0));

  async function loadSocieties() {

    const { data } = await supabase
      .from("societies")
      .select("*")
      .order("name");

    if (data) {
      setSocieties(data);
    }
  }

  async function loadInvoices() {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      alert(`Unable to load invoices: ${error.message}`);
      return;
    }

    setInvoices((data || []) as AdminInvoice[]);
  }

  async function saveInvoice() {

    const selectedSociety = societies.find(
      (s) => s.id === Number(societyId)
    );

    if (!selectedSociety) {
      alert("Please select a society");
      return;
    }

    if (!pdfUrl) {
      alert("Please upload PDF first");
      return;
    }

    setSaving(true);

    try {
      const values = {
          society_id: Number(societyId),
          society_name: selectedSociety.name,
          invoice_number: invoiceNumber,
          invoice_month: invoiceMonth,
          amount: Number(amount),
          gst: Number(gst),
          total_amount: Number(totalAmount),
          due_date: dueDate,
          status,
          pdf_url: pdfUrl,
      };

      const query = editingId
        ? supabase.from("invoices").update(values).eq("id", editingId)
        : supabase.from("invoices").insert(values);

      const { error } = await query;

      if (error) {
        alert(`Unable to save invoice: ${error.message}`);
        return;
      }

      alert(editingId ? "Invoice updated." : "Invoice saved and is now available to the customer.");

      setEditingId(null);
      setSocietyId("");
      setInvoiceNumber("");
      setInvoiceMonth("");
      setAmount("");
      setGst("");
      setDueDate("");
      setStatus("Pending");
      setPdfUrl("");
      await loadInvoices();
    } finally {
      setSaving(false);
    }
  }

  function editInvoice(invoice: AdminInvoice) {
    setEditingId(invoice.id);
    setSocietyId(String(invoice.society_id));
    setInvoiceNumber(invoice.invoice_number || "");
    setInvoiceMonth(invoice.invoice_month || "");
    setAmount(String(invoice.amount ?? ""));
    setGst(String(invoice.gst ?? ""));
    setDueDate(invoice.due_date || "");
    setStatus(invoice.status || "Pending");
    setPdfUrl(invoice.pdf_url || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditingId(null);
    setSocietyId("");
    setInvoiceNumber("");
    setInvoiceMonth("");
    setAmount("");
    setGst("");
    setDueDate("");
    setStatus("Pending");
    setPdfUrl("");
  }

  async function deleteInvoice(id: number) {
    if (!confirm("Are you sure you want to delete this invoice?")) return;

    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) {
      alert(`Unable to delete invoice: ${error.message}`);
      return;
    }

    if (editingId === id) resetForm();
    await loadInvoices();
  }

  return (
    <div className="w-full max-w-4xl mx-auto">

      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">
        Invoice Management
      </h1>

      <div className="bg-white rounded-xl md:rounded-2xl p-4 md:p-8 shadow-sm space-y-4 md:space-y-5">

        <select
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={societyId}
          onChange={(e) => setSocietyId(e.target.value)}
        >
          <option value="">
            Select Society
          </option>

          {societies.map((society) => (
            <option
              key={society.id}
              value={society.id}
            >
              {society.name}
            </option>
          ))}
        </select>

        <input
          placeholder="Invoice Number"
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
        />

        <input
          placeholder="Invoice Month (Example: June 2026)"
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={invoiceMonth}
          onChange={(e) => setInvoiceMonth(e.target.value)}
        />

        <input
          type="number"
          placeholder="Amount"
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <input
          type="number"
          placeholder="GST"
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={gst}
          onChange={(e) => setGst(e.target.value)}
        />

        <input
          placeholder="Total Amount"
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base bg-gray-100"
          value={totalAmount}
          readOnly
        />

        <input
          type="date"
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />

        <select
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="Pending">
            Pending
          </option>

          <option value="Paid">
            Paid
          </option>
        </select>

        <FileUploader
          folder="invoices"
          onUploadComplete={(url) => {
            console.log("Invoice URL:", url);
            setPdfUrl(url);
          }}
        />

        {pdfUrl && (
          <div className="text-green-700 font-medium text-sm md:text-base">
            ✓ PDF uploaded. Click Save Invoice to make it available to the customer.
          </div>
        )}

        <button
          onClick={saveInvoice}
          disabled={saving}
          className="bg-green-700 hover:bg-green-800 disabled:bg-green-400 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium w-full md:w-auto text-sm md:text-base"
        >
          {saving ? "Saving Invoice..." : editingId ? "Update Invoice" : "Save Invoice"}
        </button>

        {editingId && (
          <button
            onClick={resetForm}
            className="ml-0 md:ml-3 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium w-full md:w-auto text-sm md:text-base"
          >
            Cancel Edit
          </button>
        )}

      </div>

      <div className="mt-8 md:mt-10">
        <h2 className="text-xl md:text-2xl font-bold mb-4">Existing Invoices</h2>
        <div className="bg-white rounded-lg md:rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-max text-xs md:text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 md:p-4">Society</th>
                <th className="text-left p-3 md:p-4">Invoice</th>
                <th className="text-left p-3 md:p-4">Month</th>
                <th className="text-left p-3 md:p-4">Total</th>
                <th className="text-left p-3 md:p-4">Status</th>
                <th className="text-left p-3 md:p-4">PDF</th>
                <th className="text-left p-3 md:p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 md:p-4 font-medium">{invoice.society_name}</td>
                  <td className="p-3 md:p-4">{invoice.invoice_number}</td>
                  <td className="p-3 md:p-4">{invoice.invoice_month}</td>
                  <td className="p-3 md:p-4">₹ {Number(invoice.total_amount).toLocaleString()}</td>
                  <td className="p-3 md:p-4">{invoice.status}</td>
                  <td className="p-3 md:p-4"><a href={invoice.pdf_url} target="_blank" rel="noreferrer" className="text-blue-600">View PDF</a></td>
                  <td className="p-3 md:p-4">
                    <button onClick={() => editInvoice(invoice)} className="text-blue-600 hover:text-blue-800 font-medium mr-4">Edit</button>
                    <button onClick={() => deleteInvoice(invoice.id)} className="text-red-600 hover:text-red-800 font-medium">Delete</button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-gray-500">No invoices found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
