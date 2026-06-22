"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import FileUploader from "../../../components/admin/FileUploader";

type Society = {
  id: number;
  name: string;
};

export default function AdminInvoicesPage() {

  const [societies, setSocieties] = useState<Society[]>([]);

  const [societyId, setSocietyId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState("Pending");
  const [pdfUrl, setPdfUrl] = useState("");

  useEffect(() => {
    loadSocieties();
  }, []);

  useEffect(() => {
    const amt = Number(amount || 0);
    const gstAmt = Number(gst || 0);

    setTotalAmount(String(amt + gstAmt));
  }, [amount, gst]);

  async function loadSocieties() {

    const { data } = await supabase
      .from("societies")
      .select("*")
      .order("name");

    if (data) {
      setSocieties(data);
    }
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

    const { error } = await supabase
      .from("invoices")
      .insert({
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
      });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Invoice Uploaded Successfully");

    setSocietyId("");
    setInvoiceNumber("");
    setInvoiceMonth("");
    setAmount("");
    setGst("");
    setTotalAmount("");
    setDueDate("");
    setStatus("Pending");
    setPdfUrl("");
  }

  return (
    <div className="max-w-4xl">

      <h1 className="text-4xl font-bold mb-8">
        Invoice Management
      </h1>

      <div className="bg-white rounded-2xl p-8 shadow-sm space-y-5">

        <select
          className="border p-4 rounded-xl w-full"
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
          className="border p-4 rounded-xl w-full"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
        />

        <input
          placeholder="Invoice Month (Example: June 2026)"
          className="border p-4 rounded-xl w-full"
          value={invoiceMonth}
          onChange={(e) => setInvoiceMonth(e.target.value)}
        />

        <input
          type="number"
          placeholder="Amount"
          className="border p-4 rounded-xl w-full"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <input
          type="number"
          placeholder="GST"
          className="border p-4 rounded-xl w-full"
          value={gst}
          onChange={(e) => setGst(e.target.value)}
        />

        <input
          placeholder="Total Amount"
          className="border p-4 rounded-xl w-full bg-gray-100"
          value={totalAmount}
          readOnly
        />

        <input
          type="date"
          className="border p-4 rounded-xl w-full"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />

        <select
          className="border p-4 rounded-xl w-full"
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
          <div className="text-green-700 font-medium">
            ✓ Invoice PDF Uploaded Successfully
          </div>
        )}

        <button
          onClick={saveInvoice}
          className="bg-green-700 hover:bg-green-800 text-white px-6 py-3 rounded-xl"
        >
          Save Invoice
        </button>

      </div>

    </div>
  );
}