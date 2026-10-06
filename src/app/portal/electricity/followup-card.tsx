"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeReplacementFollowUp } from "./followup-actions";
import { Card, CardTitle, ErrorText } from "@/components/ui";
import { formatDate } from "@/lib/format-date";
import type { PortalFollowUpRow } from "@/lib/portal-followups";

function Row({ row }: { row: PortalFollowUpRow }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    startTransition(async () => {
      const r = await completeReplacementFollowUp(row.id, note);
      if (r?.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-[var(--field-border)] p-3 text-sm">
      <p>
        <strong>
          {row.remainingTotal} light{row.remainingTotal === 1 ? "" : "s"} still to install
        </strong>{" "}
        on {row.circuitLabel} — raised {formatDate(row.raisedAt)}.
      </p>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">{row.reason}</p>
      {open ? (
        <div className="mt-3 space-y-2">
          <input
            className="field"
            placeholder="Anything to add (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
          />
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-2">
            <button type="button" className="btn-primary btn-sm" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Confirm it's done"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => setOpen(true)}>
          Mark as completed
        </button>
      )}
    </div>
  );
}

/** Shown only when the society has agreed to finish some lights itself. */
export function ReplacementFollowUpCard({ rows }: { rows: PortalFollowUpRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card className="p-5 space-y-3">
      <CardTitle>Lights left for you to finish</CardTitle>
      <p className="text-[13px] text-[var(--text-muted)]">
        A few lights couldn&apos;t be replaced on the day — your committee agreed to finish them. Once they&apos;re in, mark it done so FirsThing knows.
      </p>
      <div className="space-y-2">
        {rows.map((r) => (
          <Row key={r.id} row={r} />
        ))}
      </div>
    </Card>
  );
}
