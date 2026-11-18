"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { importPumpReportDays, recordPumpBaseline } from "./baseline-actions";

export type DocumentOption = { id: string; label: string };

/**
 * The "before FirsThing" baseline, recorded once from a filed document
 * (2026-11-13). The kWh/KL is derived from the period's totals, never
 * typed — a figure every saving is measured against is not something a
 * form should let anyone key in directly. Below it, the report's own daily
 * table can be pasted in so the history starts from the day the automation
 * went live rather than from the first vendor email.
 */
export function BaselineForm({
  meterId,
  documents,
  current,
  inModal = false,
  onSaved,
}: {
  meterId: string;
  documents: DocumentOption[];
  current: { kwhPerKl: number; periodFrom: string; periodTo: string; savingsFrom: string } | null;
  /** Rendered inside the header button's modal: the form is always open and saving closes the modal. */
  inModal?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(inModal || current === null);
  const [periodFrom, setPeriodFrom] = useState(current?.periodFrom ?? "");
  const [periodTo, setPeriodTo] = useState(current?.periodTo ?? "");
  const [kwh, setKwh] = useState("");
  const [kl, setKl] = useState("");
  const [savingsFrom, setSavingsFrom] = useState(current?.savingsFrom ?? "");
  const [docId, setDocId] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [daysText, setDaysText] = useState("");
  const [daysError, setDaysError] = useState<string | null>(null);
  const [daysDone, setDaysDone] = useState<string | null>(null);
  const [daysPending, startDays] = useTransition();

  const kwhN = Number(kwh), klN = Number(kl);
  const derived = kwhN > 0 && klN > 0 ? kwhN / klN : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setDone(null);
    start(async () => {
      try {
        const r = await recordPumpBaseline({ meterId, periodFrom, periodTo, kwh: kwhN, kl: klN, savingsFrom, sourceDocumentId: docId || null, note, reason });
        if (r.error) setError(r.error);
        else { setDone(`Recorded — ${r.kwhPerKl!.toFixed(2)} kWh/KL.`); if (!inModal) setOpen(false); router.refresh(); onSaved?.(); }
      } catch { setError("Could not save — the page may be out of date. Reload and try again."); }
    });
  }

  function submitDays(e: React.FormEvent) {
    e.preventDefault();
    setDaysError(null); setDaysDone(null);
    startDays(async () => {
      try {
        const r = await importPumpReportDays({ meterId, sourceDocumentId: docId || null, text: daysText });
        if (r.error) setDaysError(r.error);
        else {
          setDaysDone(`${r.added} day${r.added === 1 ? "" : "s"} added${r.skipped && r.skipped.length ? ` · ${r.skipped.length} already read from the meter and left as they are` : ""}.`);
          setDaysText("");
          router.refresh();
        }
      } catch { setDaysError("Could not save — reload and try again."); }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {!open && !inModal && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {done ? <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>{done}</p> : <span />}
          <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
            {current ? "Replace the baseline" : "Record the baseline"}
          </button>
        </div>
      )}
      {open && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Measured from" htmlFor="bl-from">
              <input id="bl-from" type="date" className="field" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </Field>
            <Field label="to (inclusive)" htmlFor="bl-to">
              <input id="bl-to" type="date" className="field" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </Field>
            <Field label="Electricity over the period · kWh" htmlFor="bl-kwh" hint="The period total, not a daily average.">
              <input id="bl-kwh" type="number" step="any" min="0" className="field" value={kwh} onChange={(e) => setKwh(e.target.value)} />
            </Field>
            <Field label="Water pumped over the period · KL" htmlFor="bl-kl">
              <input id="bl-kl" type="number" step="any" min="0" className="field" value={kl} onChange={(e) => setKl(e.target.value)} />
            </Field>
          </div>
          <div className="rounded-[var(--r-sm)] px-3 py-2.5" style={{ background: "var(--surface-active)" }}>
            <span className="lbl">Baseline</span>{" "}
            <span className="num text-[18px] font-extrabold">{derived === null ? "—" : `${derived.toFixed(2)} kWh/KL`}</span>
            {derived !== null && (
              <span className="ml-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                = {kwhN.toLocaleString("en-IN")} ÷ {klN.toLocaleString("en-IN")}
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Savings count from" htmlFor="bl-start" hint="The day the automation went live — the report's post-optimisation start.">
              <input id="bl-start" type="date" className="field" value={savingsFrom} onChange={(e) => setSavingsFrom(e.target.value)} />
            </Field>
            <Field label="Source document" htmlFor="bl-doc" hint="One of the society's filed documents.">
              <select id="bl-doc" className="field" value={docId} onChange={(e) => setDocId(e.target.value)}>
                <option value="">— none named —</option>
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Note" htmlFor="bl-note">
            <input id="bl-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. figures from the report's methodology section" />
          </Field>
          {current && (
            <Field label="Why this replaces the baseline on record" htmlFor="bl-reason" hint={`The earlier figure (${current.kwhPerKl.toFixed(2)} kWh/KL) stays on record with this reason.`}>
              <input id="bl-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Record the baseline"}</button>
            {current && !inModal && <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>}
          </div>
        </form>
      )}

      <details className="rounded-[var(--r-sm)] border px-3 py-2" style={{ borderColor: "var(--border)" }}>
        <summary className="cursor-pointer text-[13px] font-semibold">Type in days from the report</summary>
        <form onSubmit={submitDays} className="mt-3 flex flex-col gap-3">
          <Field label="One line per day — date, kWh, KL" htmlFor="bl-days" hint="e.g. 24 June 2026, 592, 987. A day the meter has already reported is left as it is.">
            <textarea id="bl-days" className="field min-h-[120px] font-mono text-[12px]" value={daysText} onChange={(e) => setDaysText(e.target.value)} />
          </Field>
          {daysError && <ErrorText>{daysError}</ErrorText>}
          {daysDone && <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>{daysDone}</p>}
          <div>
            <button type="submit" className="btn-secondary" disabled={daysPending || daysText.trim() === ""}>{daysPending ? "Adding…" : "Add these days"}</button>
          </div>
        </form>
      </details>
    </div>
  );
}
