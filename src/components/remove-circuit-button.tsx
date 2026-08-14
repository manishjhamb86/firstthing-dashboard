"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidCircuit } from "@/app/admin/societies/[id]/circuits/void-actions";
import { ErrorText, Field } from "@/components/ui";

/**
 * Remove (soft-delete) a circuit, with its reason.
 *
 * When the viewer may not remove this circuit the control is replaced by a
 * plain statement of why — phrased in terms of the circuit's own state
 * ("Has commissioning work"), not the viewer's missing permissions, since
 * that is the thing they can actually reason about.
 */
export function RemoveCircuitButton({
  circuitId,
  label,
  canRemove,
  blockLabel,
}: {
  circuitId: string;
  label: string;
  canRemove: boolean;
  blockLabel: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!canRemove) {
    return blockLabel ? (
      <span className="text-xs text-[var(--text-muted)]">{blockLabel}</span>
    ) : null;
  }

  if (!open) {
    return (
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Remove
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 mt-2 max-w-md">
      <Field label={`Why is “${label}” being removed?`} htmlFor={`rm-${circuitId}`}>
        <input
          id={`rm-${circuitId}`}
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. added twice by mistake"
        />
      </Field>
      <p className="text-xs text-[var(--text-muted)]">
        It stops appearing in the registry, on the monitoring board and in any billing run. The record
        is kept, and the operations lead can put it back.
      </p>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-danger btn-sm"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await voidCircuit(circuitId, reason);
              if (result?.error) {
                setError(result.error);
                return;
              }
              setOpen(false);
              setReason("");
              router.refresh();
            });
          }}
        >
          {pending ? "Removing…" : "Remove circuit"}
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
