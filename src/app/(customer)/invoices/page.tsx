"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";

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
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function fetchInvoices() {
    setLoading(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage(userError?.message || "Please log in to view invoices.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("society_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.society_id) {
      setErrorMessage(profileError?.message || "Your account is not linked to a society.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("society_id", profile.society_id)
      .order("id", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setInvoices(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchInvoices();
  }, []);

  return (
    <div>

      <div className="flex justify-between items-center mb-8">

        <div>
          <h1 className="text-2xl font-bold text-ink">
            Invoices
          </h1>

          <p className="text-m2 mt-2">
            Monthly billing & savings invoices
          </p>
        </div>

      </div>

      <div className="space-y-6">

        {loading && (
          <div className="bg-card rounded-2xl p-6 border border-border text-m2">
            Loading invoices...
          </div>
        )}

        {!loading && errorMessage && (
          <div className="bg-[var(--bb)] border border-[var(--bbd2)] text-[var(--bf)] rounded-2xl p-6">
            Unable to load invoices: {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && invoices.length === 0 && (
          <div className="bg-card rounded-2xl p-6 border border-border text-m2">
            No invoices are available for your society yet.
          </div>
        )}

        {invoices.map((invoice) => (

          <div
            key={invoice.id}
            className="bg-card rounded-2xl p-6 border border-border flex justify-between items-center"
          >

            <div>

              <h2 className="text-2xl font-bold text-ink">
                {invoice.invoice_number}
              </h2>

              <p className="text-m2 mt-2">
                {invoice.invoice_month}
              </p>

              <p className="text-m2 mt-1">
                Due Date: {invoice.due_date}
              </p>

            </div>

            <div className="text-right">

              <p className="text-3xl font-bold text-ac">
                ₹ {invoice.total_amount.toLocaleString()}
              </p>

              <div
                className="mt-3 inline-block px-4 py-2 rounded-xl text-sm font-medium"
                style={{
                  background: invoice.status === "Paid" ? "var(--okb)" : "var(--wb)",
                  color: invoice.status === "Paid" ? "var(--okf)" : "var(--wf)",
                }}
              >
                {invoice.status}
              </div>

              <div>
                <a
                  href={invoice.pdf_url}
                  target="_blank"
                  className="inline-block mt-4 bg-ac text-onac px-5 py-2 rounded-xl"
                >
                  Download Invoice
                </a>
              </div>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}
