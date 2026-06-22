"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import FileUploader from "../../../components/admin/FileUploader";

type Society = {
  id: number;
  name: string;
};

export default function AdminReportsPage() {
  const [societies, setSocieties] = useState<Society[]>([]);
  const [reports, setReports] = useState<any[]>([]);

  const [societyId, setSocietyId] = useState("");
  const [reportMonth, setReportMonth] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");

  useEffect(() => {
    loadSocieties();
    loadReports();
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

  async function loadReports() {
    const { data, error } = await supabase
      .from("savings_reports")
      .select(
        `
        *,
        societies(name)
      `
      )
      .order("id", {
        ascending: false,
      });

    console.log("Reports:", data);
    console.log("Reports Error:", error);

    if (data) {
      setReports(data);
    }
  }

  async function saveReport() {
    if (!pdfUrl) {
      alert("Please upload PDF first");
      return;
    }

    const { error } = await supabase
      .from("savings_reports")
      .insert({
        society_id: Number(societyId),
        report_month: reportMonth,
        pdf_url: pdfUrl,
      });

    if (error) {
      console.log(error);
      alert(error.message);
      return;
    }

    alert("Report Saved");

    setSocietyId("");
    setReportMonth("");
    setPdfUrl("");

    loadReports();
  }

  async function deleteReport(id: number) {
    const confirmDelete = confirm(
      "Are you sure you want to delete this report?"
    );

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("savings_reports")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadReports();
  }

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">
        Savings Reports
      </h1>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-8 space-y-4 md:space-y-5">

        <select
          className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          value={societyId}
          onChange={(e) =>
            setSocietyId(e.target.value)
          }
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
          placeholder="Report Month (May 2026)"
          className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          value={reportMonth}
          onChange={(e) =>
            setReportMonth(e.target.value)
          }
        />

        <FileUploader
          folder="savings-reports"
          onUploadComplete={(url) => {
            console.log(
              "URL received:",
              url
            );
            setPdfUrl(url);
          }}
        />

        {pdfUrl && (
          <div className="text-green-600 text-xs md:text-sm font-medium">
            ✓ PDF uploaded successfully
          </div>
        )}

        <button
          onClick={saveReport}
          className="bg-green-700 hover:bg-green-800 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium w-full md:w-auto text-sm md:text-base"
        >
          Save Report
        </button>
      </div>

      <div className="mt-8 md:mt-10">

        <h2 className="text-xl md:text-2xl font-bold mb-4">
          Existing Reports
        </h2>

        <div className="bg-white rounded-lg md:rounded-2xl shadow-sm overflow-x-auto">

          <table className="w-full min-w-max">

            <thead className="bg-gray-50 border-b">

              <tr>
                <th className="text-left p-2 md:p-4 text-xs md:text-sm font-semibold">
                  Society
                </th>

                <th className="text-left p-2 md:p-4 text-xs md:text-sm font-semibold">
                  Month
                </th>

                <th className="text-left p-2 md:p-4 text-xs md:text-sm font-semibold">
                  PDF
                </th>

                <th className="text-left p-2 md:p-4 text-xs md:text-sm font-semibold">
                  Action
                </th>
              </tr>

            </thead>

            <tbody>

              {reports.map((report) => (

                <tr
                  key={report.id}
                  className="border-t hover:bg-gray-50 transition-colors"
                >

                  <td className="p-2 md:p-4 text-xs md:text-sm font-medium">
                    {report.societies?.name}
                  </td>

                  <td className="p-2 md:p-4 text-xs md:text-sm">
                    {report.report_month}
                  </td>

                  <td className="p-2 md:p-4">
                    <a
                      href={report.pdf_url}
                      target="_blank"
                      className="text-blue-600 hover:text-blue-800 text-xs md:text-sm font-medium"
                    >
                      View PDF
                    </a>
                  </td>

                  <td className="p-2 md:p-4">
                    <button
                      onClick={() =>
                        deleteReport(report.id)
                      }
                      className="text-red-600 hover:text-red-800 text-xs md:text-sm font-medium"
                    >
                      Delete
                    </button>
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}