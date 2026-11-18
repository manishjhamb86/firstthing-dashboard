"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { fetchBillFromZoho } from "../../actions";

/** Fetch new invoices from Zoho now; the page then shows the next step if this society's month arrived. */
export function FetchBillButton({ societyId, period }: { societyId: string; period: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ tone: "bad" | "muted"; text: string } | null>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        className="btn-primary inline-flex items-center gap-2"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setNote(null);
            const r = await fetchBillFromZoho(societyId, period);
            if (r.error) return setNote({ tone: "bad", text: r.error });
            if (r.found) return router.refresh();
            setNote({ tone: "muted", text: `${r.summary} This society's invoice for the month is not in Zoho yet.` });
          })
        }
      >
        <RefreshCw size={16} aria-hidden className={pending ? "animate-spin" : undefined} />
        {pending ? "Fetching from Zoho…" : "Fetch from Zoho"}
      </button>
      {note && (
        <p role={note.tone === "bad" ? "alert" : "status"} className="max-w-md text-[13px]" style={{ color: note.tone === "bad" ? "var(--bad-fg)" : "var(--text-muted)" }}>
          {note.text}
        </p>
      )}
    </div>
  );
}
