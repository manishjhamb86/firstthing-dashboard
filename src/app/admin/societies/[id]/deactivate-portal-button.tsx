"use client";

import { useState, useTransition } from "react";
import { deactivatePortalAccount } from "./portal-actions";

export function DeactivatePortalButton({ profileId, societyId }: { profileId: string; societyId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  return (
    <div className="text-right">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deactivatePortalAccount(profileId, societyId);
            setError(result.error);
          })
        }
        className="text-xs font-semibold text-[var(--text-subtle)] hover:text-[var(--bad-fg)] disabled:opacity-60"
      >
        {pending ? "…" : "Deactivate"}
      </button>
      {error && (
        <p role="alert" className="text-xs" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
