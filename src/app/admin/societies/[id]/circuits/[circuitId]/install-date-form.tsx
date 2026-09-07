"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { correctMeterInstallDate } from "./actions";

/**
 * Correcting the recorded install date after the meter step is done
 * (user-asked 2026-09-07, after a circuit was stranded by accepting the
 * step's "today" default).
 *
 * Closed behind a button for the same reason the benchmark override is: an
 * open date field on a step already marked done reads as something still
 * waiting to be filled in. Every refusal is the server's — this is a demo
 * -mode affordance, not a client-side gate.
 */
export function InstallDateForm({
  circuitId,
  current,
}: {
  circuitId: string;
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
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        Correct the install date
      </button>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Meter installed on"
          htmlFor="fix-installed-on"
          hint="Demo mode. The pre-install window moves to the day after; the ordering rules still hold."
        >
          <input
            id="fix-installed-on"
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
              const r = await correctMeterInstallDate(circuitId, value);
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
        <button type="button" className="btn-ghost mb-2" onClick={() => { setOpen(false); setError(null); }}>
          Cancel
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
