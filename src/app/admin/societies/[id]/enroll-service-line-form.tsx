"use client";

import { useState, useTransition } from "react";
import { enrollServiceLine } from "../actions";

const SERVICE_LINE_OPTIONS = [
  { value: "lighting", label: "Lighting" },
  { value: "pumps", label: "Pumps" },
  { value: "solar", label: "Solar" },
  { value: "wastewater", label: "Wastewater" },
];

export function EnrollServiceLineForm({
  societyId,
  available,
}: {
  societyId: string;
  available: string[];
}) {
  const [serviceLine, setServiceLine] = useState(available[0] ?? "");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (available.length === 0) return null;

  function submit() {
    startTransition(async () => {
      const result = await enrollServiceLine(societyId, serviceLine);
      setError(result?.error);
    });
  }

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={serviceLine}
          onChange={(e) => setServiceLine(e.target.value)}
          disabled={pending}
          className="border rounded-[var(--r-sm)] p-2 text-sm"
          style={{ borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" }}
        >
          {SERVICE_LINE_OPTIONS.filter((o) => available.includes(o.value)).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={submit} disabled={pending} className="btn-primary text-sm disabled:opacity-60">
          {pending ? "Enrolling…" : "Enroll service line"}
        </button>
      </div>
      {error && (
        <p className="text-xs mt-2" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
