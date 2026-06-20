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
    <div className="max-w-2xl">

      <h1 className="text-4xl font-bold mb-8">
        Add Society
      </h1>

      <div className="bg-white p-8 rounded-2xl shadow-sm space-y-5">

        <div>
          <label className="block mb-2">
            Society Name
          </label>

          <input
            className="border w-full p-4 rounded-xl"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="block mb-2">
            City
          </label>

          <input
            className="border w-full p-4 rounded-xl"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        <div>
          <label className="block mb-2">
            Primary Email
          </label>

          <input
            type="email"
            className="border w-full p-4 rounded-xl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="block mb-2">
            Temporary Password
          </label>

          <input
            type="password"
            className="border w-full p-4 rounded-xl"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          onClick={saveSociety}
          className="bg-green-700 text-white px-5 py-3 rounded-xl"
        >
          Create Society
        </button>

      </div>

    </div>
  );
}