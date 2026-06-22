"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "../../components/layout/sidebar";
import { supabase } from "../../lib/supabase";
import { Eye, FileText } from "lucide-react";

type AdminReport = {
  id: number;
  type: "admin";
  report_type: string;
  report_date: string;
  pdf_url: string;
};

type InspectionForm = {
  id: number;
  type: "inspection";
  area: string;
  inspection_date: string;
  inspector_name: string;
  faulty_lights: number;
  total_lights_checked: number;
};

type Report = AdminReport | InspectionForm;

export default function InspectionReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

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
      .select("society_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.society_id) return;

    const allReports: Report[] = [];

    // Load admin inspection reports
    const { data: adminReports } = await supabase
      .from("inspection_reports")
      .select("*")
      .eq("society_id", profile.society_id)
      .order("report_date", { ascending: false });

    if (adminReports) {
      allReports.push(
        ...adminReports.map((r) => ({
          ...r,
          type: "admin" as const,
        }))
      );
    }

    // Load inspection forms (if customer)
    if (profile.role === "customer") {
      const { data: inspectionForms } = await supabase
        .from("inspection_forms")
        .select("*")
        .eq("society_id", profile.society_id)
        .order("inspection_date", { ascending: false });

      if (inspectionForms) {
        allReports.push(
          ...inspectionForms.map((f) => ({
            ...f,
            type: "inspection" as const,
          }))
        );
      }
    }

    // Sort by date
    allReports.sort((a, b) => {
      const dateA = new Date(
        a.type === "admin" ? a.report_date : a.inspection_date
      );
      const dateB = new Date(
        b.type === "admin" ? b.report_date : b.inspection_date
      );
      return dateB.getTime() - dateA.getTime();
    });

    setReports(allReports);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex overflow-hidden">
        <Sidebar />
        <div className="flex-1 overflow-y-auto p-8">
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex overflow-hidden">
      <Sidebar />

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <h1 className="text-2xl md:text-4xl font-bold mb-2">
          Inspection Reports
        </h1>
        <p className="text-gray-500 text-xs md:text-sm mb-8">
          View inspection reports submitted for your society
        </p>

        {reports.length === 0 ? (
          <div className="bg-white rounded-lg md:rounded-2xl p-8 text-center shadow-sm">
            <FileText size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">No inspection reports yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => {
              if (report.type === "admin") {
                return (
                  <div
                    key={`admin-${report.id}`}
                    className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-block bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-semibold">
                            Admin Report
                          </span>
                        </div>
                        <h2 className="text-lg md:text-2xl font-bold">
                          {report.report_type}
                        </h2>
                        <p className="text-gray-500 text-xs md:text-sm mt-2">
                          {new Date(
                            report.report_date
                          ).toLocaleDateString()}
                        </p>
                      </div>

                      <a
                        href={report.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full md:w-auto bg-green-700 hover:bg-green-800 text-white px-4 md:px-5 py-2 md:py-3 rounded-lg font-medium text-sm md:text-base text-center transition-colors"
                      >
                        Download Report
                      </a>
                    </div>
                  </div>
                );
              } else {
                return (
                  <Link key={`inspection-${report.id}`} href={`/inspection-reports/${report.id}`}>
                    <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-block bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-semibold">
                              Field Inspection
                            </span>
                          </div>
                          <h2 className="text-lg md:text-2xl font-bold">
                            {report.area}
                          </h2>
                          <p className="text-gray-500 text-xs md:text-sm mt-1">
                            By {report.inspector_name} •{" "}
                            {new Date(
                              report.inspection_date
                            ).toLocaleDateString()}
                          </p>
                          <div className="flex flex-wrap gap-4 mt-3 text-xs md:text-sm">
                            <div>
                              <p className="text-gray-500">Total Lights</p>
                              <p className="font-semibold">
                                {report.total_lights_checked}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Faulty</p>
                              <p className="font-semibold text-red-600">
                                {report.faulty_lights}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Fault Rate</p>
                              <p className="font-semibold text-orange-600">
                                {report.total_lights_checked > 0
                                  ? Math.round(
                                      (report.faulty_lights /
                                        report.total_lights_checked) *
                                        100
                                    )
                                  : 0}
                                %
                              </p>
                            </div>
                          </div>
                        </div>

                        <button className="w-full md:w-auto flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 md:px-5 py-2 md:py-3 rounded-lg font-medium text-sm md:text-base justify-center transition-colors">
                          <Eye size={18} />
                          View Details
                        </button>
                      </div>
                    </div>
                  </Link>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
}