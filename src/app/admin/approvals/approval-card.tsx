"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { approvePendingApproval, rejectPendingApproval, withdrawPendingApproval } from "./actions";

type ApprovalCardData = {
  id: string;
  kindLabel: string;
  summary: string;
  society: string;
  by: string;
  at: string;
  mine: boolean;
  appliedError: string | null;
  decided?: { status: string; by: string; at: string; note: string | null };
};

const STATUS_LABEL: Record<string, string> = {
  approved: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/**
 * One queued correction, as the named account decides it (2026-10-20). The
 * requester sees Withdraw instead of Accept/Reject — the server refuses
 * anyone else deciding whatever this renders.
 */
export function ApprovalCard({ r, canDecide }: { r: ApprovalCardData; canDecide: boolean }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      try {
        const res = await fn();
        if (res.error) setError(res.error);
        router.refresh();
      } catch {
        setError("The request did not complete — refresh to see whether it was recorded before trying again.");
      }
    });
  const open = !r.decided;

  return (
    <article className="tl-card">
      <div className="min-w-0">
        <div className="text-[12.5px] text-[var(--text-subtle)]">
          {r.kindLabel} · {r.society}
        </div>
        <p className="mt-0.5 text-[15px] font-bold">{r.summary}</p>
        <p className="mt-2 text-[13px] text-[var(--text-muted)]">
          Raised by {r.mine ? "you" : r.by} · {r.at}
        </p>
        {r.appliedError && (
          <div className="tl-msg mt-2" data-tone="bad">
            Could not apply: {r.appliedError} — the state this was validated against has since changed. Withdraw it
            and raise a fresh one, or try approving again if the underlying issue is now resolved.
          </div>
        )}
        {r.decided && (
          <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">
            {STATUS_LABEL[r.decided.status] ?? r.decided.status} by {r.decided.by} · {r.decided.at}
            {r.decided.note ? ` — ${r.decided.note}` : ""}
          </p>
        )}
        {rejecting && (
          <label className="mt-3 flex flex-col gap-1 text-[12px] font-semibold text-[var(--text-muted)]">
            Why it is rejected (the requester reads this)
            <textarea className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
      {open && (
        <div className="decide">
          {r.mine ? (
            <>
              <span className="text-[12.5px] text-[var(--text-subtle)]">You raised this, so it is theirs to decide.</span>
              <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={() => run(() => withdrawPendingApproval(r.id))}>
                Withdraw
              </button>
            </>
          ) : canDecide ? (
            rejecting ? (
              <>
                <button type="button" className="btn-danger btn-sm" disabled={pending || !note.trim()} onClick={() => run(() => rejectPendingApproval(r.id, note))}>
                  Reject
                </button>
                <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={() => setRejecting(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => approvePendingApproval(r.id))}>
                  Approve
                </button>
                <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={() => setRejecting(true)}>
                  Reject with a note
                </button>
              </>
            )
          ) : (
            <span className="text-[12.5px] text-[var(--text-subtle)]">Waiting for the one account that can approve this.</span>
          )}
        </div>
      )}
    </article>
  );
}
