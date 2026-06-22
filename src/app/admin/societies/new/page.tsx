"use client";

import { useState } from "react";
import { supabase } from "../../../../lib/supabase";

export default function NewSocietyPage() {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

async function saveSociety() {

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    alert("Session expired. Please login again.");
    return;
  }

  const response = await fetch(
    "https://ffqzlgvimdxlppjykvap.supabase.co/functions/v1/create-society-user",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        societyName: name,
        city,
        email,
        password,
      }),
    }
  );

  const result = await response.json();
  

console.log("RESPONSE STATUS", response.status);
console.log("RESULT", result);

alert(JSON.stringify(result));

  if (!result.success) {
    alert(result.error || "Failed to create society");
    return;
  }

  alert(
`Society Created Successfully

Email: ${email}
Password: ${password}`
  );

  setName("");
  setCity("");
  setEmail("");
  setPassword("");
}

  return (
    <div className="w-full max-w-2xl mx-auto">

      <h1 className="text-2xl md:text-4xl font-bold mb-6 md:mb-8">
        Add Society
      </h1>

      <div className="bg-white p-4 md:p-8 rounded-lg md:rounded-2xl shadow-sm space-y-4 md:space-y-5">

        <div>
          <label className="block mb-2 text-sm md:text-base font-medium">
            Society Name
          </label>

          <input
            className="border w-full p-3 md:p-4 rounded-lg md:rounded-xl text-sm md:text-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block mb-2 text-sm md:text-base font-medium">
            City
          </label>

          <input
            className="border w-full p-3 md:p-4 rounded-lg md:rounded-xl text-sm md:text-base"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        <div>
          <label className="block mb-2 text-sm md:text-base font-medium">
            Primary Email
          </label>

          <input
            type="email"
            className="border w-full p-3 md:p-4 rounded-lg md:rounded-xl text-sm md:text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block mb-2 text-sm md:text-base font-medium">
            Temporary Password
          </label>

          <input
            type="password"
            className="border w-full p-3 md:p-4 rounded-lg md:rounded-xl text-sm md:text-base"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          onClick={saveSociety}
          className="bg-green-700 hover:bg-green-800 text-white px-4 md:px-5 py-2 md:py-3 rounded-lg md:rounded-xl font-medium w-full md:w-auto text-sm md:text-base"
        >
          Create Society
        </button>

      </div>

    </div>
  );
}