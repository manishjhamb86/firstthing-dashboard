"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ErrorText } from "@/components/ui";
import { setReadingExclusion } from "@/app/admin/societies/[id]/circuits/[circuitId]/reading-actions";
import { SAVINGS_BAND_META } from "@/lib/circuit-load";
import type { StoredReadingDTO } from "@/app/admin/societies/[id]/circuits/[circuitId]/stored-readings-panel";

/**
 * The stored readings as a working table — latest first, sortable by
 * clicking a header, filterable by date, range and status, and paginated so
 * the list is never longer than a month (the user's spec, 2026-08-28:
 * default 10 per page, 20 or 30 on request).
 */

type SortKey = "date" | "kWh" | "hours" | "savings" | "status";
type StatusFilter = "all" | "included" | "excluded" | "flagged" | "superseded" | "released";
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

  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1); // latest first
  const [onDate, setOnDate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
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
      if (status === "included" && (r.excluded || r.flagged)) return false;
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
            <option value="all">All</option>
            <option value="included">Included</option>
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
        {(onDate || from || to || status !== "all" || bandFilter !== "all") && (
          <button type="button" className="btn-ghost btn-sm"
            onClick={() => { setOnDate(""); setFrom(""); setTo(""); setStatus("all"); setBandFilter("all"); setPage(0); }}>
            Clear filters
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
                  <td className="num whitespace-nowrap">{r.date}</td>
                  <td className="num text-right">{r.kWh.toFixed(2)}</td>
                  <td className="num text-right">
                    {r.intervalCount ?? "—"}
                    {r.intervalCount !== null && r.expectedIntervals !== null && r.intervalCount < r.expectedIntervals && (
                      <span style={{ color: "var(--warn-fg)" }}> / {r.expectedIntervals}</span>
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
                      {r.flagged && <span style={{ color: "var(--bad-fg)" }}>Flagged</span>}
                      {r.excluded && (
                        <span title={r.excludedReason ?? undefined} style={{ color: "var(--warn-fg)" }}>
                          Excluded
                        </span>
                      )}
                      {r.superseded && <span className="text-[var(--text-muted)]">Superseded</span>}
                      {r.released && <span style={{ color: "var(--info-fg)" }}>Released</span>}
                      {!r.flagged && !r.excluded && !r.superseded && !r.released && (
                        <span className="text-[var(--text-subtle)]">OK</span>
                      )}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="text-right">
                      {!r.released && (
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          disabled={pending}
                          onClick={() => toggleExclusion(r)}
                        >
                          {r.excluded ? "Include" : "Exclude"}
                        </button>
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
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- pagination ---- */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[13px] text-[var(--text-muted)]">
        <span className="num">
          {filtered.length === 0
            ? "Nothing matches these filters"
            : `Showing ${current * pageSize + 1}–${Math.min((current + 1) * pageSize, filtered.length)} of ${filtered.length}`}
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
