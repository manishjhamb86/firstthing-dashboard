"use client";

import { useState, useTransition } from "react";
import {
  recordCommissioningReading,
  fixCommissioningAnomaly,
  escalateOutOfBandResult,
} from "./monitoring-actions";
import { CsvUploadForm } from "./csv-upload-form";
import { Card, ErrorText, Field, StatusChip } from "@/components/ui";

type Reading = {
  id: string;
  date: string; // ISO
  status: string;
  consumptionKwh: number | null;
  anomalyNote: string | null;
};

const REQUIRED_VALID_DAYS = 5;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function MonitoringWindowPanel({
  circuitId,
  windowType,
  title,
  readings,
  validCount,
  pendingAnomaly,
  canEdit,
}: {
  circuitId: string;
  windowType: "pre_install" | "post_install";
  title: string;
  readings: Reading[];
  validCount: number;
  pendingAnomaly: boolean;
  canEdit: boolean;
}) {
  const [date, setDate] = useState(todayISO());
  const [consumptionKwh, setConsumptionKwh] = useState("");
  const [isAnomaly, setIsAnomaly] = useState(false);
  const [anomalyNote, setAnomalyNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await recordCommissioningReading(circuitId, windowType, date, {
        consumptionKwh: isAnomaly ? undefined : Number(consumptionKwh),
        anomalyNote: isAnomaly ? anomalyNote : undefined,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      setConsumptionKwh("");
      setAnomalyNote("");
      setIsAnomaly(false);
    });
  }

  function fix() {
    startTransition(async () => {
      const result = await fixCommissioningAnomaly(circuitId, windowType);
      setError(result?.error);
    });
  }

  function escalate() {
    startTransition(async () => {
      const result = await escalateOutOfBandResult(circuitId);
      setError(result?.error);
    });
  }

  const complete = validCount >= REQUIRED_VALID_DAYS;

  return (
    <section className="max-w-md mb-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        <StatusChip tone={complete ? "ok" : pendingAnomaly ? "warn" : "info"}>
          {complete ? "Complete" : `Day ${validCount} of ${REQUIRED_VALID_DAYS}`}
        </StatusChip>
      </div>

      {/* 5-slot progress strip — CON-19's rule is "5 consecutive valid
          days", so showing the count as five discrete slots states the
          actual shape of the requirement, not just a number. */}
      <div className="flex gap-1.5 mb-4" aria-label={`${validCount} of ${REQUIRED_VALID_DAYS} valid days recorded`}>
        {Array.from({ length: REQUIRED_VALID_DAYS }, (_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{ background: i < validCount ? "var(--accent)" : "var(--surface-active)" }}
          />
        ))}
      </div>

      {readings.length > 0 && (
        <Card className="mb-4 overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reading</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r) => (
                <tr key={r.id}>
                  <td className="num">{r.date.slice(0, 10)}</td>
                  <td>
                    {r.status === "valid" ? (
                      <>
                        <span className="num">{r.consumptionKwh}</span> kWh
                      </>
                    ) : (
                      <span style={{ color: "var(--warn-fg)" }}>
                        {/* The flagged reading is shown, not hidden — it is
                            what the flag is about. It just doesn't count. */}
                        {r.consumptionKwh != null && (
                          <>
                            <span className="num">{r.consumptionKwh}</span> kWh —{" "}
                          </>
                        )}
                        {r.anomalyNote}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!canEdit && !complete && (
        <p className="text-sm text-[var(--text-muted)]">Only PER-04/PER-01 can record days on this window.</p>
      )}

      {canEdit && pendingAnomaly && (
        <Card className="p-5 space-y-3">
          <p className="text-sm" style={{ color: "var(--warn-fg)" }}>
            An anomaly is open — investigate on site, then record the fix to restart the 5-day count at the next
            midnight.
          </p>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={fix} disabled={pending} className="btn-primary">
              {pending ? "Recording…" : "Record fix & restart"}
            </button>
            {/* FEAT-015 — the other door out. Restarting the window assumes
                something was fixed; when the shortfall is real, measuring
                again just flags the same day tomorrow. */}
            {windowType === "post_install" && (
              <button type="button" onClick={escalate} disabled={pending} className="btn-secondary">
                Nothing to fix — escalate for review
              </button>
            )}
          </div>
        </Card>
      )}

      {canEdit && !pendingAnomaly && (
        <Card className="p-5 space-y-4">
          <Field label="Date" htmlFor={`mw-date-${windowType}`}>
            <input
              id={`mw-date-${windowType}`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={isAnomaly}
              onChange={(e) => setIsAnomaly(e.target.checked)}
              disabled={pending}
            />
            Flag this day as an anomaly instead of a reading
          </label>
          {!isAnomaly ? (
            <Field label="Consumption (kWh)" htmlFor={`mw-kwh-${windowType}`}>
              <input
                id={`mw-kwh-${windowType}`}
                type="number"
                value={consumptionKwh}
                onChange={(e) => setConsumptionKwh(e.target.value)}
                disabled={pending}
                className="field"
              />
            </Field>
          ) : (
            <Field label="Anomaly note" htmlFor={`mw-note-${windowType}`}>
              <input
                id={`mw-note-${windowType}`}
                value={anomalyNote}
                onChange={(e) => setAnomalyNote(e.target.value)}
                disabled={pending}
                className="field"
              />
            </Field>
          )}
          {error && <ErrorText>{error}</ErrorText>}
          <button
            type="button"
            onClick={submit}
            disabled={pending || (isAnomaly ? !anomalyNote.trim() : !consumptionKwh.trim())}
            className="btn-primary"
          >
            {pending ? "Recording…" : "Record day"}
          </button>
          <CsvUploadForm circuitId={circuitId} windowType={windowType} />
        </Card>
      )}
    </section>
  );
}
