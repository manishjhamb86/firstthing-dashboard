"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restoreCircuit } from "./void-actions";
import { ErrorText } from "@/components/ui";

/**
 * Put a removed circuit back. Ops only — deliberately stricter than removal,
 * because restoring puts the circuit back in front of the billing query.
 */
export function RestoreCircuitButton({ circuitId }: { circuitId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="btn-ghost btn-sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await restoreCircuit(circuitId);
            if (result?.error) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Restoring…" : "Restore"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}
