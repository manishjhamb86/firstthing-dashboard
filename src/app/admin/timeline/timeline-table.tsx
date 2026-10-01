"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchInput } from "@/components/search-input";
import { EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { matchesQuery } from "@/lib/society-list";

export type TimelineRow = {
  id: string;
  name: string;
  location: string;
  summary: { order: number; future: number; check: number; missing: number; inOrder: number };
  line: { tone: string };
  billedFrom: Date | null;
  pending: number;
};

/**
 * The timeline index, filtered as you type (user-asked, 2026-10-01) — the
 * same live-filter already on the societies list itself (society-list.ts's
 * own matchesQuery, reused as-is rather than a second copy): every word
 * matches the name or location, in any order, no Search button.
 */
export function TimelineTable({ rows, initialQuery }: { rows: TimelineRow[]; initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);

  function change(q: string) {
    setQuery(q);
    const params = new URLSearchParams(window.location.search);
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  const shown = useMemo(() => rows.filter((r) => matchesQuery(r, query)), [rows, query]);

  return (
    <>
      <div className="mb-4">
        <SearchInput value={query} onChange={change} placeholder="Search by name or location…" label="Search societies" />
      </div>

      {shown.length === 0 ? (
        <EmptyState title={rows.length === 0 ? "No societies yet" : "No society matches that search"}>
          {rows.length === 0 ? "A society’s timeline appears here once it is added." : "Try a different name or location."}
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Society</th>
                <th>Dates</th>
                <th>Billed from</th>
                <th className="text-right">Requests</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const bad = r.summary.order + r.summary.future;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/societies/${r.id}/timeline`} className="font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-[12px] text-[var(--text-subtle)]">{r.location}</div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {bad > 0 && <span className="chip chip-bad">✕ {bad} out of order</span>}
                        {r.summary.check > 0 && <span className="chip chip-warn">! {r.summary.check} to check</span>}
                        {r.summary.missing > 0 && <span className="chip chip-warn">– {r.summary.missing} not recorded</span>}
                        {r.line.tone === "ok" && <span className="chip chip-ok">✓ {r.summary.inOrder} in order</span>}
                      </div>
                    </td>
                    <td className="num whitespace-nowrap">
                      {r.billedFrom ? formatDate(r.billedFrom) : <span className="text-[var(--text-subtle)]">Not billed</span>}
                    </td>
                    <td className="num text-right">{r.pending > 0 ? <span className="chip chip-warn">{r.pending} waiting</span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
