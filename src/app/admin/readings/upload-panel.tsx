"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field, StatusChip } from "@/components/ui";
import type { ClarifyingQuestion, MappingProposal } from "@/lib/reading-ingest-ai";
import type { ReadingMapping } from "@/lib/reading-normalize";
import { getReadingUploadUrl } from "./uploads";
import {
  abandonUpload,
  commitUpload,
  confirmMapping,
  discardUpload,
  recordRawUpload,
  requestMapping,
  type PreviewResult,
} from "./actions";

type CircuitOption = { id: string; label: string; alreadyHasReadings: boolean };

type Duplicate = {
  rawFileId: string;
  fileName: string;
  uploadedAt: string;
  daysProduced: number | null;
  readingsUsedInCalculation: number;
};

const DEFAULT_MAPPING: ReadingMapping = {
  delimiter: ",",
  headerRowIndex: 0,
  dateColumn: 0,
  timeColumn: 1,
  valueColumn: 2,
  valueUnit: "kWh",
  dateFormat: "ISO",
  granularity: "sub_daily",
  valueKind: "interval",
  footerRowsToIgnore: 0,
};

export function UploadPanel({ period, circuits }: { period: string; circuits: CircuitOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [circuitId, setCircuitId] = useState("");
  const [vendor, setVendor] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [rawFileId, setRawFileId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MappingProposal | null>(null);
  const [mapping, setMapping] = useState<ReadingMapping>(DEFAULT_MAPPING);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [aiDown, setAiDown] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [duplicate, setDuplicate] = useState<Duplicate | null>(null);

  const selected = circuits.find((c) => c.id === circuitId);

  function reset() {
    setRawFileId(null);
    setProposal(null);
    setQuestions([]);
    setAnswers({});
    setPreview(null);
    setDuplicate(null);
    setAiDown(false);
    setFile(null);
    setFileText("");
    setMapping(DEFAULT_MAPPING);
  }

  async function onUpload() {
    setError(null);
    setNotice(null);
    if (!circuitId) return setError("Pick the circuit this export belongs to.");
    if (!file) return setError("Choose the vendor's export file.");

    setBusy("Storing the file…");
    try {
      const text = await file.text();
      setFileText(text);

      // The bytes reach S3 before anything interprets them (CON-30). If the
      // rest of this flow falls over, the evidence is already safe.
      const presigned = await getReadingUploadUrl({
        circuitId,
        period,
        fileName: file.name,
        contentType: file.type || "text/csv",
      });
      if ("error" in presigned) {
        setError(presigned.error);
        return;
      }
      const { uploadUrl, key } = presigned;
      const put = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "text/csv" },
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);

      const recorded = await recordRawUpload({
        circuitId,
        period,
        s3Key: key,
        fileName: file.name,
        contentType: file.type || "text/csv",
        byteSize: file.size,
        vendor,
      });
      if ("error" in recorded) throw new Error(recorded.error);
      setRawFileId(recorded.rawFileId);

      setBusy("Reading the file's shape…");
      const mapped = await requestMapping(recorded.rawFileId, text);
      if (mapped.kind === "error") throw new Error(mapped.error);
      if (mapped.kind === "ai_unavailable") {
        // FEAT-043-AC-3 — the file is stored; only the convenience is lost.
        setAiDown(true);
        setNotice(mapped.error);
        setMapping(DEFAULT_MAPPING);
      } else {
        setProposal(mapped.proposal);
        setMapping(mapped.proposal.mapping);
        setQuestions(mapped.proposal.questions);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onAnswer() {
    if (!rawFileId || !fileText) return;
    setError(null);
    setBusy("Re-reading with your answers…");
    try {
      const mapped = await requestMapping(rawFileId, fileText, answers);
      if (mapped.kind === "error") throw new Error(mapped.error);
      if (mapped.kind === "proposal") {
        setProposal(mapped.proposal);
        setMapping(mapped.proposal.mapping);
        setQuestions(mapped.proposal.questions);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not re-read the file.");
    } finally {
      setBusy(null);
    }
  }

  function onConfirm() {
    if (!rawFileId) return;
    setError(null);
    const overridden =
      !!proposal && JSON.stringify(proposal.mapping) !== JSON.stringify(mapping);
    startTransition(async () => {
      const res = await confirmMapping(rawFileId, mapping, fileText, { overridden });
      if ("error" in res) return setError(res.error);
      setPreview(res.result);
    });
  }

  function onCommit(replaceExisting = false) {
    if (!rawFileId) return;
    setError(null);
    startTransition(async () => {
      const res = await commitUpload(rawFileId, fileText, { replaceExisting });
      if ("error" in res) return setError(res.error);
      if ("duplicate" in res) return setDuplicate(res.duplicate);
      setNotice(
        `Committed ${res.committed.days} days (${res.committed.coverageDays} of ${res.committed.daysInMonth} covered). ` +
          (res.committed.blocking > 0
            ? `${res.committed.blocking} flag${res.committed.blocking === 1 ? "" : "s"} block this month from billing — resolve them in Anomaly review.`
            : "No blocking flags."),
      );
      reset();
      router.refresh();
    });
  }

  function onAbandon() {
    if (!rawFileId) return;
    const reason = window.prompt("Why is this file being abandoned?");
    if (!reason) return;
    startTransition(async () => {
      const res = await abandonUpload(rawFileId, reason);
      if ("error" in res) return setError(res.error);
      setNotice("Abandoned. Nothing was imported.");
      reset();
      router.refresh();
    });
  }

  function onDiscardDuplicate() {
    if (!rawFileId) return;
    startTransition(async () => {
      const res = await discardUpload(rawFileId);
      if ("error" in res) return setError(res.error);
      setNotice("Discarded — the readings already on file were kept.");
      reset();
      router.refresh();
    });
  }

  const working = busy !== null || pending;

  return (
    <Card className="p-6 mb-6">
      <CardTitle>Upload a vendor export</CardTitle>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Circuit" htmlFor="rd-circuit">
          <select
            id="rd-circuit"
            className="field"
            value={circuitId}
            onChange={(e) => setCircuitId(e.target.value)}
            disabled={working || !!rawFileId}
          >
            <option value="">Select a circuit…</option>
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.alreadyHasReadings ? " — already has readings" : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor" htmlFor="rd-vendor" hint="Optional — whose app this came from.">
          <input
            id="rd-vendor"
            className="field"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            disabled={working || !!rawFileId}
          />
        </Field>
        <Field label="Export file" htmlFor="rd-file" hint="CSV from the meter vendor's app.">
          <input
            id="rd-file"
            className="field"
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={working || !!rawFileId}
          />
        </Field>
      </div>

      {selected?.alreadyHasReadings && !rawFileId && (
        <p className="mt-3 text-sm" style={{ color: "var(--warn-fg)" }}>
          This circuit already has committed readings for {period}. You&apos;ll be asked whether to
          replace them before anything is written.
        </p>
      )}

      {!rawFileId && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={onUpload} disabled={working}>
            {busy ?? "Upload and read"}
          </button>
        </div>
      )}

      {notice && (
        <p className="mt-4 text-sm" style={{ color: "var(--ok-fg)" }}>
          {notice}
        </p>
      )}
      {error && (
        <div className="mt-4">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {rawFileId && (aiDown || proposal) && !preview && (
        <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--line)" }}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <p className="lbl">Column mapping</p>
            {aiDown ? (
              <StatusChip tone="warn">Automatic reading unavailable — map by hand</StatusChip>
            ) : (
              <StatusChip tone={proposal!.confidence === "high" ? "ok" : "warn"}>
                {proposal!.confidence} confidence
              </StatusChip>
            )}
          </div>

          {proposal?.columnNames?.length ? (
            <p className="mb-4 text-sm text-[var(--text-muted)]">
              Columns found: {proposal.columnNames.map((n, i) => `${i}: ${n}`).join(" · ")}
            </p>
          ) : null}
          {proposal?.notes ? (
            <p className="mb-4 text-sm text-[var(--text-muted)]">{proposal.notes}</p>
          ) : null}

          {questions.length > 0 && (
            <div className="mb-5 rounded-[var(--r-md)] border p-4" style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)" }}>
              <p className="lbl mb-3">Needs an answer before this can be trusted</p>
              <div className="space-y-3">
                {questions.map((q) => (
                  <Field key={q.id} label={q.question} htmlFor={`q-${q.id}`}>
                    <select
                      id={`q-${q.id}`}
                      className="field"
                      value={answers[q.question] ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [q.question]: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {q.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary mt-3"
                onClick={onAnswer}
                disabled={working || Object.keys(answers).length === 0}
              >
                Re-read with these answers
              </button>
            </div>
          )}

          {/* FEAT-044-AC-5 — every proposed value is editable, at any
              confidence. Confidence is not authority. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Header row (index)" htmlFor="m-header">
              <input
                id="m-header"
                type="number"
                className="field"
                value={mapping.headerRowIndex}
                onChange={(e) => setMapping({ ...mapping, headerRowIndex: Number(e.target.value) })}
              />
            </Field>
            <Field label="Date column" htmlFor="m-date">
              <input
                id="m-date"
                type="number"
                className="field"
                value={mapping.dateColumn}
                onChange={(e) => setMapping({ ...mapping, dateColumn: Number(e.target.value) })}
              />
            </Field>
            <Field label="Time column" htmlFor="m-time" hint="-1 if there isn't one.">
              <input
                id="m-time"
                type="number"
                className="field"
                value={mapping.timeColumn ?? -1}
                onChange={(e) =>
                  setMapping({
                    ...mapping,
                    timeColumn: Number(e.target.value) >= 0 ? Number(e.target.value) : null,
                  })
                }
              />
            </Field>
            <Field label="Reading column" htmlFor="m-value">
              <input
                id="m-value"
                type="number"
                className="field"
                value={mapping.valueColumn}
                onChange={(e) => setMapping({ ...mapping, valueColumn: Number(e.target.value) })}
              />
            </Field>
            <Field label="Date format" htmlFor="m-format">
              <select
                id="m-format"
                className="field"
                value={mapping.dateFormat}
                onChange={(e) =>
                  setMapping({ ...mapping, dateFormat: e.target.value as ReadingMapping["dateFormat"] })
                }
              >
                {["ISO", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY", "YYYY/MM/DD"].map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit" htmlFor="m-unit">
              <select
                id="m-unit"
                className="field"
                value={mapping.valueUnit}
                onChange={(e) =>
                  setMapping({ ...mapping, valueUnit: e.target.value as ReadingMapping["valueUnit"] })
                }
              >
                {["kWh", "Wh", "MWh"].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Reading kind"
              htmlFor="m-kind"
              hint="A cumulative register read as consumption is the costliest mis-mapping there is."
            >
              <select
                id="m-kind"
                className="field"
                value={mapping.valueKind}
                onChange={(e) =>
                  setMapping({ ...mapping, valueKind: e.target.value as ReadingMapping["valueKind"] })
                }
              >
                <option value="interval">Consumption for the interval</option>
                <option value="cumulative">Cumulative meter register</option>
              </select>
            </Field>
            <Field label="Delimiter" htmlFor="m-delim">
              <select
                id="m-delim"
                className="field"
                value={mapping.delimiter}
                onChange={(e) =>
                  setMapping({ ...mapping, delimiter: e.target.value as ReadingMapping["delimiter"] })
                }
              >
                <option value=",">Comma</option>
                <option value=";">Semicolon</option>
                <option value={"\t"}>Tab</option>
                <option value="|">Pipe</option>
              </select>
            </Field>
            <Field label="Footer rows to ignore" htmlFor="m-footer">
              <input
                id="m-footer"
                type="number"
                className="field"
                value={mapping.footerRowsToIgnore}
                onChange={(e) =>
                  setMapping({ ...mapping, footerRowsToIgnore: Number(e.target.value) })
                }
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={onConfirm} disabled={working}>
              Confirm mapping and preview
            </button>
            <button type="button" className="btn-ghost" onClick={onAbandon} disabled={working}>
              Abandon this file
            </button>
          </div>
        </div>
      )}

      {preview && !duplicate && (
        <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--line)" }}>
          <p className="lbl mb-3">What this would import</p>
          <div className="flex flex-wrap gap-x-8 gap-y-2 mb-4 text-sm">
            <span>
              <span className="num font-semibold">{preview.daysProduced}</span> days
            </span>
            <span>
              <span className="num font-semibold">{preview.totalKwh.toFixed(2)}</span> kWh total
            </span>
            <span>
              <span className="num font-semibold">{preview.rowsParsed}</span> of{" "}
              <span className="num">{preview.rowsAttempted}</span> rows read (
              <span className="num">{preview.parseRatePct}%</span>)
            </span>
            <span>
              Coverage{" "}
              <span className="num font-semibold">
                {preview.coverage.coverageDays}/{preview.coverage.daysInMonth}
              </span>
            </span>
          </div>

          {preview.coverage.belowFloor && (
            <p className="mb-4 text-sm" style={{ color: "var(--warn-fg)" }}>
              Below CON-12&apos;s 20-day floor. The month will not produce a billing-grade figure
              unless it is explicitly accepted in Anomaly review.
            </p>
          )}
          {preview.problems.map((p) => (
            <p key={p} className="mb-2 text-sm" style={{ color: "var(--warn-fg)" }}>
              {p}
            </p>
          ))}

          <div className="overflow-x-auto mb-4">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="text-right">kWh</th>
                  <th className="text-right">Intervals</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((r) => (
                  <tr key={r.date}>
                    <td className="num">{r.date}</td>
                    <td className="num text-right">{r.kWh.toFixed(3)}</td>
                    <td className="num text-right">{r.intervalCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={() => onCommit(false)} disabled={working}>
              Commit these readings
            </button>
            <button type="button" className="btn-secondary" onClick={() => setPreview(null)} disabled={working}>
              Back to the mapping
            </button>
            <button type="button" className="btn-ghost" onClick={onAbandon} disabled={working}>
              Abandon this file
            </button>
          </div>
        </div>
      )}

      {duplicate && (
        // FEAT-043-AC-5 — the choice is explicit, and neither option is the
        // default. Committing on top of existing readings without this step
        // is how a monthly total silently doubles.
        <div
          className="mt-6 rounded-[var(--r-md)] border p-4"
          style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)" }}
        >
          <p className="font-semibold mb-1">{period} already has readings for this circuit</p>
          <p className="text-sm mb-3">
            {duplicate.fileName} was uploaded on {duplicate.uploadedAt.slice(0, 10)} and produced{" "}
            {duplicate.daysProduced ?? "—"} days.
            {duplicate.readingsUsedInCalculation > 0
              ? ` ${duplicate.readingsUsedInCalculation} of those days have already been billed and cannot be changed.`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-danger"
              onClick={() => onCommit(true)}
              disabled={working || duplicate.readingsUsedInCalculation > 0}
            >
              Replace with this file
            </button>
            <button type="button" className="btn-secondary" onClick={onDiscardDuplicate} disabled={working}>
              Keep what&apos;s there, discard this file
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
