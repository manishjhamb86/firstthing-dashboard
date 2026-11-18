"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveVisit, sendBackVisit, withdrawVisit } from "../actions";

/** Approve or send back a waiting visit — offered only to someone else holding Approve visits. */
export function ReviewPanel({ visitId, societyName, loggerName }: { visitId: string; societyName: string; loggerName: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.error) return setError(r.error);
      router.refresh();
    });
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="text-[16px] font-bold">Approve this visit?</h2>
      <p className="text-[13.5px] text-[var(--text-muted)]">Once approved it counts towards {societyName}&apos;s month.</p>
      <button type="button" className="btn-primary min-h-[48px]" disabled={pending} onClick={() => act(() => approveVisit(visitId))}>
        Approve visit
      </button>
      <label className="flex flex-col gap-1.5 text-[13px] font-semibold" htmlFor="sb-note">
        Or send it back, saying why
        <textarea id="sb-note" rows={3} className="field text-[14px] font-normal" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. No outcome recorded" />
      </label>
      <button type="button" className="btn-secondary min-h-[46px]" disabled={pending || !note.trim()} onClick={() => act(() => sendBackVisit(visitId, note))}>
        Send back to {loggerName}
      </button>
      {error && <p role="alert" className="text-[13px]" style={{ color: "var(--bad-fg)" }}>{error}</p>}
    </section>
  );
}

export function NextReviewLink() {
  return <Link href="/admin/visits/approvals" className="btn-primary text-center">Next visit to review</Link>;
}

/** Withdraw a visit, with a reason — it stays on record, struck through. */
export function WithdrawVisit({ visitId }: { visitId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" className="text-[13px] font-semibold underline" style={{ color: "var(--bad-fg)" }} onClick={() => setOpen(true)}>
        Withdraw this visit
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="wd-reason" className="text-[13px] font-semibold">Why is it being withdrawn?</label>
      <input id="wd-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending || !reason.trim()}
          onClick={() =>
            start(async () => {
              const r = await withdrawVisit(visitId, reason);
              if (r.error) return setError(r.error);
              router.refresh();
            })
          }
        >
          Withdraw
        </button>
        <button type="button" className="text-[13px] font-semibold" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p role="alert" className="text-[13px]" style={{ color: "var(--bad-fg)" }}>{error}</p>}
    </div>
  );
}
