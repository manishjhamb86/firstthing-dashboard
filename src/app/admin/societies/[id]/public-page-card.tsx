"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, StatusChip } from "@/components/ui";
import { normaliseSlug } from "@/lib/society-slug";
import { savePublicPage } from "./public-page-actions";

/**
 * The society's public page (2026-11-27): firsthing.earth/<address>, the
 * page its RWA shows residents. Anyone can open the link; operations sets
 * the address, switches it off, and decides whether office-bearers are named.
 */
export function PublicPageCard({
  societyId,
  base,
  initial,
  canEdit,
}: {
  societyId: string;
  /** "https://firsthing.earth" in production; this server's own address elsewhere. */
  base: string;
  initial: { slug: string; enabled: boolean; showLeadership: boolean; intro: string };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState(initial.slug);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [showLeadership, setShowLeadership] = useState(initial.showLeadership);
  const [intro, setIntro] = useState(initial.intro);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const url = `${base}/${initial.slug}`;

  function save() {
    setError(null);
    start(async () => {
      const r = await savePublicPage({ societyId, slug, enabled, showLeadership, intro });
      if (r.error) {
        setError(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

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
        <StatusChip tone={initial.enabled ? "ok" : "neu"}>{initial.enabled ? "Live" : "Off"}</StatusChip>
      </div>
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        The page the RWA shows its residents — what FirsThing has done at the society, in energy terms. Anyone with the
        link can open it; no rupee amounts are shown.
      </p>
      {!editing ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
            <span className="min-w-0 flex-1 truncate font-semibold">{url.replace(/^https?:\/\//, "")}</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy link"}
            </button>
            {initial.enabled && (
              <a href={`/${initial.slug}`} target="_blank" rel="noreferrer" className="link-arrow text-[13px] font-semibold">
                Open →
              </a>
            )}
          </div>
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            {initial.showLeadership ? "Names the society's current office-bearers." : "Office-bearers are not named."}
            {initial.intro ? " Uses the RWA's own story." : " Uses the standard story."}
          </p>
          {canEdit && (
            <button type="button" className="btn-secondary btn-sm mt-3" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="pp-slug" className="lbl">
              Address
            </label>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="shrink-0 text-[13px]" style={{ color: "var(--text-muted)" }}>
                {base.replace(/^https?:\/\//, "")}/
              </span>
              <input id="pp-slug" className="field min-w-0 flex-1" value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={() => setSlug(normaliseSlug(slug))} />
            </div>
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-subtle)" }}>
              Letters, digits and hyphens. /{normaliseSlug(slug).replace(/-/g, "") || "…"} opens the same page.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>The page is live</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={showLeadership} onChange={(e) => setShowLeadership(e.target.checked)} />
            <span>
              Name the current office-bearers
              <span className="block text-[12px]" style={{ color: "var(--text-subtle)" }}>
                Only with the RWA&apos;s permission. Names and positions from the member register; never phone numbers.
              </span>
            </span>
          </label>
          <div>
            <label htmlFor="pp-intro" className="lbl">
              The society&apos;s story (optional)
            </label>
            <textarea
              id="pp-intro"
              className="field mt-1"
              rows={4}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="Leave blank for the standard paragraph. Use the RWA-approved words."
            />
          </div>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setSlug(initial.slug);
                setEnabled(initial.enabled);
                setShowLeadership(initial.showLeadership);
                setIntro(initial.intro);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
