"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Droplets } from "lucide-react";
import Sidebar from "../../components/layout/sidebar";


export default function WaterTanksPage() {
  const [tanks, setTanks] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadTanks();

    const interval = setInterval(() => {
      loadTanks();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  async function loadTanks() {
    const { data } = await supabase
      .from("tank_configurations")
      .select(`
        *,
        tank_readings (
          water_level_percent,
          current_liters,
          status,
          received_at
        )
      `);

    if (data) {
      setTanks(data);
    }
  }

  const filteredTanks = tanks.filter((tank) =>
    tank.tank_name
      ?.toLowerCase()
      .includes(search.toLowerCase())
  );

  const healthyCount = tanks.filter(
    (t) => t.tank_readings?.[0]?.status === "healthy"
  ).length;

  const mediumCount = tanks.filter(
    (t) => t.tank_readings?.[0]?.status === "medium"
  ).length;

  const criticalCount = tanks.filter(
    (t) => t.tank_readings?.[0]?.status === "critical"
  ).length;

  function getStatusClass(status: string) {
    if (status === "healthy") {
      return "bg-green-100 text-green-700";
    }

    if (status === "medium") {
      return "bg-yellow-100 text-yellow-700";
    }

    return "bg-red-100 text-red-700";
  }

return (
  <div className="min-h-screen bg-gray-100 flex overflow-hidden">

    <Sidebar />

    <div className="flex-1 overflow-y-auto p-8 space-y-8">

      <div>

        <h1 className="text-4xl font-bold text-slate-900">
          Water Tanks
        </h1>

        <p className="text-gray-500 mt-2">
          Real-time monitoring of water tank levels
        </p>

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="bg-white rounded-3xl p-6 shadow-sm">

          <div className="text-gray-500 text-sm">
            Total Tanks
          </div>

          <div className="text-3xl font-bold mt-2">
            {tanks.length}
          </div>

        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm">

          <div className="text-green-600 text-sm">
            Healthy
          </div>

          <div className="text-3xl font-bold text-green-700 mt-2">
            {healthyCount}
          </div>

        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm">

          <div className="text-yellow-600 text-sm">
            Medium
          </div>

          <div className="text-3xl font-bold text-yellow-700 mt-2">
            {mediumCount}
          </div>

        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm">

          <div className="text-red-600 text-sm">
            Critical
          </div>

          <div className="text-3xl font-bold text-red-700 mt-2">
            {criticalCount}
          </div>

        </div>

      </div>

      <div className="bg-white rounded-3xl p-4 shadow-sm">

        <input
          placeholder="Search Tank..."
          value={search}
          onChange={(e) =>
            setSearch(e.target.value)
          }
          className="w-full border rounded-2xl p-4 focus:outline-none"
        />

      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">

        {filteredTanks.map((tank) => {

          const latest =
            tank.tank_readings?.[0];

          const level =
            latest?.water_level_percent || 0;

          const liters =
            latest?.current_liters || 0;

          const status =
            latest?.status || "critical";

          return (

            <div
              key={tank.id}
              className="bg-white rounded-3xl shadow-sm p-6 border border-gray-100 hover:shadow-md transition"
            >

              <div className="flex justify-between items-start">

                <div>

                  <div className="flex items-center gap-3">

                    <Droplets
                      className="text-green-600"
                      size={28}
                    />

                    <h2 className="text-xl font-bold text-slate-900">
                      {tank.tank_name}
                    </h2>

                  </div>

                  <p className="text-gray-500 mt-2">
                    {tank.location}
                  </p>

                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusClass(
                    status
                  )}`}
                >
                  {status}
                </span>

              </div>

              <div className="mt-8 text-center">

                <div className="text-6xl font-bold text-green-700">
                  {level}%
                </div>

              </div>

              <div className="mt-6">

                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">

                  <div
                    className="h-4 bg-green-600 rounded-full"
                    style={{
                      width: `${level}%`,
                    }}
                  />

                </div>

              </div>

              <div className="mt-6 text-center">

                <div className="text-lg font-semibold text-slate-900">
                  {Number(liters).toLocaleString()}
                  {" / "}
                  {Number(
                    tank.capacity_liters
                  ).toLocaleString()}
                  {" L"}
                </div>

                <div className="text-gray-500 text-sm mt-1">
                  Current Water Level
                </div>

              </div>

              <div className="mt-6 pt-4 border-t text-sm text-gray-500">

                <div>
                  Last Updated
                </div>

                <div className="font-medium text-slate-700 mt-1">
                  {latest?.received_at
                    ? new Date(
                        latest.received_at
                      ).toLocaleString()
                    : "No Data"}
                </div>

              </div>

            </div>

          );
        })}

      </div>
</div>
    </div>
  );
}