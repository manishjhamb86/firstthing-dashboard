"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { Plus, ClipboardList, TrendingUp } from "lucide-react";

type InspectionSummary = {
  total: number;
  thisMonth: number;
  avgFaults: number;
};

type RecentInspection = {
  id: number;
  area: string;
  inspection_date: string;
  faulty_lights: number;
  society_name: string;
};

export default function InspectionDashboard() {
  const [summary, setSummary] = useState<InspectionSummary>({
    total: 0,
    thisMonth: 0,
    avgFaults: 0,
  });
  const [recentInspections, setRecentInspections] = useState<RecentInspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Get total inspections
    const { data: allInspections, count: totalCount } = await supabase
      .from("inspection_forms")
      .select("id", { count: "exact" })
      .eq("created_by", user.id);

    // Get this month's inspections
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().split("T")[0];

    const { count: monthCount } = await supabase
      .from("inspection_forms")
      .select("id", { count: "exact" })
      .eq("created_by", user.id)
      .gte("created_at", monthStartStr);

    // Get recent inspections
    const { data: recentData } = await supabase
      .from("inspection_forms")
      .select("id, area, inspection_date, faulty_lights, society_name")
      .eq("created_by", user.id)
      .order("inspection_date", { ascending: false })
      .limit(5);

    // Calculate average faults
    const { data: faultsData } = await supabase
      .from("inspection_forms")
      .select("faulty_lights")
      .eq("created_by", user.id);

    const avgFaults =
      faultsData && faultsData.length > 0
        ? Math.round(
            faultsData.reduce((sum, f) => sum + (f.faulty_lights || 0), 0) /
              faultsData.length
          )
        : 0;

    setSummary({
      total: totalCount || 0,
      thisMonth: monthCount || 0,
      avgFaults,
    });

    if (recentData) {
      setRecentInspections(recentData as RecentInspection[]);
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold">
            Inspection Dashboard
          </h1>
          <p className="text-gray-500 text-xs md:text-sm mt-2">
            Track and manage your inspections
          </p>
        </div>

        <Link href="/inspection/new">
          <button className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg font-medium w-full md:w-auto justify-center md:justify-start">
            <Plus size={20} />
            New Inspection
          </button>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-8">
        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="text-gray-500 text-xs md:text-sm mb-2">
            Total Inspections
          </div>
          <div className="text-3xl md:text-4xl font-bold text-blue-700">
            {summary.total}
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-2">
            All time submissions
          </p>
        </div>

        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="text-gray-500 text-xs md:text-sm mb-2">
            This Month
          </div>
          <div className="text-3xl md:text-4xl font-bold text-green-700">
            {summary.thisMonth}
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-2">
            Current month
          </p>
        </div>

        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="text-gray-500 text-xs md:text-sm mb-2">
            Avg Faults/Inspection
          </div>
          <div className="text-3xl md:text-4xl font-bold text-orange-700">
            {summary.avgFaults}
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-2">
            Average faulty lights
          </p>
        </div>
      </div>

      {/* Recent Inspections */}
      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 p-4 md:p-6 border-b">
          <ClipboardList size={24} className="text-blue-700" />
          <h2 className="text-xl md:text-2xl font-bold">
            Recent Inspections
          </h2>
        </div>

        {recentInspections.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No inspections yet</p>
            <Link href="/inspection/new">
              <button className="mt-4 bg-blue-700 hover:bg-blue-800 text-white px-6 py-2 rounded-lg font-medium">
                Create First Inspection
              </button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3 md:p-4 font-semibold text-xs md:text-sm">
                    Date
                  </th>
                  <th className="text-left p-3 md:p-4 font-semibold text-xs md:text-sm">
                    Area
                  </th>
                  <th className="text-left p-3 md:p-4 font-semibold text-xs md:text-sm hidden sm:table-cell">
                    Society
                  </th>
                  <th className="text-left p-3 md:p-4 font-semibold text-xs md:text-sm">
                    Faulty Lights
                  </th>
                  <th className="text-left p-3 md:p-4 font-semibold text-xs md:text-sm">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentInspections.map((inspection) => (
                  <tr key={inspection.id} className="border-b hover:bg-gray-50 transition-colors">
                    <td className="p-3 md:p-4 text-xs md:text-sm">
                      {new Date(inspection.inspection_date).toLocaleDateString()}
                    </td>
                    <td className="p-3 md:p-4 text-xs md:text-sm font-medium">
                      {inspection.area}
                    </td>
                    <td className="p-3 md:p-4 text-xs md:text-sm hidden sm:table-cell">
                      {inspection.society_name}
                    </td>
                    <td className="p-3 md:p-4">
                      <span className="inline-block bg-orange-100 text-orange-700 px-2 md:px-3 py-1 rounded-full text-xs font-semibold">
                        {inspection.faulty_lights}
                      </span>
                    </td>
                    <td className="p-3 md:p-4">
                      <Link href={`/inspection-reports/${inspection.id}`}>
                        <button className="text-blue-600 hover:text-blue-800 font-medium text-xs md:text-sm">
                          View
                        </button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
