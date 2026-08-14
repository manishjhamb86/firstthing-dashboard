"use client";

import { useRef, useState, useTransition } from "react";
import { uploadCommissioningReadingsCsv } from "./monitoring-actions";

export function CsvUploadForm({ circuitId, windowType }: { circuitId: string; windowType: "pre_install" | "post_install" }) {
  const [fileName, setFileName] = useState<string | undefined>();
  const [result, setResult] = useState<{ succeeded: number; total: number; error?: string } | undefined>();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    startTransition(async () => {
      const text = await file.text();
      const outcome = await uploadCommissioningReadingsCsv(circuitId, windowType, text);
      setResult(outcome);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-2">
      <p className="text-xs text-[var(--text-muted)]">
        Or upload a sheet — a CSV with <code>date,consumption_kwh</code> columns (add
        <code>anomaly_note</code> for anomaly rows, leaving consumption_kwh blank).
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={onFileSelected}
        disabled={pending}
        className="text-sm"
      />
      {pending && <p className="text-xs text-[var(--text-muted)]">Uploading {fileName}…</p>}
      {result && !pending && (
        <p className="text-xs" style={{ color: result.error ? "var(--warn-fg)" : "var(--ok-fg)" }}>
          {result.error ?? `Applied all ${result.succeeded} of ${result.total} rows.`}
        </p>
      )}
    </div>
  );
}
