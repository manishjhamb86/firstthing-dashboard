import Link from "next/link";
import { AlertTriangle, Check, type LucideIcon } from "lucide-react";

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

/** The 2-up kWh/% row beside the hero — deliberately icon-less and smaller than `KpiBubble`.
 *  Tone widened past ok/info (2026-10-07) for pages whose compact figures can
 *  genuinely be bad/warn (e.g. Support's "Open" count), not just this product's
 *  habitual savings green/blue. */
export function CompactTile({ tone, value, label }: { tone: Tone; value: string; label: string }) {
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
 *
 * Collapsed to one line in the OK case (2026-10-07, user-reviewed design —
 * see the dashboard mockup): a clean bill of health is the expected,
 * non-actionable case and earns a quiet line, not a full KPI-sized card.
 * The fuller icon-bubble treatment is kept for when something genuinely
 * needs attention, where the extra visual weight is earned.
 */
export function HealthBubble({
  issues,
  summary,
  okLabel = "All reporting",
  attentionLabel = "Needs attention",
  title = "System health",
  compact = false,
}: {
  issues: HealthIssue[];
  summary: string;
  okLabel?: string;
  attentionLabel?: string;
  title?: string;
  /** One-line pill instead of a full card when there's nothing wrong. */
  compact?: boolean;
}) {
  const ok = issues.length === 0;

  if (compact && ok) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-[var(--r-md)] px-3.5 py-2.5"
        style={{ background: HEALTH_PURPLE.bg }}
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{ background: HEALTH_PURPLE.iconBg, color: "#fff" }}
        >
          <Check size={13} strokeWidth={3} aria-hidden />
        </span>
        <p className="text-[13px] font-bold" style={{ color: HEALTH_PURPLE.title }}>
          {okLabel} — {summary}
        </p>
      </div>
    );
  }

  // The attention case still carried the full KPI-tile anatomy (a 36px icon
  // bubble, a 24px headline, its own "System health · …" line) even in the
  // compact slot — which is sized to match the quiet OK pill above, not a
  // full tile. One tank offline was taking as much vertical room as the
  // whole rest of the mobile hero combined (user-caught, 2026-10-08, with
  // a screenshot). Same slim pill shape as the OK case, just warn-toned and
  // carrying the issue link(s) instead of the summary line.
  if (compact) {
    const warn = toneColors("warn");
    return (
      <div className="flex flex-col gap-1 rounded-[var(--r-md)] px-3.5 py-2.5" style={{ background: warn.bg }}>
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--surface)", color: warn.fg }}
          >
            <AlertTriangle size={12.5} strokeWidth={2.5} aria-hidden />
          </span>
          <p className="text-[13px] font-bold" style={{ color: warn.fg }}>
            {attentionLabel}
          </p>
        </div>
        <ul className="flex flex-col gap-0.5 pl-[34px]">
          {issues.map((i) => (
            <li key={i.text}>
              <Link href={i.href} className="text-[12.5px] font-semibold underline" style={{ color: warn.fg }}>
                {i.text} →
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Same anatomy as KpiBubble — icon bubble on top, the headline where the
  // figure goes, a bold line, a muted line — so the four tiles line up
  // (user-caught 2026-09-25: the side-icon layout sat out of line).
  const colors = ok
    ? { bg: HEALTH_PURPLE.bg, fg: HEALTH_PURPLE.title, muted: HEALTH_PURPLE.subtitle, iconBg: HEALTH_PURPLE.iconBg, iconFg: "#fff" }
    : { bg: toneColors("warn").bg, fg: toneColors("warn").fg, muted: "var(--text-subtle)", iconBg: "var(--surface)", iconFg: toneColors("warn").fg };
  return (
    <div className="flex flex-col gap-2.5 rounded-[var(--r-md)] p-5" style={{ background: colors.bg }} role={ok ? undefined : "status"}>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{ background: colors.iconBg, color: colors.iconFg }}
      >
        {ok ? <Check size={17} strokeWidth={3} aria-hidden /> : <AlertTriangle size={17} strokeWidth={2.3} aria-hidden />}
      </span>
      <p className="text-[24px] font-extrabold leading-none tracking-[-0.02em]" style={{ color: colors.fg }}>
        {ok ? okLabel : attentionLabel}
      </p>
      {ok ? (
        <p className="text-[13px] font-bold" style={{ color: colors.fg }}>
          {title}
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {issues.map((i) => (
            <li key={i.text}>
              <Link href={i.href} className="text-[13px] font-bold underline" style={{ color: colors.fg }}>
                {i.text} →
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px]" style={{ color: colors.muted }}>
        {ok ? summary : `${title} · ${summary}`}
      </p>
    </div>
  );
}

/**
 * A compact shortcut pill — real navigation, not decoration. Replaced the
 * full-width `QuickLinkRow` (2026-10-07, user-reviewed design): two of
 * these side by side cost a fraction of two stacked 56px rows, which is all
 * a navigation shortcut needs — the information is elsewhere on the page.
 */
export function QuickLinkPill({
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
  const { fg } = toneColors(tone);
  return (
    <Link
      href={href}
      className="flex flex-1 items-center gap-2 rounded-[var(--r-md)] border px-3 py-2.5"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
    >
      <Icon size={15} strokeWidth={2.2} aria-hidden style={{ color: fg }} />
      <span className="min-w-0 truncate text-[12.5px] font-semibold">{label}</span>
    </Link>
  );
}
