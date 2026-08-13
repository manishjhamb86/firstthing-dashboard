"use client";
import Link from "next/link";
import {
  LayoutDashboard,
  FileText,
  User,
  BarChart3,
  Droplets,
  Menu,
} from "lucide-react";
import { useState } from "react";

export default function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile Header */}

      <div className="md:hidden fixed top-0 left-0 right-0 bg-green-950 text-white flex items-center justify-between px-4 py-4 z-50">
        <h1 className="font-bold text-lg">
          Firsthing.earth
        </h1>

        <button onClick={() => setOpen(!open)}>
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Drawer */}

      {open && (
        <div className="md:hidden fixed top-16 left-0 w-64 bg-green-950 text-white h-full p-6 z-50">
          <Navigation />
        </div>
      )}

      {/* Desktop Sidebar */}

      <div className="hidden md:flex w-64 min-w-64 bg-green-950 text-white p-6 flex-col min-h-screen">
        <Navigation />
      </div>
    </>
  );
}

function Navigation() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold">
          Firsthing.earth
        </h1>

        <p className="text-green-300 mt-2 text-sm">
          Energy Intelligence
        </p>
      </div>

      <div className="mt-12 space-y-3">

        <Link href="/">
          <div className="flex items-center gap-3 bg-green-700 p-4 rounded-xl">
            <LayoutDashboard size={20} />
            Dashboard
          </div>
        </Link>

        <Link href="/water-tanks">
          <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl">
            <Droplets size={20} />
            Water Tanks
          </div>
        </Link>

        <Link href="/reports">
          <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl">
            <BarChart3 size={20} />
            Savings Reports
          </div>
        </Link>

        <Link href="/inspection-reports">
          <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl">
            <FileText size={20} />
            Inspection Reports
          </div>
        </Link>

        <Link href="/invoices">
          <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl">
            <FileText size={20} />
            Invoices
          </div>
        </Link>

        <Link href="/profile">
          <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl">
            <User size={20} />
            Profile
          </div>
        </Link>

      </div>

      <div className="mt-auto bg-green-900 rounded-2xl p-5">
        <h2 className="font-semibold text-lg">
          Sustainable Future 🌱
        </h2>

        <p className="text-sm text-green-200 mt-2">
          Together we are building smarter and energy efficient societies.
        </p>
      </div>
    </>
  );
}