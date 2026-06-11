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
    <div className="max-w-7xl">
      <h1 className="text-4xl font-bold mb-8">
        Savings Reports
      </h1>

      <div className="bg-white rounded-2xl shadow-sm p-8 space-y-5">

        <select
          className="border rounded-xl p-4 w-full"
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
          className="border rounded-xl p-4 w-full"
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
          <div className="text-green-600 text-sm">
            PDF uploaded successfully
          </div>
        )}

        <button
          onClick={saveReport}
          className="bg-green-700 hover:bg-green-800 text-white px-6 py-3 rounded-xl"
        >
          Save Report
        </button>
      </div>

      <div className="mt-10">

        <h2 className="text-2xl font-bold mb-4">
          Existing Reports
        </h2>

        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

          <table className="w-full">

            <thead className="bg-gray-50">

              <tr>
                <th className="text-left p-4">
                  Society
                </th>

                <th className="text-left p-4">
                  Month
                </th>

                <th className="text-left p-4">
                  PDF
                </th>

                <th className="text-left p-4">
                  Action
                </th>
              </tr>

            </thead>

            <tbody>

              {reports.map((report) => (

                <tr
                  key={report.id}
                  className="border-t"
                >

                  <td className="p-4">
                    {report.societies?.name}
                  </td>

                  <td className="p-4">
                    {report.report_month}
                  </td>

                  <td className="p-4">
                    <a
                      href={report.pdf_url}
                      target="_blank"
                      className="text-blue-600"
                    >
                      View PDF
                    </a>
                  </td>

                  <td className="p-4">
                    <button
                      onClick={() =>
                        deleteReport(report.id)
                      }
                      className="text-red-600"
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