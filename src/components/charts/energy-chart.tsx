"use client";

import { useEffect, useState } from "react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { supabase } from "../../lib/supabase";

type Reading = {
  reading_time: string;
  power_kw: number;
};

export default function EnergyChart() {

  const [readings, setReadings] = useState<Reading[]>([]);

  useEffect(() => {

  fetchReadings();

  const channel = supabase
    .channel("live-meter-readings")

    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "meter_readings",
      },
      () => {
        fetchReadings();
      }
    )

    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };

}, []);

  async function fetchReadings() {

    // Current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    // Readings
    const { data } = await supabase
      .from("meter_readings")
      .select("*")
      .eq("society_name", profile.society_name)
      .order("reading_time", { ascending: true });

    if (data) {
      setReadings(data);
    }
  }

  const chartData = readings.map((item) => ({
    time: new Date(item.reading_time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    value: item.power_kw,
  }));

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">

      <div className="flex justify-between items-center mb-6">

        <div>
          <h2 className="text-2xl font-bold">
            Live Energy Consumption
          </h2>

          <p className="text-gray-500 mt-1">
            Real-time power usage tracking
          </p>
        </div>

        <div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-sm font-medium">
          Live
        </div>

      </div>

      <div className="h-80">

        <ResponsiveContainer width="100%" height="100%">

          <LineChart data={chartData}>

            <XAxis dataKey="time" />

            <YAxis />

            <Tooltip />

            <Line
              type="monotone"
              dataKey="value"
              stroke="#16a34a"
              strokeWidth={4}
            />

          </LineChart>

        </ResponsiveContainer>

      </div>

    </div>
  );
}