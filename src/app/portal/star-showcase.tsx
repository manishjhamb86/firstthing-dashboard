"use client";

// The star partner showcase on the resident dashboard (2026-10-21). The user
// chose an auto-scrolling carousel; WCAG 2.2 SC 2.2.2 then requires a visible
// pause, and the W3C pattern also pauses on hover or keyboard focus and starts
// paused when the device asks for reduced motion — all three are here. The
// track is an ordinary horizontal scroller, so a phone can swipe it by hand.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Pause, Play, Star as StarIcon } from "lucide-react";
import { StarRating } from "@/components/star-rating";
import { formatDate } from "@/lib/format-date";
import type { ShowcaseStats, StarCard } from "@/lib/star-showcase-loader";

const ADVANCE_MS = 5000;
const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (cb: () => void) => {
  const q = window.matchMedia?.(REDUCED);
  q?.addEventListener("change", cb);
  return () => q?.removeEventListener("change", cb);
};

export function StarShowcase({ cards, stats }: { cards: StarCard[]; stats: ShowcaseStats }) {
  const track = useRef<HTMLDivElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeReduced, () => window.matchMedia?.(REDUCED).matches ?? false, () => false);
  // Reduced motion starts paused; the reader can still press Play.
  const [choice, setChoice] = useState<boolean | null>(null);
  const playing = choice ?? !reducedMotion;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const rotates = cards.length > 1;

  useEffect(() => {
    if (!rotates || !playing || hovered || focused) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % cards.length), ADVANCE_MS);
    return () => window.clearInterval(t);
  }, [rotates, playing, hovered, focused, cards.length]);

  useEffect(() => {
    const el = track.current;
    const card = el?.children[index] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
  }, [index]);

  // Nothing to show, nothing rendered — the earlier version still drew the
  // card and a "no star partners yet" line even when there were none, and
  // alongside it a stats row disclosing OTHER societies' aggregate payment
  // status ("Nothing unpaid past due — 14 of 18 societies") to every signed-
  // in resident. A resident should never be told anything about a society
  // besides their own having an unpaid bill, even in aggregate and even with
  // no name attached (user-caught, 2026-10-22: "why you showing paid unpaid
  // to customers?", then "just show star societies, that too if there is
  // any"). The two aggregate counts that stayed open to that same reading —
  // how many societies exist, how many are star partners — are dropped too,
  // rather than judging which aggregate is safe to keep; only the star
  // societies themselves, and only when there's at least one, says nothing
  // about anyone who isn't on this list by name and by their own committee's
  // consent. The back-office page (`/admin/star-societies`) still shows ops
  // staff the full picture — this is the resident-facing surface only.
  if (cards.length === 0) return null;

  const asOf = formatDate(new Date(stats.asOf));
  return (
    <section aria-labelledby="star-showcase-title" className="card mb-6 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="star-showcase-title" className="flex items-center gap-2 text-[16px] font-bold">
            <StarIcon size={17} aria-hidden style={{ color: "var(--warn-fg)" }} />
            Star partner societies
          </h2>
          <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            Societies that pay every invoice on time, shown with their committee&apos;s agreement.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rotates && (
            <button
              type="button"
              className="btn-ghost inline-flex items-center gap-1.5"
              onClick={() => setChoice(!playing)}
              aria-label={playing ? "Pause the star partners" : "Play the star partners"}
            >
              {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
              {playing ? "Pause" : "Play"}
            </button>
          )}
          <Link href="/portal/star-societies" className="text-[13px] font-semibold underline">
            See all
          </Link>
        </div>
      </div>

      <div
        ref={track}
        role="region"
        aria-roledescription="carousel"
        aria-label="Star partner societies"
        aria-live={playing && !hovered && !focused ? "off" : "polite"}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        {cards.map((c, i) => (
          <article
            key={c.societyId}
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${cards.length}: ${c.name}`}
            tabIndex={0}
            className="min-w-[240px] max-w-[300px] flex-1 snap-start rounded-[var(--r-md)] border p-4"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
          >
            <p className="font-bold leading-tight">{c.name}</p>
            <p className="mb-2 text-[12px]" style={{ color: "var(--text-subtle)" }}>
              {c.location}
            </p>
            <StarRating stars={c.stars} size={16} />
            {c.summary && <p className="mt-2 text-[13px]">{c.summary}</p>}
            <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
              Star partner since {formatDate(new Date(c.since))}
            </p>
          </article>
        ))}
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
        As of {asOf}.
      </p>
    </section>
  );
}
