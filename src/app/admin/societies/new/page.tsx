"use client";

import { useState } from "react";
import { supabase } from "../../../../lib/supabase";

export default function NewSocietyPage() {
  const [name, setName] = useState("");

  async function saveSociety() {
    const { error } = await supabase
      .from("societies")
      .insert({
        name,
      });

    if (error) {
      alert(error.message);
      return;
    }

    alert("Society Created");

    setName("");
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-4xl font-bold mb-8">
        Add Society
      </h1>

      <div className="bg-white p-8 rounded-2xl shadow-sm">
        <div>
          <label className="block mb-2">
            Society Name
          </label>

          <input
            className="border w-full p-4 rounded-xl"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <button
          onClick={saveSociety}
          className="mt-6 bg-green-700 text-white px-5 py-3 rounded-xl"
        >
          Save Society
        </button>
      </div>
    </div>
  );
}