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
        className="text-xs font-semibold text-black/40 hover:text-red-600 disabled:opacity-60"
      >
        {pending ? "…" : "Deactivate"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
