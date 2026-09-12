"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field } from "@/components/ui";
import { finalizeInspection } from "../actions";
import type { InspectionSensorStatus } from "@prisma/client";

const SENSOR_OPTIONS: { value: InspectionSensorStatus; label: string }[] = [
  { value: "ok", label: "OK" },
  { value: "full", label: "Full" },
  { value: "dim", label: "Dim" },
  { value: "off", label: "OFF" },
  { value: "flicker", label: "Flicker" },
];

type Row = {
  key: number;
  location: string;
  sensorStatus: InspectionSensorStatus;
  physicalDamage: boolean;
  actionReplace: boolean;
  remarks: string;
};

function emptyRow(key: number): Row {
  return { key, location: "", sensorStatus: "off", physicalDamage: false, actionReplace: false, remarks: "" };
}

/**
 * The visit's second act (2026-09-12) — the checklist and its two summary
 * figures, once the walk-through is actually done. Renders only while the
 * inspection is still a draft (`totalLightsChecked` null); a finalized one
 * shows the read-only summary instead.
 */
export function FinalizeInspectionForm({
  inspectionId,
  defaultTotal,
}: {
  inspectionId: string;
  defaultTotal: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [totalLightsChecked, setTotalLightsChecked] = useState(defaultTotal != null ? String(defaultTotal) : "");
  const [societyRepName, setSocietyRepName] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [nextKey, setNextKey] = useState(1);

  function addRow() {
    setRows((r) => [...r, emptyRow(nextKey)]);
    setNextKey((k) => k + 1);
  }
  function removeRow(key: number) {
    setRows((r) => r.filter((row) => row.key !== key));
  }
  function updateRow(key: number, patch: Partial<Row>) {
    setRows((r) => r.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await finalizeInspection({
        id: inspectionId,
        totalLightsChecked: Number(totalLightsChecked),
        societyRepName,
        notes,
        findings: rows.map((r) => ({
          location: r.location,
          sensorStatus: r.sensorStatus,
          physicalDamage: r.physicalDamage,
          actionReplace: r.actionReplace,
          remarks: r.remarks,
        })),
      });
      if (result.error) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <ErrorText>{error}</ErrorText>}

      <Card className="p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-semibold">Faulty or notable fixtures</p>
          <button type="button" className="btn-outline shrink-0" onClick={addRow}>
            + Add fixture
          </button>
        </div>
        <p className="mb-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Only fixtures with a problem — a healthy light is never listed, exactly as on the paper
          checklist.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No faulty fixtures added yet.
          </p>
        ) : (
          // A stacked card per fixture, not a table (2026-09-12, user-caught:
          // a six-column table forces horizontal scroll on a phone, and an
          // inspector is doing this walk on one). Every field keeps a real
          // label — placeholders alone disappear the moment they're filled.
          <div className="space-y-2.5">
            {rows.map((row, idx) => (
              <div key={row.key} className="rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="lbl">Fixture {idx + 1}</p>
                  <button type="button" className="text-[12.5px] font-semibold" style={{ color: "var(--bad-fg)" }} onClick={() => removeRow(row.key)}>
                    Remove
                  </button>
                </div>
                <div className="space-y-2.5">
                  <Field label="Location" htmlFor={`loc-${row.key}`}>
                    <input
                      id={`loc-${row.key}`}
                      className="field"
                      placeholder="e.g. Lift lobby 3rd floor"
                      value={row.location}
                      onChange={(e) => updateRow(row.key, { location: e.target.value })}
                      required
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="Sensor" htmlFor={`sensor-${row.key}`}>
                      <select
                        id={`sensor-${row.key}`}
                        className="field"
                        value={row.sensorStatus}
                        onChange={(e) => updateRow(row.key, { sensorStatus: e.target.value as InspectionSensorStatus })}
                      >
                        {SENSOR_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="flex flex-col justify-end gap-1.5 pb-0.5 text-[13px]">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={row.physicalDamage}
                          onChange={(e) => updateRow(row.key, { physicalDamage: e.target.checked })}
                        />
                        Physical damage
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={row.actionReplace}
                          onChange={(e) => updateRow(row.key, { actionReplace: e.target.checked })}
                        />
                        To be replaced
                      </label>
                    </div>
                  </div>
                  <Field label="Remarks" htmlFor={`remarks-${row.key}`}>
                    <input
                      id={`remarks-${row.key}`}
                      className="field"
                      value={row.remarks}
                      onChange={(e) => updateRow(row.key, { remarks: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <p className="mb-3 font-semibold">Finish the visit</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Total lights checked"
            htmlFor="totalLightsChecked"
            hint={defaultTotal != null ? `Defaulted from this circuit's represented count — change it if the walk found otherwise.` : undefined}
          >
            <input
              id="totalLightsChecked"
              type="number"
              min={0}
              className="field"
              value={totalLightsChecked}
              onChange={(e) => setTotalLightsChecked(e.target.value)}
              required
            />
          </Field>
          <Field
            label="Society representative"
            htmlFor="societyRepName"
            hint="Whoever signed on the society's behalf — leave blank if nobody was available."
          >
            <input
              id="societyRepName"
              className="field"
              value={societyRepName}
              onChange={(e) => setSocietyRepName(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Notes" htmlFor="notes">
            <textarea id="notes" className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save inspection"}
          </button>
        </div>
      </Card>
    </form>
  );
}
