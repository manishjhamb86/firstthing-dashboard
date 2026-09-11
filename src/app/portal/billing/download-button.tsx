"use client";

import { useState, useTransition } from "react";
import { getPortalInvoiceUrl } from "./actions";

export function DownloadInvoiceButton({ invoiceId }: { invoiceId: string }) {
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

  return (
    <div className="shrink-0 text-right">
      <button type="button" className="btn-secondary" disabled={pending} onClick={download}>
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
