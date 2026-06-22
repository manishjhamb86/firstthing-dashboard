"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";

export default function TankDetailsPage() {
  const params = useParams();

  const [tank, setTank] = useState<any>(null);
  const [readings, setReadings] = useState<any[]>([]);
  const [latestReading, setLatestReading] =
    useState<any>(null);

  useEffect(() => {
    loadTank();
  }, []);

  async function loadTank() {
    const { data, error } = await supabase
      .from("tank_configurations")
      .select(`
        *,
        societies(name)
      `)
      .eq("id", params.id)
      .single();

    if (error) {
      console.log(error);
      return;
    }

    setTank(data);

    loadReadings(data.id);
  }

  async function loadReadings(
    tankId: number
  ) {
    const { data } = await supabase
      .from("tank_readings")
      .select("*")
      .eq("tank_id", tankId)
      .order("received_at", {
        ascending: false,
      })
      .limit(20);

    if (data) {
      setReadings(data);

      if (data.length > 0) {
        setLatestReading(data[0]);
      }
    }
  }

  if (!tank) {
    return (
      <div className="text-center p-6 md:p-10">
        Loading Tank...
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 md:space-y-6">

      <div>

        <h1 className="text-2xl md:text-4xl font-bold">
          {tank.tank_name}
        </h1>

        <p className="text-gray-500 text-xs md:text-sm mt-2">
          Tank Monitoring & Configuration
        </p>

      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">

        <div className="bg-white rounded-lg md:rounded-2xl p-3 md:p-6 shadow-sm">

          <div className="text-gray-500 text-xs md:text-sm">
            Current Water
          </div>

          <div className="text-xl md:text-3xl font-bold mt-2">
            {latestReading
              ? Number(
                  latestReading.current_liters
                ).toLocaleString()
              : 0}
            {" L"}
          </div>

        </div>

        <div className="bg-white rounded-lg md:rounded-2xl p-3 md:p-6 shadow-sm">

          <div className="text-gray-500 text-xs md:text-sm">
            Water Level
          </div>

          <div className="text-xl md:text-3xl font-bold text-green-700 mt-2">
            {latestReading?.water_level_percent ??
              0}
            %
          </div>

        </div>

        <div className="bg-white rounded-lg md:rounded-2xl p-3 md:p-6 shadow-sm">

          <div className="text-gray-500 text-xs md:text-sm">
            Status
          </div>

          <div className="text-lg md:text-3xl font-bold mt-2">
            {latestReading?.status ??
              "No Data"}
          </div>

        </div>

      </div>

      <div className="grid md:grid-cols-2 gap-3 md:gap-6">

        <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-6">

          <h2 className="font-bold text-lg md:text-xl mb-3 md:mb-4">
            Tank Information
          </h2>

          <div className="space-y-2 md:space-y-3 text-sm md:text-base">

            <p>
              <strong>Society:</strong>{" "}
              {tank.societies?.name}
            </p>

            <p>
              <strong>Tank Code:</strong>{" "}
              {tank.tank_code}
            </p>

            <p>
              <strong>Tank Type:</strong>{" "}
              {tank.tank_type}
            </p>

            <p>
              <strong>Location:</strong>{" "}
              {tank.location}
            </p>

            <p>
              <strong>Capacity:</strong>{" "}
              {Number(
                tank.capacity_liters
              ).toLocaleString()}
              {" L"}
            </p>

          </div>

        </div>

        <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-6">

          <h2 className="font-bold text-lg md:text-xl mb-3 md:mb-4">
            Sensor Configuration
          </h2>

          <div className="space-y-2 md:space-y-3 text-sm md:text-base">

            <p>
              <strong>Height:</strong>{" "}
              {tank.height_meters}
              {" m"}
            </p>

            <p>
              <strong>Sensor Offset:</strong>{" "}
              {tank.sensor_offset_cm}
              {" cm"}
            </p>

            <p>
              <strong>Low Alert:</strong>{" "}
              {tank.low_alert_percent}
              %
            </p>

            <p>
              <strong>Critical Alert:</strong>{" "}
              {tank.critical_alert_percent}
              %
            </p>

          </div>

        </div>

      </div>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-6">

        <h2 className="font-bold text-lg md:text-xl mb-3 md:mb-4">
          Vendor API Configuration
        </h2>

        <div className="space-y-1 md:space-y-2 text-xs md:text-base">

          <p>
            <strong>societyId:</strong>{" "}
            {tank.society_id}
          </p>

          <p>
            <strong>tankCode:</strong>{" "}
            {tank.tank_code}
          </p>

        </div>

        <div className="mt-4 md:mt-6 bg-gray-100 rounded-lg md:rounded-xl p-3 md:p-4 overflow-x-auto">

          <pre className="text-xs md:text-sm whitespace-pre-wrap break-words">
            {JSON.stringify({
              apiKey: "FIRSTTHING123",
              societyId: tank.society_id,
              tankCode: tank.tank_code,
              currentLiters: 39000,
              waterLevelPercent: 78,
              sensorDistanceCm: 110
            }, null, 2)}
          </pre>

        </div>

      </div>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-6">

        <h2 className="font-bold text-lg md:text-xl mb-3 md:mb-4">
          Recent Readings
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-xs md:text-base">

            <thead>

              <tr className="border-b">

                <th className="text-left p-2 md:p-3 font-semibold">
                  Time
                </th>

                <th className="text-left p-2 md:p-3 font-semibold">
                  Water %
                </th>

                <th className="text-left p-2 md:p-3 font-semibold hidden sm:table-cell">
                  Liters
                </th>

                <th className="text-left p-2 md:p-3 font-semibold hidden md:table-cell">
                  Distance
                </th>

                <th className="text-left p-2 md:p-3 font-semibold">
                  Status
                </th>

              </tr>

            </thead>

            <tbody>

              {readings.map((reading) => {
                return (
                  <tr
                    key={reading.id}
                    className="border-b hover:bg-gray-50 transition-colors"
                  >

                    <td className="p-2 md:p-3">
                      {new Date(
                        reading.received_at
                      ).toLocaleString()}
                    </td>

                    <td className="p-2 md:p-3 font-semibold">
                      {reading.water_level_percent}%
                    </td>

                    <td className="p-2 md:p-3 hidden sm:table-cell">
                      {Number(
                        reading.current_liters
                      ).toLocaleString()}
                    </td>

                    <td className="p-2 md:p-3 hidden md:table-cell">
                      {reading.sensor_distance_cm} cm
                    </td>

                    <td className="p-2 md:p-3">
                      {reading.status}
                    </td>

                  </tr>
                );
              })}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}