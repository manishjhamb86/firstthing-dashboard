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
  /** INV-09's day check — a stored day whose figure looks impossible. */
  flagged?: boolean;
  /**
   * Hours that actually carried a reading, from the meter's own hourly
   * store. The vendor's export writes 0 for an hour the meter was offline
   * or switched off, so a day can hold 24 rows and still be mostly silence —
   * this is what tells them apart. Null when no meter is bound (an upload
   * has no hour-level truth to check against).
   */
  dataHours?: number | null;
  variancePct: number | null;
  varianceBand: VarianceBand | null;
  savingsPct: number | null;
  savingsBand: SavingsBand | null;
  /** Non-null when this day can no longer be excluded or re-included. */
  frozenReason?: string | null;
};

const PHASE_LABEL: Record<StoredReadingDTO["phase"], string> = {
  pre_install: "Pre-installation readings",
  post_install: "Post-installation readings",
  // Only ever rendered on the Live monitoring screen. The circuit page used
  // to label its post-replacement days "Monthly monitoring" as soon as a
  // benchmark existed, which named the very days that PRODUCED the benchmark
  // after something else entirely (user-reported 2026-08-20).
  monitoring: "Monthly readings",
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
  // Don't offer what can only refuse. This control used to render on every
  // row; on a circuit past its benchmark the action refused every time and
  // the refusal was a line of small text in the last column, so the rows
  // simply "came back on refresh".
  if (reading.frozenReason) {
    return <span className="text-xs text-[var(--text-subtle)]">{reading.frozenReason}</span>;
  }
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
  allComplete = false,
  commissionedBaseline = null,
  demoDayCount = 0,
  fromDemoReport = false,
}: {
  readings: StoredReadingDTO[];
  canEdit: boolean;
  /** Every step on this circuit is done — nothing here needs looking at. */
  allComplete?: boolean;
  /**
   * Circuit.preInstallBaseline — the figure frozen at light replacement and
   * measured against ever since. Passed in so the pre-install group can name
   * BOTH numbers when they differ, rather than showing one average under a
   * heading while the step above shows another (user-reported 2026-08-20:
   * "the window states 12.47 but the readings show 12.59").
   */
  commissionedBaseline?: number | null;
  /**
   * Days held against this circuit's demos rather than in this store.
   *
   * A circuit commissioned before this system existed has no reviewed
   * meter days at all — its evidence is the demo report's own table. The
   * empty state used to send that operator off to upload a CSV nobody has,
   * which is the same dead end this project has now fixed three times: a
   * screen naming a next step its reader cannot reach.
   */
  demoDayCount?: number;
  /**
   * These days were printed in the demo report rather than reviewed from a
   * meter export. Said plainly at the top, because a reader who cannot tell
   * the two apart cannot judge how much weight the figures carry.
   */
  fromDemoReport?: boolean;
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
    // The newest phase present starts open, because it is the one still
    // being worked on — unless nothing is: once every step is complete the
    // whole page folds to headers and figures (user-reported 2026-08-20).
    () => {
      if (allComplete) return new Set<string>();
      const phases = [...new Set(readings.map((r) => r.phase))];
      return new Set(phases.length > 0 ? [phases[phases.length - 1]] : []);
    },
  );

  if (readings.length === 0) {
    return demoDayCount ? (
      <EmptyState title="No monthly readings stored yet">
        {`This circuit was commissioned before this system existed, so its evidence is the ${demoDayCount} days recorded against its demos above, not a reviewed meter export. Each month's readings are added from here once they are uploaded.`}
      </EmptyState>
    ) : (
      <EmptyState title="No daily readings stored yet">
        Upload the meter&apos;s CSV in the step above — every day is reviewed before it is saved.
      </EmptyState>
    );
  }

  const phases: StoredReadingDTO["phase"][] = ["pre_install", "post_install", "monitoring"];

  return (
    <div className="space-y-4">
      {fromDemoReport && (
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          These are the days this circuit&apos;s demo report printed, not a reviewed meter export —
          this society was commissioned before the system existed. They are what its baseline and
          benchmark were computed from, and they cannot be excluded or re-reviewed here.
        </p>
      )}
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
                  {/* Named, not just "avg": this is the average of the days
                      LISTED HERE, which is not necessarily the figure in
                      force. */}
                  these days average {summary.averageKwh.toFixed(2)} kWh/day
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

            {/* The two figures are both correct and they are not the same
                thing: the commissioned baseline froze when the lights were
                replaced, and this list has moved since. Showing one without
                naming the other is what made them look like a contradiction.
                Shown whether or not the table is open, because the gap is
                visible in the header itself. */}
            {phase === "pre_install" &&
              commissionedBaseline != null &&
              summary?.averageKwh != null &&
              Math.abs(commissionedBaseline - summary.averageKwh) > 0.005 && (
                <p className="text-xs text-[var(--text-muted)]">
                  Commissioned baseline is{" "}
                  <span className="num font-semibold text-[var(--text)]">
                    {commissionedBaseline.toFixed(2)}
                  </span>{" "}
                  kWh/day — frozen when the lights were replaced, and what every savings figure is
                  measured against. These{" "}
                  <span className="num">{rows.length - excludedCount}</span> counted day
                  {rows.length - excludedCount === 1 ? "" : "s"} average{" "}
                  <span className="num font-semibold text-[var(--text)]">
                    {summary.averageKwh.toFixed(2)}
                  </span>{" "}
                  because days were added or excluded after that. Changing the list does not move the
                  baseline (ADR-005).
                </p>
              )}

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
