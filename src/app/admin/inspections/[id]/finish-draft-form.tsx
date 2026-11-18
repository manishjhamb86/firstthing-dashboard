"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field } from "@/components/ui";
import { finalizeInspection } from "../actions";

/**
 * The draft's own close-out (2026-10-06, user-asked) — the moment someone
 * clicks "finished adding fixtures": the total and the society rep are
 * entered here, same as before, but there is no findings array to submit
 * any more — every fixture already saved itself the instant it was added
 * (finding-row.tsx's draft mode). Kept separate from FinalizeInspectionForm,
 * which still does the full batch replace for correcting an ALREADY
 * finalized inspection via `?edit=1`.
 */
export function FinishDraftForm({ inspectionId, defaultTotal, findingsSoFar }: { inspectionId: string; defaultTotal: number | null; findingsSoFar: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [totalLightsChecked, setTotalLightsChecked] = useState(defaultTotal != null ? String(defaultTotal) : "");
  const [societyRepName, setSocietyRepName] = useState("");
  const [notes, setNotes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await finalizeInspection({
        id: inspectionId,
        totalLightsChecked: Number(totalLightsChecked),
        societyRepName,
        notes,
        evidencePhotoKey: null,
      });
      if (result.error) return setError(result.error);
      // The report exists from this moment: land on the visit's own page with
      // its download first and the signed-copy upload after it.
      router.push(`/admin/inspections/${inspectionId}?done=1`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit}>
      <Card className="p-4 sm:p-6">
        <p className="mb-3 font-semibold">Finish the visit</p>
        <p className="mb-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {findingsSoFar} fixture{findingsSoFar === 1 ? "" : "s"} logged above. Once this is saved the checklist is
          locked — correct a fixture from the edit screen after this instead. The report PDF is generated the moment it is saved.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Total lights checked"
            htmlFor="totalLightsChecked"
            hint={defaultTotal != null ? "Defaulted from this circuit's represented count — change it if the walk found otherwise." : undefined}
          >
            <input
              id="totalLightsChecked"
              type="number"
              min={0}
              className="field"
              value={totalLightsChecked}
              onChange={(e) => setTotalLightsChecked(e.target.value)}
              required
              disabled={pending}
            />
          </Field>
          <Field label="Society representative" htmlFor="societyRepName" hint="Whoever signed on the society's behalf — leave blank if nobody was available.">
            <input id="societyRepName" className="field" value={societyRepName} onChange={(e) => setSocietyRepName(e.target.value)} disabled={pending} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Notes" htmlFor="notes">
            <textarea id="notes" className="field" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} />
          </Field>
        </div>
        {error && (
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        <div className="mt-3">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Finished — save the visit"}
          </button>
        </div>
      </Card>
    </form>
  );
}
