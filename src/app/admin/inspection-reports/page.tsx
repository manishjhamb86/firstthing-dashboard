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

    </div>
  );
}