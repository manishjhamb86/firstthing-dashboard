"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeAlert } from "./actions";

export function AcknowledgeButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-outline btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await acknowledgeAlert(alertId);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "…" : "Acknowledge"}
      </button>
      {error && <span className="text-xs" style={{ color: "var(--bad-fg)" }}>{error}</span>}
    </span>
  );
}
