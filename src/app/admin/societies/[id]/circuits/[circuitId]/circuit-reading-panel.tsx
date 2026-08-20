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
  draftDemoReadings,
  getCircuitReadingUploadUrl,
  previewCircuitReadings,
  previewDemoReadings,
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
  // An incomplete day gets no verdict — see circuit-load.ts. Saying so beats
  // a dash, because the operator can see the kWh is low and deserves the
  // reason.
  if (row.partial) {
    return {
      text: "—",
      label:
        row.expectedIntervals === null
          ? "Partial day — not comparable"
          : `Partial day (${row.intervalCount} of ${row.expectedIntervals}h) — not comparable`,
    };
  }
  // Before the meter, or on the replacement day, nothing is being measured
  // that could be compared to anything.
  if (row.phase === "before_meter" || row.phase === "replacement_day") {
    return {
      text: "—",
      label: row.phase === "before_meter" ? "Before the meter went in" : "Replacement day",
    };
  }
  if (row.phase === "pre_install") {
    if (row.varianceBand === null) return { text: "—", label: "No load inventory to compare against" };
    return {
      text: fmtPct(row.variancePct),
      label: VARIANCE_BAND_META[row.varianceBand as VarianceBand].label,
    };
  }
  // Only a post-install day is ever judged against a baseline, so this is the
  // only place that may mention one. It used to be the catch-all fallback,
  // which is how a pre-install row ended up reporting "No baseline yet" —
  // demanding something of the upload that this phase never involves.
  if (row.savingsBand === null) return { text: "—", label: "No baseline recorded yet" };
  return {
    text: row.savingsPct === null ? "—" : `${row.savingsPct.toFixed(1)}%`,
    label: SAVINGS_BAND_META[row.savingsBand as SavingsBand].label,
  };
}

/**
 * The step's valid period, resolved server-side from the circuit's own dates
 * and shown BEFORE a file is chosen (user-asked 2026-08-20: "Show the valid
 * period for meter readings"). Previously the range only appeared once an
 * upload had been parsed — so the one question you have while picking a file
 * was answered only after picking it, and a file of out-of-range days read
 * as a fault rather than as the wrong days.
 */
export type ReadingWindowDTO = {
  kind: "pre_install" | "post_install" | "monitoring";
  from: string;
  to: string;
  empty: boolean;
  demoExtended: boolean;
  /** what the start is anchored to, in words — the pivot and its date */
  startBasis: string;
};

