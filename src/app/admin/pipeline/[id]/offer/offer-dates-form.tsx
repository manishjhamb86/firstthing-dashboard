"use client";

import { useState, useTransition } from "react";
import { ErrorText, Field } from "@/components/ui";
import { correctOfferDates } from "./actions";

/**
 * Correct the issue and response dates on an offer that is past draft — for a
 * deal typed up long after it happened. Closed behind a button, like every
 * other correction control here: an open date field on a settled record reads
 * as something still waiting to be filled in.
 */
export function OfferDatesForm({
  pipelineId,
  offerId,
  issuedOn,
  respondedOn,
}: {
  pipelineId: string;
  offerId: string;
  /** YYYY-MM-DD */
  issuedOn: string;
  /** YYYY-MM-DD, or null when the offer has not been responded to */
  respondedOn: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState(issuedOn);
  const [responded, setResponded] = useState(respondedOn ?? "");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        Correct the dates
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Issued on" htmlFor="of-issued-on" hint="Not before the first meeting.">
          <input id="of-issued-on" type="date" className="field field-auto" value={issued} onChange={(e) => setIssued(e.target.value)} disabled={pending} />
        </Field>
        {respondedOn !== null && (
          <Field label="Responded on" htmlFor="of-responded-on" hint="Not before it was issued; not after the agreement was signed.">
            <input id="of-responded-on" type="date" className="field field-auto" value={responded} onChange={(e) => setResponded(e.target.value)} disabled={pending} />
          </Field>
        )}
        <button
          type="button"
          className="btn-primary mb-2"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(undefined);
              setSaved(false);
              const r = await correctOfferDates(pipelineId, offerId, { issuedOn: issued, respondedOn: respondedOn !== null ? responded : null });
              setError(r.error);
              if (!r.error) {
                setSaved(true);
                setOpen(false);
              }
            })
          }
        >
          {pending ? "Saving…" : "Save dates"}
        </button>
        <button type="button" className="btn-ghost mb-2" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {saved && <p className="text-sm" style={{ color: "var(--ok-fg)" }}>Dates corrected.</p>}
    </div>
  );
}
