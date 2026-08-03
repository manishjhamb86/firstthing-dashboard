"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../../lib/supabase";

type Report = {
  id: number;
  report_month: string;
  pdf_url: string;
};

export default function ReportsPage() {

  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("society_id")
      .eq("id", user.id)
      .single();

    if (!profile?.society_id) return;

    const { data } = await supabase
      .from("savings_reports")
      .select("*")
      .eq("society_id", profile.society_id)
      .order("id", { ascending: false });

    if (data) {
      setReports(data);
    }
  }

  return (
    <div>

      <h1 className="text-2xl font-bold text-ink mb-8">
        Savings Reports
      </h1>

      {reports.length === 0 && (
        <div className="bg-card rounded-2xl p-8 border border-border text-m2">
          No reports available.
        </div>
      )}

      <div className="space-y-6">

        {reports.map((report) => (

          <div
            key={report.id}
            className="bg-card rounded-2xl p-6 border border-border flex justify-between items-center"
          >

            <div>
              <h2 className="text-2xl font-bold text-ink">
                {report.report_month}
              </h2>

              <p className="text-m2 mt-2">
                Monthly Energy Savings Report
              </p>
            </div>

            <a
              href={report.pdf_url}
              target="_blank"
              className="bg-ac text-onac px-5 py-3 rounded-xl"
            >
              Download Report
            </a>

          </div>

        ))}

      </div>

    </div>
  );
}
