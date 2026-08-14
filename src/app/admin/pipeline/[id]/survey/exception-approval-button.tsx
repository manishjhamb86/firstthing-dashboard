"use client";

import { useState, useTransition } from "react";
import { approveLightCountException } from "./actions";

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
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        disabled={pending}
        className="border rounded-[var(--r-sm)] p-1 text-xs"
        style={{ borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" }}
      />
      <button
        type="button"
        onClick={approve}
        disabled={pending || !reason.trim()}
        className="text-xs font-semibold disabled:opacity-60"
        style={{ color: "var(--accent)" }}
      >
        {pending ? "Approving…" : "Approve exception"}
      </button>
      {error && (
        <p className="text-xs w-full" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
