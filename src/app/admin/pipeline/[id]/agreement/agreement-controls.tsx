"use client";

import { useState, useTransition } from "react";
import { ErrorText, Field } from "@/components/ui";
import { uploadFileToS3 } from "@/lib/upload-to-s3";
import { activateContract, markAgreementStep, prepareAgreement, uploadExecutedAgreement } from "./actions";

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
  return (
    <span>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending || disabled}
        onClick={() => startTransition(async () => setError((await markAgreementStep(pipelineId, step))?.error))}
      >
        {pending ? "Saving…" : label}
      </button>
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
          <input
            id="ag-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="field"
          />
        </Field>
        <Field label="Document period" htmlFor="ag-period" hint="An explicit choice (INV-04).">
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
