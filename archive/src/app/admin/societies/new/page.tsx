"use client";

import { useState } from "react";
import { createSociety } from "../actions";

export default function NewSocietyPage() {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveSociety() {
    setSaving(true);

    try {
      const result = await createSociety({ name, city, email, password });

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
    } catch {
      alert("Unable to create society. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-xl">
      <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Society Name</label>
          <input
            className="w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">City</label>
          <input
            className="w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Primary Email</label>
          <input
            type="email"
            className="w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-ink">Temporary Password</label>
          <input
            type="password"
            className="w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          onClick={saveSociety}
          disabled={saving}
          className="rounded-[9px] bg-ac px-4 py-2.5 text-sm font-bold text-onac disabled:opacity-60"
        >
          {saving ? "Creating..." : "Create Society"}
        </button>
      </div>
    </div>
  );
}
