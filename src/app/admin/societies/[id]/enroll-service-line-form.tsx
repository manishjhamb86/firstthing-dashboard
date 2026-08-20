"use client";

import { useState, useTransition } from "react";
import { enrollServiceLine } from "../actions";
import { ErrorText } from "@/components/ui";

/**
 * One button per service line, on that line's own row.
 *
 * It used to be a dropdown plus a single Enroll button, which meant the card
 * showed only what the society already had and hid the rest behind a select
 * (user-asked 2026-08-20: "show separate rows for each service and highlight
 * which are already enrolled"). A row per line says what is and is not
 * covered without opening anything.
 */
export function EnrollServiceLineButton({
  societyId,
  serviceLine,
  label,
}: {
  societyId: string;
  serviceLine: string;
  label: string;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  return (
    <span className="shrink-0">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await enrollServiceLine(societyId, serviceLine);
            setError(result?.error);
          })
        }
      >
        {pending ? "Enrolling…" : label}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}
