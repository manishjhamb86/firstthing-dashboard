"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveLead } from "../actions";

/**
 * Confirming a lead that was logged for somebody else.
 *
 * When the viewer IS the assignee this is an ordinary button. When they are
 * the creator or an operations account, they are confirming a meeting they
 * may not have been at — so it asks first, and names whose record it is
 * (user-asked 2026-08-24). The old version also swallowed the action's
 * refusal entirely: it awaited the result and threw it away, so a refused
 * click looked identical to a successful one.
 */
export function ApproveLeadButton({
  pipelineId,
  onBehalfOf,
}: {
  pipelineId: string;
  /** The assignee's name when this is an on-behalf act, else null. */
  onBehalfOf?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function approve() {
    if (
      onBehalfOf &&
      !window.confirm(
        `This lead is assigned to ${onBehalfOf}. Confirm it on their behalf?\n\n` +
          `Only do this if the meeting has actually happened — confirming it is what lets the deal advance.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await approveLead(pipelineId);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={approve} disabled={pending} className="btn-tone-ok btn-sm">
        {pending ? "Confirming…" : onBehalfOf ? `Confirm for ${onBehalfOf}` : "Confirm — this lead is mine"}
      </button>
      {error && (
        <span className="text-xs text-right max-w-[280px]" style={{ color: "var(--bad-fg)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
