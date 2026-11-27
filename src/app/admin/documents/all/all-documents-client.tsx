"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, StatusChip } from "@/components/ui";
import { TONE_STYLE, docTypeDisplay } from "../doc-type-display";
import { WithdrawButton } from "../withdraw-button";
import type { FiledRow } from "../recently-filed";

const PAGE = 25;

/** The full list: search, type, society and status filters, 25 to a page. */
export function AllDocumentsClient({ rows }: { rows: FiledRow[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [society, setSociety] = useState("");
  const [status, setStatus] = useState<"all" | "filed" | "withdrawn">("all");
  const [page, setPage] = useState(0);

  const types = useMemo(() => [...new Map(rows.map((r) => [r.docType, r.label])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const societies = useMemo(() => [...new Set(rows.map((r) => r.society))].sort(), [rows]);
  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (type && r.docType !== type) return false;
      if (society && r.society !== society) return false;
      if (status === "filed" && r.withdrawn) return false;
      if (status === "withdrawn" && !r.withdrawn) return false;
      const hay = `${r.society} ${r.label} ${r.fileName} ${r.when} ${r.by}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, q, type, society, status]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const counts = { all: rows.length, filed: rows.filter((r) => !r.withdrawn).length, withdrawn: rows.filter((r) => r.withdrawn).length };
  const reset = () => setPage(0);

  return (
    <div className="min-w-0 max-w-full space-y-3.5">
      <div className="flex flex-wrap gap-2">
        {(["all", "filed", "withdrawn"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setStatus(k);
              reset();
            }}
            className="rounded-full border px-3.5 py-1.5 text-xs font-semibold"
            style={
              status === k
                ? { background: "var(--accent-subtle)", borderColor: "var(--accent-line)", color: "var(--accent-deep)" }
                : { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text-muted)" }
            }
          >
            {k === "all" ? "All" : k === "filed" ? "Filed" : "Withdrawn"} <span className="tabular-nums opacity-80">{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          type="search"
          className="field text-sm sm:min-w-[16rem] sm:flex-[3]"
          placeholder="Search society, type, file or who filed it"
          aria-label="Search documents"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            reset();
          }}
        />
        <div className="flex gap-2 sm:flex-[2]">
          <select className="field min-w-0 flex-1 text-sm" aria-label="Filter by type" value={type} onChange={(e) => { setType(e.target.value); reset(); }}>
            <option value="">Every type</option>
            {types.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
          <select className="field min-w-0 flex-1 text-sm" aria-label="Filter by society" value={society} onChange={(e) => { setSociety(e.target.value); reset(); }}>
            <option value="">Every society</option>
            {societies.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card className="min-w-0 max-w-full overflow-hidden">
        {shown.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            {rows.length === 0 ? "Nothing has been filed yet." : "No document matches."}
          </p>
        ) : (
          // relative: the header's screen-reader-only label is absolutely
          // positioned and would otherwise escape this box and widen the page.
          <div className="relative overflow-x-auto">
            <table className="tbl" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Society · for</th>
                  <th>Filed</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const disp = docTypeDisplay(r.docType);
                  const tone = r.withdrawn ? TONE_STYLE.neu : TONE_STYLE[disp.tone];
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-start gap-3">
                          <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-[9px]" style={{ background: tone.bg, color: tone.fg }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d={disp.icon} />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <Link
                              href={`/admin/documents/${r.id}`}
                              className="font-semibold"
                              style={r.withdrawn ? { textDecoration: "line-through", color: "var(--text-subtle)" } : { color: "var(--text)" }}
                            >
                              {r.label} · v{r.version}
                            </Link>
                            <p className="max-w-[18rem] truncate text-[12px]" style={{ color: "var(--text-subtle)" }} title={r.fileName}>
                              {r.fileName}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p>{r.society}</p>
                        <p className="tabular-nums text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                          {r.when}
                        </p>
                      </td>
                      <td className="text-[13px]">
                        <p className="whitespace-nowrap">
                          {r.day} · <span className="tabular-nums">{r.time}</span>
                        </p>
                        <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
                          {r.by}
                        </p>
                      </td>
                      <td>
                        <StatusChip tone={r.withdrawn ? "bad" : "ok"}>{r.withdrawn ? "Withdrawn" : "Filed"}</StatusChip>
                        {r.withdrawn?.reason && (
                          <p className="mt-1 text-[12px]" style={{ color: "var(--warn-fg)" }}>
                            {r.withdrawn.reason}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <Link href={`/admin/documents/${r.id}`} className="btn-ghost btn-sm">
                          Open
                        </Link>
                        {!r.withdrawn && <WithdrawButton documentId={r.id} version={r.version} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-[13px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          <span>
            {filtered.length === 0 ? "0" : `${current * PAGE + 1}–${current * PAGE + shown.length}`} of {filtered.length}
          </span>
          {pages > 1 && (
            <span className="flex items-center gap-2">
              <button type="button" className="btn-ghost btn-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
                ← Newer
              </button>
              <span className="tabular-nums">
                Page {current + 1} of {pages}
              </span>
              <button type="button" className="btn-ghost btn-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                Older →
              </button>
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}
