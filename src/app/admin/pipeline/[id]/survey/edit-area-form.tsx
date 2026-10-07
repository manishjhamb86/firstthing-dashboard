"use client";

import { useState, useTransition } from "react";
import { ErrorText, Field } from "@/components/ui";
import { Modal } from "@/components/modal";
import { updateLightingInventoryArea } from "./actions";

/**
 * Correct an inventory row in place — the count changes at installation
 * (user-asked 2026-09-16), and the area/light-type names themselves can be
 * mistyped or miscased the same way a candidate circuit's own name can
 * (2026-10-08, user-asked, same report). A dialog, not an inline row form —
 * this codebase's own standing rule ("a form that has to fit inside a table
 * row will always lose", modal.tsx) applies more now than when this only
 * edited a count: five fields in a narrow trailing cell is exactly that
 * failure. Closed until asked for, like every other correction control here.
 */
export function EditAreaForm({
  id,
  siteSurveyId,
  area,
  lightType,
  count,
  method,
  note,
  circuitRepresented,
  circuitDemoLights = 0,
}: {
  id: string;
  siteSurveyId: string;
  area: string;
  lightType: string;
  count: number;
  method: "walked" | "records" | "estimated";
  note: string | null;
  /** What the candidate circuit for this light type represents today, if one exists (shown before any edit). */
  circuitRepresented: number | null;
  /** The demo lights on that circuit — the inventory total includes them, the full installation does not. */
  circuitDemoLights?: number;
}) {
  const [open, setOpen] = useState(false);
  const [areaValue, setAreaValue] = useState(area);
  const [lightTypeValue, setLightTypeValue] = useState(lightType);
  const [value, setValue] = useState(String(count));
  const [m, setM] = useState<"walked" | "records" | "estimated">(method);
  const [n, setN] = useState(note ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState<{ count: number; circuit: { from: number; to: number } | null; note?: string } | null>(null);
  const [pending, start] = useTransition();

  function openIt() {
    setAreaValue(area);
    setLightTypeValue(lightType);
    setValue(String(count));
    setM(method);
    setN(note ?? "");
    setError(undefined);
    setOpen(true);
  }

  function submit() {
    start(async () => {
      setError(undefined);
      const r = await updateLightingInventoryArea(id, siteSurveyId, {
        area: areaValue,
        lightType: lightTypeValue,
        count: Number(value),
        method: m,
        note: n,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setSaved({ count: Number(value), circuit: r.circuit ?? null, note: r.circuitNote });
      setOpen(false);
    });
  }

  return (
    <>
      <span className="inline-flex flex-wrap items-center justify-end gap-2">
        {saved?.circuit && (
          <span className="text-xs" style={{ color: "var(--ok-fg)" }}>
            Circuit now represents {saved.circuit.to.toLocaleString("en-IN")} (was {saved.circuit.from.toLocaleString("en-IN")}) — regenerate the demo report to re-price on it.
          </span>
        )}
        {saved?.note && (
          <span className="text-xs" style={{ color: "var(--warn-fg)" }}>
            {saved.note}
          </span>
        )}
        <button
          type="button"
          className="text-xs font-semibold"
          style={{ color: "var(--accent)" }}
          title={circuitRepresented != null ? `The circuit's full installation is ${circuitRepresented.toLocaleString("en-IN")} (+ ${circuitDemoLights.toLocaleString("en-IN")} demo lights) today; it follows the corrected total, less the demo lights.` : undefined}
          onClick={openIt}
        >
          Edit
        </button>
      </span>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit this inventory row"
        footer={
          <>
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={submit}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Area" htmlFor={`ea-area-${id}`}>
            <input id={`ea-area-${id}`} className="field" value={areaValue} onChange={(e) => setAreaValue(e.target.value)} disabled={pending} />
          </Field>
          <Field label="Light type" htmlFor={`ea-lighttype-${id}`} hint="Correcting this re-matches the row against whichever candidate circuit now shares the name.">
            <input id={`ea-lighttype-${id}`} className="field" value={lightTypeValue} onChange={(e) => setLightTypeValue(e.target.value)} disabled={pending} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Count" htmlFor={`ea-count-${id}`}>
              <input
                id={`ea-count-${id}`}
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                className="field num"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={pending}
              />
            </Field>
            <Field label="Method" htmlFor={`ea-method-${id}`}>
              <select
                id={`ea-method-${id}`}
                className="field"
                value={m}
                onChange={(e) => setM(e.target.value as "walked" | "records" | "estimated")}
                disabled={pending}
              >
                <option value="walked">Walked</option>
                <option value="records">Society records</option>
                <option value="estimated">Estimated</option>
              </select>
            </Field>
          </div>
          {m === "estimated" && (
            <Field label="Why it was estimated" htmlFor={`ea-note-${id}`}>
              <input id={`ea-note-${id}`} className="field" value={n} onChange={(e) => setN(e.target.value)} disabled={pending} />
            </Field>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}
