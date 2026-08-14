"use client";

import { useState, useTransition } from "react";
import { ErrorText, Field } from "@/components/ui";
import { issueOffer, recordOfferOutcome } from "./actions";

export function IssueOfferButton({ pipelineId, offerId }: { pipelineId: string; offerId: string }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await issueOffer(pipelineId, offerId))?.error))}
      >
        {pending ? "Issuing…" : "Issue to the society"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

// FEAT-028 — the back-office path for an outcome relayed by phone. The
// society's own acceptance goes through the portal and GATE-04 instead.
export function RecordOutcomeControls({ pipelineId, offerId }: { pipelineId: string; offerId: string }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function record(outcome: "accepted" | "rejected") {
    startTransition(async () => {
      const r = await recordOfferOutcome(pipelineId, offerId, outcome, note);
      setError(r?.error);
      if (!r?.error) setNote("");
    });
  }

  return (
    <div className="space-y-3">
      <Field
        label="Response relayed by the society"
        htmlFor={`oo-note-${offerId}`}
        hint="Required for a rejection — it is usually followed by a counter."
      >
        <input
          id={`oo-note-${offerId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={pending}
          placeholder="Secretary confirmed on a call."
          className="field"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => record("accepted")}>
          Record acceptance
        </button>
        <button type="button" className="btn-danger btn-sm" disabled={pending} onClick={() => record("rejected")}>
          Record rejection
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
