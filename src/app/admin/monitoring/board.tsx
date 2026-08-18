"use client";

import { useState } from "react";
import Link from "next/link";
import { EmptyState, StatusChip } from "@/components/ui";

export type BoardRow = {
  id: string;
  href: string;
  society: string;
  circuit: string;
  /** which state of commissioning this circuit is in */
  group: "review" | "pre" | "post" | "resolved";
  stageLabel: string;
  /** sorts the whole board; lower is more urgent */
  rank: number;
  urgent: boolean;
  validCount: number | null;
  requiredDays: number;
  today: "logged" | "not_yet" | null;
  signal: string;
  signalTone: "ok" | "warn" | "bad" | "neu" | null;
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs review" },
  { id: "pre", label: "Pre-install" },
  { id: "post", label: "Post-install" },
  { id: "resolved", label: "Resolved" },
] as const;

function DayStrip({ validCount, required }: { validCount: number; required: number }) {
  return (
    <span className="inline-flex gap-1 align-middle" aria-hidden>
      {Array.from({ length: required }, (_, i) => (
        <span
          key={i}
          className="h-1.5 w-4 rounded-full"
          style={{ background: i < validCount ? "var(--accent)" : "var(--surface-active)" }}
        />
      ))}
    </span>
  );
}

/**
 * One list, not four sections and not four tabs.
 *
 * Both of those hide work — a tab behind a click, a section below the fold —
 * and on a board whose whole job is "nothing gets missed", hiding is the
 * defect. So every circuit in commissioning is in ONE list ordered by
 * urgency, which puts whatever needs acting on at the top by construction.
 * The chips filter that list rather than reveal it: the default is All, so
 * narrowing is always the user's deliberate act and never the starting state.
 */
export function MonitoringBoard({ rows }: { rows: BoardRow[] }) {
  const [filter, setFilter] = useState<string>("all");

  const counts: Record<string, number> = {
    all: rows.length,
    review: rows.filter((r) => r.group === "review").length,
    pre: rows.filter((r) => r.group === "pre").length,
    post: rows.filter((r) => r.group === "post").length,
    resolved: rows.filter((r) => r.group === "resolved").length,
  };

  const shown = (filter === "all" ? rows : rows.filter((r) => r.group === filter))
    .slice()
    .sort((a, b) => a.rank - b.rank || a.society.localeCompare(b.society));

  return (
    <div className="card overflow-hidden">
      <div
        className="flex flex-wrap items-center gap-2 border-b p-3"
        style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}
      >
        {FILTERS.map((f) => {
          const on = f.id === filter;
          const n = counts[f.id];
          const urgent = f.id === "review" && n > 0;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.id)}
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors"
              style={{
                background: on ? "var(--accent)" : "var(--surface)",
                color: on ? "var(--text-on-accent)" : "var(--text-muted)",
                border: `1px solid ${on ? "var(--accent)" : "var(--field-border)"}`,
              }}
            >
              {f.label}
              <span
                className="num rounded-full px-1.5 text-[11px] leading-[1.6]"
                style={
                  on
                    ? { background: "rgba(255,255,255,0.22)", color: "var(--text-on-accent)" }
                    : urgent
                      ? { background: "var(--bad-bg)", color: "var(--bad-fg)" }
                      : { background: "var(--surface-active)", color: "var(--text-subtle)" }
                }
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="p-5">
          <EmptyState title={filter === "all" ? "Nothing in a commissioning window" : "Nothing in this state"}>
            {filter === "all"
              ? "A circuit appears here the day after its meter is installed, and stays until its benchmark is confirmed."
              : "Clear the filter to see every circuit in commissioning."}
          </EmptyState>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th>Circuit</th>
                <th>Stage</th>
                <th>Progress</th>
                <th>Today</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  // The urgent rows are tinted as well as sorted first, so the
                  // top of the list reads as "act on this" without counting.
                  style={r.urgent ? { background: "var(--bad-bg)" } : undefined}
                >
                  <td>
                    <Link href={r.href} className="font-medium hover:underline">
                      {r.society}
                    </Link>
                  </td>
                  <td className="text-[var(--text-muted)]">{r.circuit}</td>
                  <td>
                    <StatusChip tone={r.urgent ? "bad" : r.group === "resolved" ? "ok" : "neu"}>
                      {r.stageLabel}
                    </StatusChip>
                  </td>
                  <td>
                    {r.validCount === null ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <DayStrip validCount={r.validCount} required={r.requiredDays} />
                        <span className="num text-xs text-[var(--text-muted)]">
                          {r.validCount}/{r.requiredDays}
                        </span>
                      </span>
                    )}
                  </td>
                  <td>
                    {r.today === null ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : r.today === "logged" ? (
                      <StatusChip tone="ok">Logged</StatusChip>
                    ) : (
                      <StatusChip tone="warn">Not yet</StatusChip>
                    )}
                  </td>
                  <td>
                    {r.signalTone ? (
                      <StatusChip tone={r.signalTone}>{r.signal}</StatusChip>
                    ) : (
                      <span className="num">{r.signal}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
