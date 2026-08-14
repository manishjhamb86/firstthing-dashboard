"use client";

import { useState, useTransition } from "react";
import { recordLightReplacement } from "./actions";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function LightReplacementForm({ circuitId }: { circuitId: string }) {
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await recordLightReplacement(circuitId, date);
      setError(result?.error);
    });
  }

  return (
    <div className="max-w-md space-y-2">
      <label className="block text-sm">
        Date the last light was replaced
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={pending}
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
          style={{ borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" }}
        />
      </label>
      {error && (
        <p className="text-sm" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <button type="button" onClick={submit} disabled={pending} className="btn-primary text-sm disabled:opacity-60">
        {pending ? "Recording…" : "Mark installed"}
      </button>
    </div>
  );
}
