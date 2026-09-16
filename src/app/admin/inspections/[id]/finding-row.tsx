"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InspectionSensorStatus } from "@prisma/client";
import { ErrorText, Field, StatusChip } from "@/components/ui";
import { SENSOR_STATUS_META } from "@/lib/inspection";
import { removeInspectionFinding, saveInspectionFinding } from "../actions";

const SENSOR_OPTIONS: { value: InspectionSensorStatus; label: string }[] = [
  { value: "ok", label: "OK" },
  { value: "full", label: "Full" },
  { value: "dim", label: "Dim" },
  { value: "off", label: "OFF" },
  { value: "flicker", label: "Flicker" },
];

export type FindingRowData = {
  id: string | null;
  srNo: number;
  location: string;
  sensorStatus: InspectionSensorStatus;
  physicalDamage: boolean;
  actionReplace: boolean;
  remarks: string;
};

/**
 * One fixture on a finalised inspection, editable in place (user's call
 * 2026-09-16: "editing should be both line-item wise and the whole form").
 * Closed by default — the read-only line — with Edit / Remove; `id` null is
 * the "add a fixture" row, which opens straight onto the fields.
 */
export function FindingRow({ inspectionId, finding, canEdit, onDone }: { inspectionId: string; finding: FindingRowData; canEdit: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(finding.id === null);
  const [v, setV] = useState(finding);
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const meta = SENSOR_STATUS_META[finding.sensorStatus];

  if (!open) {
    return (
      <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 truncate font-medium">
            {finding.srNo}. {finding.location}
          </span>
          <span className="inline-flex items-center gap-2">
            <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
            {canEdit && (
              <>
                <button type="button" className="text-[12.5px] font-semibold" style={{ color: "var(--accent)" }} onClick={() => setOpen(true)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="text-[12.5px] font-semibold"
                  style={{ color: "var(--bad-fg)" }}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await removeInspectionFinding(inspectionId, finding.id!);
                      setError(r.error);
                      if (!r.error) router.refresh();
                    })
                  }
                >
                  Remove
                </button>
              </>
            )}
          </span>
        </div>
        {(finding.physicalDamage || finding.actionReplace || finding.remarks) && (
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {[finding.physicalDamage ? "Physical damage" : null, finding.actionReplace ? "To be replaced" : null, finding.remarks].filter(Boolean).join(" · ")}
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--r-md)] border p-3 space-y-2.5" style={{ borderColor: "var(--accent-line)" }}>
      <p className="lbl">{finding.id ? `Fixture ${finding.srNo}` : "New fixture"}</p>
      <Field label="Location" htmlFor={`fr-loc-${finding.id ?? "new"}`}>
        <input id={`fr-loc-${finding.id ?? "new"}`} className="field" value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} disabled={pending} placeholder="e.g. Lift lobby 3rd floor" />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Sensor" htmlFor={`fr-sensor-${finding.id ?? "new"}`}>
          <select id={`fr-sensor-${finding.id ?? "new"}`} className="field field-auto" value={v.sensorStatus} onChange={(e) => setV({ ...v, sensorStatus: e.target.value as InspectionSensorStatus })} disabled={pending}>
            {SENSOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.physicalDamage} onChange={(e) => setV({ ...v, physicalDamage: e.target.checked })} disabled={pending} /> Physical damage
        </label>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.actionReplace} onChange={(e) => setV({ ...v, actionReplace: e.target.checked })} disabled={pending} /> To be replaced
        </label>
      </div>
      <Field label="Remarks" htmlFor={`fr-rem-${finding.id ?? "new"}`}>
        <input id={`fr-rem-${finding.id ?? "new"}`} className="field" value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} disabled={pending} />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const r = await saveInspectionFinding(inspectionId, finding.id, {
                location: v.location,
                sensorStatus: v.sensorStatus,
                physicalDamage: v.physicalDamage,
                actionReplace: v.actionReplace,
                remarks: v.remarks,
              });
              setError(r.error);
              if (!r.error) {
                setOpen(false);
                onDone?.();
                router.refresh();
              }
            })
          }
        >
          {pending ? "Saving…" : finding.id ? "Save" : "Add fixture"}
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={pending}
          onClick={() => {
            setV(finding);
            setOpen(false);
            onDone?.();
          }}
        >
          Cancel
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

/** The "add a fixture" control beneath the list: a button that opens a new row. */
export function AddFindingRow({ inspectionId, nextSrNo }: { inspectionId: string; nextSrNo: number }) {
  const [adding, setAdding] = useState(false);
  if (!adding) {
    return (
      <button type="button" className="btn-outline btn-sm" onClick={() => setAdding(true)}>
        + Add fixture
      </button>
    );
  }
  return (
    <FindingRow
      inspectionId={inspectionId}
      canEdit
      onDone={() => setAdding(false)}
      finding={{ id: null, srNo: nextSrNo, location: "", sensorStatus: "off", physicalDamage: false, actionReplace: false, remarks: "" }}
    />
  );
}
