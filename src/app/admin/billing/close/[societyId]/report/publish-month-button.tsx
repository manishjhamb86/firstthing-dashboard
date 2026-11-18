"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishMonthReports } from "../../actions";

/** Publish every circuit's report for the month, then offer the way back to the society. */
export function PublishMonthButton({
  societyId, period, societyName, toPublish, total, canPublish, backHref,
}: { societyId: string; period: string; societyName: string; toPublish: number; total: number; canPublish: boolean; backHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (toPublish === 0 || done) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] font-semibold" style={{ color: "var(--ok-fg)" }}>
          {done ? `Published to ${societyName}.` : "Published — the society sees this on its portal."}
        </span>
        <Link href={backHref} className="btn-primary">Back to {societyName}</Link>
      </div>
    );
  }
  if (!canPublish) {
    return <p className="max-w-xs text-[13px] text-[var(--text-muted)]">Publishing to a society needs pipeline authority.</p>;
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await publishMonthReports(societyId, period);
            if (r.error) return setError(r.error);
            setDone(true);
            router.refresh();
          })
        }
      >
        {pending ? "Publishing…" : `Publish to ${societyName}${total > 1 ? ` (${toPublish} of ${total})` : ""}`}
      </button>
      {error && <p role="alert" className="max-w-sm text-right text-[13px]" style={{ color: "var(--bad-fg)" }}>{error}</p>}
    </div>
  );
}
