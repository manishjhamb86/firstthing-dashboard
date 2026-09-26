"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { correctRescaleEvent, removeRescaleEvent, voidRescaleEvent } from "./rescale-actions";
import { ErrorText, Field } from "@/components/ui";

type Props = {
  eventId: string;
  previousLightCount: number;
  newLightCount: number;
  previousBaseline: number;
  effectiveDate: string;
  verificationNote: string;
  /** Demo mode (before go-live): the entry can be removed completely. */
  canRemove?: boolean;
  /** Already voided: only removal is offered. */
  voided?: boolean;
};

/**
 * Correct / void controls for one rescale entry.
 *
 * Deliberately NOT an in-place edit of the stored row: these entries replay
 * into the baseline a society is billed on, so the correction path writes a
 * fresh entry and strikes the old one out. What the operator sees is an edit;
 * what the record keeps is both.
 *
 * Controlled inputs throughout — an uncontrolled `required` field in a form
 * that can fail and be resubmitted is the React 19 reset bug this codebase
 * already documented once.
 */
export function RescaleRowActions(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<null | "void" | "correct">(null);
  const [error, setError] = useState<string | null>(null);

  const [reason, setReason] = useState("");
  const [count, setCount] = useState(String(props.newLightCount));
  const [note, setNote] = useState(props.verificationNote);
  const [date, setDate] = useState(props.effectiveDate);

  function close() {
    setMode(null);
    setError(null);
    setReason("");
    setCount(String(props.newLightCount));
    setNote(props.verificationNote);
    setDate(props.effectiveDate);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "void"
          ? await voidRescaleEvent(props.eventId, reason)
          : await correctRescaleEvent(props.eventId, {
              newLightCount: Number(count),
              verificationNote: note,
              effectiveDate: date,
              reason,
            });
      if (result?.error) {
        setError(result.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  function remove() {
    if (
      !window.confirm(
        "Remove this light-count change completely? The circuit's light count, its baseline from that date, the light-count history, monitoring and the published months all go back to what they are without it. This cannot be undone.",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await removeRescaleEvent(props.eventId);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        {!props.voided && (
          <>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("correct")}>
              Correct
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setMode("void")}>
              Void
            </button>
          </>
        )}
        {props.canRemove && (
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={remove} style={{ color: "var(--bad-fg)" }}>
            Remove
          </button>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-w-[15rem]">
      {mode === "correct" && (
        <>
          <Field label="Corrected light count" htmlFor={`count-${props.eventId}`}>
            <input
              id={`count-${props.eventId}`}
              className="field"
              type="number"
              min={1}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </Field>
          <Field label="Effective date" htmlFor={`date-${props.eventId}`}>
            <input
              id={`date-${props.eventId}`}
              className="field"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Verification" htmlFor={`note-${props.eventId}`}>
            <input
              id={`note-${props.eventId}`}
              className="field"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <p className="text-xs text-[var(--text-muted)]">
            Rescales from {props.previousBaseline.toFixed(2)} kWh/day at {props.previousLightCount} lights — the
            same starting point as the entry being replaced, so a mistake is undone rather than compounded.
          </p>
        </>
      )}
      <Field
        label={mode === "void" ? "Why is this being voided?" : "Why is this being corrected?"}
        htmlFor={`reason-${props.eventId}`}
      >
        <input
          id={`reason-${props.eventId}`}
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. count entered against the wrong circuit"
        />
      </Field>
      {mode === "void" && (
        <p className="text-xs text-[var(--text-muted)]">
          The entry stays in this history, struck through, and stops counting toward the baseline in force.
        </p>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex gap-2">
        <button type="button" className={mode === "void" ? "btn-danger btn-sm" : "btn-primary btn-sm"} onClick={submit} disabled={pending}>
          {pending ? "Saving…" : mode === "void" ? "Void entry" : "Save correction"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={close} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );
}
