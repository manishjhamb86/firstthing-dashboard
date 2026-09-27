"use client";

import { FileDrop } from "@/components/file-drop";
import { useState, useTransition } from "react";
import { ErrorText, Field } from "@/components/ui";
import { uploadFileToS3 } from "@/lib/upload-to-s3";
import { activateContract, correctAgreementDates, markAgreementStep, prepareAgreement, uploadExecutedAgreement } from "./actions";

export function PrepareAgreementButton({ pipelineId }: { pipelineId: string }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await prepareAgreement(pipelineId))?.error))}
      >
        {pending ? "Preparing…" : "Prepare the agreement"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

export function StepButton({
  pipelineId,
  step,
  label,
  disabled,
}: {
  pipelineId: string;
  step: "printed" | "notarized" | "signed";
  label: string;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  // Recording after the fact: the step happened on a day, not necessarily
  // today (backdated deals, 2026-09-15). Closed until asked for.
  const [dated, setDated] = useState(false);
  const [on, setOn] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {dated && (
        <input
          type="date"
          aria-label={`${label} — on`}
          className="field field-auto"
          value={on}
          onChange={(e) => setOn(e.target.value)}
          disabled={pending || disabled}
        />
      )}
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending || disabled || (dated && !on)}
        onClick={() => startTransition(async () => setError((await markAgreementStep(pipelineId, step, dated ? on : undefined))?.error))}
      >
        {pending ? "Saving…" : dated ? `${label} on that date` : label}
      </button>
      {!dated && !disabled && (
        <button type="button" className="btn-ghost btn-sm" onClick={() => setDated(true)}>
          Happened earlier?
        </button>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}

export function ExecutedUploadForm({
  pipelineId,
  societyName,
}: {
  pipelineId: string;
  societyName: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  // INV-04 — the document's period is chosen, never inferred.
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [hasDeviation, setHasDeviation] = useState(false);
  const [deviationNote, setDeviationNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = uploading || pending;

  async function submit() {
    if (!file) return setError("Attach the scanned, signed agreement.");
    setError(undefined);
    setUploading(true);
    try {
      const s3Key = await uploadFileToS3(file, {
        society: societyName,
        month: period,
        docType: "agreement",
        dateLabel: period,
      });
      startTransition(async () => {
        const r = await uploadExecutedAgreement(pipelineId, {
          s3Key,
          fileName: file.name,
          hasDeviation,
          deviationNote,
          period,
          contentType: file.type || "application/octet-stream",
          byteSize: file.size,
        });
        setError(r?.error);
        if (!r?.error) setFile(null);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Executed (signed) scan" htmlFor="ag-file">
          <FileDrop id="ag-file" accept=".pdf,.png,.jpg,.jpeg" disabled={busy} files={file ? [file] : []} onFiles={(f) => setFile(f[0] ?? null)} compact />
        </Field>
        <Field label="Document period" htmlFor="ag-period" hint="An explicit choice.">
          <input
            id="ag-period"
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={busy}
            className="field"
          />
        </Field>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={hasDeviation}
          onChange={(e) => setHasDeviation(e.target.checked)}
          disabled={busy}
          className="mt-1"
        />
        <span>
          The signed document differs from the accepted offer
          <span className="block text-[var(--text-muted)]">
            A handwritten change at signing does happen — the executed document is authoritative, but the
            difference has to be recorded, not quietly absorbed.
          </span>
        </span>
      </label>

      {hasDeviation && (
        <Field label="What differs?" htmlFor="ag-dev">
          <textarea
            id="ag-dev"
            rows={2}
            value={deviationNote}
            onChange={(e) => setDeviationNote(e.target.value)}
            disabled={busy}
            placeholder="Term struck through and rewritten as 48 months, initialled by both parties."
            className="field"
          />
        </Field>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <button type="button" className="btn-primary" onClick={submit} disabled={busy || !file}>
        {uploading ? "Uploading…" : "Upload executed agreement"}
      </button>
    </div>
  );
}

export function ActivateContractForm({ pipelineId }: { pipelineId: string }) {
  const [termStart, setTermStart] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-4">
      <Field label="Term starts" htmlFor="ct-start" hint="The contract's own term end is derived from this.">
        <input
          id="ct-start"
          type="date"
          value={termStart}
          onChange={(e) => setTermStart(e.target.value)}
          disabled={pending}
          className="field field-auto"
        />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() => startTransition(async () => setError((await activateContract(pipelineId, termStart))?.error))}
      >
        {pending ? "Activating…" : "Activate the contract"}
      </button>
    </div>
  );
}

type AgreementDateKey = "prepared" | "printed" | "notarized" | "signed" | "uploaded" | "activated" | "termStart" | "termEnd";

/**
 * Every date on the agreement and its contract, corrected together and
 * checked once (2026-09-27). Closed until asked for. A step that has not
 * happened is not offered — record it with its own control first.
 */
export function AgreementDatesControl({
  pipelineId,
  dates,
  today,
  live,
}: {
  pipelineId: string;
  /** YYYY-MM-DD for each step that has happened; null for one that has not. */
  dates: Record<AgreementDateKey, string | null>;
  today: string;
  live: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(dates);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Correct the dates
      </button>
    );
  }

  const fields: [AgreementDateKey, string][] = [
    ["prepared", "Prepared"],
    ["printed", "Printed"],
    ["notarized", "Notarised"],
    ["signed", "Signed"],
    ["uploaded", "Executed scan uploaded"],
    ["activated", "Contract activated"],
    ["termStart", "Term starts"],
    ["termEnd", "Term ends"],
  ];

  return (
    <form
      className="mt-3 space-y-3 rounded-[var(--r-md)] border border-[var(--border)] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(undefined);
        startTransition(async () => {
          const v = (k: AgreementDateKey) => values[k] ?? undefined;
          const r = await correctAgreementDates(pipelineId, {
            prepared: values.prepared ?? "",
            printed: v("printed"),
            notarized: v("notarized"),
            signed: v("signed"),
            uploaded: v("uploaded"),
            activated: v("activated"),
            termStart: v("termStart"),
            termEnd: v("termEnd"),
            reason,
          });
          if (r && "error" in r) setError(r.error);
          else setOpen(false);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields
          .filter(([k]) => dates[k] !== null)
          .map(([k, label]) => (
            <Field key={k} label={label} htmlFor={`agr-${k}`}>
              <input
                id={`agr-${k}`}
                className="field"
                type="date"
                max={k === "termEnd" ? undefined : today}
                value={values[k] ?? ""}
                onChange={(e) => setValues((cur) => ({ ...cur, [k]: e.target.value }))}
                required
              />
            </Field>
          ))}
      </div>
      {dates.termStart !== null && (
        <p className="text-xs text-[var(--text-muted)]">
          Where no completion certificate is recorded, the term start is when billing starts — monitoring and published
          months follow it.
        </p>
      )}
      <Field label={live ? "Why they are being corrected" : "Why (optional in demo mode)"} htmlFor="agr-reason" hint="Kept with the old dates.">
        <input id="agr-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Typed up after the fact; the agreement was executed earlier." />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save the correction"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => { setOpen(false); setError(undefined); setValues(dates); }}>
          Cancel
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </form>
  );
}
