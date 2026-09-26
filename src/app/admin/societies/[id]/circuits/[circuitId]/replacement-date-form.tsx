"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { recordDemoReplacement } from "./demo-step-actions";

/**
 * Correcting the recorded replacement date after the step is done
 * (user-asked 2026-09-16, "in case choose wrong date by mistake"). Closed
 * behind a button, like the install-date correction beside it: an open date
 * field on a done step reads as something still waiting to be filled in.
 * Every refusal is the server's.
 */
export function ReplacementDateForm({ demoId, current }: { demoId: string; current: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        Correct the replacement date
      </button>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Lights replaced on"
          htmlFor="fix-replaced-on"
          hint="That day stays excluded and the post-install window moves to the day after; the ordering rules still hold."
        >
          <input
            id="fix-replaced-on"
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
              const r = await recordDemoReplacement({ demoId, replacedOn: value });
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
