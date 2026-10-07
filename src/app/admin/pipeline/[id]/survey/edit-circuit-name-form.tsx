"use client";

import { useState, useTransition } from "react";
import { ErrorText } from "@/components/ui";
import { updateCircuitConfiguration } from "@/app/admin/societies/[id]/circuits/actions";

/**
 * Correct a candidate circuit's own name — "basement", "TubeLight" — typed
 * as recorded at survey time with no standard casing or spelling check
 * (2026-10-08, user-asked, from a screenshot of this exact step). Reuses
 * updateCircuitConfiguration (PER-01-only, the registry's own edit action)
 * rather than a new one, passing through every other field unchanged — this
 * control touches the name alone.
 */
export function EditCircuitNameForm({
  circuitId,
  lightType,
  location,
  meteredLightCount,
  representedLightCount,
  wattage,
  workingHours,
}: {
  circuitId: string;
  lightType: string;
  location: string | null;
  meteredLightCount: number;
  representedLightCount: number;
  wattage: number;
  workingHours: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(lightType);
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="text-xs font-semibold" style={{ color: "var(--accent)" }} onClick={() => setOpen(true)}>
        Edit name
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        aria-label="Circuit name"
        className="field field-auto"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
      />
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(undefined);
            const r = await updateCircuitConfiguration(circuitId, {
              lightType: value,
              location: location ?? "",
              meteredLightCount,
              representedLightCount,
              wattage,
              workingHours: workingHours ?? undefined,
            });
            if (r?.error) {
              setError(r.error);
              return;
            }
            setOpen(false);
          })
        }
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}
