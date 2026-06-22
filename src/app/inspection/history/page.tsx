"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";
import { Eye } from "lucide-react";

type InspectionItem = {
  id: number;
  area: string;
  inspection_date: string;
  inspector_name: string;
  society_name: string;
  total_lights_checked: number;
  faulty_lights: number;
  created_at: string;
};

export default function InspectionHistoryPage() {
  const [inspections, setInspections] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchArea, setSearchArea] = useState("");

  useEffect(() => {
    loadInspections();
  }, []);

  async function loadInspections() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("inspection_forms")
      .select("*")
      .eq("created_by", user.id)
      .order("inspection_date", { ascending: false });

    if (data) {
      setInspections(data as InspectionItem[]);
    }

    setLoading(false);
  }

  const filteredInspections = inspections.filter((inspection) =>
    inspection.area.toLowerCase().includes(searchArea.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-2xl md:text-4xl font-bold mb-2">
        Inspection History
      </h1>
      <p className="text-gray-500 text-xs md:text-sm mb-8">
        View all your submitted inspections
      </p>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by area..."
          value={searchArea}
          onChange={(e) => setSearchArea(e.target.value)}
          className="w-full border rounded-lg p-3 text-sm"
        />
      </div>

      {/* Inspections List */}
      <div className="space-y-4">
        {filteredInspections.length === 0 ? (
          <div className="bg-white rounded-lg md:rounded-2xl p-8 text-center shadow-sm">
            <p className="text-gray-500 mb-4">No inspections found</p>
            <Link href="/inspection/new">
              <button className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-2 rounded-lg font-medium">
                Create One Now
              </button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg md:rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-xs md:text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 md:p-4 font-semibold">Date</th>
                    <th className="text-left p-3 md:p-4 font-semibold">Area</th>
                    <th className="text-left p-3 md:p-4 font-semibold hidden sm:table-cell">
                      Society
                    </th>
                    <th className="text-left p-3 md:p-4 font-semibold">
                      Total Lights
                    </th>
                    <th className="text-left p-3 md:p-4 font-semibold">
                      Faulty
                    </th>
                    <th className="text-left p-3 md:p-4 font-semibold">
                      Inspector
                    </th>
                    <th className="text-left p-3 md:p-4 font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInspections.map((inspection) => (
                    <tr
                      key={inspection.id}
                      className="border-b hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-3 md:p-4">
                        {new Date(
                          inspection.inspection_date
                        ).toLocaleDateString()}
                      </td>
                      <td className="p-3 md:p-4 font-medium">
                        {inspection.area}
                      </td>
                      <td className="p-3 md:p-4 hidden sm:table-cell">
                        {inspection.society_name}
                      </td>
                      <td className="p-3 md:p-4">
                        {inspection.total_lights_checked}
                      </td>
                      <td className="p-3 md:p-4">
                        <span className="inline-block bg-red-100 text-red-700 px-2 md:px-3 py-1 rounded-full font-semibold">
                          {inspection.faulty_lights}
                        </span>
                      </td>
                      <td className="p-3 md:p-4 text-xs md:text-sm">
                        {inspection.inspector_name}
                      </td>
                      <td className="p-3 md:p-4">
                        <Link
                          href={`/inspection-reports/${inspection.id}`}
                        >
                          <button className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                            <Eye size={16} />
                            View
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
