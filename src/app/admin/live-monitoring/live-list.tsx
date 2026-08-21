"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, EmptyState, StatusChip } from "@/components/ui";
import { SERVICE_LINE_LABEL } from "@/lib/status-maps";

export type LiveCircuitRow = {
  id: string;
  label: string;
  serviceLine: string;
  benchmarkPct: number | null;
  measuredPct: number | null;
  /** below the band the contract is built on */
  warn: boolean;
  days: number;
  lastReading: string | null;
};

export type LiveSocietyRow = {
  id: string;
  name: string;
  location: string;
  circuits: LiveCircuitRow[];
};

/**
 * Live monitoring: one row per SOCIETY, with that society's circuits as
 * lines attached to it, filterable by service line (user's own shape,
 * 2026-08-21).
 *
 * Grouping matters here in a way it does not on the demo board. A circuit in
 * commissioning is a task; a live circuit is part of how one society is
 * performing against the benchmark it is billed on — and a society with
 * three lighting circuits is one relationship, not three unrelated rows.
 *
 * Filtering is client-side deliberately: the whole set is already on the
 * page, and a filter that re-fetches would make "show me lighting only" feel
 * like navigating away from what you were reading.
 */
export function LiveList({
  societies,
  serviceLines,
}: {
  societies: LiveSocietyRow[];
  serviceLines: string[];
}) {
  const [line, setLine] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      societies
        .map((s) => ({
          ...s,
          circuits: s.circuits.filter((c) => {
            if (line !== "all" && c.serviceLine !== line) return false;
            if (!q) return true;
            // Matching the SOCIETY keeps all of its circuits — you searched
            // for the relationship, not for one of its rows.
            return (
              s.name.toLowerCase().includes(q) ||
              s.location.toLowerCase().includes(q) ||
              c.label.toLowerCase().includes(q)
            );
          }),
        }))
        // A society with nothing left is not "a society with no circuits" —
        // it is simply not on that line, so it drops out.
        .filter((s) => s.circuits.length > 0)
    );
  }, [societies, line, query]);

  const countFor = (l: string) =>
    l === "all"
      ? societies.reduce((n, s) => n + s.circuits.length, 0)
      : societies.reduce((n, s) => n + s.circuits.filter((c) => c.serviceLine === l).length, 0);

  return (
    <>
      {/* Always rendered, even on a single service line. Hiding the bar when
          there was only one made the whole feature look absent on a
          deployment that happens to run one line — which is exactly what
          stage looks like (user-reported 2026-08-21). */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search society or circuit…"
          aria-label="Search society or circuit"
          className="field field-auto w-full sm:w-72"
        />
        <div className="flex flex-wrap gap-2">
          {["all", ...serviceLines].map((l) => {
            const on = l === line;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLine(l)}
                className="chip"
                style={{
                  background: on ? "var(--accent)" : "var(--surface)",
                  color: on ? "#fff" : "var(--text-muted)",
                  borderColor: on ? "var(--accent)" : "var(--border)",
                }}
              >
                {l === "all" ? "All service lines" : SERVICE_LINE_LABEL[l] ?? l}
                <span className="num" style={{ opacity: 0.75 }}>
                  {countFor(l)}
                </span>
              </button>
            );
          })}
        </div>
        {(query.trim() !== "" || line !== "all") && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setLine("all");
            }}
            className="btn-ghost btn-sm"
          >
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={
            query.trim() !== ""
              ? `Nothing matches “${query.trim()}”`
              : line === "all"
                ? "No circuits are live yet"
                : `No circuits are live on ${SERVICE_LINE_LABEL[line] ?? line}`
          }
        >
          {query.trim() !== "" || line !== "all"
            ? "Clear the filter to see every live circuit."
            : "A circuit arrives here once its benchmark is confirmed and its installation is signed off — billing starts the day after the completion certificate (CON-22)."}
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {filtered.map((s) => {
            const below = s.circuits.filter((c) => c.warn).length;
            const measured = s.circuits.filter((c) => c.measuredPct != null).length;
            return (
              <Card key={s.id} className="p-0 overflow-hidden">
                <div
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5"
                  style={{ background: "var(--surface-sunken)" }}
                >
                  <span className="min-w-0">
                    <Link href={`/admin/societies/${s.id}`} className="font-semibold hover:underline">
                      {s.name}
                    </Link>
                    <span className="block text-xs text-[var(--text-muted)]">{s.location}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 shrink-0">
                    <span className="text-xs text-[var(--text-muted)]">
                      <span className="num">{s.circuits.length}</span> circuit
                      {s.circuits.length === 1 ? "" : "s"}
                    </span>
                    {/* The society-level answer: is anything here under the
                        band it is billed on? */}
                    {measured === 0 ? (
                      <StatusChip tone="neu">Awaiting readings</StatusChip>
                    ) : below > 0 ? (
                      <StatusChip tone="warn">
                        {below} of {s.circuits.length} below band
                      </StatusChip>
                    ) : (
                      <StatusChip tone="ok">On target</StatusChip>
                    )}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Circuit</th>
                        <th>Service line</th>
                        <th>Benchmark</th>
                        <th>Measured</th>
                        <th>Days</th>
                        <th>Last reading</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.circuits.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link
                              href={`/admin/live-monitoring/${c.id}`}
                              className="font-medium hover:underline"
                            >
                              {c.label} →
                            </Link>
                          </td>
                          <td className="text-[var(--text-muted)]">
                            {SERVICE_LINE_LABEL[c.serviceLine] ?? c.serviceLine}
                          </td>
                          <td className="num">
                            {c.benchmarkPct != null ? `${c.benchmarkPct.toFixed(1)}%` : "—"}
                          </td>
                          <td>
                            {c.measuredPct == null ? (
                              <span className="text-[var(--text-muted)]">awaiting readings</span>
                            ) : (
                              <StatusChip tone={c.warn ? "warn" : "ok"}>
                                {c.measuredPct.toFixed(1)}%
                              </StatusChip>
                            )}
                          </td>
                          <td className="num">{c.days}</td>
                          <td className="num text-[var(--text-muted)]">{c.lastReading ?? "none yet"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
