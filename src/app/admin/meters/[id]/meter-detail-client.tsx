"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, StatusChip } from "@/components/ui";
import { syncMeterNow } from "../actions";
import { analyseMeterCsv, commitMeterCsv, type CsvPreview } from "../csv-actions";

/**
 * Reading a meter now, and importing its exported history.
 *
 * The import is deliberately two steps with a confirmation between them. The
 * export carries no device identity, so which meter it belongs to is a
 * judgement — and a file filed against the wrong meter puts one society's
 * consumption into another's monitoring and looks entirely normal
 * afterwards. The system proposes; a person confirms.
 */
export function MeterDetailActions({ meterId, mode }: { meterId: string; mode: "read" | "upload" }) {
  return mode === "read" ? <ReadNow meterId={meterId} /> : <UploadHistory meterId={meterId} />;
}

function ReadNow({ meterId }: { meterId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="text-right">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await syncMeterNow(meterId);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Reading…" : "Read now"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

function UploadHistory({ meterId }: { meterId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [text, setText] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [done, setDone] = useState<{
    text: string;
    billing?: { href: string; circuitLabel: string; days: number; flagged: number; partialExcluded: number };
    note?: string;
  } | null>(null);

  function choose(file: File) {
    setError(null);
    setDone(null);
    setPreview(null);
    start(async () => {
      const contents = await file.text();
      setText(contents);
      setFileName(file.name);
      const r = await analyseMeterCsv({ fileName: file.name, text: contents, meterId });
      if (r.error) setError(r.error);
      else setPreview(r.preview!);
    });
  }

  const proposed =
    preview?.match.kind === "confident" ? preview.match.best : null;
  // "This page's meter is not the one the evidence points at" is the thing
  // worth saying out loud — not merely recorded once the import is done.
  const mismatch = proposed !== null && proposed.meterId !== meterId;
  const noEvidence = preview !== null && preview.match.kind !== "confident";

  return (
    <div className="min-w-0">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) choose(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() => fileRef.current?.click()}
      >
        {pending ? "Reading the file…" : "Upload history CSV"}
      </button>

      {error && <ErrorText>{error}</ErrorText>}
      {done && (
        <div className="mt-2 text-[13px]">
          <p style={{ color: "var(--ok-fg)" }}>{done.text}</p>
          {done.billing && (
            <p className="mt-1">
              <strong>{done.billing.days}</strong> days projected to <strong>{done.billing.circuitLabel}</strong>
              {done.billing.partialExcluded > 0 && `, ${done.billing.partialExcluded} partial excluded`}
              {done.billing.flagged > 0 && (
                <span style={{ color: "var(--warn-fg)" }}>, {done.billing.flagged} flagged</span>
              )}
              {" — "}
              <a href={done.billing.href} className="font-semibold underline">
                see live monitoring →
              </a>
            </p>
          )}
          {done.note && (
            <p className="mt-1" style={{ color: "var(--text-subtle)" }}>
              Not projected to billing: {done.note}.
            </p>
          )}
        </div>
      )}

      {preview && (
        <div
          className="mt-3 rounded-[var(--r-md)] p-4 text-left"
          style={{ background: "var(--surface-sunken)", border: "1px solid var(--border)" }}
        >
          <p className="mb-2 text-[14px] font-semibold">{preview.fileName}</p>
          <dl className="mb-3 grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
            <Row label="Covers">
              {preview.firstDay} → {preview.lastDay} ({preview.days} days)
            </Row>
            <Row label="Hours in the file">
              {preview.hours}
              {preview.unparseableRows > 0 && (
                <span style={{ color: "var(--warn-fg)" }}> · {preview.unparseableRows} unreadable</span>
              )}
            </Row>
            <Row label="Total">{preview.totalKwh.toFixed(2)} kWh</Row>
            <Row label="Hours carrying a reading">
              {preview.nonZeroHours}
              <span style={{ color: "var(--text-subtle)" }}>
                {" "}
                of {preview.hours}
              </span>
            </Row>
          </dl>

          {/* Which meter the evidence points at. */}
          <div
            className="mb-3 rounded-[var(--r-sm)] p-3 text-[13px]"
            style={{
              background: mismatch || noEvidence ? "var(--warn-bg)" : "var(--ok-bg)",
              border: `1px solid ${mismatch || noEvidence ? "var(--warn-line)" : "var(--ok-line)"}`,
            }}
          >
            {proposed && !mismatch && (
              <>
                <StatusChip tone="ok">Matches this meter</StatusChip>
                <p className="mt-2">
                  {proposed.distinctive} hours that carry a reading agree with what is already stored
                  here, and none disagree.
                </p>
              </>
            )}
            {mismatch && proposed && (
              <>
                <StatusChip tone="warn">This file looks like another meter</StatusChip>
                <p className="mt-2">
                  It agrees with <strong>{proposed.meterName}</strong>
                  {proposed.circuitLabel ? ` (${proposed.circuitLabel})` : ""} on {proposed.distinctive}{" "}
                  hours that carry a reading. Importing it here would file that meter&rsquo;s consumption
                  against this one.
                </p>
              </>
            )}
            {noEvidence && preview.match.kind === "no_evidence" && (
              <>
                <StatusChip tone="warn">Nothing to match against</StatusChip>
                <p className="mt-2">{preview.match.reason}</p>
              </>
            )}
            {noEvidence && preview.match.kind === "ambiguous" && (
              <>
                <StatusChip tone="warn">More than one meter agrees</StatusChip>
                <p className="mt-2">{preview.match.reason}</p>
              </>
            )}
          </div>

          {preview.effect && (
            <p className="mb-3 text-[13px]">
              Committing stores <strong>{preview.effect.newHours}</strong> new hours
              {preview.effect.unchangedHours > 0 && `, leaves ${preview.effect.unchangedHours} unchanged`}
              {preview.effect.supersededHours > 0 && (
                <span style={{ color: "var(--warn-fg)" }}>
                  , and replaces {preview.effect.supersededHours} that are held with a different value
                </span>
              )}
              .
            </p>
          )}

          {preview.problems.length > 0 && (
            <ul className="mb-3 list-disc pl-5 text-[13px]" style={{ color: "var(--warn-fg)" }}>
              {preview.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await commitMeterCsv({
                    meterId,
                    fileName,
                    text,
                    overrodeMatch: mismatch || noEvidence,
                    matchDetail: proposed && !mismatch ? proposed : null,
                  });
                  if (r.error) {
                    setError(r.error);
                    return;
                  }
                  setPreview(null);
                  setDone({
                    text: `Stored ${r.stored} hours${r.superseded ? `, replacing ${r.superseded}` : ""}.`,
                    billing: r.billing,
                    note: r.billingSkipped,
                  });
                  router.refresh();
                })
              }
            >
              {pending
                ? "Storing…"
                : mismatch
                  ? "Import here anyway"
                  : "Import into this meter"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setPreview(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="lbl">{label}</dt>
      <dd className="num mt-0.5">{children}</dd>
    </div>
  );
}
