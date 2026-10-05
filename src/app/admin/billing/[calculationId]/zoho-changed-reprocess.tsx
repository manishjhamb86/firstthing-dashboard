"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reprocessReleasedZohoInvoice } from "../intake/actions";

/**
 * The accountant's own exception to GATE-02 (2026-10-06, user-asked, after
 * a released invoice's own flag ("Changed in Zoho since this was processed
 * — open it to review") had nowhere to lead: the intake review page
 * redirects straight to this month's page for any submitted row, so this
 * is the only screen that can ever offer it. Voids the live invoice,
 * reopens the intake for review, and — for a released month — un-releases
 * it; the accountant reviews Zoho's current figures and releases again.
 */
export function ZohoChangedReprocess({
  intakeId,
  changedAt,
  wasReleased,
}: {
  intakeId: string;
  changedAt: string;
  wasReleased: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border px-4 py-3 text-[13px]"
      style={{ borderColor: "var(--warn-line)", background: "var(--warn-bg)", color: "var(--warn-fg)" }}
    >
      <span>
        This invoice changed in Zoho ({changedAt}) after it was {wasReleased ? "released" : "submitted"}.
        {wasReleased
          ? " Reprocessing voids the current invoice, un-releases this month, and brings in Zoho's current figures — you will need to release it again."
          : " Reprocessing voids the current invoice and brings in Zoho's current figures for review."}
        {error && <span className="block" style={{ color: "var(--bad-fg)" }}>{error}</span>}
      </span>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={pending}
        onClick={() => {
          if (
            !window.confirm(
              wasReleased
                ? "Void this invoice, un-release the month, and fetch Zoho's current figures for review? The society's own copy of this bill stays exactly as released until you release the corrected version."
                : "Void this invoice and fetch Zoho's current figures for review?",
            )
          )
            return;
          setError(null);
          startTransition(async () => {
            const r = await reprocessReleasedZohoInvoice(intakeId);
            if (r.error) {
              setError(r.error);
              return;
            }
            router.push(`/admin/billing/intake/${intakeId}`);
          });
        }}
      >
        {pending ? "Reprocessing…" : "Void & bring in the updated invoice"}
      </button>
    </div>
  );
}
