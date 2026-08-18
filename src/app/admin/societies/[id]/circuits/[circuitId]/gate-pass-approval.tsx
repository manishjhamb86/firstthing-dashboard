"use client";

import { useState, useTransition } from "react";
import { approveGatePass, rejectGatePass } from "./actions";
import { ErrorText } from "@/components/ui";

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
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button type="button" onClick={approve} disabled={pending} className="btn-tone-ok btn-sm">
        Approve
      </button>
      <input
        placeholder="Rejection reason"
        aria-label="Rejection reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={pending}
        className="field max-w-52"
        style={{ padding: "6px 10px", fontSize: "12.5px" }}
      />
      <button
        type="button"
        onClick={reject}
        disabled={pending || !reason.trim()}
        className="btn-danger btn-sm"
      >
        Reject
      </button>
      {error && (
        <div className="w-full">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  );
}
