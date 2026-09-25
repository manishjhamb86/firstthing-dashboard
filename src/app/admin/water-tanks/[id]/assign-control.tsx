"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { SearchSelect } from "@/components/search-select";
import { saveTankAssignment } from "../actions";

type Setup = "domestic" | "flush" | "stp";

/**
 * Where this tank belongs — society, setup, tower — as ONE compact form
 * with one save at the end (user-caught 2026-09-15: the society was a
 * 22-row <select>, the Assign button sat between the fields, and setup and
 * tower each saved on their own control, one of them on blur).
 *
 * Mobile-first: fields stack full-width; the save is the last thing on the
 * card. A thrown action error is shown, never swallowed — the earlier
 * control ran the action inside startTransition with no catch, so a stale
 * server reference after a deploy read as "nothing happened".
 */
export function AssignControl({
  tankId,
  currentSocietyId,
  currentSetup,
  currentLocation,
  societies,
  onSaved,
}: {
  tankId: string;
  /** Called after a successful save — the modal closes on it. */
  onSaved?: () => void;
  currentSocietyId: string | null;
  currentSetup: string | null;
  currentLocation: string | null;
  societies: { id: string; name: string; location: string }[];
}) {
  const router = useRouter();
  const [societyId, setSocietyId] = useState<string | null>(currentSocietyId);
  const [setup, setSetup] = useState<Setup | "">((currentSetup as Setup | null) ?? "");
  const [location, setLocation] = useState(currentLocation ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    societyId !== currentSocietyId || (setup || null) !== (currentSetup ?? null) || location.trim() !== (currentLocation ?? "");

  function save(nextSocietyId: string | null) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await saveTankAssignment({
          tankId,
          societyId: nextSocietyId,
          setup: setup === "" ? null : setup,
          location,
        });
        if (result.error) setError(result.error);
        else {
          setSaved(true);
          if (nextSocietyId === null) setSocietyId(null);
          router.refresh();
          onSaved?.();
        }
      } catch {
        setError("Could not save — the page may be out of date. Reload and try again.");
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(societyId);
      }}
    >
      <Field label="Society" htmlFor="tank-society" hint="Type to search. Only this society's portal will show the tank.">
        <SearchSelect
          id="tank-society"
          options={societies.map((s) => ({ id: s.id, label: s.name, sublabel: s.location }))}
          value={societyId}
          onCommit={(id) => setSocietyId(id)}
          placeholder="Search societies…"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Setup" htmlFor="tank-setup" hint="Groups the tank on the portal.">
          <select
            id="tank-setup"
            className="field"
            value={setup}
            onChange={(e) => setSetup(e.target.value as Setup | "")}
            disabled={pending}
          >
            <option value="">Not classified</option>
            <option value="domestic">Domestic — household supply</option>
            <option value="flush">Flush — recycled supply</option>
            <option value="stp">STP — treated storage</option>
          </select>
        </Field>
        <Field label="Tower / building" htmlFor="tank-location" hint="Sub-groups it within its setup.">
          <input
            id="tank-location"
            type="text"
            className="field"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Tower D"
            disabled={pending}
          />
        </Field>
      </div>

      {error && <ErrorText>{error}</ErrorText>}
      {saved && !dirty && !error && (
        <p className="text-[12.5px]" style={{ color: "var(--ok-fg)" }}>
          Saved.
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {currentSocietyId ? (
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => save(null)}>
            Unassign from society
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={pending || !dirty}>
          {pending ? "Saving…" : currentSocietyId ? "Save changes" : "Assign & save"}
        </button>
      </div>
    </form>
  );
}
