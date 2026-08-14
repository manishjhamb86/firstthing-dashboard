"use client";

import { useState, useTransition } from "react";
import { updateCircuitConfiguration } from "./actions";
import { ErrorText, Field } from "@/components/ui";

type Circuit = {
  id: string;
  location: string | null;
  meteredLightCount: number;
  representedLightCount: number;
  wattage: number;
  workingHours: number | null;
};

export function CircuitEditForm({ circuit, onDone }: { circuit: Circuit; onDone: () => void }) {
  const [location, setLocation] = useState(circuit.location ?? "");
  const [meteredLightCount, setMeteredLightCount] = useState(String(circuit.meteredLightCount));
  const [representedLightCount, setRepresentedLightCount] = useState(String(circuit.representedLightCount));
  const [wattage, setWattage] = useState(String(circuit.wattage));
  const [workingHours, setWorkingHours] = useState(circuit.workingHours != null ? String(circuit.workingHours) : "");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await updateCircuitConfiguration(circuit.id, {
        location,
        meteredLightCount: Number(meteredLightCount),
        representedLightCount: Number(representedLightCount),
        wattage: Number(wattage),
        workingHours: workingHours.trim() ? Number(workingHours) : undefined,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="mt-2 p-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-sunken)] space-y-4">
      <Field label="Location / area" htmlFor={`ce-location-${circuit.id}`}>
        <input
          id={`ce-location-${circuit.id}`}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          disabled={pending}
          className="field"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Metered light count" htmlFor={`ce-metered-${circuit.id}`}>
          <input
            id={`ce-metered-${circuit.id}`}
            type="number"
            value={meteredLightCount}
            onChange={(e) => setMeteredLightCount(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
        <Field label="Represented light count" htmlFor={`ce-represented-${circuit.id}`}>
          <input
            id={`ce-represented-${circuit.id}`}
            type="number"
            value={representedLightCount}
            onChange={(e) => setRepresentedLightCount(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
        <Field label="Wattage (per light)" htmlFor={`ce-wattage-${circuit.id}`}>
          <input
            id={`ce-wattage-${circuit.id}`}
            type="number"
            value={wattage}
            onChange={(e) => setWattage(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
        <Field label="Working hours / day" htmlFor={`ce-hours-${circuit.id}`}>
          <input
            id={`ce-hours-${circuit.id}`}
            type="number"
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={pending} className="btn-primary btn-sm">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className="btn-secondary btn-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
