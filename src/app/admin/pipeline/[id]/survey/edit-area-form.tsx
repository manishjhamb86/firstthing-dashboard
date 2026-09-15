"use client";

import { useState, useTransition } from "react";
import { ErrorText } from "@/components/ui";
import { updateLightingInventoryArea } from "./actions";

/**
 * Correct an inventory row's count in place — the count changes at
 * installation (user-asked 2026-09-16). Closed until asked for, like every
 * other correction control here.
 */
export function EditAreaForm({
  id,
  siteSurveyId,
  count,
  method,
  note,
  circuitRepresented,
}: {
  id: string;
  siteSurveyId: string;
  count: number;
  method: "walked" | "estimated";
  note: string | null;
  /** What the candidate circuit for this light type represents today, if one exists (shown before any edit). */
  circuitRepresented: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(count));
  const [m, setM] = useState<"walked" | "estimated">(method);
  const [n, setN] = useState(note ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState<{ count: number; circuit: { from: number; to: number } | null; note?: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
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
          title={circuitRepresented != null ? `The circuit represents ${circuitRepresented.toLocaleString("en-IN")} today; it follows the corrected total.` : undefined}
          onClick={() => setOpen(true)}
        >
          Edit count
        </button>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input
        aria-label="Corrected light count"
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        className="field field-auto num w-24"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
      />
      <select aria-label="Corrected count method" className="field field-auto" value={m} onChange={(e) => setM(e.target.value as "walked" | "estimated")} disabled={pending}>
        <option value="walked">Walked</option>
        <option value="estimated">Estimated</option>
      </select>
      {m === "estimated" && (
        <input aria-label="Why the corrected count is estimated" className="field field-auto" placeholder="Why it was estimated" value={n} onChange={(e) => setN(e.target.value)} disabled={pending} />
      )}
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(undefined);
            const r = await updateLightingInventoryArea(id, siteSurveyId, { count: Number(value), method: m, note: n });
            setError(r.error);
            if (!r.error) {
              setSaved({ count: Number(value), circuit: r.circuit ?? null, note: r.circuitNote });
              setOpen(false);
            }
          })
        }
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
