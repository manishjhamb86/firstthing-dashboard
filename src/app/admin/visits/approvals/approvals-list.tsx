"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusChip } from "@/components/ui";
import { approveVisits } from "../actions";

type Row = { id: string; society: string; purpose: string; feedback: boolean; when: string; loggedBy: string; mine: boolean; agenda: string; outcome: string; evidence: string };

/** Tick several and approve them together, or open one to approve or send back. */
export function ApprovalsList({ visits }: { visits: Row[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const chosen = visits.filter((v) => picked[v.id] && !v.mine);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={pending || chosen.length === 0}
          onClick={() =>
            start(async () => {
              setNote(null);
              const r = await approveVisits(chosen.map((v) => v.id));
              setPicked({});
              setNote(r.problems.length ? { tone: "bad", text: `${r.approved} approved. ${r.problems.join(" ")}` } : { tone: "ok", text: `${r.approved} visit${r.approved === 1 ? "" : "s"} approved — they now count for the month.` });
              router.refresh();
            })
          }
        >
          {chosen.length === 0 ? "Tick visits to approve" : `Approve ${chosen.length} visit${chosen.length === 1 ? "" : "s"}`}
        </button>
        {note && <p role="status" className="text-[13.5px] font-semibold" style={{ color: note.tone === "ok" ? "var(--ok-fg)" : "var(--bad-fg)" }}>{note.text}</p>}
      </div>
      <section className="card overflow-hidden">
        {visits.map((v) => (
          <article key={v.id} className="flex flex-wrap items-start gap-x-5 gap-y-3 border-b border-[var(--border)] p-4 last:border-b-0">
            <label className="flex h-11 w-11 items-center justify-center" title={v.mine ? "You logged this — someone else approves it" : undefined}>
              <input
                type="checkbox"
                className="h-[18px] w-[18px]"
                disabled={v.mine}
                checked={!!picked[v.id]}
                onChange={() => setPicked((p) => ({ ...p, [v.id]: !p[v.id] }))}
                aria-label={`Select ${v.society}`}
              />
            </label>
            <div className="flex min-w-0 flex-col gap-1.5" style={{ flex: "1 1 360px" }}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-[15px]">{v.society}</strong>
                <StatusChip tone={v.feedback ? "info" : "neu"}>{v.purpose}</StatusChip>
                <span className="num text-[13px] text-[var(--text-muted)]">{v.when} · {v.loggedBy}</span>
                {v.mine && <span className="text-[12px] text-[var(--text-muted)]">· logged by you</span>}
              </div>
              <p className="text-[13.5px]"><span className="text-[var(--text-muted)]">Agenda</span> — {v.agenda}</p>
              <p className="text-[13.5px]"><span className="text-[var(--text-muted)]">Outcome</span> — {v.outcome}</p>
              <p className="text-[12.5px] text-[var(--text-muted)]">{v.evidence}</p>
            </div>
            <Link href={`/admin/visits/${v.id}`} className="btn-secondary">Open</Link>
          </article>
        ))}
      </section>
    </div>
  );
}
