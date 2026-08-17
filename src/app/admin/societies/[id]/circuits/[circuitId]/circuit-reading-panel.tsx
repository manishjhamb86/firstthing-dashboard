"use client";

// CON-45 — upload a meter CSV against THIS circuit, review every produced
// day row by row, and save only what you accepted. The system derives the
// phase and the window; every judgment stays with the operator.

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, StatusChip } from "@/components/ui";
import {
  SAVINGS_BAND_META,
  VARIANCE_BAND_META,
  SAVINGS_WARN_BELOW,
  type SavingsBand,
  type VarianceBand,
} from "@/lib/circuit-load";
import {
  abortCircuitUpload,
  commitCircuitReadings,
  getCircuitReadingUploadUrl,
  previewCircuitReadings,
  recordCircuitRawUpload,
  type CircuitPreviewDTO,
  type CommitSummary,
  type PreviewRowDTO,
  type RowDecision,
} from "./reading-actions";

const KIND_LABEL: Record<string, string> = {
  pre_install: "Pre-installation readings",
  post_install: "Post-installation readings",
  monitoring: "Monthly monitoring readings",
};

const KIND_HINT: Record<string, string> = {
  pre_install:
    "Each day is compared against the load inventory's theoretical figure — the check that nothing unknown is consuming on this circuit. Within ±5% clean; ±5–10% flagged; beyond ±10% a red warning. Nothing blocks — you decide.",
  post_install:
    "Each day shows its savings against the pre-install average. ≥65% green · 60–65% cyan · 58–60% yellow · 55–58% orange · <55% red. Above 80% is flagged for a meter check, not celebrated.",
  monitoring:
    "The system picked up from the last stored reading (one day back on purpose — the previous final day may have been cut mid-day) through yesterday. Savings are against the same pre-install average as always.",
};

