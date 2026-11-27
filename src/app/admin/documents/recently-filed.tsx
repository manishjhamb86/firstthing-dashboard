"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, StatusChip } from "@/components/ui";
import { TONE_STYLE, docTypeDisplay } from "./doc-type-display";
import { WithdrawButton } from "./withdraw-button";

export type FiledRow = {
  id: string;
  docType: string;
  label: string;
  version: number;
  society: string;
  /** "2026-10", or the gate pass's date and time. */
  when: string;
  fileName: string;
  /** IST day heading, e.g. "7 October 2026". */
  day: string;
  time: string;
  by: string;
  withdrawn: { reason: string | null } | null;
};

/**
 * The right-hand list on the Documents page (2026-11-27 redesign): grouped
 * by the day it was filed, each with its type's icon and a Filed / Withdrawn
 * chip; a withdrawn version stays, struck through, with its reason. A search
 * narrows by society, type or file name.
 */
export function RecentlyFiled({ rows }: { rows: FiledRow[] }) {
  const [q, setQ] = useState("");
  const days = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (r: FiledRow) => {
      const hay = `${r.society} ${r.label} ${r.fileName} ${r.when}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    const out: { day: string; rows: FiledRow[] }[] = [];
    for (const r of rows.filter(hit)) {
      const last = out[out.length - 1];
      if (last && last.day === r.day) last.rows.push(r);
      else out.push({ day: r.day, rows: [r] });
    }
    return out;
  }, [rows, q]);

  return (
    <Card className="overflow-hidden">
      <div className="space-y-3 px-5 pb-3 pt-5">
        <h2 className="text-[17px] font-bold">Recently filed</h2>
        <input
          type="search"
          className="field w-full text-sm"
          placeholder="Search society, type or file"
          aria-label="Search recently filed documents"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Nothing filed here yet.
        </p>
      ) : days.length === 0 ? (
        <p className="px-5 pb-5 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Nothing matches.
        </p>
      ) : (
        days.map((d) => (
          <div key={d.day}>
            <p className="border-y px-5 py-2 text-[12px] font-bold" style={{ background: "var(--surface-sunken)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
              {d.day}
            </p>
            <ul>
              {d.rows.map((r) => {
                const disp = docTypeDisplay(r.docType);
                const tone = r.withdrawn ? TONE_STYLE.neu : TONE_STYLE[disp.tone];
                return (
                  <li key={r.id} className="flex gap-3 border-b px-5 py-3.5 last:border-b-0" style={{ borderColor: "var(--border-subtle)" }}>
                    <span className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-[9px]" style={{ background: tone.bg, color: tone.fg }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d={disp.icon} />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/admin/documents/${r.id}`}
                          className="font-semibold"
                          style={r.withdrawn ? { textDecoration: "line-through", color: "var(--text-subtle)" } : { color: "var(--text)" }}
                        >
                          {r.label} · v{r.version}
                        </Link>
                        <StatusChip tone={r.withdrawn ? "bad" : "ok"}>{r.withdrawn ? "Withdrawn" : "Filed"}</StatusChip>
                      </div>
                      <p className="text-[13px]">
                        {r.society} · <span className="tabular-nums">{r.when}</span>
                      </p>
                      <p className="truncate text-[12px]" style={{ color: "var(--text-subtle)" }} title={r.fileName}>
                        {r.fileName} · {r.time} · {r.by}
                      </p>
                      {r.withdrawn ? (
                        <p className="text-[12px]" style={{ color: "var(--warn-fg)" }}>
                          Withdrawn{r.withdrawn.reason ? ` — ${r.withdrawn.reason}` : ""}
                        </p>
                      ) : (
                        <WithdrawButton documentId={r.id} version={r.version} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </Card>
  );
}
