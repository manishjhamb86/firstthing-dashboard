"use client";

import { useState, useTransition } from "react";
import { recordLightReplacement } from "./actions";
import { Card, ErrorText, Field } from "@/components/ui";

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
    <Card className="p-5 space-y-4">
      <Field
        label="Date the last light was replaced"
        htmlFor="lr-date"
        hint="CON-19 — this pivot day is excluded; the post-install window starts the next midnight."
      >
        <input
          id="lr-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={pending}
          className="field"
        />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <button type="button" onClick={submit} disabled={pending} className="btn-primary">
        {pending ? "Recording…" : "Mark installed"}
      </button>
    </Card>
  );
}
