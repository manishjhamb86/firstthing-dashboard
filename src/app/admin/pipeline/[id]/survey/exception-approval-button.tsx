"use client";

import { useState, useTransition } from "react";
import { approveLightCountException } from "./actions";
import { ErrorText } from "@/components/ui";

export function ExceptionApprovalButton({ circuitId }: { circuitId: string }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const result = await approveLightCountException(circuitId, reason);
      setError(result?.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        placeholder="Exception reason"
        aria-label="Exception reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={pending}
        className="field max-w-60"
        style={{ padding: "6px 10px", fontSize: "12.5px" }}
      />
      <button
        type="button"
        onClick={approve}
        disabled={pending || !reason.trim()}
        className="btn-tone-ok btn-sm"
      >
        {pending ? "Approving…" : "Approve exception"}
      </button>
      {error && (
        <div className="w-full">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  );
}
