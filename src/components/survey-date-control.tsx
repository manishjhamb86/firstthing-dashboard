"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import { ErrorText, Field } from "@/components/ui";
import { correctSurveyDate } from "@/app/admin/pipeline/actions";

/**
 * When the site survey happened, and — for operations — a way to correct it
 * (2026-09-26). A deal typed up after the fact carries the day it was entered
 * as its survey date, and the meter install is ordered against it; this is
 * the route out of that refusal, stated next to it rather than on a page the
 * operator has to go and find.
 */
export function SurveyDateControl({
  pipelineId,
  surveyDate,
  label,
  canCorrect,
}: {
  pipelineId: string;
  /** ISO day. */
  surveyDate: string | null;
  label: string;
  canCorrect: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(surveyDate ?? "");
  const [reason, setReason] = useState("");
  const [moveEarlier, setMoveEarlier] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [earlier, setEarlier] = useState<string[] | null>(null);

  const save = () =>
    start(async () => {
      setError(null);
      const r = await correctSurveyDate({ pipelineId, on, reason, moveEarlier });
      if (r.error) {
        setError(r.error);
        if (r.needsEarlier) setEarlier(r.needsEarlier);
        return;
      }
      setOpen(false);
      setEarlier(null);
      setMoveEarlier(false);
      setReason("");
      router.refresh();
    });

  return (
    <div className="space-y-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--text-muted)]">
          {label[0].toUpperCase() + label.slice(1)} dated{" "}
          <span className="num font-medium text-[var(--text)]">{surveyDate ? formatDate(surveyDate) : "—"}</span>
        </span>
        {canCorrect && !open && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
            Correct the survey date
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-3 rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--border)" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="The day the survey happened" htmlFor={`sd-on-${pipelineId}`}>
              <input
                id={`sd-on-${pipelineId}`}
                type="date"
                className="field"
                value={on}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => { setOn(e.target.value); setEarlier(null); setMoveEarlier(false); }}
              />
            </Field>
            <Field label="Why it is being corrected" htmlFor={`sd-why-${pipelineId}`}>
              <input
                id={`sd-why-${pipelineId}`}
                className="field"
                value={reason}
                placeholder="e.g. entered after the fact; surveyed in October"
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>
          {earlier && (
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={moveEarlier} onChange={(e) => setMoveEarlier(e.target.checked)} />
              <span>
                Move them too — date {earlier.join(", ")} to the same day, so the deal&apos;s dates stay in order. The
                old dates are kept in the change log.
              </span>
            </label>
          )}
          {error && !(earlier && moveEarlier) && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pending || !on || !reason.trim()} onClick={save}>
              {pending ? "Saving…" : "Save the survey date"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); setError(null); setEarlier(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
