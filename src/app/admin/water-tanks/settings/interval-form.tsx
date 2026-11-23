"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { describeTankInterval, TANK_INTERVAL_MAX, TANK_INTERVAL_MIN } from "@/lib/tank-sample-interval";
import { saveTankSampleInterval } from "../actions";

/** How often every tank's level is read (2026-11-23). Applies to every account. */
export function IntervalForm({ current }: { current: number }) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(String(current));
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const n = Number(minutes);
  const valid = Number.isInteger(n) && n >= TANK_INTERVAL_MIN && n <= TANK_INTERVAL_MAX;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        setSaved(false);
        start(async () => {
          const r = await saveTankSampleInterval(n);
          if (r.error) setError(r.error);
          else {
            setSaved(true);
            router.refresh();
          }
        });
      }}
    >
      <Field
        label="Read every tank's level every (minutes)"
        htmlFor="ta-interval"
        hint={valid ? `Levels are read ${describeTankInterval(n)}. Between ${TANK_INTERVAL_MIN} minutes and 24 hours.` : `Between ${TANK_INTERVAL_MIN} minutes and 24 hours (${TANK_INTERVAL_MAX} minutes).`}
      >
        <input id="ta-interval" type="number" min={TANK_INTERVAL_MIN} max={TANK_INTERVAL_MAX} step={1} className="field num" value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={pending} />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      {saved && <p className="text-sm font-medium" style={{ color: "var(--ok-fg)" }}>Saved — the next reading follows the new interval.</p>}
      <button type="submit" className="btn-primary" disabled={pending || !valid || n === current}>
        {pending ? "Saving…" : "Save interval"}
      </button>
    </form>
  );
}
