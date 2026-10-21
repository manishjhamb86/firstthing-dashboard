"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { markSocietyDefaulter, unmarkSocietyDefaulter } from "@/app/admin/societies/defaulter-actions";

/**
 * Mark a society a defaulter (2026-10-21) — a stated, reversible flag,
 * separate from rejecting/terminating it. Nothing about billing or the
 * automatic arrears clock changes; the only effect is that this society's
 * notifications move out of the main feed into their own section.
 */
export function MarkDefaulterDialog({ societyId }: { societyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await markSocietyDefaulter(societyId, reason);
        if (r.error) setError(r.error);
        else {
          setOpen(false);
          router.refresh();
        }
      } catch {
        setError("The request did not complete — refresh to see whether it was recorded before trying again.");
      }
    });
  }

  return (
    <>
      <button type="button" className="btn-danger btn-sm" onClick={() => setOpen(true)}>
        Mark a defaulter
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Mark this society a defaulter"
        description="Nothing about billing changes — invoices it owes stay owed and keep being followed up. Its notifications move out of the main window into their own Defaulter societies section."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-danger" disabled={pending || !reason.trim()} onClick={submit}>
              {pending ? "Recording…" : "Mark a defaulter"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Why" htmlFor="defaulter-reason" hint="Kept on the record beside who marked it and when.">
            <input
              id="defaulter-reason"
              type="text"
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Stopped paying after the June invoice · never paid a single invoice…"
            />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}

export function UnmarkDefaulterButton({ societyId }: { societyId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await unmarkSocietyDefaulter(societyId);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Removing…" : "Remove defaulter mark"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}
