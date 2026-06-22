"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Menu, X, FileText, Home, History, LogOut } from "lucide-react";

export default function InspectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorName, setInspectorName] = useState("");

  useEffect(() => {
    checkAccess();
  }, []);

  async function checkAccess() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      window.location.href = "/login";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, society_name")
      .eq("id", session.user.id)
      .single();

    if (!profile || profile.role !== "inspection") {
      window.location.href = "/login";
      return;
    }

    setInspectorName(profile.society_name || "Inspector");
    setAuthorized(true);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Checking permissions...
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  const navItems = [
    { href: "/inspection", label: "Dashboard", icon: Home },
    { href: "/inspection/new", label: "New Inspection", icon: FileText },
    { href: "/inspection/history", label: "My Inspections", icon: History },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-100">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-blue-950 text-white p-4 sticky top-0 z-40">
        <h1 className="text-xl font-bold">Inspection</h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-blue-900 rounded-lg"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:relative z-30 w-64 h-screen md:h-auto bg-blue-950 text-white p-6 transition-transform duration-300 ease-in-out`}
      >
        <h1 className="text-2xl font-bold mb-8 hidden md:block">
          Inspection Portal
        </h1>

        <nav className="space-y-3 mb-8">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-900 cursor-pointer transition-colors"
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={20} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="bg-blue-900 rounded-2xl p-5 mb-4">
            <h2 className="font-semibold text-lg">
              {inspectorName}
            </h2>
            <p className="text-sm text-blue-200 mt-2">
              Inspection Officer
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 md:hidden z-20"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 w-full overflow-auto">
        {children}
      </div>
    </div>
  );
}
