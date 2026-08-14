"use client";

import { useState, useTransition } from "react";
import { recordCommissioningReading, fixCommissioningAnomaly } from "./monitoring-actions";

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

  const fieldStyle = { borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" };

  return (
    <section className="max-w-md mb-10">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <p className="text-sm text-[var(--text-muted)] mb-3">
        {validCount} of {REQUIRED_VALID_DAYS} valid days recorded.
      </p>

      {readings.length > 0 && (
        <ul className="text-sm mb-4 space-y-1">
          {readings.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
              <span>{r.date.slice(0, 10)}</span>
              {r.status === "valid" ? (
                <span>{r.consumptionKwh} kWh</span>
              ) : (
                <span style={{ color: "var(--warn-fg)" }}>Anomaly — {r.anomalyNote}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!canEdit && <p className="text-sm text-[var(--text-muted)]">Only PER-04/PER-01 can record days on this window.</p>}

      {canEdit && pendingAnomaly && (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: "var(--warn-fg)" }}>
            An anomaly is open — investigate on site, then record the fix to restart the 5-day count at the next
            midnight.
          </p>
          <button type="button" onClick={fix} disabled={pending} className="btn-primary text-sm disabled:opacity-60">
            {pending ? "Recording…" : "Record fix & restart"}
          </button>
        </div>
      )}

      {canEdit && !pendingAnomaly && (
        <div className="space-y-2">
          <label className="block text-xs">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={pending}
              className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
              style={fieldStyle}
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={isAnomaly} onChange={(e) => setIsAnomaly(e.target.checked)} disabled={pending} />
            Flag this day as an anomaly instead of a reading
          </label>
          {!isAnomaly ? (
            <label className="block text-xs">
              Consumption (kWh)
              <input
                type="number"
                value={consumptionKwh}
                onChange={(e) => setConsumptionKwh(e.target.value)}
                disabled={pending}
                className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
                style={fieldStyle}
              />
            </label>
          ) : (
            <label className="block text-xs">
              Anomaly note
              <input
                value={anomalyNote}
                onChange={(e) => setAnomalyNote(e.target.value)}
                disabled={pending}
                className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
                style={fieldStyle}
              />
            </label>
          )}
          {error && (
            <p className="text-sm" style={{ color: "var(--bad-fg)" }}>
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={pending || (isAnomaly ? !anomalyNote.trim() : !consumptionKwh.trim())}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {pending ? "Recording…" : "Record day"}
          </button>
        </div>
      )}
    </section>
  );
}
