"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { setLiveDemoCountCorrectionAllowed } from "./actions";

export function ToggleForm({ allowed }: { allowed: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <button
        type="button"
        className={allowed ? "btn-secondary btn-sm" : "btn-primary btn-sm"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(undefined);
            const r = await setLiveDemoCountCorrectionAllowed(!allowed);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Saving…" : allowed ? "Switch off" : "Switch on"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
