"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { SearchSelect } from "@/components/search-select";
import { createPumpRoomFromIngest } from "./actions";

type RoomType = "domestic" | "stp" | "fire";

export function ClassifyForm({
  subjectLabel,
  societies,
}: {
  subjectLabel: string;
  societies: { id: string; name: string; location: string }[];
}) {
  const router = useRouter();
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [roomType, setRoomType] = useState<RoomType | "">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setNotice(null);
        if (!societyId || !roomType) {
          setError("Choose both a society and a type.");
          return;
        }
        startTransition(async () => {
          const r = await createPumpRoomFromIngest({ subjectLabel, societyId, roomType });
          if (r.error) setError(r.error);
          else {
            setNotice(r.backfilled ? `Classified — ${r.backfilled} backlog day${r.backfilled === 1 ? "" : "s"} recovered.` : "Classified.");
            router.refresh();
          }
        });
      }}
    >
      <div className="min-w-[220px] flex-1">
        <Field label="Society" htmlFor={`pr-society-${subjectLabel}`} hint="Type to search.">
          <SearchSelect
            id={`pr-society-${subjectLabel}`}
            options={societies.map((s) => ({ id: s.id, label: s.name, sublabel: s.location }))}
            value={societyId}
            onCommit={(id) => setSocietyId(id)}
            placeholder="Search societies…"
          />
        </Field>
      </div>
      <div className="w-full sm:w-44">
        <Field label="Type" htmlFor={`pr-type-${subjectLabel}`}>
          <select
            id={`pr-type-${subjectLabel}`}
            className="field"
            value={roomType}
            onChange={(e) => setRoomType(e.target.value as RoomType | "")}
            disabled={pending}
          >
            <option value="">Choose…</option>
            <option value="domestic">Domestic</option>
            <option value="stp">STP</option>
            <option value="fire">Fire</option>
          </select>
        </Field>
      </div>
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Classifying…" : "Classify"}
      </button>
      {error && (
        <div className="w-full sm:w-auto">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
      {notice && !error && (
        <p className="text-[12.5px]" style={{ color: "var(--ok-fg)" }}>
          {notice}
        </p>
      )}
    </form>
  );
}
