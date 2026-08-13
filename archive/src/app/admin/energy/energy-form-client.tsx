"use client";

import { useState } from "react";
import { createEnergyStat } from "./actions";

type Society = { id: number; name: string };

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

export default function EnergyFormClient({ societies }: { societies: Society[] }) {
  const [societyId, setSocietyId] = useState("");
  const [todayConsumption, setTodayConsumption] = useState("");
  const [totalSavings, setTotalSavings] = useState("");
  const [savingsPercentage, setSavingsPercentage] = useState("");
  const [systemStatus, setSystemStatus] = useState("Optimized");

  async function saveEnergyData() {
    try {
      await createEnergyStat({
        societyId: Number(societyId),
        todayConsumption: Number(todayConsumption),
        totalSavings: Number(totalSavings),
        savingsPercentage: Number(savingsPercentage),
        systemStatus,
      });

      alert("Energy Data Saved");
    } catch {
      alert("Failed to save energy data");
    }
  }

  return (
    <div className="w-full max-w-xl">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-3.5">
        <select className={inputClass} value={societyId} onChange={(e) => setSocietyId(e.target.value)}>
          <option value="">Select Society</option>
          {societies.map((society) => (
            <option key={society.id} value={society.id}>
              {society.name}
            </option>
          ))}
        </select>

        <input
          placeholder="Today's Consumption"
          className={inputClass}
          value={todayConsumption}
          onChange={(e) => setTodayConsumption(e.target.value)}
        />

        <input
          placeholder="Total Savings"
          className={inputClass}
          value={totalSavings}
          onChange={(e) => setTotalSavings(e.target.value)}
        />

        <input
          placeholder="Savings Percentage"
          className={inputClass}
          value={savingsPercentage}
          onChange={(e) => setSavingsPercentage(e.target.value)}
        />

        <select className={inputClass} value={systemStatus} onChange={(e) => setSystemStatus(e.target.value)}>
          <option>Optimized</option>
          <option>Efficient</option>
          <option>Warning</option>
          <option>Offline</option>
        </select>

        <button onClick={saveEnergyData} className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac">
          Save Energy Data
        </button>
      </div>
    </div>
  );
}
