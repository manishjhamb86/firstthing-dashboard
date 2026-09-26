"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchInput } from "@/components/search-input";
import { ClickableRow } from "@/components/clickable-row";
import { Card, EmptyState, StatusChip } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import { SOCIETY_STATUS, SERVICE_LINE_LABEL, statusMeta } from "@/lib/status-maps";
import {
  firstDirection,
  matchesQuery,
  sortSocieties,
  startedOn,
  type SocietyRow,
  type SortDir,
  type SortKey,
} from "@/lib/society-list";

const STATUS_TABS = ["all", "prospect", "active", "suspended", "terminated"] as const;
type Tab = (typeof STATUS_TABS)[number];

/**
 * The societies list, filtered as you type and sorted by any header
 * (2026-09-26, user-asked). Every society is on the page already, so neither
 * needs a round trip; the search and status go into the address with
 * replaceState, so a filtered view is still a link that can be shared.
 */
export function SocietiesTable({
  rows,
  initialQuery,
  initialTab,
}: {
  rows: SocietyRow[];
  initialQuery: string;
  initialTab: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [tab, setTab] = useState<Tab>((STATUS_TABS as readonly string[]).includes(initialTab) ? (initialTab as Tab) : "all");
  const [sortKey, setSortKey] = useState<SortKey>("started");
  const [dir, setDir] = useState<SortDir>("desc");

  function remember(q: string, t: Tab) {
    const params = new URLSearchParams();
    if (t !== "all") params.set("status", t);
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  const matching = useMemo(() => rows.filter((r) => matchesQuery(r, query)), [rows, query]);
  const countFor = (t: Tab) => (t === "all" ? matching.length : matching.filter((r) => r.status === t).length);
  const shown = useMemo(
    () => sortSocieties(tab === "all" ? matching : matching.filter((r) => r.status === tab), sortKey, dir),
    [matching, tab, sortKey, dir],
  );

  function sortBy(k: SortKey) {
    if (k === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setDir(firstDirection(k));
    }
  }

  const header = (k: SortKey, label: string, cls = "") => {
    const active = k === sortKey;
    return (
      <th className={cls} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
        <button
          type="button"
          onClick={() => sortBy(k)}
          className="inline-flex items-center gap-1.5 hover:opacity-80"
          style={{ color: active ? "var(--text)" : "inherit", font: "inherit", letterSpacing: "inherit", textTransform: "inherit" }}
        >
          {label}
          <span aria-hidden style={{ opacity: active ? 1 : 0.25 }}>
            {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
          </span>
        </button>
      </th>
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <SearchInput
          value={query}
          onChange={(v) => {
            setQuery(v);
            remember(v, tab);
          }}
          placeholder="Search name or location"
          label="Search societies"
          className="w-full sm:w-72"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
          {STATUS_TABS.map((t) => {
            const isActive = t === tab;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={isActive}
                onClick={() => {
                  setTab(t);
                  remember(query, t);
                }}
                className="rounded-[var(--r-pill)] border px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  background: isActive ? "var(--accent)" : "var(--surface)",
                  borderColor: isActive ? "var(--accent)" : "var(--border)",
                  color: isActive ? "var(--text-on-accent)" : "var(--text-muted)",
                }}
              >
                {t === "all" ? "All" : statusMeta(SOCIETY_STATUS, t).label}
                <span className="num ml-1.5 opacity-70">{countFor(t)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        rows.length === 0 ? (
          <EmptyState
            title="No societies yet"
            action={
              <Link href="/admin/societies/new" className="btn-ghost btn-sm">
                New society →
              </Link>
            }
          >
            Create one from a lead to get started.
          </EmptyState>
        ) : (
          <EmptyState
            title="No societies match"
            action={
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setQuery("");
                  setTab("all");
                  remember("", "all");
                }}
              >
                Clear filters →
              </button>
            }
          >
            Nothing on record matches {query.trim() ? <strong>“{query.trim()}”</strong> : "this status"}.
          </EmptyState>
        )
      ) : (
        <Card className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                {header("name", "Society")}
                {header("started", "Billing from", "hidden sm:table-cell")}
                {header("flats", "Flats", "hidden md:table-cell")}
                {header("lights", "Lights", "hidden md:table-cell")}
                {header("serviceLines", "Service lines", "hidden lg:table-cell")}
                {header("circuits", "Circuits", "hidden md:table-cell")}
                {header("status", "Status")}
                <th className="hidden sm:table-cell" />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const st = statusMeta(SOCIETY_STATUS, s.status);
                const started = startedOn(s);
                const muted = <span style={{ color: "var(--text-subtle)" }}>—</span>;
                return (
                  <ClickableRow key={s.id} href={`/admin/societies/${s.id}`}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[13px] font-bold"
                          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                        >
                          {s.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <Link href={`/admin/societies/${s.id}`} className="font-medium hover:underline">
                            {s.name}
                          </Link>
                          <p className="text-[13px] text-[var(--text-muted)]">{s.location}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden sm:table-cell whitespace-nowrap">
                      {started ? (
                        <>
                          <span className="num">{formatDate(new Date(`${started.date}T00:00:00Z`))}</span>
                          {started.kind === "signed" && (
                            <span className="block text-xs text-[var(--text-muted)]">agreement signed · not billing yet</span>
                          )}
                        </>
                      ) : (
                        muted
                      )}
                    </td>
                    <td className="num hidden md:table-cell">{s.flatCount === null ? muted : s.flatCount.toLocaleString("en-IN")}</td>
                    <td className="num hidden md:table-cell">{s.lights === null ? muted : s.lights.toLocaleString("en-IN")}</td>
                    <td className="hidden lg:table-cell">
                      {s.serviceLines.length === 0 ? (
                        <span className="text-[13px] text-[var(--text-subtle)]">None enrolled</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {s.serviceLines.map((line) => {
                            const [code, state] = line.split(":");
                            return (
                              <span
                                key={code}
                                className="rounded-[var(--r-pill)] px-2 py-0.5 text-[11px] font-semibold"
                                style={{
                                  background: state === "active" ? "var(--ok-bg)" : "var(--neu-bg)",
                                  color: state === "active" ? "var(--ok-fg)" : "var(--neu-fg)",
                                }}
                              >
                                {SERVICE_LINE_LABEL[code] ?? code}
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </td>
                    <td className="num hidden md:table-cell">{s.circuits === 0 ? muted : s.circuits}</td>
                    <td>
                      <StatusChip tone={st.tone}>{st.label}</StatusChip>
                    </td>
                    {/* Decoration only — the whole row is the link. */}
                    <td className="hidden sm:table-cell text-right whitespace-nowrap" aria-hidden>
                      <span className="row-link-cue text-sm font-semibold">Open →</span>
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
