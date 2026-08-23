import type { ReactNode } from "react";
import { BackButton } from "./back-button";

// Shared presentational primitives for the DIR-02 Console system
// (docs/product/05a-theme-system.md). No hooks — usable from Server and
// Client Components alike; interaction stays in the caller.

export type ChipTone = "ok" | "warn" | "bad" | "info" | "neu";

export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`chip chip-${tone}`}>
      <span className="chip-dot" aria-hidden />
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`card ${className ?? ""}`}>{children}</div>;
}

// Section heading inside a card — Modernize-style sentence-case semibold,
// replacing the Console small-caps treatment.
export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  // className exists so a title can sit in a header row beside an action
  // button, where the default bottom margin would misalign the pair.
  return <p className={`text-[15px] font-semibold mb-4 ${className}`}>{children}</p>;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  chip,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Where to land when there is no history to walk — a deep link or a new tab. */
  backHref?: string;
  chip?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {/* One control, and it goes BACK — not to a fixed parent. See
          BackButton for why the breadcrumb version was wrong three ways. */}
      {backHref && (
        <div className="mb-3">
          <BackButton fallbackHref={backHref} />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        {/* min-w-0 flex-1: without it a long subtitle makes the title column
            wider than the row and the action wraps beneath it — which is how
            the device catalog's "Add device" ended up below the heading while
            every other page's sat top-right. The subtitle wraps inside its
            own column now. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[22px] font-bold leading-tight tracking-[-0.018em]">{title}</h1>
            {chip}
          </div>
          {subtitle && <p className="mt-1 text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 max-w-full">{action}</div>}
      </div>
    </header>
  );
}

// INV-06 — every list surface defines an empty state.
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border border-dashed border-[var(--border)] rounded-[var(--r-md)] p-8 text-center">
      <p className="font-semibold mb-1">{title}</p>
      {children && <div className="text-sm text-[var(--text-muted)]">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Labeled form field wrapper — real <label>s, never placeholder-only
// (this repo's own documented rule from the archived app's invoice work:
// placeholders disappear the moment a field has a value).
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="lbl">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm" style={{ color: "var(--bad-fg)" }}>
      {children}
    </p>
  );
}

// Page ribbon — a page-level message, flush at the top of the content
// column. This is where warnings and errors belong (the user's call,
// 2026-08-21): one strip, at the top, in the place the eye already checks,
// rather than a coloured paragraph wherever in the page it was authored.
//
// Render it as the FIRST element of the page — PageHeader carries its own
// back control, so nothing needs to sit above it. Placed lower it still
// renders, it just does not pull flush.
const RIBBON_TONE: Record<string, { bg: string; fg: string; line: string }> = {
  warn: { bg: "var(--warn-bg)", fg: "var(--warn-fg)", line: "var(--warn-line)" },
  bad: { bg: "var(--bad-bg)", fg: "var(--bad-fg)", line: "var(--bad-line)" },
  info: { bg: "var(--info-bg)", fg: "var(--info-fg)", line: "var(--info-line)" },
  neutral: { bg: "var(--neu-bg)", fg: "var(--neu-fg)", line: "var(--neu-line)" },
};

export function PageRibbon({
  tone = "warn",
  action,
  children,
}: {
  tone?: keyof typeof RIBBON_TONE;
  /** an inline control the message itself offers — approve, restore, fix */
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = RIBBON_TONE[tone] ?? RIBBON_TONE.warn;
  return (
    <div
      className="page-ribbon flex flex-wrap items-center justify-between gap-x-6 gap-y-2"
      style={{ background: t.bg, color: t.fg, borderColor: t.line }}
      // A warning is an advisory, not an interruption — role="status" so a
      // screen reader picks it up without stealing focus mid-task.
      role="status"
    >
      <div className="min-w-0">{children}</div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// Status tiles — ONE component and ONE row, used by every page that has
// figures to show. There used to be two components (KpiTile and Stat) and
// nine hand-written grids with three different gaps and two different
// breakpoints, so the row's height and the value's baseline moved as you
// navigated ("changing or navigating to other pages doesn't give a
// flickering effect", 2026-08-21).
//
// Three things are fixed on purpose, and each one is a thing that used to
// move:
//   · the label reserves one row whether or not it needs it, so the value
//     sits at the same y on a page with "Retired" and a page with
//     "Awaiting today's reading";
//   · the detail is clamped to two lines, so a long one cannot grow the row;
//   · the tile has a floor height, so a row of tiles with no detail is the
//     same height as one with.
//
// There is deliberately NO icon variant. An icon bubble on the Portfolio's
// tiles and not on the circuit page's is the same component wearing two
// faces, which is the drift this consolidation exists to end (audit,
// 2026-08-21). `tone` earns its keep instead by tinting the FIGURE — a held
// month reads amber and a clear one green, in the one place the eye is
// already looking.
// Only a figure that needs attention is tinted. `ok` renders in the plain
// text colour on purpose: a green number carries no information the absence
// of amber does not already carry, and a row of mixed green-and-plain tiles
// reads as if the colours mean something they do not.
const STAT_TONE: Record<string, string> = {
  accent: "var(--text)",
  ok: "var(--text)",
  info: "var(--text)",
  warn: "var(--warn-fg)",
  bad: "var(--bad-fg)",
};

export function StatRow({ children }: { children: ReactNode }) {
  // A container query, not a viewport one. `lg:grid-cols-4` asked how wide
  // the WINDOW was, so the society portal — whose reading column is ~700px
  // inside a 1400px window — crammed four tiles into it and wrapped
  // "507.32 kWh/day" across two lines. The row now measures the space it is
  // actually in, so the same component behaves in a narrow column and a
  // full-width one without either caller knowing about the other.
  return (
    <div className="stat-row-wrap">
      <div className="stat-row">{children}</div>
    </div>
  );
}

export function Stat({
  label,
  value,
  detail,
  tone = "accent",
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: keyof typeof STAT_TONE;
}) {
  return (
    <div className="card stat-tile p-4">
      <p className="lbl mb-1.5 min-h-9">{label}</p>
      <p
        className="num text-[20px] font-semibold leading-none"
        style={{ color: STAT_TONE[tone] ?? STAT_TONE.accent }}
      >
        {value}
      </p>
      {/* Always rendered, even when empty. A floor height alone was not
          enough: a tile with a two-line detail came out at 134px next to a
          one-line tile's 118px, which is the height drift this is here to
          prevent. Two lines are reserved and at most two are shown, so the
          tile is the same height whatever the copy. */}
      <p className="stat-detail mt-1.5 text-xs text-[var(--text-subtle)]">{detail ?? "\u00A0"}</p>
    </div>
  );
}
