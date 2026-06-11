"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Society = {
  id: number;
  name: string;
};

export default function EnergyPage() {
  const [societies, setSocieties] = useState<Society[]>([]);

  const [societyId, setSocietyId] = useState("");

  const [todayConsumption, setTodayConsumption] = useState("");
  const [totalSavings, setTotalSavings] = useState("");
  const [savingsPercentage, setSavingsPercentage] = useState("");
  const [systemStatus, setSystemStatus] = useState("Optimized");

  useEffect(() => {
    loadSocieties();
  }, []);

  async function loadSocieties() {
    const { data } = await supabase
      .from("societies")
      .select("*")
      .order("name");

    if (data) {
      setSocieties(data);
    }
  }

  async function saveEnergyData() {
    const { error } = await supabase
      .from("energy_stats")
      .insert({
        society_id: Number(societyId),
        today_consumption: Number(todayConsumption),
        total_savings: Number(totalSavings),
        savings_percentage: Number(savingsPercentage),
        system_status: systemStatus,
      });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Energy Data Saved");
  }

  return (
    <div className="max-w-3xl">

      <h1 className="text-4xl font-bold mb-8">
        Energy Data
      </h1>

      <div className="bg-white rounded-2xl p-8 shadow-sm space-y-5">

        <select
          className="border p-4 rounded-xl w-full"
          value={societyId}
          onChange={(e) => setSocietyId(e.target.value)}
        >
          <option value="">
            Select Society
          </option>

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
          placeholder="Today's Consumption"
          className="border p-4 rounded-xl w-full"
          value={todayConsumption}
          onChange={(e) => setTodayConsumption(e.target.value)}
        />

        <input
          placeholder="Total Savings"
          className="border p-4 rounded-xl w-full"
          value={totalSavings}
          onChange={(e) => setTotalSavings(e.target.value)}
        />

        <input
          placeholder="Savings Percentage"
          className="border p-4 rounded-xl w-full"
          value={savingsPercentage}
          onChange={(e) => setSavingsPercentage(e.target.value)}
        />

        <select
          className="border p-4 rounded-xl w-full"
          value={systemStatus}
          onChange={(e) => setSystemStatus(e.target.value)}
        >
          <option>Optimized</option>
          <option>Efficient</option>
          <option>Warning</option>
          <option>Offline</option>
        </select>

        <button
          onClick={saveEnergyData}
          className="bg-green-700 text-white px-6 py-3 rounded-xl"
        >
          Save Energy Data
        </button>

      </div>

    </div>
  );
}