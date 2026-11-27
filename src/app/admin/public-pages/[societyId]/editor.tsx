"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, StatusChip } from "@/components/ui";
import { normaliseSlug } from "@/lib/society-slug";
import { PUBLIC_SECTIONS, type PublicSectionKey } from "@/lib/public-page-sections";
import { savePublicPage } from "@/app/admin/societies/[id]/public-page-actions";

export type SectionSummary = {
  key: PublicSectionKey;
  /** What the section shows right now, in a line. */
  now: string;
  /** Nothing to show yet — the section stays off the page whatever the switch says. */
  empty?: boolean;
  link?: { href: string; label: string };
};

/**
 * The editor for one society's public page (2026-11-27): address, live
 * switch, and a row per section with what it shows now and a Show switch.
 * One Save at the end.
 */
export function PublicPageEditor({
  societyId,
  base,
  canEdit,
  initial,
  summaries,
  members,
  membersHref,
}: {
  societyId: string;
  base: string;
  canEdit: boolean;
  initial: { slug: string; enabled: boolean; showLeadership: boolean; intro: string; hidden: PublicSectionKey[] };
  summaries: SectionSummary[];
  members: { name: string; position: string }[];
  membersHref: string;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial.slug);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [showLeadership, setShowLeadership] = useState(initial.showLeadership);
  const [intro, setIntro] = useState(initial.intro);
  const [hidden, setHidden] = useState<Set<PublicSectionKey>>(new Set(initial.hidden));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const dirty = useMemo(
    () =>
      normaliseSlug(slug) !== initial.slug ||
      enabled !== initial.enabled ||
      showLeadership !== initial.showLeadership ||
      intro.trim() !== initial.intro.trim() ||
      hidden.size !== initial.hidden.length ||
      initial.hidden.some((k) => !hidden.has(k)),
    [slug, enabled, showLeadership, intro, hidden, initial],
  );
  const url = `${base}/${initial.slug}`;

  function toggle(k: PublicSectionKey, show: boolean) {
    setSaved(false);
    setHidden((h) => {
      const next = new Set(h);
      if (show) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      try {
        const r = await savePublicPage({ societyId, slug, enabled, showLeadership, intro, hiddenSections: [...hidden] });
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.slug) setSlug(r.slug);
        setSaved(true);
        router.refresh();
      } catch {
        setError("The save did not complete — reload the page and try again.");
      }
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

  const summaryOf = (k: PublicSectionKey) => summaries.find((s) => s.key === k);

  return (
    <div className="grid max-w-4xl gap-5">
      {!canEdit && (
        <p className="rounded-[var(--r-sm)] border px-4 py-3 text-sm" style={{ background: "var(--info-bg)", borderColor: "var(--info-line)", color: "var(--info-fg)" }}>
          You can see these settings; changing them is an operations action.
        </p>
      )}

      <Card className="p-6">
        <CardTitle>The page</CardTitle>
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}>
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
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pp-slug" className="lbl">
              Address
            </label>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="shrink-0 text-[13px]" style={{ color: "var(--text-muted)" }}>
                {base.replace(/^https?:\/\//, "")}/
              </span>
              <input
                id="pp-slug"
                className="field min-w-0 flex-1"
                value={slug}
                disabled={!canEdit}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSaved(false);
                }}
                onBlur={() => setSlug(normaliseSlug(slug))}
              />
            </div>
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-subtle)" }}>
              /{normaliseSlug(slug).replace(/-/g, "") || "…"} opens the same page.
            </p>
          </div>
          <label className="flex items-start gap-2.5 self-center text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={enabled}
              disabled={!canEdit}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setSaved(false);
              }}
            />
            <span>
              <span className="font-semibold">The page is live</span>
              <span className="block text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                Off: the address answers &ldquo;not found&rdquo;.
              </span>
            </span>
          </label>
        </div>
      </Card>

      <Card className="p-6">
        <CardTitle>What the page shows</CardTitle>
        <p className="-mt-1 mb-4 text-[13px]" style={{ color: "var(--text-muted)" }}>
          The top of the page — the society&apos;s name, location and &ldquo;partner since&rdquo; card — and the contact band
          always show. No rupee amounts appear anywhere.
        </p>
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {PUBLIC_SECTIONS.map((sec, i) => {
            const sum = summaryOf(sec.key);
            const shown = !hidden.has(sec.key);
            return (
              <li key={sec.key} className="py-4 first:pt-0">
                {i === 4 && (
                  <LeadershipRow
                    shown={showLeadership}
                    canEdit={canEdit}
                    members={members}
                    membersHref={membersHref}
                    onChange={(v) => {
                      setShowLeadership(v);
                      setSaved(false);
                    }}
                  />
                )}
                <SectionRow
                  id={`sec-${sec.key}`}
                  label={sec.label}
                  hint={sec.hint}
                  shown={shown}
                  canEdit={canEdit}
                  onChange={(v) => toggle(sec.key, v)}
                  now={sum?.now ?? ""}
                  empty={!!sum?.empty}
                  link={sum?.link}
                >
                  {sec.key === "story" && (
                    <div className="mt-3">
                      <label htmlFor="pp-intro" className="lbl">
                        The society&apos;s own words (optional)
                      </label>
                      <textarea
                        id="pp-intro"
                        className="field mt-1"
                        rows={4}
                        value={intro}
                        disabled={!canEdit}
                        onChange={(e) => {
                          setIntro(e.target.value);
                          setSaved(false);
                        }}
                        placeholder="Leave blank for the standard paragraph. Use the RWA-approved words."
                      />
                    </div>
                  )}
                </SectionRow>
              </li>
            );
          })}
        </ul>
      </Card>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={!dirty || pending} onClick={save}>
            {pending ? "Saving…" : "Save changes"}
          </button>
          {saved && !dirty && (
            <span className="text-sm font-semibold" style={{ color: "var(--ok-fg)" }} role="status">
              Saved — the page is updated.
            </span>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      )}
    </div>
  );
}

