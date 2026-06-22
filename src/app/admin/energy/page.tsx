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
    <div className="w-full max-w-3xl mx-auto">

      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">
        Energy Data
      </h1>

      <div className="bg-white rounded-lg md:rounded-2xl p-4 md:p-8 shadow-sm space-y-4 md:space-y-5">

        <select
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
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
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={todayConsumption}
          onChange={(e) => setTodayConsumption(e.target.value)}
        />

        <input
          placeholder="Total Savings"
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={totalSavings}
          onChange={(e) => setTotalSavings(e.target.value)}
        />

        <input
          placeholder="Savings Percentage"
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
          value={savingsPercentage}
          onChange={(e) => setSavingsPercentage(e.target.value)}
        />

        <select
          className="border p-3 md:p-4 rounded-lg md:rounded-xl w-full text-sm md:text-base"
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
          className="bg-green-700 hover:bg-green-800 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium w-full md:w-auto text-sm md:text-base"
        >
          Save Energy Data
        </button>

      </div>

    </div>
  );
}