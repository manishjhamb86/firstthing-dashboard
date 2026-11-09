"use client";

import { useState, useTransition } from "react";
import { StatusChip } from "@/components/ui";
import { formatInstant } from "@/lib/format-date";
import { getPumpRoomIngestUrl } from "../actions";

type Row = {
  id: string;
  receivedAt: string;
  status: "needs_assignment" | "applied" | "parse_failed";
  parseError: string | null;
  rowCount: number | null;
};

const TONE: Record<Row["status"], "ok" | "warn" | "bad"> = {
  applied: "ok",
  needs_assignment: "warn",
  parse_failed: "bad",
};

const LABEL: Record<Row["status"], string> = {
  applied: "Applied",
  needs_assignment: "Needs assignment",
  parse_failed: "Could not read",
};

export function IngestHistory({ rows }: { rows: Row[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function view(id: string) {
    setError(null);
    setOpenId(id);
    startTransition(async () => {
      const r = await getPumpRoomIngestUrl(id);
      if ("error" in r) setError(r.error);
      else window.open(r.url, "_blank", "noopener,noreferrer");
      setOpenId(null);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        No emails have arrived for this room yet.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5 last:border-b-0 last:pb-0" style={{ borderColor: "var(--border)" }}>
          <div className="min-w-0">
            <p className="text-[13px]">
              <span className="num">{formatInstant(new Date(r.receivedAt))}</span>
              {r.rowCount !== null && <span style={{ color: "var(--text-muted)" }}> · {r.rowCount} rows</span>}
            </p>
            {r.parseError && (
              <p className="text-[11px]" style={{ color: "var(--bad-fg)" }}>
                {r.parseError}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <StatusChip tone={TONE[r.status]}>{LABEL[r.status]}</StatusChip>
            <button type="button" className="btn-ghost" disabled={pending && openId === r.id} onClick={() => view(r.id)}>
              {pending && openId === r.id ? "Opening…" : "View file"}
            </button>
          </div>
        </div>
      ))}
      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