function SectionRow({
  id,
  label,
  hint,
  shown,
  canEdit,
  onChange,
  now,
  empty,
  link,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  shown: boolean;
  canEdit: boolean;
  onChange: (show: boolean) => void;
  now: string;
  empty: boolean;
  link?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor={id} className="font-semibold">
            {label}
          </label>
          <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            {hint}
          </p>
          <p className="mt-1.5 text-[13px]" style={{ color: empty ? "var(--warn-fg)" : "var(--text-muted)" }}>
            <span className="font-semibold">Now: </span>
            {now}
            {link && (
              <>
                {" "}
                <Link href={link.href} className="link-arrow font-semibold">
                  {link.label} →
                </Link>
              </>
            )}
          </p>
        </div>
        <label className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold">
          <input id={id} type="checkbox" checked={shown} disabled={!canEdit} onChange={(e) => onChange(e.target.checked)} />
          {shown ? <StatusChip tone={empty ? "warn" : "ok"}>{empty ? "Shown when there is one" : "Shown"}</StatusChip> : <StatusChip tone="neu">Hidden</StatusChip>}
        </label>
      </div>
      {children}
    </div>
  );
}

function LeadershipRow({
  shown,
  canEdit,
  members,
  membersHref,
  onChange,
}: {
  shown: boolean;
  canEdit: boolean;
  members: { name: string; position: string }[];
  membersHref: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="mb-4 border-b pb-4" style={{ borderColor: "var(--border-subtle)" }}>
      <SectionRow
        id="sec-leadership"
        label="RWA members"
        hint="Current members' names and positions from the member register. Never phone numbers."
        shown={shown}
        canEdit={canEdit}
        onChange={onChange}
        now={members.length > 0 ? members.map((m) => `${m.name} (${m.position})`).join(", ") : "No current members recorded."}
        empty={members.length === 0}
        link={{ href: membersHref, label: members.length > 0 ? "Manage members" : "Add members" }}
      />
    </div>
  );
}
