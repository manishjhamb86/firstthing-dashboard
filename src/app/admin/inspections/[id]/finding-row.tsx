"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InspectionSensorStatus } from "@prisma/client";
import { ErrorText, Field, StatusChip } from "@/components/ui";
import { SENSOR_STATUS_META } from "@/lib/inspection";
import { removeInspectionFinding, saveInspectionFinding, addDraftFinding, removeDraftFinding } from "../actions";

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

type FindingValues = {
  location: string;
  sensorStatus: InspectionSensorStatus;
  physicalDamage: boolean;
  actionReplace: boolean;
  remarks: string;
};

/**
 * One fixture, editable in place (user's call 2026-09-16: "editing should be
 * both line-item wise and the whole form"). Closed by default — the
 * read-only line — with Edit / Remove; `id` null is the "add a fixture" row,
 * which opens straight onto the fields.
 *
 * `draft` (2026-10-06, user-asked) points the same component at the
 * draft-scoped actions instead of the finalized-editing ones, so adding a
 * fixture while the visit is still in progress saves the instant it's
 * added — and surfaces the duplicate-location nudge `addDraftFinding`
 * returns, which the finalized path has no equivalent of (a finalized
 * inspection's findings were all entered together, so there was nothing to
 * compare a new one against mid-walk).
 */
export function FindingRow({
  inspectionId,
  finding,
  canEdit,
  draft = false,
  onDone,
}: {
  inspectionId: string;
  finding: FindingRowData;
  canEdit: boolean;
  draft?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(finding.id === null);
  const [v, setV] = useState(finding);
  const [error, setError] = useState<string | undefined>();
  const [warning, setWarning] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const meta = SENSOR_STATUS_META[finding.sensorStatus];

  async function save(values: FindingValues): Promise<{ error?: string }> {
    if (draft) {
      if (finding.id) {
        // No per-row edit action exists for a draft yet — only add/remove —
        // so correcting a just-added row during the draft removes and
        // re-adds it, which is functionally identical and keeps one action
        // per concept rather than a third variant.
        const r1 = await removeDraftFinding(inspectionId, finding.id);
        if (r1.error) return r1;
        const r2 = await addDraftFinding(inspectionId, values);
        if ("error" in r2) return r2;
        setWarning(r2.warning);
        return {};
      }
      const r = await addDraftFinding(inspectionId, values);
      if ("error" in r) return r;
      setWarning(r.warning);
      return {};
    }
    return saveInspectionFinding(inspectionId, finding.id, values);
  }

  if (!open) {
    return (
      <div className="rounded-[var(--r-sm)] border px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 truncate text-[13.5px] font-medium">
            {finding.srNo}. {finding.location}
          </span>
          <span className="inline-flex shrink-0 items-center gap-2">
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
                      const r = await (draft ? removeDraftFinding(inspectionId, finding.id!) : removeInspectionFinding(inspectionId, finding.id!));
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
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {[finding.physicalDamage ? "Physical damage" : null, finding.actionReplace ? "To be replaced" : null, finding.remarks].filter(Boolean).join(" · ")}
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        {warning && (
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--warn-fg)" }}>
            {warning}
          </p>
        )}
      </div>
    );
  }

  // Every field of the fixture being worked on, visible together, with
  // nothing else competing for the screen (user-asked, 2026-10-07: "all
  // fields of each line item visible at all times when editing"). Sensor and
  // the two checkboxes each get their own full-width row rather than sharing
  // one wrapped `items-end` line — that alignment trick cost vertical space
  // on a narrow screen for no benefit, since nothing there needs to sit
  // beside anything else.
  return (
    <div className="rounded-[var(--r-md)] border p-3 space-y-2" style={{ borderColor: "var(--accent-line)" }}>
      <p className="lbl">{finding.id ? `Fixture ${finding.srNo}` : `New fixture — #${finding.srNo}`}</p>
      <Field label="Location" htmlFor={`fr-loc-${finding.id ?? "new"}`}>
        <input
          id={`fr-loc-${finding.id ?? "new"}`}
          className="field"
          value={v.location}
          onChange={(e) => setV({ ...v, location: e.target.value })}
          disabled={pending}
          placeholder="e.g. Lift lobby 3rd floor"
          autoFocus={finding.id === null}
        />
      </Field>
      <Field label="Sensor" htmlFor={`fr-sensor-${finding.id ?? "new"}`}>
        <select id={`fr-sensor-${finding.id ?? "new"}`} className="field" value={v.sensorStatus} onChange={(e) => setV({ ...v, sensorStatus: e.target.value as InspectionSensorStatus })} disabled={pending}>
          {SENSOR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.physicalDamage} onChange={(e) => setV({ ...v, physicalDamage: e.target.checked })} disabled={pending} /> Physical damage
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.actionReplace} onChange={(e) => setV({ ...v, actionReplace: e.target.checked })} disabled={pending} /> To be replaced
        </label>
      </div>
      <Field label="Remarks (optional)" htmlFor={`fr-rem-${finding.id ?? "new"}`}>
        <input id={`fr-rem-${finding.id ?? "new"}`} className="field" value={v.remarks} onChange={(e) => setV({ ...v, remarks: e.target.value })} disabled={pending} />
      </Field>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending || !v.location.trim()}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const r = await save({
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
          {pending ? "Saving…" : finding.id ? "Save" : "Save & next fixture"}
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

/**
 * The live add-fixture form.
 *
 * In `draft` mode it stays open and keeps rolling: saving one fixture
 * immediately remounts a fresh blank form for the next one (a new `key`
 * forces a clean `FindingRow` instance rather than fighting its own local
 * state back to empty) instead of collapsing to a button the person has to
 * find and tap again — "should move out of screen/focus only once that
 * fixture is done and user moves to next line item" (user-asked, 2026-10-07).
 * "Done adding for now" drops back to the plain button for whoever genuinely
 * wants to stop. The non-draft (editing an already-finalized inspection)
 * case is rarer and keeps the original tap-to-open shape.
 */
export function AddFindingRow({ inspectionId, nextSrNo, draft = false }: { inspectionId: string; nextSrNo: number; draft?: boolean }) {
  const [adding, setAdding] = useState(draft);
  const [srNo, setSrNo] = useState(nextSrNo);
  if (!adding) {
    return (
      <button type="button" className="btn-outline btn-sm" onClick={() => setAdding(true)}>
        + Add fixture
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <FindingRow
        key={srNo}
        inspectionId={inspectionId}
        canEdit
        draft={draft}
        onDone={() => (draft ? setSrNo((n) => n + 1) : setAdding(false))}
        finding={{ id: null, srNo, location: "", sensorStatus: "off", physicalDamage: false, actionReplace: false, remarks: "" }}
      />
      {draft && (
        <button type="button" className="text-[12.5px] font-semibold" style={{ color: "var(--text-subtle)" }} onClick={() => setAdding(false)}>
          Done adding for now
        </button>
      )}
    </div>
  );
}
