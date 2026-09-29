"use client";

import { useState } from "react";
import { useOutbox } from "../../outbox-provider";
import { newItem, saveOnPhone } from "../../queue";

/**
 * Submit the survey (FEAT-010). The office's blockers are shown as it last
 * knew them; this phone's own unsent work is shown too, because the survey
 * is judged when everything before the submission has reached the office —
 * the queue sends in order, so the submission always goes last.
 */
export function SurveySubmit({ surveyId, label, blockers }: { pipelineId: string; surveyId: string; label: string; blockers: string[] }) {
  const outbox = useOutbox();
  const mine = outbox.items.filter((i) => (i.payload as { surveyId?: string } | null)?.surveyId === surveyId);
  const queued = mine.some((i) => i.kind === "survey.submit");
  const earlier = mine.filter((i) => i.kind !== "survey.submit").length;
  const [msg, setMsg] = useState<string | null>(null);

  if (queued) {
    return <p className="card p-3">Submission saved on this phone — it goes to the office after everything saved before it.</p>;
  }
  return (
    <section className="card p-4 space-y-3">
      <h2 className="font-semibold">Submit the survey</h2>
      {blockers.length > 0 ? (
        <div style={{ color: "var(--warn-fg)" }}>
          <p className="font-semibold">As the office last knew, not ready yet:</p>
          <ul className="list-disc pl-5">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[var(--text-muted)]">Once submitted, the survey is read-only for everyone on the team.</p>
      )}
      {earlier > 0 && <p className="text-[var(--text-muted)]">{earlier} change{earlier === 1 ? "" : "s"} on this phone will be sent first.</p>}
      <button
        type="button"
        className="btn-primary w-full min-h-[52px]"
        onClick={async () => {
          if (!confirm("Submit the survey? It becomes read-only for the whole team.")) return;
          const ok = await saveOnPhone(outbox, [newItem("survey.submit", { surveyId }, `Submit · ${label}`)]);
          setMsg(ok ? null : "Could not save on this phone. Try again.");
        }}
      >
        Submit the survey
      </button>
      {msg && <p role="alert" style={{ color: "var(--bad-fg)" }}>{msg}</p>}
    </section>
  );
}
