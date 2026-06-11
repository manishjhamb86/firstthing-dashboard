"use client";

import Sidebar from "../../components/layout/sidebar";

export default function ProfilePage() {

  return (
    <div className="min-h-screen bg-gray-100 flex overflow-hidden">

      <Sidebar />

      <div className="flex-1 overflow-y-auto p-8">

        <h1 className="text-4xl font-bold mb-8">
          Society Profile
        </h1>

        <div className="bg-white rounded-2xl p-8 shadow-sm max-w-4xl">

          <div className="grid grid-cols-2 gap-8">

            <div>
              <p className="text-gray-500 mb-2">
                Society Name
              </p>

              <h2 className="text-2xl font-bold">
                Arihant Arden
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                City
              </p>

              <h2 className="text-2xl font-bold">
                Noida
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                Total Lights
              </p>

              <h2 className="text-2xl font-bold">
                3200
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                Savings Percentage
              </p>

              <h2 className="text-2xl font-bold text-green-700">
                64%
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                Contract Start
              </p>

              <h2 className="text-2xl font-bold">
                Jan 2026
              </h2>
            </div>

            <div>
              <p className="text-gray-500 mb-2">
                System Status
              </p>

              <h2 className="text-2xl font-bold text-green-700">
                Active
              </h2>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}