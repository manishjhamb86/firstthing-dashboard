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
    <div>

      <div className="flex justify-between items-center mb-8">

        <h1 className="text-4xl font-bold">
          Societies
        </h1>

        <Link href="/admin/societies/new">

          <button className="bg-green-700 text-white px-5 py-3 rounded-xl">
            + Add Society
          </button>

        </Link>

      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

        <table className="w-full">

          <thead className="bg-gray-50">

            <tr>

              <th className="text-left p-4">
                Society
              </th>

              <th className="text-left p-4">
                ID
              </th>

              <th className="text-left p-4">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {societies.map((society) => (

              <tr
                key={society.id}
                className="border-t"
              >

                <td className="p-4">
                  {society.name}
                </td>

                <td className="p-4">
                  {society.id}
                </td>

                <td className="p-4">
  <Link
    href={`/admin/societies/${society.id}`}
    className="text-blue-600 hover:text-blue-800"
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