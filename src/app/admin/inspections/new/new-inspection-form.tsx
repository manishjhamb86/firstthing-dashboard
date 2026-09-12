"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field } from "@/components/ui";
import { createInspection } from "../actions";
import type { InspectionSensorStatus } from "@prisma/client";

type Society = { id: string; name: string; location: string };

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

function defaultPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function defaultDatetimeLocal(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function NewInspectionForm({
  societies,
  initialSocietyId,
}: {
  societies: Society[];
  initialSocietyId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [societyId, setSocietyId] = useState(initialSocietyId ?? "");
  const [area, setArea] = useState("");
  const [period, setPeriod] = useState(defaultPeriod());
  const [inspectedAt, setInspectedAt] = useState(defaultDatetimeLocal());
  const [inspectorName, setInspectorName] = useState("");
  const [inspectorContact, setInspectorContact] = useState("");
  const [totalLightsChecked, setTotalLightsChecked] = useState("");
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
      const result = await createInspection({
        societyId,
        area,
        period,
        inspectedAt,
        inspectorName,
        inspectorContact,
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
      if ("error" in result) return setError(result.error);
      router.push(`/admin/inspections/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {error && <ErrorText>{error}</ErrorText>}

      <Card className="p-6">
        <p className="mb-4 font-semibold">Visit details</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Society" htmlFor="societyId">
            <select
              id="societyId"
              className="field"
              value={societyId}
              onChange={(e) => setSocietyId(e.target.value)}
              required
            >
              <option value="">Select a society…</option>
              {societies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.location}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Area" htmlFor="area" hint="Leave blank for a whole-society visit.">
            <input
              id="area"
              className="field"
              placeholder="e.g. Basement, Tower B"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </Field>
          <Field label="Month" htmlFor="period">
            <input
              id="period"
              type="month"
              className="field"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              required
            />
          </Field>
          <Field label="Inspection date & time" htmlFor="inspectedAt">
            <input
              id="inspectedAt"
              type="datetime-local"
              className="field"
              value={inspectedAt}
              onChange={(e) => setInspectedAt(e.target.value)}
              required
            />
          </Field>
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
          <Field label="Total lights checked" htmlFor="totalLightsChecked">
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
        <div className="mt-4">
          <Field label="Notes" htmlFor="notes">
            <textarea
              id="notes"
              className="field"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-semibold">Faulty or notable fixtures</p>
          <button type="button" className="btn-outline" onClick={addRow}>
            + Add fixture
          </button>
        </div>
        <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Only fixtures with a problem — a healthy light is never listed, exactly as on the paper
          checklist.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No faulty fixtures added yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Sr</th>
                  <th>Location</th>
                  <th>Sensor</th>
                  <th>Damage</th>
                  <th>Replace</th>
                  <th>Remarks</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.key}>
                    <td>{idx + 1}</td>
                    <td>
                      <input
                        className="field"
                        placeholder="e.g. Lift lobby 3rd floor"
                        value={row.location}
                        onChange={(e) => updateRow(row.key, { location: e.target.value })}
                        required
                      />
                    </td>
                    <td>
                      <select
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
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={row.physicalDamage}
                        onChange={(e) => updateRow(row.key, { physicalDamage: e.target.checked })}
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={row.actionReplace}
                        onChange={(e) => updateRow(row.key, { actionReplace: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        className="field"
                        value={row.remarks}
                        onChange={(e) => updateRow(row.key, { remarks: e.target.value })}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn-ghost" onClick={() => removeRow(row.key)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save inspection"}
        </button>
      </div>
    </form>
  );
}
