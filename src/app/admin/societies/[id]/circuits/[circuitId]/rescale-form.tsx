"use client";

import { useState, useTransition } from "react";
import { recordLightCountChange } from "./rescale-actions";
import { Card, ErrorText, Field } from "@/components/ui";
import { rescaleBaseline } from "@/lib/benchmark-rescale";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function RescaleForm({
  circuitId,
  currentLightCount,
  effectiveBaseline,
}: {
  circuitId: string;
  currentLightCount: number;
  effectiveBaseline: number;
}) {
  const [newLightCount, setNewLightCount] = useState("");
  const [verificationNote, setVerificationNote] = useState("");
  const [verificationPhotoUrl, setVerificationPhotoUrl] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const parsed = Number(newLightCount);
  const preview =
    Number.isInteger(parsed) && parsed > 0 && parsed !== currentLightCount
      ? rescaleBaseline(effectiveBaseline, currentLightCount, parsed)
      : null;
  const backdated = effectiveDate < todayISO();

  function submit() {
    startTransition(async () => {
      const result = await recordLightCountChange(circuitId, {
        newLightCount: parsed,
        verificationNote,
        verificationPhotoUrl,
        effectiveDate,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      setNewLightCount("");
      setVerificationNote("");
      setVerificationPhotoUrl("");
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        A verified light-count change rescales the baseline proportionally (CON-10) — deterministic math, not a
        renegotiation. The savings percentage itself is unchanged.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New metered light count" htmlFor="rs-count" hint={`Currently ${currentLightCount}.`}>
          <input
            id="rs-count"
            type="number"
            min="1"
            step="1"
            value={newLightCount}
            onChange={(e) => setNewLightCount(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
        <Field
          label="Effective from"
          htmlFor="rs-date"
          hint={backdated ? "Backdated — earlier months are not restated." : undefined}
        >
          <input
            id="rs-date"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
      </div>

      {/* The operator sees the exact figure before committing it — this is
          a number the society is billed against, not a preference. */}
      {preview != null && (
        <div
          className="rounded-[var(--r-md)] border p-3 text-sm"
          style={{ borderColor: "var(--info-line)", background: "var(--info-bg)", color: "var(--info-fg)" }}
        >
          Baseline rescales{" "}
          <span className="num font-semibold">{effectiveBaseline.toFixed(2)}</span> →{" "}
          <span className="num font-semibold">{preview.toFixed(2)}</span> kWh/day
          <span className="text-xs">
            {" "}
            ({effectiveBaseline.toFixed(2)} ÷ {currentLightCount} × {parsed})
          </span>
        </div>
      )}

      <Field
        label="How was the new count verified?"
        htmlFor="rs-note"
        hint="Required — an unverified count change is refused."
      >
        <textarea
          id="rs-note"
          rows={2}
          value={verificationNote}
          onChange={(e) => setVerificationNote(e.target.value)}
          disabled={pending}
          placeholder="Walked and counted with the society's electrician on 12 Sep; 4 fixtures added in the east corridor."
          className="field"
        />
      </Field>

      <Field label="Verification photo URL (optional)" htmlFor="rs-photo">
        <input
          id="rs-photo"
          value={verificationPhotoUrl}
          onChange={(e) => setVerificationPhotoUrl(e.target.value)}
          disabled={pending}
          placeholder="https://…"
          className="field"
        />
      </Field>

      {error && <ErrorText>{error}</ErrorText>}

      <button
        type="button"
        onClick={submit}
        disabled={pending || !newLightCount.trim() || !verificationNote.trim()}
        className="btn-primary"
      >
        {pending ? "Recording…" : "Record verified count change"}
      </button>
    </Card>
  );
}
