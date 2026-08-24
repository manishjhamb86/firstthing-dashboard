"use client";

import { useState, useTransition } from "react";
import { submitProposal } from "../actions";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import { BackdateField } from "@/components/backdate-field";
import { usePathname, useRouter } from "next/navigation";

type Outcome = "agreed" | "declined" | "undecided";

// FEAT-002-AC-2: empty until an outcome is chosen — the form itself is the
// prompt, not a silently-optional field. Controlled inputs (React 19
// form-reset finding, see login-form.tsx).
export function ProposalForm({
  pipelineId,
  demoMode = false,
  hint,
}: {
  pipelineId: string;
  demoMode?: boolean;
  /** What the step is for — it replaces the callout that used to say so. */
  hint?: string;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [closedLostReason, setClosedLostReason] = useState("");
  const [decidedOn, setDecidedOn] = useState("");
  // Cancel CLOSES the step. It used to navigate away, which left the form
  // rendering unconditionally at the lead stage — so the box was back the
  // moment the reader returned to the deal ("why does this box come back even
  // when I cancelled it", 2026-08-24). The open step lives in the URL, so
  // dropping the parameter is the whole of "put it back how it was".
  const router = useRouter();
  const pathname = usePathname();
  const close = () => router.replace(pathname, { scroll: false });

  /**
   * Saving closes the step too. "Agreed" and "declined" move the deal on, so
   * the form would stop rendering anyway — but "undecided" leaves the deal at
   * the lead stage, which re-rendered the identical open form and read as a
   * click that did nothing (the shape reported on the lead-details form,
   * 2026-08-25). A refusal keeps it open, since that is the case with
   * something still to do here.
   */
  function submit() {
    setError(undefined);
    startTransition(async () => {
      const result = await submitProposal(pipelineId, {
        summary,
        outcome: outcome as Outcome,
        closedLostReason,
        decidedOn: decidedOn || undefined,
      });
      if (result?.error) setError(result.error);
      else close();
    });
  }
  // Only worth confirming if there is something to lose.
  const dirty = summary !== "" || outcome !== "" || closedLostReason !== "" || decidedOn !== "";

  return (
    <Card className="max-w-xl p-6">
      <CardTitle>Demo proposal</CardTitle>
      {hint && <p className="text-sm text-[var(--text-muted)] -mt-2 mb-4">{hint}</p>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
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
          {/* A way out that actually undoes coming here: the step closes and
              the deal page goes back to naming it as the next move. Confirms
              only when there is typed input to discard. */}
          <button
            type="button"
            className="btn-ghost"
            disabled={pending}
            onClick={() => {
              if (
                dirty &&
                !window.confirm(
                  "Discard this proposal decision and close the step? Nothing is saved.",
                )
              ) {
                return;
              }
              close();
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
