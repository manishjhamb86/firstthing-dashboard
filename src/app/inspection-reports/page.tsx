"use client";

import { useEffect, useState } from "react";
import Sidebar from "../../components/layout/sidebar";
import { supabase } from "../../lib/supabase";

type InspectionReport = {
  id: number;
  report_type: string;
  report_date: string;
  pdf_url: string;
};

export default function InspectionReportsPage() {

  const [reports, setReports] = useState<InspectionReport[]>([]);

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
      .from("inspection_reports")
      .select("*")
      .eq("society_id", profile.society_id)
      .order("report_date", { ascending: false });

    if (data) {
      setReports(data);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex overflow-hidden">

      <Sidebar />

      <div className="flex-1 overflow-y-auto p-8">

        <h1 className="text-4xl font-bold mb-8">
          Inspection Reports
        </h1>

        <div className="space-y-6">

          {reports.map((report) => (

            <div
              key={report.id}
              className="bg-white rounded-2xl p-6 shadow-sm flex justify-between items-center"
            >

              <div>

                <h2 className="text-2xl font-bold">
                  {report.report_type}
                </h2>

                <p className="text-gray-500 mt-2">
                  {report.report_date}
                </p>

              </div>

              <a
                href={report.pdf_url}
                target="_blank"
                className="bg-green-700 hover:bg-green-800 text-white px-5 py-3 rounded-xl"
              >
                Download Report
              </a>

            </div>

          ))}

        </div>

      </div>

    </div>
  );
}