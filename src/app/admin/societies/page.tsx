"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabase";

type Society = {
  id: number;
  name: string;
};

export default function SocietiesPage() {

  const [societies, setSocieties] = useState<Society[]>([]);

  useEffect(() => {
    fetchSocieties();
  }, []);

  async function fetchSocieties() {
    const { data } = await supabase
      .from("societies")
      .select("*")
      .order("name");

    if (data) {
      setSocieties(data);
    }
  }

  return (
    <div className="w-full">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 md:mb-8">

        <h1 className="text-2xl md:text-4xl font-bold">
          Societies
        </h1>

        <Link href="/admin/societies/new">

          <button className="bg-green-700 hover:bg-green-800 text-white px-4 md:px-5 py-2 md:py-3 rounded-lg md:rounded-xl text-sm md:text-base font-medium w-full sm:w-auto">
            + Add Society
          </button>

        </Link>

      </div>

      <div className="bg-white rounded-lg md:rounded-2xl shadow-sm overflow-x-auto">

        <table className="w-full min-w-max">

          <thead className="bg-gray-50 border-b">

            <tr>

              <th className="text-left p-3 md:p-4 text-xs md:text-sm font-semibold">
                Society
              </th>

              <th className="text-left p-3 md:p-4 text-xs md:text-sm font-semibold hidden sm:table-cell">
                ID
              </th>

              <th className="text-left p-3 md:p-4 text-xs md:text-sm font-semibold">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {societies.map((society) => (

              <tr
                key={society.id}
                className="border-t hover:bg-gray-50 transition-colors"
              >

                <td className="p-3 md:p-4 text-sm md:text-base font-medium">
                  {society.name}
                </td>

                <td className="p-3 md:p-4 text-sm md:text-base hidden sm:table-cell text-gray-600">
                  {society.id}
                </td>

                <td className="p-3 md:p-4">
  <Link
    href={`/admin/societies/${society.id}`}
    className="text-blue-600 hover:text-blue-800 text-sm md:text-base font-medium"
  >
    Edit
  </Link>
</td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}