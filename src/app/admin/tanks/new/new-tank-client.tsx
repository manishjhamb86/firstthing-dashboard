"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTank } from "../actions";

type Society = { id: number; name: string };

const inputClass =
  "w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none";

export default function NewTankClient({ societies }: { societies: Society[] }) {
  const router = useRouter();

  const [societyId, setSocietyId] = useState("");
  const [tankName, setTankName] = useState("");
  const [tankCode, setTankCode] = useState("");
  const [tankType, setTankType] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [heightMeters, setHeightMeters] = useState("");
  const [sensorOffset, setSensorOffset] = useState("");
  const [lowAlert, setLowAlert] = useState("20");
  const [criticalAlert, setCriticalAlert] = useState("10");
  const [displayOrder, setDisplayOrder] = useState("1");

  async function saveTank() {
    try {
      await createTank({
        societyId: Number(societyId),
        tankName,
        tankCode,
        tankType,
        location,
        capacityLiters: Number(capacity),
        heightMeters: Number(heightMeters),
        sensorOffsetCm: Number(sensorOffset),
        lowAlertPercent: Number(lowAlert),
        criticalAlertPercent: Number(criticalAlert),
        displayOrder: Number(displayOrder),
      });

      alert("Tank Saved");
      router.push("/admin/tanks");
    } catch {
      alert("Failed to save tank");
    }
  }

  return (
    <div className="w-full max-w-2xl">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-3.5">
        <select value={societyId} onChange={(e) => setSocietyId(e.target.value)} className={inputClass}>
          <option value="">Select Society</option>
          {societies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <input placeholder="Tank Name" value={tankName} onChange={(e) => setTankName(e.target.value)} className={inputClass} />

        <input placeholder="Tank Code" value={tankCode} onChange={(e) => setTankCode(e.target.value)} className={inputClass} />

        <select value={tankType} onChange={(e) => setTankType(e.target.value)} className={inputClass}>
          <option value="">Tank Type</option>
          <option value="Overhead Tank">Overhead Tank</option>
          <option value="Underground Tank">Underground Tank</option>
          <option value="Fire Tank">Fire Tank</option>
        </select>

        <input placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />

        <input
          placeholder="Capacity (Liters)"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          className={inputClass}
        />

        <input
          placeholder="Tank Height (Meters)"
          value={heightMeters}
          onChange={(e) => setHeightMeters(e.target.value)}
          className={inputClass}
        />

        <input
          placeholder="Sensor Offset (cm)"
          value={sensorOffset}
          onChange={(e) => setSensorOffset(e.target.value)}
          className={inputClass}
        />

        <input placeholder="Low Alert %" value={lowAlert} onChange={(e) => setLowAlert(e.target.value)} className={inputClass} />

        <input
          placeholder="Critical Alert %"
          value={criticalAlert}
          onChange={(e) => setCriticalAlert(e.target.value)}
          className={inputClass}
        />

        <input
          placeholder="Display Order"
          value={displayOrder}
          onChange={(e) => setDisplayOrder(e.target.value)}
          className={inputClass}
        />

        <button onClick={saveTank} className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac">
          Save Tank
        </button>
      </div>
    </div>
  );
}
