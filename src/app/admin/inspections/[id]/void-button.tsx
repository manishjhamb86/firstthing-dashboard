"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { voidInspection } from "../actions";

export function VoidInspectionButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        Void this inspection
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {error && <ErrorText>{error}</ErrorText>}
      <input
        className="field"
        placeholder="Why is this being voided?"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await voidInspection({ id, reason });
              if (result.error) return setError(result.error);
              router.refresh();
              setOpen(false);
            })
          }
        >
          {pending ? "Voiding…" : "Confirm void"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
