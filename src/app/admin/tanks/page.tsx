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
    <div>

      <div className="flex justify-between items-center mb-8">

        <div>
          <h1 className="text-4xl font-bold">
            Water Tanks
          </h1>

          <p className="text-gray-500 mt-2">
            Live monitoring and tank configuration
          </p>
        </div>

        <Link href="/admin/tanks/new">
          <button className="bg-green-700 hover:bg-green-800 text-white px-5 py-3 rounded-xl">
            + Add Tank
          </button>
        </Link>

      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="text-gray-500 text-sm">
            Total Tanks
          </div>

          <div className="text-3xl font-bold mt-2">
            {tanks.length}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="text-green-600 text-sm">
            Healthy
          </div>

          <div className="text-3xl font-bold text-green-700 mt-2">
            {healthyCount}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="text-yellow-600 text-sm">
            Medium
          </div>

          <div className="text-3xl font-bold text-yellow-700 mt-2">
            {mediumCount}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="text-red-600 text-sm">
            Critical
          </div>

          <div className="text-3xl font-bold text-red-700 mt-2">
            {criticalCount}
          </div>
        </div>

      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

        <table className="w-full">

          <thead className="bg-gray-50">

            <tr>
              <th className="p-4 text-left">
                Society
              </th>

              <th className="p-4 text-left">
                Tank
              </th>

              <th className="p-4 text-left">
                Capacity
              </th>

              <th className="p-4 text-left">
                Water %
              </th>

              <th className="p-4 text-left">
                Current Liters
              </th>

              <th className="p-4 text-left">
                Status
              </th>

              <th className="p-4 text-left">
                Last Update
              </th>

              <th className="p-4 text-left">
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
                  className="border-t"
                >

                  <td className="p-4">
                    {tank.societies?.name}
                  </td>

                  <td className="p-4">

  <Link
    href={`/admin/tanks/${tank.id}`}
    className="text-green-700 hover:underline font-medium"
  >
    {tank.tank_name}
  </Link>

</td>

                  <td className="p-4">
                    {Number(
                      tank.capacity_liters
                    ).toLocaleString()} L
                  </td>

                  <td className="p-4 font-semibold">
                    {latest?.water_level_percent ?? "-"}%
                  </td>

                  <td className="p-4">
                    {latest?.current_liters
                      ? Number(
                          latest.current_liters
                        ).toLocaleString()
                      : "-"}
                  </td>

                  <td className="p-4">

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusClass(
                        latest?.status
                      )}`}
                    >
                      {latest?.status ?? "No Data"}
                    </span>

                  </td>

                  <td className="p-4 text-sm">

                    {latest?.received_at
                      ? new Date(
                          latest.received_at
                        ).toLocaleString()
                      : "-"}

                  </td>

                  <td className="p-4">

                    <button
                      onClick={() =>
                        deleteTank(tank.id)
                      }
                      className="text-red-600 hover:text-red-800"
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