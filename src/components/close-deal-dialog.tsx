"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { closeDeal, rejectSociety, reopenDeal, reopenSociety } from "@/app/admin/societies/close-actions";

/**
 * Reject a society or close one deal (2026-09-25). The dialog states what
 * will happen to each deal before anything is done — closing a lead and
 * terminating a billed contract are very different consequences behind one
 * button, so neither is left implied.
 */
export function CloseDealDialog({
  mode,
  id,
  planLines,
  hasContract,
  unpaidInvoices,
  today,
}: {
  mode: "society" | "deal";
  id: string;
  /** One line per deal, from describePlan() on the server. */
  planLines: string[];
  hasContract: boolean;
  unpaidInvoices: number;
  /** YYYY-MM-DD, computed on the server so the default cannot mismatch hydration. */
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [day, setDay] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const title = mode === "society" ? "Reject / terminate this society" : "Close this deal";

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        const r = mode === "society" ? await rejectSociety(id, reason, day) : await closeDeal(id, reason, day);
        if (r.error) setError(r.error);
        else {
          setOpen(false);
          router.refresh();
        }
      } catch {
        setError("The request did not complete — refresh to see whether it was recorded before trying again.");
      }
    });
  }

  return (
    <>
      <button type="button" className="btn-danger btn-sm" onClick={() => setOpen(true)}>
        {mode === "society" ? "Reject / terminate" : "Close deal"}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description="Nothing is deleted — the record, its documents and its invoices stay, and this can be reopened."
        size="wide"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Keep it open
            </button>
            <button type="button" className="btn-danger" disabled={pending || !reason.trim()} onClick={submit}>
              {pending ? "Recording…" : title}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="lbl mb-1.5">What happens</p>
            <ul className="list-disc space-y-1 pl-5 text-[13.5px]">
              {planLines.map((l) => (
                <li key={l}>{l}</li>
              ))}
              {hasContract && (
                <li>
                  {unpaidInvoices > 0
                    ? `${unpaidInvoices} unpaid invoice${unpaidInvoices === 1 ? "" : "s"} stay owed and keep being followed up; the automatic suspension stops.`
                    : "No invoice is unpaid."}
                </li>
              )}
              {mode === "society" && <li>Portal accounts keep read access to their documents and invoices.</li>}
            </ul>
          </div>
          <Field label="Why" htmlFor="close-reason" hint="Kept on the record beside the date and who recorded it.">
            <input
              id="close-reason"
              type="text"
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Committee declined after the demo · contract cancelled before the first bill…"
            />
          </Field>
          <Field
            label={hasContract ? "Last day billed" : "Closed on"}
            htmlFor="close-day"
            hint={hasContract ? "Billing prorates that month to this day and bills nothing after it. Use the contract's start to bill nothing at all." : undefined}
          >
            <input id="close-day" type="date" className="field field-auto" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}

export function ReopenButton({ mode, id }: { mode: "society" | "deal"; id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = mode === "society" ? await reopenSociety(id) : await reopenDeal(id);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
      >
        {pending ? "Reopening…" : "Reopen"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}
