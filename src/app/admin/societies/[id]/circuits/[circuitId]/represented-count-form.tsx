"use client";

import { useState, useTransition } from "react";
import { updateRepresentedLightCount } from "./actions";
import { ErrorText } from "@/components/ui";

/**
 * Correcting CON-11's extrapolation base, where the figure is actually read.
 *
 * The represented count is the population the metered circuit stands in for,
 * and the monthly fee is computed on it — so a circuit left representing only
 * the lights on it under-bills by the whole extrapolation factor. Indiabulls
 * Centrum Park was offered at 50 of 2,000 (user-caught 2026-09-08). It has
 * always been editable on the circuit REGISTRY, which is not where anybody
 * reads it: the number is shown on this page and on the offer, so the
 * correction belongs here too.
 *
 * Closed by default — an open number field under a figure reads as something
 * still waiting to be filled in.
 */
export function RepresentedCountForm({
  circuitId,
  current,
  meteredLightCount,
  inventoryCount,
}: {
  circuitId: string;
  current: number;
  meteredLightCount: number;
  /** What this survey's own inventory counted for this light type, if it has one. */
  inventoryCount: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(current));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Correct the represented count
      </button>
    );
  }

  return (
    <div className="space-y-2.5 text-sm max-w-md">
      <p className="text-xs text-[var(--text-muted)]">
        Every light of this type across the society — the population this circuit&apos;s benchmark is
        extrapolated to. The monthly fee is computed on this figure (CON-11), not on the{" "}
        <span className="num">{meteredLightCount.toLocaleString("en-IN")}</span> lights actually
        metered.
        {inventoryCount !== null && (
          <>
            {" "}
            The site survey&apos;s inventory counted{" "}
            <span className="num">{inventoryCount.toLocaleString("en-IN")}</span> of this type.
          </>
        )}
      </p>
      <label className="block" htmlFor="rep-count">
        <span className="lbl">Represented count</span>
        <input
          id="rep-count"
          type="number"
          min={meteredLightCount}
          className="field mt-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={pending}
        />
      </label>
      <label className="block" htmlFor="rep-note">
        <span className="lbl">Where the corrected figure comes from</span>
        <input
          id="rep-note"
          className="field mt-1"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Matches the site survey's own inventory for this type."
          disabled={pending}
        />
      </label>
      {/* A figure already priced into an issued offer or a released bill is
          not corrected here — the action refuses those by name rather than
          this screen implying otherwise. */}
      <p className="text-xs" style={{ color: "var(--warn-fg)" }}>
        Any demo report and offer already generated were priced on the old figure — regenerate them
        afterwards so the paper and the record agree.
      </p>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await updateRepresentedLightCount(circuitId, Number(value), note);
              if (r && "error" in r && r.error) setError(r.error);
              else {
                setOpen(false);
                setError(undefined);
                setNote("");
              }
            })
          }
        >
          {pending ? "Saving…" : "Save the represented count"}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={() => {
            setOpen(false);
            setError(undefined);
            setValue(String(current));
            setNote("");
          }}
          disabled={pending}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