function ValidPeriod({ window: w }: { window: ReadingWindowDTO }) {
  const endBasis = w.demoExtended
    ? "the end is lifted past today because demo mode is on"
    : "the last complete day — today is never imported, because the day is not over";

  if (w.empty) {
    return (
      <div
        className="rounded-[var(--r-sm)] border p-3 text-sm"
        style={{ borderColor: "var(--info-line)", background: "var(--info-bg)", color: "var(--info-fg)" }}
      >
        <p className="font-medium">This step&apos;s window has not opened yet.</p>
        <p className="mt-1">
          Counting starts {w.startBasis}, so the first day that can qualify is{" "}
          <strong className="num">{w.from}</strong>. Nothing recorded before then belongs to this
          step.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-[var(--r-sm)] border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
      <p>
        <span className="lbl">Valid period for this step</span>
      </p>
      <p className="num text-base font-semibold mt-0.5">
        {w.from} → {w.to}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Starts {w.startBasis}; {endBasis}. Days outside this period are still listed, so you can see
        what the file held — they just cannot be saved against this step.
      </p>
    </div>
  );
}

export function CircuitReadingPanel({
  circuitId,
  window: windowInfo,
  demoMode = false,
}: {
  circuitId: string;
  window: ReadingWindowDTO | null;
  demoMode?: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<"idle" | "working" | "fill" | "review" | "done">("idle");
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
  // DEMO_MODE only: the pre-filled day values, held as strings so a field can
  // be cleared and retyped without the row jumping to 0.
  const [draft, setDraft] = useState<{ date: string; kWh: string }[] | undefined>();
  const [draftBasis, setDraftBasis] = useState<string | undefined>();
  const [demoDays, setDemoDays] = useState("7");
  const [demoSavings, setDemoSavings] = useState("68");
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
    setDraft(undefined);
    setDraftBasis(undefined);
    if (inputRef.current) inputRef.current.value = "";
  }

  // ── DEMO_MODE: one click fills the form ────────────────────────────────
  function fillDemo() {
    setError(undefined);
    startTransition(async () => {
      const result = await draftDemoReadings({
        circuitId,
        days: Number(demoDays) || undefined,
        savingsPct: windowInfo?.kind === "pre_install" ? undefined : Number(demoSavings) || undefined,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setDraft(result.draft.days.map((d) => ({ date: d.date, kWh: d.kWh.toFixed(4) })));
      setDraftBasis(result.draft.anchorBasis);
      setStage("fill");
    });
  }

  // The values are the operator's; the classification is never theirs. The
  // server builds the file, re-derives every phase, disposition and band from
  // the circuit's own record, and only then is there anything to review.
  function reviewDraft() {
    if (!draft) return;
    setError(undefined);
    const days: { date: string; kWh: number }[] = [];
    for (const row of draft) {
      const value = Number(row.kWh);
      if (row.kWh.trim() === "" || !Number.isFinite(value) || value < 0) {
        setError(`${row.date}: enter a consumption figure of 0 or more.`);
        return;
      }
      days.push({ date: row.date, kWh: value });
    }
    startTransition(async () => {
      const result = await previewDemoReadings({ circuitId, days });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRawFileId(result.rawFileId);
      setFileText(result.csv);
      setFileName("demo-generated readings");
      setPreview(result.preview);
      setNoAverage(
        new Set(
          result.preview.rows
            .filter((r) => (r.disposition === "new" || r.disposition === "supersede") && r.partial)
            .map((r) => r.date),
        ),
      );
      setStage("review");
    });
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

  // DEMO_MODE — the pre-filled form. The days and their values are already
  // there; the only required action is Review, then Save.
  if (stage === "fill" && draft) {
    return (
      <Card className="p-5 space-y-4">
        <div>
          <p className="font-medium text-sm">Demo readings — {draft.length} day{draft.length === 1 ? "" : "s"}</p>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Pre-filled from {draftBasis}. Adjust any value to see it land in a different band, then
            review. Nothing is saved until you save it.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Consumption (kWh)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {draft.map((row, i) => (
                <tr key={row.date}>
                  <td className="num">{row.date}</td>
                  <td>
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      className="field field-auto num w-36"
                      value={row.kWh}
                      aria-label={`Consumption for ${row.date}`}
                      disabled={pending}
                      onChange={(e) =>
                        setDraft((prev) =>
                          (prev ?? []).map((r, j) => (j === i ? { ...r, kWh: e.target.value } : r)),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      disabled={pending || draft.length === 1}
                      onClick={() => setDraft((prev) => (prev ?? []).filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={reviewDraft} disabled={pending} className="btn-primary">
            Review these {draft.length} day{draft.length === 1 ? "" : "s"}
          </button>
          <button type="button" onClick={reset} disabled={pending} className="btn-ghost">
            Cancel
          </button>
        </div>
      </Card>
    );
  }

  if (stage !== "review" || !preview) {
    return (
      <Card className="p-5 space-y-4">
        {windowInfo && <ValidPeriod window={windowInfo} />}
        <div className="space-y-2">
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
        </div>

        {/* DEMO_MODE — walk the flow without hand-authoring an export. The
            file is the shortcut, not the flow: this generates a real vendor
            export and runs the same review and commit as an upload. */}
        {demoMode && !windowInfo?.empty && (
          <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2">
            <p className="lbl">Demo mode — enter readings by hand</p>
            <p className="text-xs text-[var(--text-muted)]">
              Fills a form with plausible days for the period above, ready to review and save. Useful
              for walking the flow before the upload path is exercised.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-[var(--text-muted)]">
                <span className="block mb-1">Days</span>
                <input
                  type="number"
                  min="1"
                  max="40"
                  className="field field-auto num w-24"
                  value={demoDays}
                  onChange={(e) => setDemoDays(e.target.value)}
                  disabled={pending}
                  aria-label="Days to generate"
                />
              </label>
              {windowInfo?.kind !== "pre_install" && (
                <label className="text-xs text-[var(--text-muted)]">
                  <span className="block mb-1">Target savings %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    className="field field-auto num w-28"
                    value={demoSavings}
                    onChange={(e) => setDemoSavings(e.target.value)}
                    disabled={pending}
                    aria-label="Target savings percent"
                  />
                </label>
              )}
              <button type="button" onClick={fillDemo} disabled={pending} className="btn-tone-info">
                Fill readings form
              </button>
            </div>
          </div>
        )}

        {pending && (
          <p className="text-xs text-[var(--text-muted)]">
            {fileName ? `Reading ${fileName}…` : "Working…"}
          </p>
        )}
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
          {preview.windowEmpty ? "Window not open yet" : `${preview.windowFrom} → ${preview.windowTo}`}
        </StatusChip>
        <span className="text-xs text-[var(--text-muted)]">
          {preview.vendor.toUpperCase()} format · {preview.parse.daysInFile} days in file ·{" "}
          {preview.actionable} in this step
        </span>
      </div>
      <p className="text-xs text-[var(--text-muted)]">{KIND_HINT[preview.kind]}</p>

      {/* The meter went in today or yesterday, so "the day after
          installation" has not finished yet and no day in any file can
          qualify. Previously this rendered as a backwards date range with a
          table of red rows, which reads as a data fault rather than as
          "you are simply early". */}
      {preview.windowEmpty && (
        <p className="text-sm rounded-[var(--r-sm)] border p-3" style={{ borderColor: "var(--info-line)", background: "var(--info-bg)", color: "var(--info-fg)" }}>
          This step&apos;s window has not opened yet. Counting starts
          {windowInfo ? ` ${windowInfo.startBasis}` : " after this step's pivot date"}, and a day
          only counts once it is complete — so the first day that can qualify is{" "}
          <strong className="num">{preview.windowFrom}</strong>. Nothing in this file can be used
          yet; upload it again once that day has passed. Nothing has been saved.
        </p>
      )}
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
          // The brand's lime, used here and effectively nowhere else:
          // docs/product/brand/ gives it one meaning, "lime marks a verified
          // value", and this is the click that turns reviewed rows into
          // stored readings a baseline and a bill will rest on.
          className="btn-signal"
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
