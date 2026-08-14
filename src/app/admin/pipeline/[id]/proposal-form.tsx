"use client";

import { useActionState, useState } from "react";
import { submitProposal } from "../actions";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";

type Outcome = "agreed" | "declined" | "undecided";

async function action(_prev: string | undefined, formData: FormData) {
  const pipelineId = formData.get("pipelineId") as string;
  const outcome = formData.get("outcome") as Outcome;
  const result = await submitProposal(pipelineId, {
    summary: formData.get("summary") as string,
    outcome,
    closedLostReason: formData.get("closedLostReason") as string,
  });
  return result?.error;
}

// FEAT-002-AC-2: empty until an outcome is chosen — the form itself is the
// prompt, not a silently-optional field. Controlled inputs (React 19
// form-reset finding, see login-form.tsx).
export function ProposalForm({ pipelineId }: { pipelineId: string }) {
  const [error, formAction, pending] = useActionState(action, undefined);
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [closedLostReason, setClosedLostReason] = useState("");

  return (
    <Card className="max-w-xl p-6">
      <CardTitle>Demo proposal</CardTitle>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="pipelineId" value={pipelineId} />

        <Field label="What was pitched (optional)" htmlFor="summary">
          <textarea
            id="summary"
            name="summary"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="field"
          />
        </Field>

        <Field label="Demo request outcome" htmlFor="outcome">
          <select
            id="outcome"
            name="outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as Outcome)}
            required
            className="field"
          >
            <option value="" disabled>
              Choose an outcome…
            </option>
            <option value="agreed">Agreed — advance to survey</option>
            <option value="undecided">Undecided — still following up</option>
            <option value="declined">Declined — close as lost</option>
          </select>
        </Field>

        {outcome === "declined" && (
          <Field label="Reason" htmlFor="closedLostReason">
            <input
              id="closedLostReason"
              name="closedLostReason"
              required
              value={closedLostReason}
              onChange={(e) => setClosedLostReason(e.target.value)}
              className="field"
            />
          </Field>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save proposal"}
        </button>
      </form>
    </Card>
  );
}
