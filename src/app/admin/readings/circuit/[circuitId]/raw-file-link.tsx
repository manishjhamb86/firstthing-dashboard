"use client";

import { useState, useTransition } from "react";
import { getRawFileDownloadUrl } from "../../uploads";

/**
 * FEAT-047-AC-3 — the degraded case, stated rather than hidden.
 *
 * The link is minted on demand instead of being rendered into the page,
 * because a signed URL that sat in the HTML would be a five-minute window
 * handed to anyone who could see the page source, and because a failure to
 * produce one has to be *visible*: if the object is unretrievable, the
 * readings above still display and this says the chain is broken here. The
 * alternative — a link that 403s when clicked — leaves the operator unable to
 * tell a storage problem from a permissions problem.
 */
export function RawFileLink({ rawFileId }: { rawFileId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className="text-sm underline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await getRawFileDownloadUrl(rawFileId);
            if ("error" in res) return setError(res.error);
            window.open(res.url, "_blank", "noopener,noreferrer");
          })
        }
      >
        {pending ? "Opening…" : "Download"}
      </button>
      {error && (
        <p className="mt-1 text-xs" style={{ color: "var(--warn-fg)" }}>
          {error} The readings above still stand — but this figure can no longer be traced to its
          original file.
        </p>
      )}
    </div>
  );
}
