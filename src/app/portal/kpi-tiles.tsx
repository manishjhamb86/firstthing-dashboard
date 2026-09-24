import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, type LucideIcon } from "lucide-react";

// Shared icon-bubble tile components for the portal (design canvas fidelity,
// 2026-09-21) — extracted out of the dashboard so the Electricity page (and
// any page after it) can reuse the exact same tiles rather than a second,
// hand-copied version that drifts (this codebase's own standing rule: a
// definition duplicated instead of shared is how two screens end up
// disagreeing about what they both claim to show).
//
// Deliberately NOT the shared `Stat` component — `Stat`'s own comment states
// this codebase's general rule ("no icon variant... a green number carries
// no information the absence of amber does not already carry"), which the
// portal's design canvas explicitly overrides (user's call, 2026-09-21:
// "full rebuild... closer to the mockup's look"). Scoping the override to
// these portal-only tiles keeps every other screen's `Stat` tiles exactly as
// that rule left them.

type Tone = "ok" | "info" | "warn" | "bad";

function toneColors(tone: Tone) {
  if (tone === "ok") return { bg: "var(--ok-bg)", fg: "var(--ok-fg)", line: "var(--ok-line)" };
  if (tone === "warn") return { bg: "var(--warn-bg)", fg: "var(--warn-fg)", line: "var(--warn-line)" };
  if (tone === "bad") return { bg: "var(--bad-bg)", fg: "var(--bad-fg)", line: "var(--bad-line)" };
  return { bg: "var(--info-bg)", fg: "var(--info-fg)", line: "var(--info-line)" };
}

/** One KPI tile: an icon in a white bubble over a tinted card, a big figure, a bold label, a muted detail line. */
export function KpiBubble({
  icon: Icon,
  tone,
  value,
  label,
  detail,
}: {
  icon: LucideIcon;
  tone: Tone;
  value: string;
  label: string;
  detail: string;
}) {
  const { bg, fg } = toneColors(tone);
  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--r-md)] p-5" style={{ background: bg }}>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ background: "var(--surface)", color: fg }}
      >
        <Icon size={17} strokeWidth={2.3} aria-hidden />
      </span>
      <p className="num text-[24px] font-extrabold leading-none tracking-[-0.02em]" style={{ color: fg }}>
        {value}
      </p>
      <p className="text-[13px] font-bold">{label}</p>
      <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
        {detail}
      </p>
    </div>
  );
}

/**
 * The phone mockup's own hero tile (Main.dc.html) — NOT the desktop 4-tile
 * row collapsed to one column. Stacking four equal, full-detail tiles on a
 * narrow screen just makes four tall cards (user-caught, 2026-09-21, with a
 * side-by-side screenshot of the two): the canvas's actual phone layout is
 * one prominent ₹ hero, a compact 2-up kWh/% row with no icon, then the
 * health bar — a deliberately different hierarchy per breakpoint, not a
 * naive reflow of the same markup.
 */
export function HeroSavedTile({ value, label = "Saved this month", detail }: { value: string; label?: string; detail: string }) {
  return (
    <div
      className="flex items-center gap-3.5 rounded-[var(--r-md)] p-4"
      style={{ background: "var(--ok-bg)", border: "1px solid var(--ok-line)" }}
    >
      <span
        aria-hidden
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-[18px] font-extrabold"
        style={{ background: "var(--surface)", color: "var(--ok-fg)" }}
      >
        ₹
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="num text-[28px] font-extrabold leading-none tracking-[-0.02em]" style={{ color: "var(--ok-fg)" }}>
          {value}
        </p>
        <p className="text-[13.5px] font-bold">{label}</p>
        <p className="text-[12px]" style={{ color: "var(--text-subtle)" }}>
          {detail}
        </p>
      </div>
    </div>
  );
}

/** The 2-up kWh/% row beside the hero — deliberately icon-less and smaller than `KpiBubble`. */
export function CompactTile({ tone, value, label }: { tone: "ok" | "info"; value: string; label: string }) {
  const { bg, fg, line } = toneColors(tone);
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--r-md)] p-4" style={{ background: bg, border: `1px solid ${line}` }}>
      <p className="num text-[21px] font-extrabold leading-none" style={{ color: fg }}>
        {value}
      </p>
      <p className="text-[12.5px] font-bold">{label}</p>
    </div>
  );
}

// A merged meters+tanks (or any) health read in a distinct purple.
// Deliberately kept OUTSIDE the shared token system: no other surface in
// this product uses this hue, and adding it globally for one tile would be
// a bigger change than the dashboard that introduced it asked for.
const HEALTH_PURPLE = { bg: "#F1EDFB", iconBg: "#5B3FB8", title: "#4A2FA5", subtitle: "#5B4E86" };

/** One thing wrong, in words, with the page that shows it. */
export type HealthIssue = { text: string; href: string };

/**
 * The meters + tanks health read. With nothing wrong it is the calm purple
 * tick; with anything wrong it turns amber, drops the tick, and NAMES each
 * problem with a link to where it can be seen — "Needs attention" beside a
 * tick and no detail read as a success (user-caught 2026-09-25, with 2 of 3
 * tanks offline).
 */
export function HealthBubble({
  issues,
  summary,
  okLabel = "All reporting",
  attentionLabel = "Needs attention",
  title = "System health",
}: {
  issues: HealthIssue[];
  summary: string;
  okLabel?: string;
  attentionLabel?: string;
  title?: string;
}) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-3.5 rounded-[var(--r-md)] p-5" style={{ background: HEALTH_PURPLE.bg }}>
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: HEALTH_PURPLE.iconBg }}
        >
          <Check size={20} strokeWidth={3} aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-[16px] font-extrabold" style={{ color: HEALTH_PURPLE.title }}>
            {okLabel}
          </p>
          <p className="text-[12px]" style={{ color: HEALTH_PURPLE.subtitle }}>
            {title} · {summary}
          </p>
        </div>
      </div>
    );
  }
  const { bg, fg, line } = toneColors("warn");
  return (
    <div
      className="flex items-start gap-3.5 rounded-[var(--r-md)] p-5"
      style={{ background: bg, border: `1px solid ${line}` }}
      role="status"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--surface)", color: fg }}
      >
        <AlertTriangle size={20} strokeWidth={2.4} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[16px] font-extrabold" style={{ color: fg }}>
          {attentionLabel}
        </p>
        <ul className="flex flex-col gap-0.5">
          {issues.map((i) => (
            <li key={i.text}>
              <Link href={i.href} className="text-[12.5px] font-semibold underline" style={{ color: fg }}>
                {i.text} →
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-[11.5px]" style={{ color: "var(--text-subtle)" }}>
          {title} · {summary}
        </p>
      </div>
    </div>
  );
}

/** A highlighted shortcut row — real navigation, not decoration. */
export function QuickLinkRow({
  icon: Icon,
  tone,
  label,
  href,
}: {
  icon: LucideIcon;
  tone: "info" | "warn";
  label: string;
  href: string;
}) {
  const { bg, fg } = toneColors(tone);
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-[var(--r-md)] border px-3.5 py-3"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: bg, color: fg }}>
        <Icon size={16} strokeWidth={2.2} aria-hidden />
      </span>
      <span className="flex-1 text-[14px] font-semibold">{label}</span>
      <ChevronRight size={17} style={{ color: "var(--text-subtle)" }} aria-hidden />
    </Link>
  );
}
