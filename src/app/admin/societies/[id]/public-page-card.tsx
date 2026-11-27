"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardTitle, StatusChip } from "@/components/ui";

/**
 * The society's public page at a glance (2026-11-27): its link, whether it
 * is live, and the way to the editor (Societies → Public pages), where what
 * the page shows is decided.
 */
export function PublicPageCard({
  societyId,
  base,
  slug,
  enabled,
  hiddenCount,
}: {
  societyId: string;
  base: string;
  slug: string;
  enabled: boolean;
  hiddenCount: number;
}) {
  const [copied, setCopied] = useState(false);
  const url = `${base}/${slug}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }
  return (
    <Card className="p-6 min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="mb-0">Public page</CardTitle>
        <StatusChip tone={enabled ? "ok" : "neu"}>{enabled ? "Live" : "Off"}</StatusChip>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
        <span className="min-w-0 flex-1 truncate font-semibold">{url.replace(/^https?:\/\//, "")}</span>
        <button type="button" className="btn-ghost btn-sm" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy link"}
        </button>
        {enabled && (
          <a href={`/${slug}`} target="_blank" rel="noreferrer" className="link-arrow text-[13px] font-semibold">
            Open →
          </a>
        )}
      </div>
      <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
        {hiddenCount > 0 ? `${hiddenCount} section${hiddenCount === 1 ? "" : "s"} hidden.` : "Every section shown."}
      </p>
      <Link href={`/admin/public-pages/${societyId}`} className="btn-secondary btn-sm mt-3 inline-flex">
        Edit the page
      </Link>
    </Card>
  );
}
