"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";

type EnergyStats = {
  today_consumption: number;
  total_savings: number;
  savings_percentage: number;
  system_status: string;
};

export default function StatsCards() {

  const [stats, setStats] = useState<EnergyStats | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {

    // Get user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    // Get energy stats
    const { data } = await supabase
      .from("energy_stats")
      .select("*")
      .eq("society_name", profile.society_name)
      .single();

    if (data) {
      setStats(data);
    }
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">

      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <p className="text-gray-500">
          Today's Consumption
        </p>

        <h2 className="text-3xl font-bold mt-3">
          {stats.today_consumption} kWh
        </h2>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <p className="text-gray-500">
          Total Savings
        </p>

        <h2 className="text-3xl font-bold mt-3 text-green-700">
          ₹ {stats.total_savings.toLocaleString()}
        </h2>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <p className="text-gray-500">
          Savings Percentage
        </p>

        <h2 className="text-3xl font-bold mt-3 text-green-700">
          {stats.savings_percentage}%
        </h2>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <p className="text-gray-500">
          System Status
        </p>

        <h2 className="text-3xl font-bold mt-3 text-green-700">
          {stats.system_status}
        </h2>
      </div>

    </div>
  );
}