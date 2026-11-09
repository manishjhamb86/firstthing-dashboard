"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { SearchSelect } from "@/components/search-select";
import { saveMeterAssignment } from "../actions";

type RoomType = "domestic" | "stp" | "fire";

/**
 * Where this pump room belongs — society and type — one compact form with
 * one save, the same shape as water tanks' AssignControl (one room per
 * society for now, so there is no tower/building field here).
 */
export function AssignControl({
  meterId,
  currentSocietyId,
  currentRoomType,
  societies,
}: {
  meterId: string;
  currentSocietyId: string | null;
  currentRoomType: RoomType | null;
  societies: { id: string; name: string; location: string }[];
}) {
  const router = useRouter();
  const [societyId, setSocietyId] = useState<string | null>(currentSocietyId);
  const [roomType, setRoomType] = useState<RoomType | "">(currentRoomType ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = societyId !== currentSocietyId || (roomType || null) !== (currentRoomType ?? null);

  function save(nextSocietyId: string | null) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await saveMeterAssignment({ meterId, societyId: nextSocietyId, roomType: roomType === "" ? null : roomType });
        if (result.error) setError(result.error);
        else {
          setSaved(true);
          if (nextSocietyId === null) setSocietyId(null);
          router.refresh();
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
      <Field label="Society" htmlFor="pr-assign-society" hint="Type to search. Only this society's portal will show the pump room.">
        <SearchSelect
          id="pr-assign-society"
          options={societies.map((s) => ({ id: s.id, label: s.name, sublabel: s.location }))}
          value={societyId}
          onCommit={(id) => setSocietyId(id)}
          placeholder="Search societies…"
        />
      </Field>
      <Field label="Type" htmlFor="pr-assign-type">
        <select id="pr-assign-type" className="field" value={roomType} onChange={(e) => setRoomType(e.target.value as RoomType | "")} disabled={pending}>
          <option value="">Not classified</option>
          <option value="domestic">Domestic</option>
          <option value="stp">STP</option>
          <option value="fire">Fire</option>
        </select>
      </Field>

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
