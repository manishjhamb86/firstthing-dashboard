"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import type { RequestCardData } from "@/lib/society-timeline-view";
import { acceptDateChange, rejectDateChange, withdrawDateChange } from "./actions";


/**
 * One date change request, as the approver decides it (2026-09-28): where the
 * date is, old → new, the requester's reason, and any rule warnings they went
 * ahead with. The requester sees Withdraw instead of Accept — the server
 * refuses self-approval whatever this renders.
 */
export function RequestCard({ r, canApprove, showSociety }: { r: RequestCardData; canApprove: boolean; showSociety?: boolean }) {
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
  const open = r.status === "pending";

  return (
    <article className="tl-card">
      <div className="min-w-0">
        <div className="text-[12.5px] text-[var(--text-subtle)]">
          {showSociety ? (
            <Link href={`/admin/societies/${r.societyId}/timeline`} className="hover:underline">
              {r.context}
            </Link>
          ) : (
            r.context
          )}
        </div>
        <h4 className="mt-0.5 text-[15px] font-bold">{r.label}</h4>
        <div className="tl-diff mt-2">
          <span className="old">{r.from}</span>
          <span aria-hidden>→</span>
          <span className="new">{r.to}</span>
          {!open && <span className={`chip ${r.status === "approved" ? "chip-ok" : "chip-neu"}`}>{r.statusLabel}</span>}
        </div>
        <p className="mt-2 text-[13px]">
          <span className="block text-[12px] font-semibold text-[var(--text-subtle)]">
            Reason from {r.mine ? "you" : r.by} · {r.at}
          </span>
          {r.reason}
        </p>
        {r.warnings.map((w, i) => (
          <div key={i} className="tl-msg mt-2" data-tone="warn">
            Raised despite a rule warning: {w}
          </div>
        ))}
        {open && r.stale && (
          <div className="tl-msg mt-2" data-tone="bad">
            The recorded date changed after this was asked, so it can no longer be applied. Accepting closes it.
          </div>
        )}
        {r.decision && <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">{r.decision}</p>}
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
              <span className="text-[12.5px] text-[var(--text-subtle)]">You raised this, so another admin decides.</span>
              <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={() => run(() => withdrawDateChange(r.id))}>
                Withdraw
              </button>
            </>
          ) : canApprove ? (
            rejecting ? (
              <>
                <button type="button" className="btn-danger btn-sm" disabled={pending || !note.trim()} onClick={() => run(() => rejectDateChange(r.id, note))}>
                  Reject
                </button>
                <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={() => setRejecting(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => acceptDateChange(r.id))}>
                  {r.stale ? "Close it" : "Accept"}
                </button>
                <button type="button" className="btn-outline btn-sm" disabled={pending} onClick={() => setRejecting(true)}>
                  Reject with a note
                </button>
              </>
            )
          ) : (
            <span className="text-[12.5px] text-[var(--text-subtle)]">Waiting for an admin who can approve date changes.</span>
          )}
        </div>
      )}
    </article>
  );
}
