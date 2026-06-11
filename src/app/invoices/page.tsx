"use client";

import { useEffect, useState } from "react";

import Sidebar from "../../components/layout/sidebar";

import { supabase } from "../../lib/supabase";

type Invoice = {
  pdf_url: string;
  id: number;
  invoice_number: string;
  invoice_month: string;
  amount: number;
  gst: number;
  total_amount: number;
  due_date: string;
  status: string;
};

export default function InvoicesPage() {

  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    fetchInvoices();
  }, []);

  async function fetchInvoices() {

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    const { data } = await supabase
      .from("invoices")
      .select("*")
      .eq("society_name", profile.society_name);

    if (data) {
      setInvoices(data);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex overflow-hidden">

      <Sidebar />

      <div className="flex-1 overflow-y-auto p-8">

        <div className="flex justify-between items-center mb-8">

          <div>
            <h1 className="text-4xl font-bold">
              Invoices
            </h1>

            <p className="text-gray-500 mt-2">
              Monthly billing & savings invoices
            </p>
          </div>

        </div>

        <div className="space-y-6">

          {invoices.map((invoice) => (

            <div
              key={invoice.id}
              className="bg-white rounded-2xl p-6 shadow-sm flex justify-between items-center"
            >

              <div>

                <h2 className="text-2xl font-bold">
                  {invoice.invoice_number}
                </h2>

                <p className="text-gray-500 mt-2">
                  {invoice.invoice_month}
                </p>

                <p className="text-gray-500 mt-1">
                  Due Date: {invoice.due_date}
                </p>

              </div>

              <div className="text-right">

                <p className="text-3xl font-bold text-green-700">
                  ₹ {invoice.total_amount.toLocaleString()}
                </p>

                <div
                  className={`mt-3 inline-block px-4 py-2 rounded-xl text-sm font-medium ${
                    invoice.status === "Paid"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {invoice.status}
                </div>

                <div>
                  <a
  href={invoice.pdf_url}
  target="_blank"
  className="inline-block mt-4 bg-green-700 hover:bg-green-800 text-white px-5 py-2 rounded-xl"
>
  Download Invoice
</a>
                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>
  );
}