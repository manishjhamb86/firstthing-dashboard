"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen flex bg-gray-100">

      <div className="w-64 bg-slate-900 text-white p-6">

        <h1 className="text-2xl font-bold mb-8">
          Firsthing Admin
        </h1>

        <div className="space-y-3">

          <Link href="/admin">
            <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
              Dashboard
            </div>
          </Link>

          <Link href="/admin/societies">
            <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
              Societies
            </div>
          </Link>

          <Link href="/admin/users">
            <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
              Society Users
            </div>
          </Link>

          <Link href="/admin/tanks">
            <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
              Water Tanks
            </div>
          </Link>

          <Link href="/admin/energy">
            <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
              Energy Data
            </div>
          </Link>

          <Link href="/admin/invoices">
            <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
              Invoices
            </div>
          </Link>

          <Link href="/admin/reports">
            <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
              Reports
            </div>
          </Link>

          <Link href="/admin/inspection-reports">
            <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
              Inspection Reports
            </div>
          </Link>

        </div>

      </div>

      <div className="flex-1 p-8">
        {children}
      </div>

    </div>
  );
}