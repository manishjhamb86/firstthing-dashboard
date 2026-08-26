"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidDocumentVersion } from "./actions";

/** Withdrawing a version always asks why — a withdrawal with no stated
 *  reason is indistinguishable from a mistake later on. */
export function WithdrawButton({ documentId, version }: { documentId: string; version: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        className="text-[11px] font-semibold"
        style={{ color: "var(--text-muted)" }}
        onClick={() => setOpen(true)}
      >
        Withdraw v{version}
      </button>
    );
  }
  return (
    <div className="mt-1.5 space-y-1.5">
      <input
        className="field"
        placeholder="Why is this version being withdrawn?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label={`Reason for withdrawing version ${version}`}
      />
      {error && (
        <p className="text-[11px]" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await voidDocumentVersion({ documentId, reason });
              if (r.error) setError(r.error);
              else {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          Withdraw
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
