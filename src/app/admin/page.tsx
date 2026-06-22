"use client";

export default function AdminPage() {
  return (
    <div className="p-4 md:p-8 w-full">

      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">
        FirsThing Admin Panel
      </h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">

        <div className="bg-white rounded-lg md:rounded-xl p-4 md:p-6 shadow">
          <h3 className="text-xs md:text-sm text-gray-600">Total Societies</h3>
          <p className="text-2xl md:text-3xl font-bold mt-2">18</p>
        </div>

        <div className="bg-white rounded-lg md:rounded-xl p-4 md:p-6 shadow">
          <h3 className="text-xs md:text-sm text-gray-600">Active Devices</h3>
          <p className="text-2xl md:text-3xl font-bold mt-2">120</p>
        </div>

        <div className="bg-white rounded-lg md:rounded-xl p-4 md:p-6 shadow">
          <h3 className="text-xs md:text-sm text-gray-600">Pending Reports</h3>
          <p className="text-2xl md:text-3xl font-bold mt-2">2</p>
        </div>

        <div className="bg-white rounded-lg md:rounded-xl p-4 md:p-6 shadow">
          <h3 className="text-xs md:text-sm text-gray-600">Pending Invoices</h3>
          <p className="text-2xl md:text-3xl font-bold mt-2">3</p>
        </div>

      </div>

    </div>
  );
}