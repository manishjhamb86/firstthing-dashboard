"use client";

import { useEffect, useState } from "react";

import Sidebar from "../components/layout/sidebar";
import StatsCards from "../components/dashboard/stats-cards";
import EnergyChart from "../components/charts/energy-chart";
import Insights from "../components/dashboard/insights";
import SocietiesList from "../components/dashboard/societies-list";
import DevicesTable from "../components/dashboard/devices-table";

import { supabase } from "../lib/supabase";

export default function Home() {

  const [loading, setLoading] = useState(true);
  const [societyName, setSocietyName] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/login";
    } else {

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (profile) {
    setSocietyName(profile.society_name);
  }

  setLoading(false);
}
  }

  async function handleLogout() {

    await supabase.auth.signOut();

    window.location.href = "/login";
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

      <div className="flex-1 overflow-y-auto p-8">

        <div className="flex justify-between items-center mb-8">

          <div>
            <h1 className="text-4xl font-bold">
              Welcome, {societyName} 👋
            </h1>

            <p className="text-gray-500 mt-2">
              Here’s what’s happening with your energy system today.
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="bg-red-500 hover:bg-red-600 text-white px-5 py-3 rounded-xl"
          >
            Logout
          </button>

        </div>

        <StatsCards />
        <SocietiesList />

        <div className="mb-8">
          <EnergyChart />
        </div>

        <Insights />
        <DevicesTable />

      </div>

    </div>
  );
}