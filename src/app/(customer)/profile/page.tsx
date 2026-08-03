"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

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
      <div className="flex items-center justify-center py-20 text-m2">
        Loading...
      </div>
    );
  }

  return (
    <div>

      <h1 className="text-2xl font-bold text-ink mb-8">
        Society Profile
      </h1>

      <div className="bg-card rounded-2xl p-8 border border-border max-w-5xl">

        <div className="grid grid-cols-2 gap-8">

          <div>
            <p className="text-m2 mb-2">
              Society Name
            </p>

            <h2 className="text-2xl font-bold text-ink">
              {society?.name || "-"}
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              City
            </p>

            <h2 className="text-2xl font-bold text-ink">
              {society?.city || "-"}
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              Total Lights
            </p>

            <h2 className="text-2xl font-bold text-ink">
              {society?.total_lights || 0}
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              Savings Percentage
            </p>

            <h2 className="text-2xl font-bold text-ac">
              {society?.savings_percentage || 0}%
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              Registered On
            </p>

            <h2 className="text-2xl font-bold text-ink">
              {society?.created_at
                ? new Date(
                    society.created_at
                  ).toLocaleDateString()
                : "-"}
            </h2>
          </div>

          <div>
            <p className="text-m2 mb-2">
              System Status
            </p>

            <h2 className="text-2xl font-bold text-ac">
              Active
            </h2>
          </div>

        </div>

      </div>

    </div>
  );
}
