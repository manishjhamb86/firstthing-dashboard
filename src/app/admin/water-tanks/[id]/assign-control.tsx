"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { assignTanks } from "../actions";

/** Assign or move this one tank — the single-tank half of the bulk bar. */
export function AssignControl({
  tankId,
  currentSocietyId,
  societies,
}: {
  tankId: string;
  currentSocietyId: string | null;
  societies: { id: string; name: string; location: string }[];
}) {
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(societyId: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await assignTanks({ tankIds: [tankId], societyId });
      if (result.error) setError(result.error);
      else {
        setChoice("");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <select
          aria-label={currentSocietyId ? "Move this tank to" : "Assign this tank to"}
          className="field field-auto"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          disabled={pending}
          style={{ minWidth: 260 }}
        >
          <option value="">Choose a society…</option>
          {societies
            .filter((s) => s.id !== currentSocietyId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.location}
              </option>
            ))}
        </select>
        <button
          type="button"
          className="btn-primary"
          disabled={pending || !choice}
          onClick={() => save(choice)}
        >
          {pending ? "Saving…" : currentSocietyId ? "Reassign" : "Assign"}
        </button>
        {currentSocietyId && (
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => save(null)}>
            Unassign
          </button>
        )}
      </div>
      {error && <div className="mt-2"><ErrorText>{error}</ErrorText></div>}
    </div>
  );
}
