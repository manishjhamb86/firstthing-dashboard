"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { SearchSelect } from "@/components/search-select";
import { ClickToEdit } from "@/components/click-to-edit";
import { startInspection } from "../actions";
import { circuitLabelOf } from "@/lib/circuit-label";
import { formatDateTime, isoDateTimeLocal, monthLabel } from "@/lib/format-date";

type Society = { id: string; name: string; location: string };
type Circuit = {
  id: string;
  societyId: string;
  location: string | null;
  lightType: string;
  meteredLightCount: number;
  representedLightCount: number;
};

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function NewInspectionForm({
  societies,
  circuits,
  initialSocietyId,
}: {
  societies: Society[];
  circuits: Circuit[];
  initialSocietyId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [societyId, setSocietyId] = useState(initialSocietyId ?? "");
  const [circuitId, setCircuitId] = useState<string>("");
  const [area, setArea] = useState("");
  const [period, setPeriod] = useState(defaultPeriod());
  const [inspectedAt, setInspectedAt] = useState(isoDateTimeLocal(new Date()));
  const [inspectorName, setInspectorName] = useState("");
  const [inspectorContact, setInspectorContact] = useState("");

  const circuitSelectRef = useRef<HTMLSelectElement>(null);

  const societyOptions = societies.map((s) => ({ id: s.id, label: s.name, sublabel: s.location }));
  const societyCircuits = circuits.filter((c) => c.societyId === societyId);
  const selectedCircuit = societyCircuits.find((c) => c.id === circuitId) ?? null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await startInspection({
        societyId,
        circuitId: circuitId || null,
        area: selectedCircuit ? circuitLabelOf(selectedCircuit.location, selectedCircuit.lightType) : area,
        period,
        inspectedAt,
        inspectorName,
        inspectorContact,
      });
      if ("error" in result) return setError(result.error);
      router.push(`/admin/inspections/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-5">
      {error && <ErrorText>{error}</ErrorText>}

      <Field label="Society" htmlFor="societyId">
        <SearchSelect
          id="societyId"
          options={societyOptions}
          value={societyId || null}
          placeholder="Type a society name…"
          onCommit={(id) => {
            setSocietyId(id ?? "");
            setCircuitId("");
            if (id) requestAnimationFrame(() => circuitSelectRef.current?.focus());
          }}
        />
      </Field>

      <Field
        label="Circuit"
        htmlFor="circuitId"
        hint={
          selectedCircuit
            ? `Standing in for ${selectedCircuit.representedLightCount} lights across the society.`
            : "Pick the circuit this visit covers, or leave it as a whole-society check."
        }
      >
        <select
          id="circuitId"
          ref={circuitSelectRef}
          className="field"
          value={circuitId}
          disabled={!societyId}
          onChange={(e) => setCircuitId(e.target.value)}
        >
          <option value="">No specific circuit (whole society)</option>
          {societyCircuits.map((c) => (
            <option key={c.id} value={c.id}>
              {circuitLabelOf(c.location, c.lightType)} — {c.meteredLightCount} metered
            </option>
          ))}
        </select>
      </Field>

      {!circuitId && (
        <Field label="Area" htmlFor="area" hint="Leave blank for a whole-society visit.">
          <input
            id="area"
            className="field"
            placeholder="e.g. Basement, Tower B"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Month">
          <ClickToEdit display={monthLabel(period)}>
            <input
              type="month"
              className="field"
              autoFocus
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              required
            />
          </ClickToEdit>
        </Field>
        <Field label="Inspection date & time">
          <ClickToEdit display={formatDateTime(new Date(`${inspectedAt}:00Z`))}>
            <input
              type="datetime-local"
              className="field"
              autoFocus
              value={inspectedAt}
              onChange={(e) => setInspectedAt(e.target.value)}
              required
            />
          </ClickToEdit>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Inspector name" htmlFor="inspectorName">
          <input
            id="inspectorName"
            className="field"
            value={inspectorName}
            onChange={(e) => setInspectorName(e.target.value)}
            required
          />
        </Field>
        <Field label="Inspector contact" htmlFor="inspectorContact">
          <input
            id="inspectorContact"
            className="field"
            value={inspectorContact}
            onChange={(e) => setInspectorContact(e.target.value)}
            required
          />
        </Field>
      </div>

      <div>
        <button type="submit" className="btn-primary" disabled={pending || !societyId}>
          {pending ? "Starting…" : "Start inspection"}
        </button>
      </div>
    </form>
  );
}
