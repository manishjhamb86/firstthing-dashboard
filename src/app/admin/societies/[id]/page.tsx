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
      <div className="text-lg md:text-xl">
        Loading...
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">

      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">
        Edit Society
      </h1>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm p-4 md:p-8 space-y-4 md:space-y-5">

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            Society Name
          </label>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          />
        </div>

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            City
          </label>

          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          />
        </div>

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            Total Lights
          </label>

          <input
            type="number"
            value={totalLights}
            onChange={(e) =>
              setTotalLights(e.target.value)
            }
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          />
        </div>

        <div>
          <label className="font-medium block mb-2 text-sm md:text-base">
            Savings %
          </label>

          <input
            type="number"
            value={savingsPercentage}
            onChange={(e) =>
              setSavingsPercentage(e.target.value)
            }
            className="border rounded-lg md:rounded-xl p-3 md:p-4 w-full text-sm md:text-base"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 md:gap-4 pt-4">

          <button
            onClick={updateSociety}
            className="bg-green-700 hover:bg-green-800 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium text-sm md:text-base order-1"
          >
            Save Changes
          </button>

          <button
            onClick={deleteSociety}
            className="bg-red-600 hover:bg-red-700 text-white px-4 md:px-6 py-2 md:py-3 rounded-lg md:rounded-xl font-medium text-sm md:text-base"
          >
            Delete Society
          </button>

        </div>

      </div>

    </div>
  );
}