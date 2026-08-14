"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import {
  acceptAnomaly,
  acceptLowCoverage,
  excludeAnomalyDay,
  resolveInformational,
  sendBackAnomaly,
} from "../anomaly-actions";

type Action = "accept" | "exclude" | "send_back";

const PROMPT: Record<Action, string> = {
  accept: "Why are these readings correct?",
  exclude: "Why is this day being excluded?",
  send_back: "What needs re-uploading?",
};

/**
 * Two shapes in one component: the per-row resolve control, and the
 * per-circuit footer (bulk-resolve and the CON-12 coverage acceptance).
 *
 * Every path here demands a reason before it will submit, because every one
 * of them changes what gets billed. The `useTransition` + plain onClick shape
 * is this repo's established one — deliberately not `useActionState` inside
 * an onClick, which is already recorded here as a bug class.
 */
export function AnomalyControls(props: {
  anomalyId?: string;
  hasDay?: boolean;
  footer?: boolean;
  circuitId?: string;
  period?: string;
  informationalCount?: number;
  showCoverageAccept?: boolean;
  coverageLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<Action | "coverage" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string; warning?: string | null } | void>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) return setError(res.error);
      if (res && "warning" in res && res.warning) setWarning(res.warning);
      setOpen(null);
      setReason("");
      router.refresh();
    });
  }

  if (props.footer) {
    return (
      <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap gap-2">
          {(props.informationalCount ?? 0) > 0 && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pending}
              onClick={() =>
                run(() => resolveInformational(props.circuitId as string, props.period as string))
              }
            >
              Resolve {props.informationalCount} informational flag
              {props.informationalCount === 1 ? "" : "s"}
            </button>
          )}
          {props.showCoverageAccept && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pending}
              onClick={() => setOpen(open === "coverage" ? null : "coverage")}
            >
              Accept low coverage ({props.coverageLabel})
            </button>
          )}
        </div>

        {open === "coverage" && (
          <div className="mt-3 max-w-xl space-y-3">
            <p className="text-sm" style={{ color: "var(--warn-fg)" }}>
              This bills {props.coverageLabel} of data as if it represented the month. The society
              can ask why — this reason is the answer.
            </p>
            <Field label="Reason" htmlFor={`cov-${props.circuitId}`}>
              <textarea
                id={`cov-${props.circuitId}`}
                className="field"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(() =>
                  acceptLowCoverage(props.circuitId as string, props.period as string, reason),
                )
              }
            >
              Accept and allow billing
            </button>
          </div>
        )}

        {warning && (
          <p className="mt-3 text-sm" style={{ color: "var(--warn-fg)" }}>
            {warning}
          </p>
        )}
        {error && (
          <div className="mt-3">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
      </div>
    );
  }

  const id = props.anomalyId as string;

  return (
    <div className="text-right">
      <div className="flex flex-wrap justify-end gap-1">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen("accept")}>
          Accept
        </button>
        {props.hasDay && (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen("exclude")}>
            Exclude
          </button>
        )}
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen("send_back")}>
          Send back
        </button>
      </div>

      {open && open !== "coverage" && (
        <div className="mt-2 space-y-2 text-left">
          <Field label={PROMPT[open]} htmlFor={`r-${id}`}>
            <textarea
              id={`r-${id}`}
              className="field"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(() =>
                  open === "accept"
                    ? acceptAnomaly(id, reason)
                    : open === "exclude"
                      ? excludeAnomalyDay(id, reason)
                      : sendBackAnomaly(id, reason),
                )
              }
            >
              Confirm
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {warning && (
        <p className="mt-2 text-xs text-left" style={{ color: "var(--warn-fg)" }}>
          {warning}
        </p>
      )}
      {error && (
        <div className="mt-2 text-left">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  );
}
