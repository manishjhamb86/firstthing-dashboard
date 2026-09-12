"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { SearchSelect } from "@/components/search-select";
import { ClickToEdit } from "@/components/click-to-edit";
import { startInspection } from "../actions";
import { circuitLabelOf } from "@/lib/circuit-label";
import { formatDateTime, monthLabel } from "@/lib/format-date";

type Society = { id: string; name: string; location: string };
type Circuit = {
  id: string;
  societyId: string;
  location: string | null;
  lightType: string;
  meteredLightCount: number;
  representedLightCount: number;
};

export function NewInspectionForm({
  societies,
  circuits,
  initialSocietyId,
  actorLabel,
  initialPeriod,
  initialInspectedAt,
}: {
  societies: Society[];
  circuits: Circuit[];
  initialSocietyId?: string;
  /** Who this visit is recorded against — the signed-in account, never
   *  retyped (2026-09-12, user-specified: "its the user who has logged in"). */
  actorLabel: string;
  /** Both computed ONCE on the server and passed down rather than this
   *  Client Component calling `new Date()` for its own initial state — the
   *  two independently-computed "now"s disagreed the moment a request
   *  straddled a minute boundary, which React reports as a real hydration
   *  mismatch (found by the e2e, not by eye). */
  initialPeriod: string;
  initialInspectedAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [societyId, setSocietyId] = useState(initialSocietyId ?? "");
  const [circuitId, setCircuitId] = useState<string>("");
  const [period, setPeriod] = useState(initialPeriod);
  const [inspectedAt, setInspectedAt] = useState(initialInspectedAt);

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
        // No specific circuit → a whole-society check, area left empty; the
        // circuit already states its own location, so there is nothing left
        // to type either way (2026-09-12).
        area: selectedCircuit ? circuitLabelOf(selectedCircuit.location, selectedCircuit.lightType) : "",
        period,
        inspectedAt,
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

      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        Recorded as the inspector — <span className="font-medium">{actorLabel}</span>.
      </p>

      <div>
        <button type="submit" className="btn-primary" disabled={pending || !societyId}>
          {pending ? "Starting…" : "Start inspection"}
        </button>
      </div>
    </form>
  );
}