function fmtPct(pct: number | null): string {
  if (pct === null) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function rowStyle(row: PreviewRowDTO): React.CSSProperties {
  if (row.disposition === "out_of_window" || row.disposition === "stored_match") return { opacity: 0.55 };
  if (row.phase === "pre_install" && row.varianceBand) {
    const meta = VARIANCE_BAND_META[row.varianceBand as VarianceBand];
    return meta.bg === "transparent" ? {} : { backgroundColor: meta.bg };
  }
  if (row.phase === "post_install" && row.savingsBand) {
    return { backgroundColor: SAVINGS_BAND_META[row.savingsBand as SavingsBand].bg };
  }
  return {};
}

function comparisonCell(row: PreviewRowDTO): { text: string; label: string } {
  if (row.phase === "pre_install") {
    if (row.varianceBand === null) return { text: "—", label: "No inventory to compare against" };
    return {
      text: fmtPct(row.variancePct),
      label: VARIANCE_BAND_META[row.varianceBand as VarianceBand].label,
    };
  }
  if (row.savingsBand === null) return { text: "—", label: "No baseline yet" };
  return {
    text: row.savingsPct === null ? "—" : `${row.savingsPct.toFixed(1)}%`,
    label: SAVINGS_BAND_META[row.savingsBand as SavingsBand].label,
  };
}

export function CircuitReadingPanel({ circuitId }: { circuitId: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "working" | "review" | "done">("idle");
  const [error, setError] = useState<string | undefined>();
  const [preview, setPreview] = useState<CircuitPreviewDTO | undefined>();
  const [rawFileId, setRawFileId] = useState<string | undefined>();
  const [fileText, setFileText] = useState<string | undefined>();
  const [fileName, setFileName] = useState<string | undefined>();
  // Per-date operator decisions. Absent = defaults (save, count in average
  // unless partial).
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [noAverage, setNoAverage] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<CommitSummary | undefined>();
  const [showOutOfWindow, setShowOutOfWindow] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const actionable = useMemo(
    () => (preview?.rows ?? []).filter((r) => r.disposition === "new" || r.disposition === "supersede"),
    [preview],
  );

  // Live footer: what will actually be saved and what it averages to.
  const liveSummary = useMemo(() => {
    if (!preview) return null;
    const kept = actionable.filter((r) => !rejected.has(r.date));
    const counted = kept.filter(
      (r) => !r.partial && !(preview.kind === "pre_install" && noAverage.has(r.date)),
    );
    const total = kept.reduce((s, r) => s + r.kWh, 0);
    const avg = counted.length > 0 ? counted.reduce((s, r) => s + r.kWh, 0) / counted.length : null;
    let savings: number | null = null;
    if (preview.kind !== "pre_install" && preview.baseline && avg !== null) {
      savings = ((preview.baseline - avg) / preview.baseline) * 100;
    }
    return { kept: kept.length, counted: counted.length, total, avg, savings };
  }, [preview, actionable, rejected, noAverage]);

  function reset() {
    setStage("idle");
    setError(undefined);
    setPreview(undefined);
    setRawFileId(undefined);
    setFileText(undefined);
    setFileName(undefined);
    setRejected(new Set());
    setNoAverage(new Set());
    setSummary(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(undefined);
    setStage("working");
    setFileName(file.name);
    startTransition(async () => {
      try {
        const text = await file.text();
        // Raw file to S3 first — a dead preview never costs the evidence.
        const presigned = await getCircuitReadingUploadUrl({
          circuitId,
          fileName: file.name,
          contentType: file.type || "text/csv",
        });
        if ("error" in presigned) throw new Error(presigned.error);
        const put = await fetch(presigned.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "text/csv" },
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status}). Try again.`);
        const recorded = await recordCircuitRawUpload({
          circuitId,
          s3Key: presigned.key,
          fileName: file.name,
          contentType: file.type || "text/csv",
          byteSize: file.size,
        });
        if ("error" in recorded) throw new Error(recorded.error);
        const previewed = await previewCircuitReadings(recorded.rawFileId, text);
        if ("error" in previewed) throw new Error(previewed.error);

        // Partial days start deselected from the average, visibly — the
        // operator can put one back deliberately.
        const partials = new Set(
          previewed.preview.rows
            .filter((r) => (r.disposition === "new" || r.disposition === "supersede") && r.partial)
            .map((r) => r.date),
        );
        setNoAverage(partials);
        setRawFileId(recorded.rawFileId);
        setFileText(text);
        setPreview(previewed.preview);
        setStage("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStage("idle");
      }
    });
  }

  function save() {
    if (!rawFileId || !fileText || !preview) return;
    setError(undefined);
    startTransition(async () => {
      const decisions: RowDecision[] = actionable.map((r) => ({
        date: r.date,
        save: !rejected.has(r.date),
        ...(preview.kind === "pre_install"
          ? { countInAverage: !noAverage.has(r.date) && !r.partial }
          : {}),
      }));
      const result = await commitCircuitReadings(rawFileId, fileText, decisions);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSummary(result.summary);
        setStage("done");
      }
    });
  }

  function abort() {
    if (!rawFileId) {
      reset();
      return;
    }
    const reason = window.prompt("Abort this upload — nothing will be saved. Why?");
    if (reason === null) return;
    if (!reason.trim()) {
      setError("Say why the upload is being abandoned.");
      return;
    }
    startTransition(async () => {
      const result = await abortCircuitUpload(rawFileId, reason);
      if ("error" in result) setError(result.error);
      else reset();
    });
  }

  if (stage === "done" && summary) {
    return (
      <Card className="p-5 space-y-3 text-sm">
        <p className="font-medium">Readings saved.</p>
        <ul className="text-[var(--text-muted)] space-y-1">
          <li>
            <span className="num">{summary.saved}</span> day{summary.saved === 1 ? "" : "s"} saved
            {summary.excluded > 0 && (
              <> — <span className="num">{summary.excluded}</span> stored excluded from the average, with the reason on the row</>
            )}
          </li>
          {summary.superseded > 0 && (
            <li>
              <span className="num">{summary.superseded}</span> overlap day superseded by the fuller value (the old value stays on record)
            </li>
          )}
          {summary.rejected > 0 && <li><span className="num">{summary.rejected}</span> rejected — not stored</li>}
          {summary.keptStored > 0 && (
            <li>
              <span className="num">{summary.keptStored}</span> changed day{summary.keptStored === 1 ? "" : "s"} kept at the stored value — the sheet disagreed and the store wins
            </li>
          )}
          {summary.baseline !== null && (
            <li>
              Pre-install average now <span className="num font-semibold">{summary.baseline.toFixed(2)}</span> kWh/day
            </li>
          )}
          {summary.benchmark && (
            <li>
              Measured savings <span className="num font-semibold">{summary.benchmark.pct.toFixed(1)}%</span>{" "}
              {summary.benchmark.inBand
                ? "— inside CON-20's 60–80% band; benchmark confirmed"
                : "— outside CON-20's 60–80% band; routed to review, no benchmark written"}
            </li>
          )}
        </ul>
        <button
          type="button"
          onClick={() => {
            reset();
            router.refresh();
          }}
          className="btn-primary"
        >
          Done
        </button>
      </Card>
    );
  }

  if (stage !== "review" || !preview) {
    return (
      <Card className="p-5 space-y-3">
        <p className="text-sm text-[var(--text-muted)]">
          Upload the meter&apos;s exported CSV. The system reads the whole file, picks the days that
          belong to this circuit&apos;s current step, and shows every one for review before anything
          is saved.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileSelected}
          disabled={pending}
          aria-label="Meter readings CSV"
          className="block w-full text-xs text-[var(--text-muted)] file:mr-3 file:rounded-[var(--r-sm)] file:border file:border-[var(--field-border)] file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--text)] hover:file:bg-[var(--surface-hover)]"
        />
        {pending && <p className="text-xs text-[var(--text-muted)]">Reading {fileName}…</p>}
        {error && <ErrorText>{error}</ErrorText>}
      </Card>
    );
  }

  const visibleRows = preview.rows.filter((r) => showOutOfWindow || r.disposition !== "out_of_window");
  const isPre = preview.kind === "pre_install";

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-sm">{KIND_LABEL[preview.kind]}</span>
        <StatusChip tone="info">
          {preview.windowFrom} → {preview.windowTo}
        </StatusChip>
        <span className="text-xs text-[var(--text-muted)]">
          {preview.vendor.toUpperCase()} format · {preview.parse.daysInFile} days in file ·{" "}
          {preview.actionable} in this step
        </span>
      </div>
      <p className="text-xs text-[var(--text-muted)]">{KIND_HINT[preview.kind]}</p>

      {preview.noInventoryWarning && (
        <p className="text-sm rounded-[var(--r-sm)] border p-3" style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
          No load inventory is recorded for this circuit, so there is no theoretical figure to
          compare these days against. Record the inventory above first — the comparison is the whole
          point of the pre-installation window.
        </p>
      )}
      {preview.changedStored > 0 && (
        <p className="text-sm rounded-[var(--r-sm)] border p-3" style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}>
          {preview.changedStored} already-stored day{preview.changedStored === 1 ? "" : "s"} in this
          sheet carr{preview.changedStored === 1 ? "ies" : "y"} a different value than the system
          has. Check this is the right meter&apos;s export. The stored values stay — they are what
          the baseline and reports were computed from.
        </p>
      )}
      {preview.released > 0 && (
        <p className="text-xs text-[var(--text-muted)]">
          {preview.released} day{preview.released === 1 ? " is" : "s are"} locked — already billed on
          a released calculation (INV-03).
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Save</th>
              <th>Date</th>
              <th>kWh</th>
              <th>Hours</th>
              <th>{isPre ? "vs theoretical" : "Savings"}</th>
              <th>Reading status</th>
              {isPre && <th>In average</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const cmp = comparisonCell(row);
              const isActionable = row.disposition === "new" || row.disposition === "supersede";
              return (
                <tr key={row.date} style={rowStyle(row)}>
                  <td>
                    {isActionable ? (
                      <input
                        type="checkbox"
                        checked={!rejected.has(row.date)}
                        aria-label={`Save ${row.date}`}
                        onChange={() =>
                          setRejected((prev) => {
                            const next = new Set(prev);
                            if (next.has(row.date)) next.delete(row.date);
                            else next.add(row.date);
                            return next;
                          })
                        }
                        disabled={pending}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">{row.date}</td>
                  <td className="num">{row.kWh.toFixed(2)}</td>
                  <td className="num">
                    {row.intervalCount}
                    {row.partial && (
                      <span style={{ color: "var(--warn-fg)" }}> of {preview.expectedIntervals}</span>
                    )}
                  </td>
                  <td className="num">
                    {cmp.text}
                    <span className="text-xs text-[var(--text-muted)]"> · {cmp.label}</span>
                  </td>
                  <td className="text-xs text-[var(--text-muted)]">
                    {row.disposition === "new" && (row.partial ? "Partial day" : "New")}
                    {row.disposition === "supersede" &&
                      `Replaces stored ${row.storedKwh?.toFixed(2)} kWh (was cut mid-day)`}
                    {row.disposition === "stored_match" && "Already in system — unchanged"}
                    {row.disposition === "stored_changed" &&
                      `Sheet says ${row.kWh.toFixed(2)}, keeping stored ${row.storedKwh?.toFixed(2)}`}
                    {row.disposition === "released" && "Billed — locked (INV-03)"}
                    {row.disposition === "out_of_window" && "Outside this step's window"}
                  </td>
                  {isPre && (
                    <td>
                      {isActionable && !rejected.has(row.date) ? (
                        <input
                          type="checkbox"
                          checked={!noAverage.has(row.date)}
                          aria-label={`Count ${row.date} in the average`}
                          onChange={() =>
                            setNoAverage((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.date)) next.delete(row.date);
                              else next.add(row.date);
                              return next;
                            })
                          }
                          disabled={pending}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {liveSummary && (
            <tfoot>
              <tr>
                <td colSpan={2} className="font-medium">
                  {liveSummary.kept} day{liveSummary.kept === 1 ? "" : "s"} to save
                </td>
                <td className="num font-semibold">{liveSummary.total.toFixed(2)}</td>
                <td colSpan={isPre ? 4 : 3} className="text-sm">
                  {liveSummary.avg !== null && (
                    <>
                      Average <span className="num font-semibold">{liveSummary.avg.toFixed(2)}</span> kWh/day
                      {isPre && " — this becomes the baseline every future savings % is measured against"}
                      {liveSummary.savings !== null && (
                        <>
                          {" · savings "}
                          <span
                            className="num font-semibold"
                            style={{
                              color:
                                liveSummary.savings < SAVINGS_WARN_BELOW ? "var(--bad-fg)" : undefined,
                            }}
                          >
                            {liveSummary.savings.toFixed(1)}%
                          </span>
                          {liveSummary.savings < SAVINGS_WARN_BELOW &&
                            " — below the 60% the contract is built on"}
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {preview.outOfWindow > 0 && (
        <button
          type="button"
          onClick={() => setShowOutOfWindow((v) => !v)}
          className="btn-ghost text-xs"
        >
          {showOutOfWindow ? "Hide" : "Show"} {preview.outOfWindow} out-of-window day
          {preview.outOfWindow === 1 ? "" : "s"} (before the meter, the replacement day, or today)
        </button>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || (liveSummary?.kept ?? 0) === 0}
          className="btn-primary"
        >
          Save {liveSummary?.kept ?? 0} reading{(liveSummary?.kept ?? 0) === 1 ? "" : "s"}
        </button>
        <button type="button" onClick={abort} disabled={pending} className="btn-ghost">
          Abort — save nothing
        </button>
      </div>
    </Card>
  );
}
