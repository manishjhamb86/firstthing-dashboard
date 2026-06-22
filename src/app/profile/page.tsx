"use client";

import { useEffect, useState } from "react";
import Sidebar from "../../components/layout/sidebar";
import { supabase } from "../../lib/supabase";

export default function ProfilePage() {

  const [loading, setLoading] = useState(true);
  const [society, setSociety] = useState<any>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/login";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (!profile?.society_id) {
      setLoading(false);
      return;
    }

    const { data: societyData } = await supabase
      .from("societies")
      .select("*")
      .eq("id", profile.society_id)
      .single();

    setSociety(societyData);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex overflow-hidden">

      <Sidebar />

      <div className="flex-1 overflow-y-auto p-4 md:p-8 mt-16 md:mt-0">

        <h1 className="text-4xl font-bold mb-8">
          Society Profile
        </h1>

        <div className="bg-white rounded-2xl p-8 shadow-sm max-w-5xl">

          <div className="grid grid-cols-2 gap-8">

            <div>
              <p className="text-gray-500 mb-2">
                Society Name
              </p>

              <h2 className="text-2xl font-bold">
                {society?.name || "-"}
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                City
              </p>

              <h2 className="text-2xl font-bold">
                {society?.city || "-"}
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                Total Lights
              </p>

              <h2 className="text-2xl font-bold">
                {society?.total_lights || 0}
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                Savings Percentage
              </p>

              <h2 className="text-2xl font-bold text-green-700">
                {society?.savings_percentage || 0}%
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                Registered On
              </p>

              <h2 className="text-2xl font-bold">
                {society?.created_at
                  ? new Date(
                      society.created_at
                    ).toLocaleDateString()
                  : "-"}
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                System Status
              </p>

              <h2 className="text-2xl font-bold text-green-700">
                Active
              </h2>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}