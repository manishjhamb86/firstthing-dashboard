"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncZohoNow } from "./actions";

/** "Fetch from Zoho" — one pass now, capped, instead of waiting for the 6-hourly one. */
export function ZohoFetchButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-secondary"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const r = await syncZohoNow();
              setMessage(r.error ? { text: r.error, bad: true } : { text: r.summary ?? "Done.", bad: false });
            } catch {
              setMessage({ text: "The fetch did not complete — refresh to see what arrived, then try again.", bad: true });
            }
            router.refresh();
          });
        }}
      >
        {pending ? "Fetching from Zoho…" : "Fetch from Zoho"}
      </button>
      {message && (
        <span role="status" className="text-[12.5px]" style={{ color: message.bad ? "var(--bad-fg)" : "var(--text-muted)" }}>
          {message.text}
        </span>
      )}
    </span>
  );
}
