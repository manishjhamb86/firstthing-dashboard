"use client";

import { useEffect, useState } from "react";

import { supabase } from "../../lib/supabase";

type Device = {
  id: number;
  device_name: string;
  device_type: string;
  status: string;
};

export default function DevicesTable() {

  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    fetchDevices();
  }, []);

  async function fetchDevices() {

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!profile) return;

    const { data } = await supabase
      .from("devices")
      .select("*")
      .eq("society_name", profile.society_name);

    if (data) {
      setDevices(data);
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm mt-8">

      <h2 className="text-2xl font-bold mb-6">
        Device Health
      </h2>

      <div className="space-y-4">

        {devices.map((device) => (

          <div
            key={device.id}
            className="border rounded-xl p-4 flex justify-between items-center"
          >

            <div>
              <h3 className="font-semibold">
                {device.device_name}
              </h3>

              <p className="text-gray-500 text-sm">
                {device.device_type}
              </p>
            </div>

            <div
              className={`px-4 py-2 rounded-xl text-sm font-medium ${
                device.status === "Online"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {device.status}
            </div>

          </div>

        ))}

      </div>

    </div>
  );
}