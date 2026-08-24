"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DeviationRootCause, DeviationReviewState } from "@prisma/client";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import { ROOT_CAUSES, billingConsequence, rootCauseMeta } from "@/lib/deviation-review";
import { assignDeviation, decideDeviation, recordFindings, reopenDeviation } from "../../deviation-actions";

/**
 * The review's own controls. Controlled inputs throughout — an uncontrolled
 * `required` field in a form that can fail and be resubmitted is a documented
 * bug class in this codebase (React 19 resets it, and native validation then
 * silently blocks the retry).
 *
 * The consequence of the classification is shown BEFORE it is committed. INV-03
 * exists because "fixable / not fixable" was not enough to bill on; a reviewer
 * choosing a cause should be able to read what the choice does to money without
 * having to know CON-01b by heart.
 */
export function DecisionPanel({
  reviewId,
  state,
  rootCause,
  decision,
  correctedAtNoCost,
  societyExplanation,
  findings,
  assignedToId,
  admins,
  coverageGap,
  coverageDays,
  daysInMonth,
}: {
  reviewId: string;
  state: DeviationReviewState;
  rootCause: DeviationRootCause | null;
  decision: string;
  correctedAtNoCost: boolean;
  societyExplanation: string;
  findings: string;
  assignedToId: string | null;
  admins: { id: string; name: string | null; email: string }[];
  coverageGap: boolean;
  coverageDays: number;
  daysInMonth: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [cause, setCause] = useState<DeviationRootCause | "">(rootCause ?? "");
  const [why, setWhy] = useState(decision);
  const [corrected, setCorrected] = useState(correctedAtNoCost);
  const [explanation, setExplanation] = useState(societyExplanation);
  const [note, setNote] = useState(findings);
  const [assignee, setAssignee] = useState(assignedToId ?? "");
  const [reopenReason, setReopenReason] = useState("");

  const meta = cause ? rootCauseMeta(cause) : null;
  const consequence = cause ? billingConsequence({ rootCause: cause, correctedAtNoCost: corrected }) : null;
  const closed = state === "closed";

  function run(fn: () => Promise<{ error?: string } | { ok: true }>) {
    setError(null);
    start(async () => {
      const r = await fn();
      if ("error" in r && r.error) setError(r.error);
      else router.refresh();
    });
  }

  if (closed) {
    return (
      <Card>
        <CardTitle>Reopen</CardTitle>
        <p className="text-sm text-[var(--text-muted)] mb-3">
          A closed review stays closed unless something new turns up. Reopening keeps the original
          classification and records why it was revisited.
        </p>
        <Field label="Why is this being reopened?" htmlFor="reopen-reason">
          <textarea
            id="reopen-reason"
            className="field"
            rows={2}
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
          />
        </Field>
        {error && <ErrorText>{error}</ErrorText>}
        <button
          type="button"
          className="btn-secondary btn-sm mt-3"
          disabled={pending}
          onClick={() => run(() => reopenDeviation({ id: reviewId, reason: reopenReason }))}
        >
          {pending ? "Reopening…" : "Reopen"}
        </button>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Classify this deviation</CardTitle>

      {/* FEAT-055-AC-5 — the cheapest resolution should be the easiest to
          reach. If the month did not report in full, say so here rather than
          leaving the reviewer to spot it in a stat tile. */}
      {coverageGap && (
        <p
          className="mb-4 rounded-[var(--r-sm)] border p-3 text-sm"
          style={{ borderColor: "var(--info-line)", background: "var(--info-bg)", color: "var(--info-fg)" }}
        >
          Only {coverageDays} of {daysInMonth} days reported. A shortfall measured on a partial
          month may be a data gap rather than consumption — that is resolvable from this screen,
          without sending anyone to site.
        </p>
      )}

      <Field label="Assign to" htmlFor="dev-assignee" hint="Optional — who is looking into it.">
        <div className="flex flex-wrap gap-2">
          <select
            id="dev-assignee"
            className="field field-auto"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Nobody yet</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={pending || !assignee}
            onClick={() => run(() => assignDeviation({ id: reviewId, toId: assignee }))}
          >
            Assign
          </button>
        </div>
      </Field>

      <Field label="What the investigation found" htmlFor="dev-findings">
        <textarea
          id="dev-findings"
          className="field"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Meter reads plausibly; two fittings dark on the east stair."
        />
      </Field>
      <button
        type="button"
        className="btn-ghost btn-sm mb-5"
        disabled={pending}
        onClick={() => run(() => recordFindings({ id: reviewId, findings: note }))}
      >
        Save findings
      </button>

      <Field label="Root cause" htmlFor="dev-cause" hint="INV-03 — a classification, not a flag.">
        <select
          id="dev-cause"
          className="field"
          value={cause}
          onChange={(e) => setCause(e.target.value as DeviationRootCause | "")}
        >
          <option value="">Choose a cause…</option>
          {ROOT_CAUSES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
              {r.countsAgainstGuarantee ? " — ours" : " — excluded (CON-01b)"}
            </option>
          ))}
        </select>
      </Field>

      {meta?.countsAgainstGuarantee && (
        <label className="flex items-start gap-2 text-sm mb-4">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={corrected}
            onChange={(e) => setCorrected(e.target.checked)}
          />
          <span>
            Corrected within a month at no cost to the society.
            <span className="block text-[var(--text-muted)]">
              CON-01b&apos;s own wording — corrected, there is nothing to adjust.
            </span>
          </span>
        </label>
      )}

      {meta && !meta.countsAgainstGuarantee && (
        <Field
          label="What the society is told"
          htmlFor="dev-explanation"
          hint="An excluded cause leaves their bill unchanged, so they are owed the reason (OQ-09)."
        >
          <textarea
            id="dev-explanation"
            className="field"
            rows={2}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        </Field>
      )}

      <Field label="Reasoning" htmlFor="dev-decision">
        <textarea
          id="dev-decision"
          className="field"
          rows={2}
          value={why}
          onChange={(e) => setWhy(e.target.value)}
        />
      </Field>

      {consequence && (
        <p
          className="mb-4 rounded-[var(--r-sm)] border p-3 text-sm"
          style={
            consequence.exposesNextMonth
              ? { borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }
              : { borderColor: "var(--ok-line)", background: "var(--ok-bg)", color: "var(--ok-fg)" }
          }
        >
          <strong className="block">{consequence.headline}</strong>
          {consequence.detail}
        </p>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex flex-wrap gap-2 mt-2">
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending}
          onClick={() =>
            run(() =>
              decideDeviation({
                id: reviewId,
                rootCause: cause === "" ? null : cause,
                decision: why,
                correctedAtNoCost: corrected,
                societyExplanation: explanation,
                close: false,
              }),
            )
          }
        >
          {pending ? "Saving…" : "Record the decision"}
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending}
          onClick={() =>
            run(() =>
              decideDeviation({
                id: reviewId,
                rootCause: cause === "" ? null : cause,
                decision: why,
                correctedAtNoCost: corrected,
                societyExplanation: explanation,
                close: true,
              }),
            )
          }
        >
          Record and close
        </button>
      </div>
    </Card>
  );
}
