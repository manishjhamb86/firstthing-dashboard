"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ServiceLine } from "@prisma/client";
import { runCalculation } from "./actions";

/**
 * FEAT-048 — triggering the run. Deliberately a plain onClick inside a
 * transition rather than useActionState in a handler: that pattern is
 * already recorded in this codebase as a bug class (it fires outside a
 * transition and the click's effect is unreliable).
 *
 * A re-run is a real act with a consequence — it supersedes the version
 * currently on screen — so it confirms first.
 */
export function RunMonthButton({
  societyId,
  serviceLine,
  period,
  rerun,
}: {
  societyId: string;
  serviceLine: ServiceLine;
  period: string;
  rerun: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={(e) => {
          // The row is a link; running the month is not navigating to it.
          e.preventDefault();
          e.stopPropagation();
          if (
            rerun &&
            !window.confirm(
              `Re-run ${period}? The figures on screen are superseded by a new version — both are kept (GATE-02).`,
            )
          ) {
            return;
          }
          setError(null);
          start(async () => {
            const result = await runCalculation({ societyId, serviceLine, period });
            if ("error" in result) setError(result.error);
            else if ("held" in result) router.push(`/admin/billing/${result.held.calculationId}`);
            else router.push(`/admin/billing/${result.calculated.calculationId}`);
          });
        }}
      >
        {pending ? "Running…" : rerun ? "Re-run" : "Run the month"}
      </button>
      {error && (
        <span className="text-xs text-right max-w-[280px]" style={{ color: "var(--bad-fg)" }}>
          {error}
        </span>
      )}
    </span>
  );
}
