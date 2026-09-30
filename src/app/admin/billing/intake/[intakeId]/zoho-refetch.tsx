"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refetchFromZoho } from "../actions";

/**
 * Fetching an invoice again from Zoho replaces its review with Zoho's current
 * figures, so it is a stated choice, never automatic: a change in Zoho after
 * fetching is flagged here and on the list, and waits for this click.
 */
export function ZohoRefetch({ intakeId, changedAt }: { intakeId: string; changedAt: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border px-4 py-3 text-[13px]"
      style={changedAt ? { borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}
    >
      <span>
        {changedAt
          ? `This invoice changed in Zoho (${changedAt}) after it was fetched. Fetch it again to review Zoho's current version — it replaces what is on this page.`
          : "From Zoho Invoice. If it is corrected in Zoho, fetch it again here."}
        {error && <span className="block" style={{ color: "var(--bad-fg)" }}>{error}</span>}
      </span>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Fetch this invoice again from Zoho? Any changes made on this page are replaced by Zoho's figures.")) return;
          setError(null);
          startTransition(async () => {
            const r = await refetchFromZoho(intakeId);
            if (r.error) setError(r.error);
            router.refresh();
          });
        }}
      >
        {pending ? "Fetching…" : "Fetch again from Zoho"}
      </button>
    </div>
  );
}
