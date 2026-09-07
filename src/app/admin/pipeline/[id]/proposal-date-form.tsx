"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { correctProposalDate } from "../actions";

/**
 * Correcting the decision date on a deal already past its proposal — which
 * also moves the day the site survey opened, since one act set both.
 *
 * Closed behind a button, like every other correction control here: an open
 * date field on a settled record reads as something still waiting to be
 * filled in.
 */
export function ProposalDateForm({
  pipelineId,
  current,
}: {
  pipelineId: string;
  /** YYYY-MM-DD */
  current: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setOpen(true)}>
        Correct the decision date
      </button>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Decided on"
          htmlFor="fix-decided-on"
          hint="Demo mode. The site survey opened the same day, so it moves with this."
        >
          <input
            id="fix-decided-on"
            type="date"
            className="field field-auto"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <button
          type="button"
          className="btn-primary mb-2"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await correctProposalDate(pipelineId, value);
              if (r.error) setError(r.error);
              else {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Saving…" : "Save the date"}
        </button>
        <button
          type="button"
          className="btn-ghost mb-2"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
