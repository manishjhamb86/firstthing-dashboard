"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unfileIntake } from "@/app/admin/billing/intake/actions";

/**
 * Reopens a service invoice that was filed as a plain document copy instead
 * of being submitted as a billed month (2026-10-03, user-caught: landing on
 * a filed copy with "nothing to read here" left no way forward — the actual
 * processing happens on Invoice intake's own review screen, which refuses to
 * render for an already-"submitted" row until it is unfiled first).
 */
export function UnfileButton({ intakeId }: { intakeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Unfile — resubmit as a billed month
      </button>
    );
  }
  return (
    <div className="space-y-1.5">
      <input
        className="field"
        placeholder="Filed as a document by mistake — should be a billed month"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        aria-label="Reason for unfiling this invoice"
      />
      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !reason.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await unfileIntake(intakeId, reason);
              if (r.error) setError(r.error);
              else router.push(`/admin/billing/intake/${intakeId}`);
            })
          }
        >
          {pending ? "Unfiling…" : "Unfile"}
        </button>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
