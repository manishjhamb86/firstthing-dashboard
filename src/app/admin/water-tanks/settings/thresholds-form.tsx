"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { saveTankAlertThresholds } from "../actions";

/**
 * The two numbers that decide "critically low" / "critically high" for the
 * push alerts the half-hourly sampler raises (2026-10-14). Separate from
 * the credentials form beside it — this never tests a connection, it just
 * stores thresholds.
 */
export function ThresholdsForm({ current }: { current: { lowPct: number; highPct: number } }) {
  const router = useRouter();
  const [lowPct, setLowPct] = useState(String(current.lowPct));
  const [highPct, setHighPct] = useState(String(current.highPct));
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await saveTankAlertThresholds({ lowPct: Number(lowPct), highPct: Number(highPct) });
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field label="Critically low at or below" htmlFor="ta-low" hint="A society gets a push notification when a tank's level drops to this or lower.">
        <input id="ta-low" type="number" min={0} max={99} className="field num" value={lowPct} onChange={(e) => setLowPct(e.target.value)} disabled={pending} />
      </Field>
      <Field label="Critically high at or above" htmlFor="ta-high" hint="Overflow risk — a society is notified when a tank's level reaches this or higher.">
        <input id="ta-high" type="number" min={1} max={100} className="field num" value={highPct} onChange={(e) => setHighPct(e.target.value)} disabled={pending} />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      {saved && <p className="text-sm font-medium" style={{ color: "var(--ok-fg)" }}>Saved.</p>}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save thresholds"}
      </button>
    </form>
  );
}
