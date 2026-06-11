import Link from "next/link";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-gray-100">

      <div className="w-64 bg-slate-900 text-white p-6">

        <h1 className="text-2xl font-bold mb-8">
          FirstThing Admin
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

          <Link href="/admin/energy">
            <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
              Energy Data
            </div>
          </Link>
          <Link href="/admin/tanks">
  <div className="p-3 rounded-lg hover:bg-slate-800 cursor-pointer">
    Water Tanks
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