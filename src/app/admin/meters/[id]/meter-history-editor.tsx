"use client";

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format-date";
import { useRouter } from "next/navigation";
import { ErrorText, Field, StatusChip } from "@/components/ui";
import { SearchSelect, type SearchSelectOption } from "@/components/search-select";
import { assignMeterSpan, deleteMeterStay, editMeterStay, previewMeterSpan, type SpanPreview } from "../actions";

export type StayDTO = { id: string; label: string; from: string; to: string | null };

const KIND_LABEL: Record<string, string> = {
  delete: "Removed",
  "trim-end": "Shortened",
  "trim-start": "Starts later",
  split: "Split around it",
};

/**
 * Correcting where this meter was, for older data (2026-09-26, demo mode).
 * Pick a stretch of its readings and the circuit they belong to; the preview
 * lists every entry that would be trimmed, split or removed, on this meter and
 * on whatever meter the circuit had then. The readings follow the history.
 */
export function MeterHistoryEditor({
  meterId,
  demoMode,
  stays,
  circuits,
  unassigned,
}: {
  meterId: string;
  demoMode: boolean;
  stays: StayDTO[];
  circuits: SearchSelectOption[];
  unassigned: { days: number; first: string | null; last: string | null };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [from, setFrom] = useState(unassigned.first ?? "");
  const [to, setTo] = useState(unassigned.last ?? "");
  const [circuitId, setCircuitId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<SpanPreview | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editReason, setEditReason] = useState("");

  const act = (fn: () => Promise<{ error?: string }>, message: string, after?: () => void) =>
    start(async () => {
      setError(null);
      setDone(null);
      const r = await fn();
      if (r.error) setError(r.error);
      else {
        setDone(message);
        after?.();
        router.refresh();
      }
    });

  const unassignedLine =
    unassigned.days > 0 ? (
      <p className="text-[13px]" style={{ color: "var(--warn-fg)" }}>
        {`${unassigned.days.toLocaleString("en-IN")} day${unassigned.days === 1 ? "" : "s"} of this meter's readings are on no circuit`}
        {unassigned.first && unassigned.last ? ` (between ${formatDate(unassigned.first)} and ${formatDate(unassigned.last)})` : ""}
        {" — they are kept, and feed nothing until a history entry covers them."}
      </p>
    ) : null;

  if (!demoMode) {
    return (
      <div className="mt-4 space-y-2 border-t pt-4" style={{ borderColor: "var(--border)" }}>
        {unassignedLine}
        <p className="text-[12.5px] text-[var(--text-subtle)]">
          Correcting past history is available in demo mode. After go-live a meter&apos;s history only moves forward, from the
          assign dialog on the meter list.
        </p>
      </div>
    );
  }

  const blocked = !!preview && (preview.releasedDays > 0 || preview.lockedDemos.length > 0);

  return (
    <div className="mt-4 space-y-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      {unassignedLine}

      <div className="space-y-3">
        <p className="text-sm font-semibold">Assign a stretch of readings to a circuit</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From" htmlFor="mh-from">
            <input id="mh-from" type="date" className="field" value={from} onChange={(e) => { setFrom(e.target.value); setPreview(null); }} />
          </Field>
          <Field label="To (last day, blank = still there)" htmlFor="mh-to">
            <input id="mh-to" type="date" className="field" value={to} onChange={(e) => { setTo(e.target.value); setPreview(null); }} />
          </Field>
        </div>
        <Field label="Circuit" htmlFor="mh-circuit">
          <SearchSelect
            id="mh-circuit"
            options={circuits}
            value={circuitId}
            onCommit={(v) => { setCircuitId(v); setPreview(null); }}
            placeholder="Type the society or circuit…"
          />
        </Field>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending || !from || !circuitId}
          onClick={() =>
            start(async () => {
              setError(null);
              setDone(null);
              const r = await previewMeterSpan({ meterId, circuitId: circuitId!, from, to: to || null });
              if (r.error) setError(r.error);
              else setPreview(r.preview ?? null);
            })
          }
        >
          Preview the change
        </button>

        {preview && (
          <div className="space-y-2 rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--border)" }}>
            {preview.changes.length === 0 ? (
              <p className="text-[13px]">Nothing else changes — the stretch is free.</p>
            ) : (
              <ul className="space-y-1 text-[13px]">
                {preview.changes.map((c, i) => (
                  <li key={i}>
                    <StatusChip tone="warn">{KIND_LABEL[c.kind] ?? c.kind}</StatusChip>{" "}
                    <strong>{c.meterName}</strong> on {c.circuitLabel}: <span className="num">{c.before}</span> →{" "}
                    <span className="num">{c.after}</span>
                  </li>
                ))}
              </ul>
            )}
            {preview.releasedDays > 0 && (
              <ErrorText>{preview.releasedDays} of the days this would move are on a released bill — they cannot move.</ErrorText>
            )}
            {preview.lockedDemos.length > 0 && (
              <ErrorText>It would move readings under {preview.lockedDemos.join(", ")}, whose report has been shared. Unlock it first.</ErrorText>
            )}
            {!blocked && (
              <>
                <Field label="Why the history is being corrected" htmlFor="mh-reason">
                  <input id="mh-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={pending || !reason.trim()}
                  onClick={() =>
                    act(
                      () => assignMeterSpan({ meterId, circuitId: circuitId!, from, to: to || null, reason }),
                      "History updated — the readings were re-filed.",
                      () => { setPreview(null); setReason(""); },
                    )
                  }
                >
                  Confirm and move the readings
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {stays.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Correct one entry</p>
          <ul className="space-y-2 text-[13px]">
            {stays.map((s) => (
              <li key={s.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {s.label} · <span className="num">{formatDate(s.from)}</span> → <span className="num">{s.to ? formatDate(s.to) : "now"}</span>
                  </span>
                  {editing !== s.id && (
                    <span className="flex gap-2">
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => { setEditing(s.id); setEditFrom(s.from); setEditTo(s.to ?? ""); setEditReason(""); }}
                      >
                        Change dates
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        disabled={pending}
                        onClick={() => {
                          const why = window.prompt("Why is this entry being removed? Its readings become unassigned.");
                          if (why) act(() => deleteMeterStay({ stayId: s.id, reason: why }), "Entry removed.");
                        }}
                      >
                        Remove
                      </button>
                    </span>
                  )}
                </div>
                {editing === s.id && (
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="From" htmlFor={`ms-from-${s.id}`}>
                      <input id={`ms-from-${s.id}`} type="date" className="field field-auto" value={editFrom} onChange={(e) => setEditFrom(e.target.value)} />
                    </Field>
                    <Field label="To (blank = still there)" htmlFor={`ms-to-${s.id}`}>
                      <input id={`ms-to-${s.id}`} type="date" className="field field-auto" value={editTo} onChange={(e) => setEditTo(e.target.value)} />
                    </Field>
                    <Field label="Why" htmlFor={`ms-why-${s.id}`}>
                      <input id={`ms-why-${s.id}`} className="field" value={editReason} onChange={(e) => setEditReason(e.target.value)} />
                    </Field>
                    <button
                      type="button"
                      className="btn-primary btn-sm mb-2"
                      disabled={pending || !editFrom || !editReason.trim()}
                      onClick={() =>
                        act(
                          () => editMeterStay({ stayId: s.id, from: editFrom, to: editTo || null, reason: editReason }),
                          "Entry corrected — the readings were re-filed.",
                          () => setEditing(null),
                        )
                      }
                    >
                      Save
                    </button>
                    <button type="button" className="btn-ghost btn-sm mb-2" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <ErrorText>{error}</ErrorText>}
      {done && <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>{done}</p>}
    </div>
  );
}
