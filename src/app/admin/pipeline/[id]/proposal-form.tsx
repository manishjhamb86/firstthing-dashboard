"use client";

import { useActionState, useState } from "react";
import { submitProposal } from "../actions";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import { BackdateField } from "@/components/backdate-field";
import { useGoBack } from "@/components/back-button";

type Outcome = "agreed" | "declined" | "undecided";

async function action(_prev: string | undefined, formData: FormData) {
  const pipelineId = formData.get("pipelineId") as string;
  const outcome = formData.get("outcome") as Outcome;
  const result = await submitProposal(pipelineId, {
    summary: formData.get("summary") as string,
    outcome,
    closedLostReason: formData.get("closedLostReason") as string,
    decidedOn: (formData.get("decidedOn") as string) || undefined,
  });
  return result?.error;
}

// FEAT-002-AC-2: empty until an outcome is chosen — the form itself is the
// prompt, not a silently-optional field. Controlled inputs (React 19
// form-reset finding, see login-form.tsx).
export function ProposalForm({
  pipelineId,
  demoMode = false,
}: {
  pipelineId: string;
  demoMode?: boolean;
}) {
  const [error, formAction, pending] = useActionState(action, undefined);
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [closedLostReason, setClosedLostReason] = useState("");
  const [decidedOn, setDecidedOn] = useState("");
  // The list, not this page: the form IS this page's step, so falling back
  // to the deal would be cancelling into the thing being cancelled. Only used
  // when there is no history of ours to pop — a deep link, or a fresh tab.
  const goBack = useGoBack("/admin/pipeline");
  // Only worth confirming if there is something to lose.
  const dirty = summary !== "" || outcome !== "" || closedLostReason !== "" || decidedOn !== "";

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

        {demoMode && (
          <BackdateField
            id="decidedOn"
            name="decidedOn"
            label="Decision made on"
            hint="Leave blank for today. The survey opens on this date, so it cannot precede the meeting or the lead."
            value={decidedOn}
            onChange={setDecidedOn}
            disabled={pending}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Save proposal"}
        </button>
        {/* A way out. The form is the whole step, so leaving it should put
            the operator back where they were rather than on a screen with
            nothing to do (user-asked 2026-08-24). It confirms only when
            there is typed input to discard. */}
        <button
          type="button"
          className="btn-ghost"
          disabled={pending}
          onClick={() => {
            if (
              dirty &&
              !window.confirm("Discard this proposal decision and go back? Nothing is saved.")
            ) {
              return;
            }
            goBack();
          }}
        >
          Cancel
        </button>
        </div>
      </form>
    </Card>
  );
}
