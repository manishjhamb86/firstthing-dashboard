"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import FileUploader from "../../../components/admin/FileUploader";

type Society = {
  id: number;
  name: string;
};

export default function AdminInspectionReportsPage() {

  const [societies, setSocieties] = useState<Society[]>([]);

  const [societyId, setSocietyId] = useState("");
  const [reportType, setReportType] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  

  useEffect(() => {
    loadSocieties();
  }, []);

  async function loadSocieties() {
    const { data } = await supabase
      .from("societies")
      .select("*")
      .order("name");

    if (data) setSocieties(data);
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
}

  return (
    <div className="max-w-4xl">

      <h1 className="text-4xl font-bold mb-8">
        Inspection Reports
      </h1>

      <div className="bg-white rounded-2xl shadow-sm p-8 space-y-5">

        <select
          className="border rounded-xl p-4 w-full"
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
          className="border rounded-xl p-4 w-full"
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
        />

        <input
          type="date"
          className="border rounded-xl p-4 w-full"
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
          className="bg-green-700 text-white px-6 py-3 rounded-xl"
        >
          Save Inspection Report
        </button>

      </div>

    </div>
  );
}