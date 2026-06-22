"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Menu, X } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      .select("role")
      .eq("id", session.user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      window.location.href = "/";
      return;
    }

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
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/societies", label: "Societies" },
    { href: "/admin/users", label: "Society Users" },
    { href: "/admin/tanks", label: "Water Tanks" },
    { href: "/admin/energy", label: "Energy Data" },
    { href: "/admin/invoices", label: "Invoices" },
    { href: "/admin/reports", label: "Reports" },
    { href: "/admin/inspection-reports", label: "Inspection Reports" },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-gray-100">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-slate-900 text-white p-4 sticky top-0 z-40">
        <h1 className="text-xl font-bold">Firsthing Admin</h1>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 hover:bg-slate-800 rounded-lg"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:relative z-30 w-64 h-screen md:h-auto bg-slate-900 text-white p-6 transition-transform duration-300 ease-in-out`}
      >
        <h1 className="text-2xl font-bold mb-8 hidden md:block">
          Firsthing Admin
        </h1>

        <nav className="space-y-3">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                onClick={() => setSidebarOpen(false)}
              >
                {item.label}
              </div>
            </Link>
          ))}
        </nav>
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