"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignReplacement, updateReplacementVisit } from "./actions";
import { ErrorText, Field } from "@/components/ui";

/**
 * Handing the light replacement to the crew that will do it, and booking the
 * day with the society.
 *
 * The replacement form used to appear the moment the baseline window closed,
 * with nobody's name on it and no day agreed (user-asked 2026-08-25). The
 * picker only offers accounts whose team does field work; the action
 * re-checks, because a picker is not a gate.
 */
export function AssignReplacement({
  circuitId,
  current,
  candidates,
  visit,
  canArrange,
}: {
  circuitId: string;
  current: { id: string; name: string } | null;
  candidates: { id: string; name: string; team: string }[];
  visit: { scheduledAt: string; contactName: string; contactPhone: string; note: string };
  /** The assignee and ops may arrange the day; nobody else. */
  canArrange: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState(current?.id ?? "");
  const [scheduledAt, setScheduledAt] = useState(visit.scheduledAt);
  const [contactName, setContactName] = useState(visit.contactName);
  const [contactPhone, setContactPhone] = useState(visit.contactPhone);
  const [note, setNote] = useState(visit.note);

  function assign(toId: string | null) {
    setError(null);
    start(async () => {
      const r = await assignReplacement({ circuitId, toId });
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  function saveVisit() {
    setError(null);
    start(async () => {
      const r = await updateReplacementVisit(circuitId, {
        scheduledAt,
        contactName,
        contactPhone,
        note,
      });
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  if (candidates.length === 0) {
    return (
      <p className="text-sm">
        No engineering or inspection account exists yet — create one under Admin users before the
        replacement can be handed to anybody.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Field
        label="Who is doing the replacement"
        htmlFor="ar-who"
        hint="An engineer or inspector. They record what was installed once the work is done."
      >
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="ar-who"
            aria-label="Assign the replacement to"
            className="field field-auto"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={pending}
          >
            <option value="">Nobody yet</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.team}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary btn-sm"
            disabled={pending || choice === (current?.id ?? "")}
            onClick={() => assign(choice === "" ? null : choice)}
          >
            {pending ? "Saving…" : current ? "Reassign" : "Assign"}
          </button>
        </div>
      </Field>

      {current && canArrange && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveVisit();
          }}
        >
          <Field
            label="Replacement day"
            htmlFor="ar-when"
            hint="What the society agreed to. Leave blank if nothing is fixed yet."
          >
            <input
              id="ar-when"
              type="datetime-local"
              className="field"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={pending}
            />
          </Field>

          <Field label="Who to ask for on site" htmlFor="ar-contact">
            <input
              id="ar-contact"
              className="field"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              disabled={pending}
            />
          </Field>

          <Field label="Their phone" htmlFor="ar-phone">
            <input
              id="ar-phone"
              className="field"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              disabled={pending}
            />
          </Field>

          <Field
            label="Anything the crew needs to know"
            htmlFor="ar-note"
            hint="Access, scaffolding, which blocks are being done first."
          >
            <textarea
              id="ar-note"
              rows={2}
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
            />
          </Field>

          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save the day"}
          </button>
        </form>
      )}

      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
