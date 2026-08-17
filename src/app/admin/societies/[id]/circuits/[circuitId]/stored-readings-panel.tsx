"use client";

// CON-45 — the circuit's stored daily readings, grouped by phase, with the
// persistent exclusion control: before a report generates, any date can be
// excluded from every average and report from then on. Excluded rows stay
// listed, struck through, with the reason — a report that silently omits
// days invites the dispute it exists to settle.

import { useState, useTransition } from "react";
import { Card, EmptyState, ErrorText, StatusChip } from "@/components/ui";
import {
  SAVINGS_BAND_META,
  VARIANCE_BAND_META,
  type SavingsBand,
  type VarianceBand,
} from "@/lib/circuit-load";
import { setReadingExclusion } from "./reading-actions";

export type StoredReadingDTO = {
  id: string;
  date: string;
  kWh: number;
  intervalCount: number | null;
  expectedIntervals: number | null;
  phase: "pre_install" | "post_install" | "monitoring";
  excluded: boolean;
  excludedReason: string | null;
  released: boolean;
  superseded: boolean;
  variancePct: number | null;
  varianceBand: VarianceBand | null;
  savingsPct: number | null;
  savingsBand: SavingsBand | null;
};

const PHASE_LABEL: Record<StoredReadingDTO["phase"], string> = {
  pre_install: "Pre-installation",
  post_install: "Post-installation",
  monitoring: "Monthly monitoring",
};

function ExclusionControl({ reading, editable }: { reading: StoredReadingDTO; editable: boolean }) {
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function toggle() {
    let reason = "";
    if (!reading.excluded) {
      const answer = window.prompt(
        `Exclude ${reading.date} from every average and report from now on. Why? (The reports will show this reason.)`,
      );
      if (answer === null) return;
      reason = answer;
    }
    startTransition(async () => {
      const result = await setReadingExclusion(reading.id, !reading.excluded, reason);
      setError("error" in result ? result.error : undefined);
    });
  }

  if (!editable) return null;
  return (
    <span>
      <button type="button" onClick={toggle} disabled={pending} className="btn-ghost text-xs">
        {reading.excluded ? "Include again" : "Exclude"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}

function rowStyle(r: StoredReadingDTO): React.CSSProperties {
  if (r.excluded) return { opacity: 0.55 };
  if (r.phase === "pre_install" && r.varianceBand) {
    const meta = VARIANCE_BAND_META[r.varianceBand];
    return meta.bg === "transparent" ? {} : { backgroundColor: meta.bg };
  }
  if (r.phase !== "pre_install" && r.savingsBand) {
    return { backgroundColor: SAVINGS_BAND_META[r.savingsBand].bg };
  }
  return {};
}

export function StoredReadingsPanel({
  readings,
  canEdit,
  summaries,
}: {
  readings: StoredReadingDTO[];
  canEdit: boolean;
  summaries: {
    phase: StoredReadingDTO["phase"];
    label: string;
    averageKwh: number | null;
    savingsPct: number | null;
    savingsBand: SavingsBand | null;
    warn: boolean;
  }[];
}) {
  const [openPhases, setOpenPhases] = useState<Set<string>>(
    // The newest phase present starts open; history starts folded.
    () => {
      const phases = [...new Set(readings.map((r) => r.phase))];
      return new Set(phases.length > 0 ? [phases[phases.length - 1]] : []);
    },
  );

  if (readings.length === 0) {
    return (
      <EmptyState title="No daily readings stored yet">
        Upload the meter&apos;s CSV in the step above — every day is reviewed before it is saved.
      </EmptyState>
    );
  }

  const phases: StoredReadingDTO["phase"][] = ["pre_install", "post_install", "monitoring"];

  return (
    <div className="space-y-4">
      {phases.map((phase) => {
        const rows = readings.filter((r) => r.phase === phase);
        if (rows.length === 0) return null;
        const summary = summaries.find((s) => s.phase === phase);
        const open = openPhases.has(phase);
        const excludedCount = rows.filter((r) => r.excluded).length;
        return (
          <Card key={phase} className="p-4 space-y-3">
            <button
              type="button"
              className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-left"
              onClick={() =>
                setOpenPhases((prev) => {
                  const next = new Set(prev);
                  if (next.has(phase)) next.delete(phase);
                  else next.add(phase);
                  return next;
                })
              }
            >
              <span className="font-medium text-sm">{PHASE_LABEL[phase]}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {rows.length} day{rows.length === 1 ? "" : "s"}
                {excludedCount > 0 && ` · ${excludedCount} excluded`}
              </span>
              {summary?.averageKwh != null && (
                <StatusChip tone="info">
                  avg {summary.averageKwh.toFixed(2)} kWh/day
                </StatusChip>
              )}
              {summary?.savingsPct != null && summary.savingsBand && (
                <span
                  className="num text-xs font-semibold rounded-[var(--r-sm)] px-2 py-0.5"
                  style={{
                    backgroundColor: SAVINGS_BAND_META[summary.savingsBand].bg,
                    color: SAVINGS_BAND_META[summary.savingsBand].accent,
                  }}
                >
                  {summary.savingsPct.toFixed(1)}% savings · {SAVINGS_BAND_META[summary.savingsBand].label}
                </span>
              )}
              <span className="ml-auto text-xs text-[var(--text-muted)]">{open ? "Hide" : "Show"}</span>
            </button>

            {open && (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>kWh</th>
                      <th>Hours</th>
                      <th>{phase === "pre_install" ? "vs theoretical" : "Savings"}</th>
                      <th>Status</th>
                      {canEdit && <th>{""}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} style={rowStyle(r)}>
                        <td className="num" style={r.excluded ? { textDecoration: "line-through" } : undefined}>
                          {r.date}
                        </td>
                        <td className="num" style={r.excluded ? { textDecoration: "line-through" } : undefined}>
                          {r.kWh.toFixed(2)}
                        </td>
                        <td className="num">
                          {r.intervalCount ?? "—"}
                          {r.intervalCount != null &&
                            r.expectedIntervals != null &&
                            r.intervalCount < r.expectedIntervals && (
                              <span style={{ color: "var(--warn-fg)" }}> of {r.expectedIntervals}</span>
                            )}
                        </td>
                        <td className="num">
                          {phase === "pre_install"
                            ? r.variancePct === null
                              ? "—"
                              : `${r.variancePct > 0 ? "+" : ""}${r.variancePct.toFixed(1)}%`
                            : r.savingsPct === null
                              ? "—"
                              : `${r.savingsPct.toFixed(1)}%`}
                          {phase === "pre_install" && r.varianceBand && (
                            <span className="text-xs text-[var(--text-muted)]">
                              {" "}
                              · {VARIANCE_BAND_META[r.varianceBand].label}
                            </span>
                          )}
                          {phase !== "pre_install" && r.savingsBand && (
                            <span className="text-xs text-[var(--text-muted)]">
                              {" "}
                              · {SAVINGS_BAND_META[r.savingsBand].label}
                            </span>
                          )}
                        </td>
                        <td className="text-xs text-[var(--text-muted)]">
                          {r.released
                            ? "Billed — locked"
                            : r.excluded
                              ? `Excluded — ${r.excludedReason}`
                              : r.superseded
                                ? "Superseded by a later upload"
                                : "Counted"}
                        </td>
                        {canEdit && (
                          <td>{!r.released && <ExclusionControl reading={r} editable={canEdit} />}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
