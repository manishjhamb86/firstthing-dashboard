"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";


export default function TanksPage() {
  const [tanks, setTanks] = useState<any[]>([]);

  useEffect(() => {
    loadTanks();
  }, []);

  async function loadTanks() {
    const { data } = await supabase
      .from("tank_configurations")
      .select(`
        *,
        societies(name),
        tank_readings (
          water_level_percent,
          current_liters,
          status,
          received_at
        )
      `)
      .order("display_order");

    if (data) {
      setTanks(data);
    }
  }

  async function deleteTank(id: number) {
    const confirmDelete = confirm(
      "Delete this tank?"
    );

    if (!confirmDelete) return;

    const { error } = await supabase
      .from("tank_configurations")
      .delete()
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    loadTanks();
  }

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
    <div className="w-full">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-4 mb-6 md:mb-8">

        <div>
          <h1 className="text-2xl md:text-4xl font-bold">
            Water Tanks
          </h1>

          <p className="text-gray-500 text-xs md:text-sm mt-2">
            Live monitoring and tank configuration
          </p>
        </div>

        <Link href="/admin/tanks/new">
          <button className="bg-green-700 hover:bg-green-800 text-white px-4 md:px-5 py-2 md:py-3 rounded-lg md:rounded-xl text-sm md:text-base font-medium w-full sm:w-auto">
            + Add Tank
          </button>
        </Link>

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">

        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="text-gray-500 text-xs md:text-sm">
            Total Tanks
          </div>

          <div className="text-2xl md:text-3xl font-bold mt-2">
            {tanks.length}
          </div>
        </div>

        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="text-green-600 text-xs md:text-sm">
            Healthy
          </div>

          <div className="text-2xl md:text-3xl font-bold text-green-700 mt-2">
            {healthyCount}
          </div>
        </div>

        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="text-yellow-600 text-xs md:text-sm">
            Medium
          </div>

          <div className="text-2xl md:text-3xl font-bold text-yellow-700 mt-2">
            {mediumCount}
          </div>
        </div>

        <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="text-red-600 text-xs md:text-sm">
            Critical
          </div>

          <div className="text-2xl md:text-3xl font-bold text-red-700 mt-2">
            {criticalCount}
          </div>
        </div>

      </div>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm overflow-x-auto">

        <table className="w-full min-w-max">

          <thead className="bg-gray-50 border-b">

            <tr>
              <th className="p-2 md:p-4 text-left text-xs md:text-sm font-semibold">
                Society
              </th>

              <th className="p-2 md:p-4 text-left text-xs md:text-sm font-semibold">
                Tank
              </th>

              <th className="p-2 md:p-4 text-left text-xs md:text-sm font-semibold hidden sm:table-cell">
                Capacity
              </th>

              <th className="p-2 md:p-4 text-left text-xs md:text-sm font-semibold">
                Water %
              </th>

              <th className="p-2 md:p-4 text-left text-xs md:text-sm font-semibold hidden md:table-cell">
                Current L
              </th>

              <th className="p-2 md:p-4 text-left text-xs md:text-sm font-semibold">
                Status
              </th>

              <th className="p-2 md:p-4 text-left text-xs md:text-sm font-semibold hidden lg:table-cell">
                Last Update
              </th>

              <th className="p-2 md:p-4 text-left text-xs md:text-sm font-semibold">
                Action
              </th>
            </tr>

          </thead>

          <tbody>

            {tanks.map((tank) => {

              const latest =
                tank.tank_readings?.[0];

              return (

                <tr
                  key={tank.id}
                  className="border-t hover:bg-gray-50 transition-colors"
                >

                  <td className="p-2 md:p-4 text-xs md:text-sm">
                    {tank.societies?.name}
                  </td>

                  <td className="p-2 md:p-4 text-xs md:text-sm font-medium">

  <Link
    href={`/admin/tanks/${tank.id}`}
    className="text-green-700 hover:underline"
  >
    {tank.tank_name}
  </Link>

</td>

                  <td className="p-2 md:p-4 text-xs md:text-sm hidden sm:table-cell">
                    {Number(
                      tank.capacity_liters
                    ).toLocaleString()} L
                  </td>

                  <td className="p-2 md:p-4 text-xs md:text-sm font-semibold">
                    {latest?.water_level_percent ?? "-"}%
                  </td>

                  <td className="p-2 md:p-4 text-xs md:text-sm hidden md:table-cell">
                    {latest?.current_liters
                      ? Number(
                          latest.current_liters
                        ).toLocaleString()
                      : "-"}
                  </td>

                  <td className="p-2 md:p-4">

                    <span
                      className={`px-2 md:px-3 py-1 rounded-full text-xs font-semibold ${getStatusClass(
                        latest?.status
                      )}`}
                    >
                      {latest?.status ?? "No Data"}
                    </span>

                  </td>

                  <td className="p-2 md:p-4 text-xs md:text-sm hidden lg:table-cell">

                    {latest?.received_at
                      ? new Date(
                          latest.received_at
                        ).toLocaleString()
                      : "-"}

                  </td>

                  <td className="p-2 md:p-4">

                    <button
                      onClick={() =>
                        deleteTank(tank.id)
                      }
                      className="text-red-600 hover:text-red-800 text-xs md:text-sm font-medium"
                    >
                      Delete
                    </button>

                  </td>

                </tr>

              );
            })}

          </tbody>

        </table>

      </div>

    </div>
  );
}