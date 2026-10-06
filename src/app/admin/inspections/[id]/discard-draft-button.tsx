"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { discardInspectionDraft } from "../actions";

/** Scrap a started-but-abandoned draft from the draft's own page (2026-10-06, user-asked). */
export function DiscardDraftButton({ id, canDiscard }: { id: string; canDiscard: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canDiscard) {
    return (
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        More than one person has added findings here, so this can&apos;t be discarded from this screen —
        ask operations to void it instead.
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        Discard this draft
      </button>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {error && <ErrorText>{error}</ErrorText>}
      <input className="field" placeholder="Why is this being discarded?" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending || !reason.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await discardInspectionDraft({ id, reason });
              if (result.error) return setError(result.error);
              router.push("/admin/inspections");
            })
          }
        >
          {pending ? "Discarding…" : "Confirm discard"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
