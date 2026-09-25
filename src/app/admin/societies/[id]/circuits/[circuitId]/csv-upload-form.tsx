"use client";

import { FileDrop } from "@/components/file-drop";
import { useState, useTransition } from "react";
import { uploadCommissioningReadingsCsv } from "./monitoring-actions";

export function CsvUploadForm({
  circuitId,
  windowType,
}: {
  circuitId: string;
  windowType: "pre_install" | "post_install";
}) {
  const [fileName, setFileName] = useState<string | undefined>();
  const [result, setResult] = useState<{ succeeded: number; total: number; error?: string } | undefined>();
  const [pending, startTransition] = useTransition();

  function onFileSelected(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    startTransition(async () => {
      const text = await file.text();
      const outcome = await uploadCommissioningReadingsCsv(circuitId, windowType, text);
      setResult(outcome);
    });
  }

  const inputId = `csv-${windowType}-${circuitId}`;

  return (
    <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
      <label htmlFor={inputId} className="lbl">
        Or upload a sheet
      </label>
      <p className="text-xs text-[var(--text-muted)]">
        A CSV with <code>date,consumption_kwh</code> columns (add <code>anomaly_note</code> for anomaly rows,
        leaving consumption_kwh blank).
      </p>
      <FileDrop id={inputId} accept=".csv,text/csv" files={[]} onFiles={(f) => onFileSelected(f[0])} disabled={pending} compact />
      {pending && <p className="text-xs text-[var(--text-muted)]">Uploading {fileName}…</p>}
      {result && !pending && (
        <p className="text-xs" style={{ color: result.error ? "var(--warn-fg)" : "var(--ok-fg)" }}>
          {result.error ?? `Applied all ${result.succeeded} of ${result.total} rows.`}
        </p>
      )}
    </div>
  );
}
