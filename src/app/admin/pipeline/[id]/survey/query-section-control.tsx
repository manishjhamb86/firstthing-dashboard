"use client";

import { useState, useTransition } from "react";
import { querySurveySection } from "./actions";

/** "Query this section" — closed until asked for; the note is what the surveyor reads on site. */
export function QuerySectionControl({
  pipelineId,
  surveyId,
  section,
  label,
}: {
  pipelineId: string;
  surveyId: string;
  section: "profile" | "inventory" | "circuits" | "pump_room";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" className="text-sm underline" onClick={() => setOpen(true)}>
        Query this section
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <label htmlFor={`q-${section}`} className="lbl">What needs checking in {label.toLowerCase()}?</label>
      <input id={`q-${section}`} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Tower C's staircase count looks low" />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await querySurveySection(pipelineId, surveyId, section, note);
              setError(r.error);
              if (!r.error) setOpen(false);
            })
          }
        >
          Reopen this section
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="text-sm" style={{ color: "var(--bad-fg)" }}>{error}</p>}
    </div>
  );
}
