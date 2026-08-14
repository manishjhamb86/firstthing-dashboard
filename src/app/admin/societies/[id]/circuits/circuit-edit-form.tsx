"use client";

import { useState, useTransition } from "react";
import { updateCircuitConfiguration } from "./actions";

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

  const fieldStyle = {
    borderColor: "var(--field-border)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  return (
    <div className="mt-2 p-3 rounded-[var(--r-md)] border border-[var(--border-subtle)] space-y-2">
      <label className="block text-xs">
        Location / area
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          disabled={pending}
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
          style={fieldStyle}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs">
          Metered light count
          <input
            type="number"
            value={meteredLightCount}
            onChange={(e) => setMeteredLightCount(e.target.value)}
            disabled={pending}
            className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
            style={fieldStyle}
          />
        </label>
        <label className="block text-xs">
          Represented light count
          <input
            type="number"
            value={representedLightCount}
            onChange={(e) => setRepresentedLightCount(e.target.value)}
            disabled={pending}
            className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
            style={fieldStyle}
          />
        </label>
        <label className="block text-xs">
          Wattage (per light)
          <input
            type="number"
            value={wattage}
            onChange={(e) => setWattage(e.target.value)}
            disabled={pending}
            className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
            style={fieldStyle}
          />
        </label>
        <label className="block text-xs">
          Working hours / day
          <input
            type="number"
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value)}
            disabled={pending}
            className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
            style={fieldStyle}
          />
        </label>
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={pending} className="btn-primary text-xs disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="text-xs text-[var(--text-subtle)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
