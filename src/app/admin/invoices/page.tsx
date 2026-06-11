"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

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

  useEffect(() => {
    loadSocieties();
  }, []);

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

    const { error } = await supabase
      .from("invoices")
      .insert({
        society_id: Number(societyId),
        society_name: selectedSociety?.name,
        invoice_number: invoiceNumber,
        invoice_month: invoiceMonth,
        amount: Number(amount),
        gst: Number(gst),
        total_amount: Number(totalAmount),
        due_date: dueDate,
        status,
        pdf_url: "#",
      });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Invoice Saved");
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
          placeholder="Invoice Month"
          className="border p-4 rounded-xl w-full"
          value={invoiceMonth}
          onChange={(e) => setInvoiceMonth(e.target.value)}
        />

        <input
          placeholder="Amount"
          className="border p-4 rounded-xl w-full"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <input
          placeholder="GST"
          className="border p-4 rounded-xl w-full"
          value={gst}
          onChange={(e) => setGst(e.target.value)}
        />

        <input
          placeholder="Total Amount"
          className="border p-4 rounded-xl w-full"
          value={totalAmount}
          onChange={(e) => setTotalAmount(e.target.value)}
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
          <option>Pending</option>
          <option>Paid</option>
        </select>

        <button
          onClick={saveInvoice}
          className="bg-green-700 text-white px-6 py-3 rounded-xl"
        >
          Save Invoice
        </button>

      </div>

    </div>
  );
}