"use client";

import React, { useMemo, useState, useTransition } from "react";
import { formatDate } from "@/lib/format-date";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorText } from "@/components/ui";
import { getHourlyReadings, setDayValidOverride, setReadingExclusion } from "@/app/admin/readings/exclusion-actions";
import { SAVINGS_BAND_META, type SavingsBand, type VarianceBand } from "@/lib/circuit-load";
import type { HourReading } from "@/lib/hourly-anomaly";

/** One stored monitoring day, as the explorer lists it. */
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
  /** A stored day whose figure looks impossible. */
  flagged?: boolean;
  /** What the detector actually saw — shown as the Flagged chip's own title (2026-10-06, user-caught: "Flagged" with no reason anywhere). */
  flaggedReason?: string | null;
  /**
   * Hours that carried a reading. The vendor writes 0 for an hour the meter
   * was offline, so a 24-row day can still be mostly silence. Null when no
   * hour-level truth exists for the day.
   */
  dataHours?: number | null;
  variancePct: number | null;
  varianceBand: VarianceBand | null;
  savingsPct: number | null;
  savingsBand: SavingsBand | null;
  /** Non-null when this day can no longer be excluded or re-included. */
  frozenReason?: string | null;
  /**
   * Hours-based completeness, judged against the circuit's own operating
   * hours (`src/lib/day-validity.ts`, 2026-10-05) — null on a row not yet
   * classified. A `partial` day is auto-excluded unless overridden below.
   */
  dayClass?: "complete" | "partial" | null;
  dayClassHoursExpected?: number | null;
  dayClassHoursPresent?: number | null;
  /** An operator's explicit confirmation that this day counts anyway. */
  validOverride?: boolean;
  validOverrideReason?: string | null;
  /**
   * Stored per-hour anomaly counts (`src/lib/hourly-anomaly.ts`, 2026-10-06) —
   * green/yellow/red out of 24, as last computed by the projection. Null on a
   * row with no hourly breakdown at all (a monthly-upload/legacy day) or one
   * not yet re-projected since this shipped.
   */
  hourlyNormalCount?: number | null;
  hourlySuspectCount?: number | null;
  hourlyAnomalyCount?: number | null;
};

/**
 * The stored readings as a working table — latest first, sortable by
 * clicking a header, filterable by date, range and status, and paginated so
 * the list is never longer than a month (the user's spec, 2026-08-28:
 * default 10 per page, 20 or 30 on request).
 */

type SortKey = "date" | "kWh" | "hours" | "savings" | "status";
type StatusFilter = "valid" | "all" | "excluded" | "flagged" | "superseded" | "released";
type BandFilter = "all" | "in" | "out";

const PAGE_SIZES = [10, 20, 30] as const;

/** In range = inside CON-20's healthy read of the band (green or cyan). */
function inRange(r: StoredReadingDTO): boolean | null {
  if (r.savingsBand === null) return null;
  return r.savingsBand === "green" || r.savingsBand === "cyan";
}

function statusRank(r: StoredReadingDTO): number {
  // Trouble first when sorting by status: the reason anyone sorts by it.
  if (r.flagged) return 0;
  if (r.excluded) return 1;
  if (r.superseded) return 2;
  if (r.released) return 3;
  return 4;
}

