"use client";

import Link from "next/link";
import { useState } from "react";
import { Search } from "lucide-react";
import type { BillState, CloseStage, ReportState } from "@/lib/monthly-close";
import { BillChip, EmailChip, ReportChip } from "./close-ui";

type Row = {
  societyId: string;
  name: string;
  location: string;
  report: ReportState;
  reportsPublished: number;
  reportsTotal: number;
  bill: BillState;
  invoiceNumber: string | null;
  invoiceAmount: number | null;
  emailedAt: string | null;
  emailReady: boolean;
  stage: CloseStage;
};

const FILTERS: { id: "all" | CloseStage; label: string }[] = [
  { id: "all", label: "All" },
  { id: "report", label: "Report to publish" },
  { id: "bill", label: "Bill to process" },
  { id: "email", label: "Ready to email" },
  { id: "done", label: "Done" },
];

const NEXT: Record<CloseStage, string> = {
  report: "Review report",
  bill: "Process bill",
  email: "Email both",
  done: "View",
};

/** The societies for the month — filter by next step, search by name, open one. */
export function CloseTable({ period, rows }: { period: string; rows: Row[] }) {
  const [filter, setFilter] = useState<"all" | CloseStage>("all");
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matching = rows.filter((r) => words.every((w) => `${r.name} ${r.location}`.toLowerCase().includes(w)));
  const shown = matching.filter((r) => filter === "all" || r.stage === filter);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <div role="group" aria-label="Filter by next step" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const n = f.id === "all" ? matching.length : matching.filter((r) => r.stage === f.id).length;
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={on}
                className="min-h-[40px] rounded-full px-3.5 text-[13px] font-semibold"
                style={on ? { background: "var(--text)", color: "var(--surface)", border: "1px solid var(--text)" } : { background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--field-border)" }}
              >
                {f.label} <span className="num opacity-75">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="flex min-h-[40px] min-w-[220px] items-center gap-2 rounded-[var(--r-md)] border border-[var(--field-border)] px-3">
          <Search size={16} aria-hidden style={{ color: "var(--text-muted)" }} />
          <span className="sr-only">Search societies</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a society" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="p-6 text-[var(--text-muted)]">Nothing here{q ? ` matches "${q}"` : ""}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Society</th>
                <th>Savings report</th>
                <th>Invoice</th>
                <th>Emailed</th>
                <th style={{ textAlign: "right" }}>Next step</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const href = `/admin/billing/close/${r.societyId}?period=${period}`;
                return (
                  <tr key={r.societyId}>
                    <td>
                      <Link href={href} className="font-semibold" style={{ color: "var(--text)" }}>
                        {r.name}
                      </Link>
                      <div className="text-[12px] text-[var(--text-muted)]">{r.location}</div>
                    </td>
                    <td><ReportChip state={r.report} published={r.reportsPublished} total={r.reportsTotal} /></td>
                    <td>
                      <BillChip state={r.bill} />
                      {r.invoiceNumber && (
                        <div className="num mt-1 text-[12px] text-[var(--text-muted)]">
                          {r.invoiceNumber}
                          {r.invoiceAmount !== null && ` · ₹${r.invoiceAmount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
                        </div>
                      )}
                    </td>
                    <td><EmailChip emailedAt={r.emailedAt ? new Date(r.emailedAt) : null} ready={r.emailReady} /></td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={href} className="btn-secondary" style={{ display: "inline-flex", minHeight: 40, alignItems: "center" }}>
                        {NEXT[r.stage]}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
