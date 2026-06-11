"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";

type Society = {
  id: number;
  name: string;
  city: string;
  total_lights: number;
  savings_percentage: number;
};

export default function SocietiesList() {

  const [societies, setSocieties] = useState<Society[]>([]);

  useEffect(() => {
    fetchSociety();
  }, []);

  async function fetchSociety() {

    // Get logged in user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Fetch profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    // Fetch only matching society
    const { data } = await supabase
      .from("societies")
      .select("*")
      .eq("name", profile.society_name);

    if (data) {
      setSocieties(data);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">

      <h2 className="text-2xl font-bold mb-6">
        Your Society
      </h2>

      <div className="space-y-4">

        {societies.map((society) => (

          <div
            key={society.id}
            className="border rounded-xl p-5 flex justify-between items-center"
          >

            <div>
              <h3 className="font-semibold text-2xl">
                {society.name}
              </h3>

              <p className="text-gray-500 mt-1">
                {society.city}
              </p>
            </div>

            <div className="text-right">

              <p className="font-bold text-2xl text-green-700">
                {society.savings_percentage}% Savings
              </p>

              <p className="text-gray-500 mt-1">
                {society.total_lights} Lights
              </p>

            </div>

          </div>

        ))}

      </div>

    </div>
  );
}