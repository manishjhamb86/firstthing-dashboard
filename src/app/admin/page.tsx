"use client";

export default function AdminPage() {
  return (
    <div className="p-8">

      <h1 className="text-4xl font-bold mb-8">
        FirsThing Admin Panel
      </h1>

      <div className="grid grid-cols-4 gap-6">

        <div className="bg-white rounded-xl p-6 shadow">
          <h3>Total Societies</h3>
          <p className="text-3xl font-bold">18</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow">
          <h3>Active Devices</h3>
          <p className="text-3xl font-bold">120</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow">
          <h3>Pending Reports</h3>
          <p className="text-3xl font-bold">2</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow">
          <h3>Pending Invoices</h3>
          <p className="text-3xl font-bold">3</p>
        </div>

      </div>

    </div>
  );
}