"use client";

import { useState, useTransition } from "react";
import { Card, ErrorText, Field } from "@/components/ui";
import { createDeviceType, setDeviceTypeActive, setReplacementOptions } from "./actions";

// Controlled inputs throughout — this repo's standing rule since the React 19
// form-reset bug: an uncontrolled required field silently breaks retry.

export function NewDeviceTypeForm({ role }: { role: "original" | "replacement" }) {
  const [name, setName] = useState("");
  const [wattage, setWattage] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const w = wattage.trim() === "" ? null : Number(wattage);
      const result = await createDeviceType({ name, role, defaultWattage: w });
      if ("error" in result) {
        setError(result.error);
      } else {
        setError(undefined);
        setName("");
        setWattage("");
      }
    });
  }

  const idPrefix = `new-${role}`;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label={role === "original" ? "Add a device found on circuits" : "Add a replacement device"} htmlFor={`${idPrefix}-name`}>
        <input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={role === "original" ? "20W tube light" : "20W motion-enabled batten"}
          disabled={pending}
          className="field"
        />
      </Field>
      <Field label="Default W" htmlFor={`${idPrefix}-w`} hint="Optional">
        <input
          id={`${idPrefix}-w`}
          type="number"
          min={1}
          max={2000}
          value={wattage}
          onChange={(e) => setWattage(e.target.value)}
          disabled={pending}
          className="field field-auto w-24"
        />
      </Field>
      <button type="button" onClick={submit} disabled={pending || name.trim().length < 2} className="btn-secondary">
        Add
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await setDeviceTypeActive(id, !active);
            setError("error" in r ? r.error : undefined);
          })
        }
        className="btn-ghost text-xs"
      >
        {active ? "Deactivate" : "Reactivate"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}

export function ReplacementMappingEditor({
  originalTypeId,
  originalName,
  selectedIds,
  replacements,
}: {
  originalTypeId: string;
  originalName: string;
  selectedIds: string[];
  replacements: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    selected.size !== selectedIds.length || selectedIds.some((id) => !selected.has(id));

  function toggle(id: string) {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const r = await setReplacementOptions(originalTypeId, [...selected]);
      if ("error" in r) {
        setError(r.error);
        setSaved(false);
      } else {
        setError(undefined);
        setSaved(true);
      }
    });
  }

  return (
    <Card className="p-4 space-y-3">
      <p className="text-sm font-medium">{originalName}</p>
      {replacements.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Add a replacement device first — there is nothing to map yet.</p>
      ) : (
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {replacements.map((r) => (
            <label key={r.id} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                disabled={pending}
              />
              {r.name}
            </label>
          ))}
        </div>
      )}
      {selected.size > 5 && (
        <ErrorText>At most 5 compatible replacements — pick the ones actually used.</ErrorText>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty || selected.size > 5}
          className="btn-secondary"
        >
          Save mapping
        </button>
        {saved && !dirty && <span className="text-sm text-[var(--text-muted)]">Saved</span>}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    </Card>
  );
}
