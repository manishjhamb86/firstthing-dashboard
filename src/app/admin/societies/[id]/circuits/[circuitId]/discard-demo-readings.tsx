"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { discardDemoReadings } from "./reading-actions";

/**
 * Removing the readings demo mode generated, so a demo can be re-run.
 *
 * Confirms first, and says what it will remove in the confirmation rather
 * than in a tooltip — this deletes rows, and the count is the one fact that
 * makes the act checkable before it happens. Re-inserting is the existing
 * demo fill on the readings step; nothing new is needed for that half.
 */
export function DiscardDemoReadings({ circuitId, days }: { circuitId: string; days: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="mt-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">
            Remove all {days} generated {days === 1 ? "day" : "days"}? The circuit&apos;s baseline is
            re-derived from whatever readings remain.
          </span>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await discardDemoReadings(circuitId);
                if ("error" in r) setError(r.error);
                else {
                  setConfirming(false);
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Removing…" : "Remove them"}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => { setConfirming(false); setError(null); }}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirming(true)}>
          Remove the generated readings
        </button>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
