import Link from "next/link";
import {
  LayoutDashboard,
  FileText,
  User,
  BarChart3,
  Droplets,
} from "lucide-react";

export default function Sidebar() {
  return (
    <div className="w-64 min-w-64 bg-green-950 text-white p-6 flex flex-col min-h-screen">

      <div>
        <h1 className="text-3xl font-bold">
          FirsThing.earth
        </h1>

        <p className="text-green-300 mt-2 text-sm">
          Energy Intelligence
        </p>
      </div>

     <div className="mt-12 space-y-3">

  <Link href="/">
    <div className="flex items-center gap-3 bg-green-700 p-4 rounded-xl cursor-pointer hover:bg-green-600">
      <LayoutDashboard size={20} />
      Dashboard
    </div>
  </Link>
  <Link href="/water-tanks">
  <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl cursor-pointer">
    <Droplets size={20} />
    Water Tanks
  </div>
</Link>
  <Link href="/reports">
    <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl cursor-pointer">
      <BarChart3 size={20} />
      Savings Reports
    </div>
  </Link>

  <Link href="/inspection-reports">
    <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl cursor-pointer">
      <FileText size={20} />
      Inspection Reports
    </div>
  </Link>

  <Link href="/invoices">
    <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl cursor-pointer">
      <FileText size={20} />
      Invoices
    </div>
  </Link>

  <Link href="/profile">
    <div className="flex items-center gap-3 p-4 hover:bg-green-900 rounded-xl cursor-pointer">
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

    </div>
  );
}