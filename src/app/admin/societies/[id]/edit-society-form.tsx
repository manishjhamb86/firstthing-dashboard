"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import { updateSocietyDetails } from "../actions";

/**
 * Correcting the society's own record. Controlled inputs, per this repo's
 * standing rule — an uncontrolled `required` field is wiped by React 19
 * after a failed submit and the retry then silently does nothing. Closes on
 * success and stays open on a refusal, which is the only case with something
 * left to do here.
 */
export function EditSocietyForm({
  id,
  name: initialName,
  location: initialLocation,
  flatCount: initialFlats,
}: {
  id: string;
  name: string;
  location: string;
  flatCount: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);
  const [flatCount, setFlatCount] = useState(initialFlats === null ? "" : String(initialFlats));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        Edit details
      </button>
    );
  }

  return (
    <Card className="mb-5 w-full p-6">
      <CardTitle>Correct this society&apos;s record</CardTitle>
      <p className="mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
        Name and location together identify the society, so changing them to match another record is
        refused. Flat count can be corrected at any time.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Society name" htmlFor="es-name">
          <input id="es-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Location" htmlFor="es-location">
          <input id="es-location" className="field" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label="Flats" htmlFor="es-flats" hint="Leave blank if it is not known yet.">
          <input
            id="es-flats"
            type="number"
            min={1}
            className="field"
            value={flatCount}
            onChange={(e) => setFlatCount(e.target.value)}
          />
        </Field>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await updateSocietyDetails({
                id,
                name,
                location,
                // Blank means "not recorded", not zero.
                flatCount: flatCount.trim() === "" ? null : Number(flatCount),
              });
              if (r.error) setError(r.error);
              else {
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
      </div>
    </Card>
  );
}