export function ReadingsExplorer({
  readings,
  canEdit = false,
}: {
  readings: StoredReadingDTO[];
  /** Offers the one correction this screen owns: post-hoc exclusion. */
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [excluding, setExcluding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [markingValid, setMarkingValid] = useState<string | null>(null);
  const [validReason, setValidReason] = useState("");

  // The 24-hour breakdown behind one day, fetched on demand and re-derived
  // fresh every open (2026-10-06, user-asked) — never cached stale across a
  // re-projection, so a second click after a correction shows the real
  // current classification rather than whatever the first click happened to see.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hourly, setHourly] = useState<HourReading[] | null>(null);
  const [hourlyError, setHourlyError] = useState<string | null>(null);
  const [hourlyLoading, setHourlyLoading] = useState(false);

  function toggleExpand(r: StoredReadingDTO) {
    if (expanded === r.id) {
      setExpanded(null);
      return;
    }
    setExpanded(r.id);
    setHourly(null);
    setHourlyError(null);
    setHourlyLoading(true);
    getHourlyReadings(r.id).then((result) => {
      setHourlyLoading(false);
      if ("error" in result) {
        setHourlyError(result.error);
        return;
      }
      setHourly(result.hours);
    });
  }

  function toggleExclusion(r: StoredReadingDTO) {
    setError(null);
    if (!r.excluded && excluding !== r.id) {
      // Excluding needs a stated reason — a removal with no reason is
      // indistinguishable from a mistake later. Open the inline row.
      setExcluding(r.id);
      setReason("");
      return;
    }
    startTransition(async () => {
      const result = await setReadingExclusion(r.id, !r.excluded, r.excluded ? "" : reason);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setExcluding(null);
      router.refresh();
    });
  }

  /**
   * The one manual direction `toggleExclusion` doesn't cover: a day the
   * system auto-classed partial that an operator confirms is fine anyway
   * (2026-10-05, user-asked). Undoing needs no reason — it's just turning
   * the override back off, not a fresh judgment call.
   */
  function toggleValidOverride(r: StoredReadingDTO) {
    setError(null);
    if (!r.validOverride && markingValid !== r.id) {
      setMarkingValid(r.id);
      setValidReason("");
      return;
    }
    startTransition(async () => {
      const result = await setDayValidOverride(r.id, !r.validOverride, r.validOverride ? "" : validReason);
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setMarkingValid(null);
      router.refresh();
    });
  }

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1); // latest first
  const [onDate, setOnDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Valid days by default (the user's call): a listing that opens with
  // excluded and flagged days mixed in reads as the record when it is not —
  // those are days the averages already ignore. The filter itself says which
  // view is on, and one click widens it.
  const [status, setStatus] = useState<StatusFilter>("valid");
  const [bandFilter, setBandFilter] = useState<BandFilter>("all");
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const rows = readings.filter((r) => {
      // A single date wins over the range — it is the more specific ask.
      if (onDate) {
        if (r.date !== onDate) return false;
      } else {
        if (from && r.date < from) return false;
        if (to && r.date > to) return false;
      }
      if (status === "valid" && (r.excluded || r.flagged)) return false;
      if (status === "excluded" && !r.excluded) return false;
      if (status === "flagged" && !r.flagged) return false;
      if (status === "superseded" && !r.superseded) return false;
      if (status === "released" && !r.released) return false;
      if (bandFilter !== "all") {
        const ir = inRange(r);
        if (ir === null) return false;
        if (bandFilter === "in" && !ir) return false;
        if (bandFilter === "out" && ir) return false;
      }
      return true;
    });
    const get = (r: StoredReadingDTO): string | number | null => {
      switch (sortKey) {
        case "date": return r.date;
        case "kWh": return r.kWh;
        case "hours": return r.intervalCount;
        case "savings": return r.savingsPct;
        case "status": return statusRank(r);
      }
    };
    return rows.sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // A row with nothing in the sorted column sinks, whichever way the
      // sort runs — the same rule as the meters list.
      if (av === null && bv === null) return a.date < b.date ? 1 : -1;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av === bv) return a.date < b.date ? 1 : -1;
      return (av > bv ? 1 : -1) * sortDir;
    });
  }, [readings, onDate, from, to, status, bandFilter, sortKey, sortDir]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * pageSize, current * pageSize + pageSize);

  function sortBy(k: SortKey) {
    setPage(0);
    if (k === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
      return;
    }
    setSortKey(k);
    // Dates and figures start at "latest/biggest first"; status starts at
    // trouble-first — each column's own natural question.
    setSortDir(k === "status" ? 1 : -1);
  }

  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    setPage(0);
    set(v);
  };

  if (readings.length === 0) {
    return (
      <EmptyState title="No readings stored yet">
        Import the meter&rsquo;s export — the figures land here the moment it commits.
      </EmptyState>
    );
  }

  return (
    <div>
      {/* ---- filters ---- */}
      <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2">
        <label className="text-xs text-[var(--text-muted)]">
          <span className="mb-1 block">On date</span>
          <input type="date" className="field field-auto" value={onDate}
            onChange={(e) => resetPage(setOnDate)(e.target.value)} aria-label="Filter to one date" />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          <span className="mb-1 block">From</span>
          <input type="date" className="field field-auto" value={from} disabled={!!onDate}
            onChange={(e) => resetPage(setFrom)(e.target.value)} aria-label="Range start" />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          <span className="mb-1 block">To</span>
          <input type="date" className="field field-auto" value={to} disabled={!!onDate}
            onChange={(e) => resetPage(setTo)(e.target.value)} aria-label="Range end" />
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          <span className="mb-1 block">Status</span>
          <select className="field field-auto" value={status}
            onChange={(e) => resetPage(setStatus)(e.target.value as StatusFilter)} aria-label="Filter by status">
            <option value="valid">Valid readings only</option>
            <option value="all">All readings</option>
            <option value="excluded">Excluded</option>
            <option value="flagged">Flagged</option>
            <option value="superseded">Superseded</option>
            <option value="released">Released</option>
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">
          <span className="mb-1 block">Savings band</span>
          <select className="field field-auto" value={bandFilter}
            onChange={(e) => resetPage(setBandFilter)(e.target.value as BandFilter)} aria-label="Filter by range">
            <option value="all">All</option>
            <option value="in">In range</option>
            <option value="out">Out of range</option>
          </select>
        </label>
        {(onDate || from || to || status !== "valid" || bandFilter !== "all") && (
          <button type="button" className="btn-ghost btn-sm"
            onClick={() => { setOnDate(""); setFrom(""); setTo(""); setStatus("valid"); setBandFilter("all"); setPage(0); }}>
            Reset filters
          </button>
        )}
      </div>

      {error && <ErrorText>{error}</ErrorText>}

      {/* ---- table ---- */}
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <Th k="date" label="Date" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
              <Th k="kWh" label="kWh" sortKey={sortKey} dir={sortDir} onSort={sortBy} align="right" />
              <Th k="hours" label="Hours" sortKey={sortKey} dir={sortDir} onSort={sortBy} align="right" />
              <Th k="savings" label="Savings" sortKey={sortKey} dir={sortDir} onSort={sortBy} align="right" />
              <Th k="status" label="Status" sortKey={sortKey} dir={sortDir} onSort={sortBy} />
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const band = r.savingsBand ? SAVINGS_BAND_META[r.savingsBand] : null;
              return (
                <React.Fragment key={r.id}>
                <tr style={r.excluded ? { opacity: 0.55 } : undefined}>
                  <td className="num whitespace-nowrap">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:opacity-80"
                      style={{ font: "inherit", color: "inherit" }}
                      onClick={() => toggleExpand(r)}
                      aria-expanded={expanded === r.id}
                      title="Show the 24 hourly readings behind this day"
                    >
                      <svg viewBox="0 0 16 16" aria-hidden style={{ width: 11, height: 11, flexShrink: 0, transform: expanded === r.id ? "rotate(90deg)" : undefined }}>
                        <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {formatDate(r.date)}
                    </button>
                    {r.hourlyNormalCount != null && (r.hourlySuspectCount ?? 0) + (r.hourlyAnomalyCount ?? 0) > 0 && (
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-normal">
                        <HourCountDot tone="ok" count={r.hourlyNormalCount} />
                        <HourCountDot tone="warn" count={r.hourlySuspectCount ?? 0} />
                        <HourCountDot tone="bad" count={r.hourlyAnomalyCount ?? 0} />
                      </div>
                    )}
                  </td>
                  <td className="num text-right">{r.kWh.toFixed(2)}</td>
                  <td className="num text-right">
                    {r.intervalCount ?? "—"}
                    {r.intervalCount !== null && r.expectedIntervals !== null && r.intervalCount < r.expectedIntervals && (
                      <span style={{ color: "var(--warn-fg)" }}> / {r.expectedIntervals}</span>
                    )}
                    {/* The export writes 0 for an hour the meter was offline
                        or off — so a 24-row day can be mostly silence, and
                        the row count alone would call it complete. */}
                    {r.dataHours !== undefined &&
                      r.dataHours !== null &&
                      r.intervalCount !== null &&
                      r.dataHours < r.intervalCount && (
                        <div
                          className="whitespace-nowrap text-[11px] font-normal"
                          style={{ color: "var(--warn-fg)" }}
                          title="Hours the meter reported a reading. The export writes 0 for an hour the meter was offline or switched off."
                        >
                          {r.dataHours === 0 ? "no hours with data" : `${r.dataHours}h with data`}
                        </div>
                      )}
                  </td>
                  <td className="text-right">
                    {r.savingsPct === null || band === null ? (
                      <span className="text-[var(--text-subtle)]">—</span>
                    ) : (
                      <span className="num inline-block rounded-[var(--r-sm)] px-2 py-0.5 text-[12px] font-semibold"
                        style={{ background: band.bg, color: "var(--text)" }}>
                        {r.savingsPct.toFixed(1)}% · {band.label}
                      </span>
                    )}
                  </td>
                  <td className="text-[12px]">
                    <span className="flex flex-wrap gap-x-2">
                      {r.flagged && (
                        <span style={{ color: "var(--bad-fg)" }}>
                          Flagged
                          {r.flaggedReason && (
                            <span className="block text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
                              {r.flaggedReason}
                            </span>
                          )}
                        </span>
                      )}
                      {r.validOverride && (
                        <span title={r.validOverrideReason ?? undefined} style={{ color: "var(--ok-fg)" }}>
                          Marked valid
                        </span>
                      )}
                      {r.excluded && !r.validOverride && (
                        <span title={r.excludedReason ?? undefined} style={{ color: "var(--warn-fg)" }}>
                          {r.dayClass === "partial" && r.dayClassHoursExpected != null && r.dayClassHoursPresent != null
                            ? `Partial — ${r.dayClassHoursPresent} of ${r.dayClassHoursExpected} hours`
                            : "Excluded"}
                        </span>
                      )}
                      {r.superseded && <span className="text-[var(--text-muted)]">Superseded</span>}
                      {r.released && <span style={{ color: "var(--info-fg)" }}>Released</span>}
                      {!r.flagged && !r.excluded && !r.superseded && !r.released && !r.validOverride && (
                        <span className="text-[var(--text-subtle)]">OK</span>
                      )}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="text-right">
                      {!r.released && (
                        <span className="inline-flex items-center gap-1.5">
                          {r.dayClass === "partial" && (
                            <button
                              type="button"
                              className="btn-ghost btn-sm"
                              disabled={pending}
                              onClick={() => toggleValidOverride(r)}
                            >
                              {r.validOverride ? "Undo" : "Mark valid anyway"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            disabled={pending}
                            onClick={() => toggleExclusion(r)}
                          >
                            {r.excluded ? "Include" : "Exclude"}
                          </button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
                {excluding === r.id && !r.excluded && (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5}>
                      <div className="flex flex-wrap items-center gap-2 py-1">
                        <input
                          type="text"
                          className="field field-auto min-w-[280px]"
                          placeholder="Why this day should not count"
                          aria-label="Exclusion reason"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          disabled={pending}
                        />
                        <button type="button" className="btn-primary btn-sm" disabled={pending}
                          onClick={() => toggleExclusion(r)}>
                          Exclude this day
                        </button>
                        <button type="button" className="btn-ghost btn-sm" disabled={pending}
                          onClick={() => setExcluding(null)}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {markingValid === r.id && !r.validOverride && (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5}>
                      <div className="flex flex-wrap items-center gap-2 py-1">
                        <input
                          type="text"
                          className="field field-auto min-w-[280px]"
                          placeholder="Why this partial day should still count"
                          aria-label="Valid-override reason"
                          value={validReason}
                          onChange={(e) => setValidReason(e.target.value)}
                          disabled={pending}
                        />
                        <button type="button" className="btn-primary btn-sm" disabled={pending}
                          onClick={() => toggleValidOverride(r)}>
                          Mark this day valid
                        </button>
                        <button type="button" className="btn-ghost btn-sm" disabled={pending}
                          onClick={() => setMarkingValid(null)}>
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
                {expanded === r.id && (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} className="bg-[var(--surface-2,var(--surface))]">
                      {hourlyLoading && <p className="py-2 text-[12px] text-[var(--text-muted)]">Loading the 24 hourly readings…</p>}
                      {hourlyError && <p className="py-2 text-[12px]" style={{ color: "var(--bad-fg)" }}>{hourlyError}</p>}
                      {hourly && <HourlyBreakdown hours={hourly} />}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- pagination ---- */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-[var(--text-muted)]">
        <span>
          <span className="num">
            {filtered.length === 0
              ? "Nothing matches these filters"
              : `Showing ${current * pageSize + 1}–${Math.min((current + 1) * pageSize, filtered.length)} of ${filtered.length}`}
          </span>
          {/* Never let a default filter quietly shrink the record. */}
          {status === "valid" && readings.length > filtered.length && (
            <>
              {" · "}
              <button
                type="button"
                className="underline"
                style={{ color: "var(--accent)" }}
                onClick={() => { setStatus("all"); setPage(0); }}
              >
                {readings.length - filtered.length} excluded or flagged hidden
              </button>
            </>
          )}
        </span>
        <span className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            Per page
            <select className="field field-auto" value={pageSize} aria-label="Rows per page"
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="button" className="btn-ghost btn-sm" disabled={current === 0}
            onClick={() => setPage(current - 1)}>
            ← Prev
          </button>
          <span className="num">{current + 1} / {pages}</span>
          <button type="button" className="btn-ghost btn-sm" disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}>
            Next →
          </button>
        </span>
      </div>
    </div>
  );
}

function Th({ k, label, sortKey, dir, onSort, align = "left" }: {
  k: SortKey; label: string; sortKey: SortKey; dir: 1 | -1;
  onSort: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = k === sortKey;
  return (
    <th className={align === "right" ? "text-right" : undefined}
      aria-sort={active ? (dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1.5 hover:opacity-80"
        style={{ color: active ? "var(--text)" : "inherit", font: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}>
        {label}
        <span aria-hidden style={{ opacity: active ? 1 : 0.25 }}>{active ? (dir === 1 ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

/** One of the three hourly counts under a day's date — hidden entirely at zero, so a quiet day shows no clutter. */
function HourCountDot({ tone, count }: { tone: "ok" | "warn" | "bad"; count: number }) {
  if (count === 0) return null;
  return (
    <span
      className="num inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
      style={{ background: `var(--${tone}-bg)`, color: `var(--${tone}-fg)` }}
      title={tone === "ok" ? `${count} normal hours` : tone === "warn" ? `${count} suspect hours` : `${count} anomalous hours`}
    >
      <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }} />
      {count}
    </span>
  );
}

const HOUR_CLASS_TONE: Record<HourReading["class"], "ok" | "warn" | "bad" | null> = {
  normal: "ok",
  suspect: "warn",
  anomaly: "bad",
  unclassified: null,
};

/**
 * The real 24-hour breakdown behind one day (2026-10-06, user-asked) — a
 * compact strip, hour by hour, each tinted by its own class against its own
 * hour-of-day history (`src/lib/hourly-anomaly.ts`): an evening-peak hour and
 * a 3am trough are judged against what THAT hour normally reads, never one
 * blanket threshold across the whole day.
 */
function HourlyBreakdown({ hours }: { hours: HourReading[] }) {
  return (
    <div className="py-2">
      <p className="mb-2 text-[11px] text-[var(--text-subtle)]">
        Each hour judged against its own history — not present means the meter reported nothing that hour.
      </p>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-12">
        {hours.map((h) => {
          const tone = h.present ? HOUR_CLASS_TONE[h.class] : null;
          return (
            <div
              key={h.hour}
              className="rounded-[var(--r-sm)] border px-1.5 py-1 text-center"
              style={{
                borderColor: tone ? `var(--${tone}-fg)` : "var(--border)",
                background: tone ? `var(--${tone}-bg)` : "var(--surface)",
              }}
              title={h.present ? `${String(h.hour).padStart(2, "0")}:00 — ${h.kWh.toFixed(3)} kWh — ${h.class}` : `${String(h.hour).padStart(2, "0")}:00 — no reading`}
            >
              <div className="text-[10px] text-[var(--text-subtle)]">{String(h.hour).padStart(2, "0")}:00</div>
              <div className="num text-[11.5px] font-semibold">{h.present ? h.kWh.toFixed(2) : "—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
