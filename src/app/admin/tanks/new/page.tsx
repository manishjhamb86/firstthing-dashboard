"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";

export default function NewTankPage() {
  const [societies, setSocieties] = useState<any[]>([]);

  const [societyId, setSocietyId] = useState("");
  const [tankName, setTankName] = useState("");
  const [tankCode, setTankCode] = useState("");
  const [tankType, setTankType] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");

  const [heightMeters, setHeightMeters] =
    useState("");

  const [sensorOffset, setSensorOffset] =
    useState("");

  const [lowAlert, setLowAlert] =
    useState("20");

  const [criticalAlert, setCriticalAlert] =
    useState("10");

  const [displayOrder, setDisplayOrder] =
    useState("1");

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

  async function saveTank() {
    const { error } = await supabase
      .from("tank_configurations")
      .insert({
        society_id: Number(societyId),

        tank_name: tankName,
        tank_code: tankCode,
        tank_type: tankType,

        location,

        capacity_liters:
          Number(capacity),

        height_meters:
          Number(heightMeters),

        sensor_offset_cm:
          Number(sensorOffset),

        low_alert_percent:
          Number(lowAlert),

        critical_alert_percent:
          Number(criticalAlert),

        display_order:
          Number(displayOrder),
      });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Tank Saved");

    window.location.href =
      "/admin/tanks";
  }

  return (
    <div className="max-w-4xl">

      <h1 className="text-4xl font-bold mb-8">
        Add Water Tank
      </h1>

      <div className="bg-white rounded-3xl p-8 shadow-sm space-y-4">

        <select
          value={societyId}
          onChange={(e) =>
            setSocietyId(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        >
          <option value="">
            Select Society
          </option>

          {societies.map((s) => (
            <option
              key={s.id}
              value={s.id}
            >
              {s.name}
            </option>
          ))}
        </select>

        <input
          placeholder="Tank Name"
          value={tankName}
          onChange={(e) =>
            setTankName(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        />

        <input
          placeholder="Tank Code"
          value={tankCode}
          onChange={(e) =>
            setTankCode(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        />

        <select
          value={tankType}
          onChange={(e) =>
            setTankType(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        >
          <option value="">
            Tank Type
          </option>

          <option value="Overhead Tank">
            Overhead Tank
          </option>

          <option value="Underground Tank">
            Underground Tank
          </option>

          <option value="Fire Tank">
            Fire Tank
          </option>
        </select>

        <input
          placeholder="Location"
          value={location}
          onChange={(e) =>
            setLocation(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        />

        <input
          placeholder="Capacity (Liters)"
          value={capacity}
          onChange={(e) =>
            setCapacity(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        />

        <input
          placeholder="Tank Height (Meters)"
          value={heightMeters}
          onChange={(e) =>
            setHeightMeters(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        />

        <input
          placeholder="Sensor Offset (cm)"
          value={sensorOffset}
          onChange={(e) =>
            setSensorOffset(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        />

        <input
          placeholder="Low Alert %"
          value={lowAlert}
          onChange={(e) =>
            setLowAlert(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        />

        <input
          placeholder="Critical Alert %"
          value={criticalAlert}
          onChange={(e) =>
            setCriticalAlert(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        />

        <input
          placeholder="Display Order"
          value={displayOrder}
          onChange={(e) =>
            setDisplayOrder(
              e.target.value
            )
          }
          className="border p-4 rounded-xl w-full"
        />

        <button
          onClick={saveTank}
          className="bg-green-700 hover:bg-green-800 text-white px-6 py-3 rounded-xl"
        >
          Save Tank
        </button>

      </div>

    </div>
  );
}