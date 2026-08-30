"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { assignTanks, setTankSetup } from "../actions";

/** Assign or move this one tank — the single-tank half of the bulk bar. */
export function AssignControl({
  tankId,
  currentSocietyId,
  currentSetup,
  societies,
}: {
  tankId: string;
  currentSocietyId: string | null;
  /** domestic | flush | stp | null — what this tank supplies. */
  currentSetup: string | null;
  societies: { id: string; name: string; location: string }[];
}) {
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveSetup(setup: string) {
    setError(null);
    startTransition(async () => {
      const result = await setTankSetup({
        tankId,
        setup: setup === "" ? null : (setup as "domestic" | "flush" | "stp"),
      });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

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
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <label htmlFor="tank-setup" className="lbl" style={{ display: "inline" }}>
          Setup
        </label>
        <select
          id="tank-setup"
          className="field field-auto"
          value={currentSetup ?? ""}
          onChange={(e) => saveSetup(e.target.value)}
          disabled={pending}
          style={{ minWidth: 200 }}
        >
          <option value="">Not classified</option>
          <option value="domestic">Domestic — household supply</option>
          <option value="flush">Flush — recycled supply</option>
          <option value="stp">STP — treated storage</option>
        </select>
        <span className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          groups this tank on the society&apos;s portal
        </span>
      </div>
      {error && <div className="mt-2"><ErrorText>{error}</ErrorText></div>}
    </div>
  );
}
