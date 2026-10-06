"use client";

import { useState, useTransition } from "react";
import { getPortalInvoiceUrl } from "./actions";

export function DownloadInvoiceButton({ invoiceId, fullWidth = false }: { invoiceId: string; fullWidth?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function download() {
    setError(null);
    startTransition(async () => {
      const result = await getPortalInvoiceUrl(invoiceId);
      if ("error" in result) return setError(result.error);
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  // fullWidth (2026-10-07, user-caught): the latest-invoice hero's own
  // button used to float alone on the card's right edge with the rest of
  // the card's width sitting empty beside it — a full-width primary action
  // there fills the space the "Download" button is the whole point of.
  return (
    <div className={fullWidth ? "" : "shrink-0 text-right"}>
      <button type="button" className={`btn-secondary ${fullWidth ? "w-full" : ""}`} disabled={pending} onClick={download}>
        {pending ? "Opening…" : "Download"}
      </button>
      {error && (
        <p className="mt-1 text-[12px]" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
