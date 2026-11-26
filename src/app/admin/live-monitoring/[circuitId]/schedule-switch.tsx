"use client";

import { useState, useTransition } from "react";
import { setCircuitSchedule } from "@/app/admin/societies/[id]/circuits/actions";

/**
 * Whether the circuit runs 24 hours or 12 (2026-11-26, user-asked). It decides
 * which days' readings count: a 24-hour circuit by the hours it is expected to
 * run, a 12-hour circuit on 8 to 15 hours with a reading.
 */
export function ScheduleSwitch({ circuitId, hours, canEdit }: { circuitId: string; hours: number | null; canEdit: boolean }) {
  const half = hours != null && hours > 0 && hours <= 12;
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const set = (h: 24 | 12) =>
    start(async () => {
      setError(undefined);
      const r = await setCircuitSchedule(circuitId, h);
      if (r && "error" in r) setError(r.error);
    });
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <span className="text-[var(--text-muted)]">This circuit runs</span>
      {canEdit ? (
        <div className="seg" role="radiogroup" aria-label="Hours the circuit runs">
          {([24, 12] as const).map((h) => {
            const on = h === 12 ? half : !half;
            return (
              <button key={h} type="button" role="radio" aria-checked={on} className={on ? "on" : undefined} disabled={pending || on} onClick={() => set(h)}>
                {h} hours
              </button>
            );
          })}
        </div>
      ) : (
        <strong>{half ? "12 hours" : "24 hours"}</strong>
      )}
      <span className="text-[var(--text-muted)]">
        {half
          ? "— a day counts when 8 to 15 of its hours carry a reading."
          : "— a day counts when every hour it is expected to run carries a reading."}
      </span>
      {pending && <span className="text-[var(--text-muted)]">Re-checking its days…</span>}
      {error && <span style={{ color: "var(--bad-fg)" }}>{error}</span>}
    </div>
  );
}
