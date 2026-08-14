"use client";

import { useActionState, useState } from "react";
import { submitProposal } from "../actions";

const fieldStyle = { borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" };

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
    <form
      action={formAction}
      className="space-y-4 max-w-xl bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-6"
    >
      <p className="text-sm font-semibold">Demo proposal</p>
      <input type="hidden" name="pipelineId" value={pipelineId} />

      <div>
        <label className="block text-sm font-medium mb-1">What was pitched (optional)</label>
        <textarea
          name="summary"
          rows={3}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Demo request outcome</label>
        <select
          name="outcome"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as Outcome)}
          required
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        >
          <option value="" disabled>
            Choose an outcome…
          </option>
          <option value="agreed">Agreed — advance to survey</option>
          <option value="undecided">Undecided — still following up</option>
          <option value="declined">Declined — close as lost</option>
        </select>
      </div>

      {outcome === "declined" && (
        <div>
          <label className="block text-sm font-medium mb-1">Reason</label>
          <input
            name="closedLostReason"
            required
            value={closedLostReason}
            onChange={(e) => setClosedLostReason(e.target.value)}
            className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
            style={fieldStyle}
          />
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save proposal"}
      </button>
    </form>
  );
}
