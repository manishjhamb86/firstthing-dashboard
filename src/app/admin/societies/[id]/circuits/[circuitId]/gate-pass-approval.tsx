"use client";

import { useState, useTransition } from "react";
import { approveGatePass, rejectGatePass } from "./actions";

export function GatePassApproval({ gatePassId }: { gatePassId: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const result = await approveGatePass(gatePassId);
      setError(result?.error);
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectGatePass(gatePassId, reason);
      setError(result?.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={approve}
        disabled={pending}
        className="text-xs font-semibold disabled:opacity-60"
        style={{ color: "var(--ok-fg)" }}
      >
        Approve
      </button>
      <input
        placeholder="Rejection reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={pending}
        className="border rounded-[var(--r-sm)] p-1 text-xs"
        style={{ borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" }}
      />
      <button
        type="button"
        onClick={reject}
        disabled={pending || !reason.trim()}
        className="text-xs font-semibold disabled:opacity-60"
        style={{ color: "var(--bad-fg)" }}
      >
        Reject
      </button>
      {error && (
        <p className="text-xs w-full" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
