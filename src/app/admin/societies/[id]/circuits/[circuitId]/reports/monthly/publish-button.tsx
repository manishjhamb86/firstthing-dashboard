"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatInstant } from "@/lib/format-date";
import { publishSavingsReport } from "./actions";

/**
 * Publish this month's report to the society's Documents tab. States what
 * is already published, and whether the rupee figure will be in it — a
 * month not yet released for billing publishes with kWh savings only.
 */
export function PublishReportButton({
  circuitId,
  month,
  publishedVersion,
  publishedAt,
  hasFee,
}: {
  circuitId: string;
  month: string;
  publishedVersion: number | null;
  publishedAt: string | null;
  hasFee: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  function publish() {
    if (!hasFee && !window.confirm("This month is not released for billing yet, so the report will show kWh savings without the rupee figure. Publish anyway?")) return;
    setMessage(null);
    start(async () => {
      try {
        const r = await publishSavingsReport(circuitId, month);
        if ("error" in r) setMessage({ tone: "bad", text: r.error });
        else {
          setMessage({ tone: "ok", text: `Published to the society as version ${r.version}.` });
          router.refresh();
        }
      } catch (err) {
        setMessage({ tone: "bad", text: err instanceof Error ? err.message : "Publishing failed — retry." });
      }
    });
  }

  return (
    <span className="no-print inline-flex flex-col items-end gap-1">
      <button type="button" className="btn-secondary" disabled={pending} onClick={publish}>
        {pending ? "Publishing…" : publishedVersion ? "Publish update to society" : "Publish to society"}
      </button>
      <span className="text-[11.5px]" style={{ color: message?.tone === "bad" ? "var(--bad-fg)" : "var(--text-subtle)" }}>
        {message
          ? message.text
          : publishedVersion
            ? `Published v${publishedVersion} · ${formatInstant(publishedAt)}`
            : "Not published to the society yet"}
      </span>
    </span>
  );
}
