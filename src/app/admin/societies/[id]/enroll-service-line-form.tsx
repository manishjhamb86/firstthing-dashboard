"use client";

import { useState, useTransition } from "react";
import { enrollServiceLine } from "../actions";
import { ErrorText } from "@/components/ui";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";

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
          aria-label="Service line to enroll"
          className="field max-w-48"
        >
          {available.map((value) => (
            <option key={value} value={value}>
              {SERVICE_LINE_LABEL[value] ?? value}
            </option>
          ))}
        </select>
        <button type="button" onClick={submit} disabled={pending} className="btn-secondary">
          {pending ? "Enrolling…" : "Enroll service line"}
        </button>
      </div>
      {error && (
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  );
}
