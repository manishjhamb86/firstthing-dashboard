"use client";

import { useState, useTransition } from "react";
import { reactivatePortalAccount } from "./portal-actions";

export function ReactivatePortalButton({ profileId, societyId }: { profileId: string; societyId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [note, setNote] = useState<string | undefined>();

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await reactivatePortalAccount(profileId, societyId).catch(() => ({ error: "That did not go through — try again." }) as { error?: string; note?: string });
            setError(result.error);
            setNote(result.note);
          })
        }
        className="text-xs font-semibold text-[var(--accent)] hover:opacity-80 disabled:opacity-60"
      >
        {pending ? "…" : "Reactivate"}
      </button>
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      {note && <p className="text-xs text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}
