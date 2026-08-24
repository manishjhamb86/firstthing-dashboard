"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignSurveyOwner } from "../actions";

/**
 * Handing the field work to a named engineer or inspector.
 *
 * This was an invisible act: the deal went from "proposal agreed" straight to
 * a blue "Run the site survey · Continue" shown to whoever happened to be
 * looking, usually sales, whose task it is not (user-reported 2026-08-24).
 * The list only offers accounts whose team actually does surveys; the action
 * re-checks that, because a picker is not a gate.
 */
export function AssignSurvey({
  pipelineId,
  current,
  candidates,
  compact,
}: {
  pipelineId: string;
  current: { id: string; name: string } | null;
  candidates: { id: string; name: string; team: string }[];
  /** Rendered inside a callout rather than as its own card. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState(current?.id ?? "");

  function save(toId: string | null) {
    setError(null);
    start(async () => {
      const r = await assignSurveyOwner({ pipelineId, toId });
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm">
        No engineering or inspection account exists yet — create one under Admin users before the
        survey can be handed to anybody.
      </p>
    );
  }

  return (
    <div className={compact ? "flex flex-wrap items-center gap-2" : "space-y-2"}>
      <select
        aria-label="Assign the survey to"
        className="field field-auto"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">Nobody yet</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} · {c.team}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={pending || choice === (current?.id ?? "")}
        onClick={() => save(choice === "" ? null : choice)}
      >
        {pending ? "Saving…" : current ? "Reassign" : "Assign"}
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--bad-fg)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
