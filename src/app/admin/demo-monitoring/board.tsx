"use client";

import { useState } from "react";
import { ListToolbar } from "@/components/list-toolbar";
import { SearchInput } from "@/components/search-input";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";
import Link from "next/link";
import { EmptyState, StatusChip } from "@/components/ui";

export type BoardRow = {
  id: string;
  href: string;
  society: string;
  circuit: string;
  serviceLine: string;
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
export function MonitoringBoard({
  rows,
  serviceLines,
}: {
  rows: BoardRow[];
  serviceLines: string[];
}) {
  const [filter, setFilter] = useState<string>("all");
  const [line, setLine] = useState<string>("all");
  const [query, setQuery] = useState("");

  // Society and service line, alongside the state chips — a board ordered by
  // urgency still needs "show me this society" once there is more than a
  // screenful (user-reported 2026-08-21).
  const q = query.trim().toLowerCase();
  const matches = (r: BoardRow) =>
    (line === "all" || r.serviceLine === line) &&
    (q === "" || r.society.toLowerCase().includes(q) || r.circuit.toLowerCase().includes(q));
  const scoped = rows.filter(matches);

  // Counts follow the search and the line, so a chip never promises rows the
  // other filters have already removed.
  const counts: Record<string, number> = {
    all: scoped.length,
    review: scoped.filter((r) => r.group === "review").length,
    pre: scoped.filter((r) => r.group === "pre").length,
    post: scoped.filter((r) => r.group === "post").length,
    resolved: scoped.filter((r) => r.group === "resolved").length,
  };

  const shown = (filter === "all" ? scoped : scoped.filter((r) => r.group === filter))
    .slice()
    .sort((a, b) => a.rank - b.rank || a.society.localeCompare(b.society));

  return (
    <>
      {/* Outside the card, like every other listing's toolbar — it was the
          only page that buried its filters in the table's own header. */}
      <ListToolbar>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search society or circuit…"
          label="Search society or circuit"
          className="w-full sm:w-64"
        />
        {serviceLines.length > 0 && (
          <select
            value={line}
            onChange={(e) => setLine(e.target.value)}
            aria-label="Service line"
            className="field field-auto"
          >
            <option value="all">All service lines</option>
            {serviceLines.map((l) => (
              <option key={l} value={l}>
                {SERVICE_LINE_LABEL[l] ?? l}
              </option>
            ))}
          </select>
        )}
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
      </ListToolbar>

      <div className="card overflow-hidden">
      {shown.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title={
              q !== ""
                ? `Nothing matches “${query.trim()}”`
                : filter === "all" && line === "all"
                  ? "Nothing in a commissioning window"
                  : "Nothing in this state"
            }
          >
            {filter === "all" && line === "all" && q === ""
              ? "A circuit appears here the day after its meter is installed, and stays until its benchmark is confirmed."
              : "Clear the filters to see every circuit in commissioning."}
          </EmptyState>
        </div>
      ) : (
        <>
        {/* Mobile: one card per circuit, not a table squeezed sideways. The
            shape follows the reference the user approved — identity + status
            pill on top, the number and its bar as the middle line, the meta
            line beneath, chevron to open. It carries exactly the same fields
            as the desktop table, so nothing is hidden, only re-laid-out. */}
        <ul className="md:hidden flex flex-col gap-3 p-3">
          {shown.map((r) => (
            <li key={r.id}>
              <Link
                href={r.href}
                className="block card p-4 no-underline"
                style={
                  r.urgent
                    ? { borderColor: "var(--bad-line)", background: "var(--bad-bg)" }
                    : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{r.society}</p>
                    <p className="text-[13px] text-[var(--text-muted)] truncate">{r.circuit}</p>
                  </div>
                  <StatusChip tone={r.urgent ? "bad" : r.group === "resolved" ? "ok" : "neu"}>
                    {r.stageLabel}
                  </StatusChip>
                </div>

                {r.validCount !== null && (
                  <div className="mt-3 flex items-center gap-3">
                    <span className="num text-[22px] font-semibold leading-none">
                      {r.validCount}/{r.requiredDays}
                    </span>
                    <span className="flex-1">
                      <DayStrip validCount={r.validCount} required={r.requiredDays} />
                    </span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  {r.today !== null &&
                    (r.today === "logged" ? (
                      <StatusChip tone="ok">Logged today</StatusChip>
                    ) : (
                      <StatusChip tone="warn">Not logged today</StatusChip>
                    ))}
                  {r.signalTone ? (
                    <StatusChip tone={r.signalTone}>{r.signal}</StatusChip>
                  ) : (
                    <span className="num text-sm text-[var(--text-muted)]">{r.signal}</span>
                  )}
                  <span className="row-link-cue ml-auto text-sm font-semibold" aria-hidden>
                    Open →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden md:block overflow-x-auto">
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
        </>
      )}
      </div>
    </>
  );
}
