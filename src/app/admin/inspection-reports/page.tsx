"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import FileUploader from "../../../components/admin/FileUploader";
import { Eye } from "lucide-react";

type Society = {
  id: number;
  name: string;
};

type InspectionHistoryItem = {
  id: number;
  area: string;
  inspection_date: string;
  inspector_name: string;
  total_lights_checked: number;
  faulty_lights: number;
  society_name?: string;
  societies?:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

export default function AdminInspectionReportsPage() {

  const [societies, setSocieties] = useState<Society[]>([]);
  const [inspectionHistory, setInspectionHistory] = useState<InspectionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const [societyId, setSocietyId] = useState("");
  const [reportType, setReportType] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  

  useEffect(() => {
    loadSocieties();
    loadInspectionHistory();
  }, []);

  async function loadSocieties() {
    const { data } = await supabase
      .from("societies")
      .select("*")
      .order("name");

    if (data) setSocieties(data);
  }

  async function loadInspectionHistory() {
    setHistoryLoading(true);

    const { data } = await supabase
      .from("inspection_forms")
      .select(
        "id, area, inspection_date, inspector_name, total_lights_checked, faulty_lights, society_name, societies(name)"
      )
      .order("inspection_date", { ascending: false });

    if (data) {
      setInspectionHistory(data as InspectionHistoryItem[]);
    }

    setHistoryLoading(false);
  }

  async function saveInspection() {

  if (!pdfUrl) {
    alert("Please upload PDF first");
    return;
  }

  const { error } = await supabase
    .from("inspection_reports")
    .insert({
      society_id: Number(societyId),
      report_type: reportType,
      report_date: reportDate,
      pdf_url: pdfUrl,
    });

  if (error) {
    console.log(error);
    alert(error.message);
    return;
  }

  alert("Inspection Report Saved");

  setSocietyId("");
  setReportType("");
  setReportDate("");
  setPdfUrl("");

  await loadInspectionHistory();
}

  return (
    <div className="w-full max-w-4xl mx-auto">

      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">
        Inspection Reports
      </h1>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-8 space-y-4 md:space-y-5">

        <select
          className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          value={societyId}
          onChange={(e) => setSocietyId(e.target.value)}
        >
          <option value="">Select Society</option>

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
          placeholder="Pump Inspection"
          className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
        />

        <input
          type="date"
          className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
        />

        <FileUploader
  folder="inspection-reports"
  onUploadComplete={(url) => {
    console.log("Inspection URL:", url);
    setPdfUrl(url);
  }}
/>

        <button
          onClick={saveInspection}
          className="bg-green-700 hover:bg-green-800 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium w-full md:w-auto text-sm md:text-base"
        >
          Save Inspection Report
        </button>

      </div>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-8 mt-6 md:mt-8">
        <h2 className="text-lg md:text-2xl font-bold mb-4 md:mb-6">
          Field Inspection History
        </h2>

        {historyLoading ? (
          <p className="text-sm text-gray-500">Loading history...</p>
        ) : inspectionHistory.length === 0 ? (
          <p className="text-sm text-gray-500">No field inspections found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs md:text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 md:p-4 font-semibold">Date</th>
                  <th className="text-left p-3 md:p-4 font-semibold">Inspector</th>
                  <th className="text-left p-3 md:p-4 font-semibold">Area</th>
                  <th className="text-left p-3 md:p-4 font-semibold">Society</th>
                  <th className="text-left p-3 md:p-4 font-semibold">Faulty / Total</th>
                  <th className="text-left p-3 md:p-4 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {inspectionHistory.map((item) => {
                  const relationSocietyName = Array.isArray(item.societies)
                    ? item.societies[0]?.name
                    : item.societies?.name;

                  return (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-3 md:p-4">
                        {new Date(item.inspection_date).toLocaleDateString()}
                      </td>
                      <td className="p-3 md:p-4 font-medium">{item.inspector_name}</td>
                      <td className="p-3 md:p-4">{item.area}</td>
                      <td className="p-3 md:p-4">
                        {relationSocietyName || item.society_name || "-"}
                      </td>
                      <td className="p-3 md:p-4">
                        <span className="inline-block bg-red-100 text-red-700 px-2 md:px-3 py-1 rounded-full font-semibold">
                          {item.faulty_lights} / {item.total_lights_checked}
                        </span>
                      </td>
                      <td className="p-3 md:p-4">
                        <Link href={`/inspection-reports/${item.id}`}>
                          <button className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                            <Eye size={16} />
                            View
                          </button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}