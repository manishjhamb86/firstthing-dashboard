"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabase";
import { useParams, useRouter } from "next/navigation";

export default function EditSocietyPage() {
  const params = useParams();
  const router = useRouter();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [totalLights, setTotalLights] = useState("");
  const [savingsPercentage, setSavingsPercentage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSociety();
  }, []);

  async function loadSociety() {
    const { data, error } = await supabase
      .from("societies")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    if (data) {
      setName(data.name || "");
      setCity(data.city || "");
      setTotalLights(data.total_lights?.toString() || "");
      setSavingsPercentage(
        data.savings_percentage?.toString() || ""
      );
    }

    setLoading(false);
  }

  async function updateSociety() {
    const { error } = await supabase
      .from("societies")
      .update({
        name,
        city,
        total_lights: Number(totalLights),
        savings_percentage: Number(savingsPercentage),
      })
      .eq("id", params.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Society updated successfully");

    router.push("/admin/societies");
  }

  async function deleteSociety() {
    const confirmed = confirm(
      "Are you sure you want to delete this society?"
    );

    if (!confirmed) return;

    const { error } = await supabase
      .from("societies")
      .delete()
      .eq("id", params.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Society deleted");

    router.push("/admin/societies");
  }

  if (loading) {
    return (
      <div className="text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="max-w-4xl">

      <h1 className="text-4xl font-bold mb-8">
        Edit Society
      </h1>

      <div className="bg-white rounded-2xl shadow-sm p-8 space-y-5">

        <div>
          <label className="font-medium block mb-2">
            Society Name
          </label>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded-xl p-4 w-full"
          />
        </div>

        <div>
          <label className="font-medium block mb-2">
            City
          </label>

          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border rounded-xl p-4 w-full"
          />
        </div>

        <div>
          <label className="font-medium block mb-2">
            Total Lights
          </label>

          <input
            type="number"
            value={totalLights}
            onChange={(e) =>
              setTotalLights(e.target.value)
            }
            className="border rounded-xl p-4 w-full"
          />
        </div>

        <div>
          <label className="font-medium block mb-2">
            Savings %
          </label>

          <input
            type="number"
            value={savingsPercentage}
            onChange={(e) =>
              setSavingsPercentage(e.target.value)
            }
            className="border rounded-xl p-4 w-full"
          />
        </div>

        <div className="flex gap-4 pt-4">

          <button
            onClick={updateSociety}
            className="bg-green-700 hover:bg-green-800 text-white px-6 py-3 rounded-xl"
          >
            Save Changes
          </button>

          <button
            onClick={deleteSociety}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl"
          >
            Delete Society
          </button>

        </div>

      </div>

    </div>
  );
}