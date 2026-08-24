import Link from "next/link";
import type { DealStep, NextAction } from "@/lib/deal-progress";

// Presentational stepper for the deal spine and the circuit's commissioning
// sequence. Deliberately hook-free (same rule as ui.tsx) so Server
// Components render it directly.
//
// The rules it encodes visually:
// - done      → solid green marker with a check, "Completed"
// - current   → solid accent marker with a halo, "In progress"
// - parallel  → dashed marker; runs alongside, link stays live
// - locked    → hollow marker, NO link, "Locked" + the step it waits on
//
// The heavier treatment (2026-08-20) follows reference designs the user
// picked: a STEP N eyebrow above each title, a right-aligned status chip per
// row, larger markers, and a connector that is GREEN behind completed steps
// and grey ahead of them — so the line itself carries how far the deal has
// got, which is the thing you read a stepper for.

function CheckGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 7.2 5.6 10.3 11.5 4.4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg width="9" height="10" viewBox="0 0 10 11" fill="none" aria-hidden>
      <rect x="1" y="4.5" width="8" height="6" rx="1.5" fill="currentColor" />
      <path d="M3 4.5V3a2 2 0 1 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

export const STEP_MARKER_PX = 28;

/**
 * The one marker used by every step-shaped surface in the product, so the
 * deal spine, the circuit sequence and the survey's own two steps read as
 * the same language rather than three near-misses.
 */
export function StepMarker({
  status,
  index,
  size = STEP_MARKER_PX,
}: {
  status: DealStep["status"];
  index: number;
  size?: number;
}) {
  const base = "flex shrink-0 items-center justify-center rounded-full font-semibold";
  const dims = { width: size, height: size, fontSize: size <= 24 ? 11 : 12 };

  if (status === "done") {
    return (
      <span
        className={base}
        style={{ ...dims, background: "var(--ok-fg)", color: "#fff" }}
        aria-hidden
      >
        <CheckGlyph />
      </span>
    );
  }
  if (status === "current") {
    return (
      <span
        className={base}
        style={{
          ...dims,
          background: "var(--accent)",
          color: "var(--accent-contrast, #fff)",
          // The halo is what makes "you are here" findable at a glance in a
          // column of nine rows.
          boxShadow: "0 0 0 4px var(--accent-subtle)",
        }}
        aria-hidden
      >
        {index}
      </span>
    );
  }
  if (status === "parallel") {
    return (
      <span
        className={base}
        style={{ ...dims, border: "1.5px dashed var(--text-muted)", color: "var(--text-muted)" }}
        aria-hidden
      >
        {index}
      </span>
    );
  }
  return (
    <span
      className={base}
      style={{
        ...dims,
        border: "1.5px solid var(--border)",
        background: "var(--surface)",
        color: "var(--text-subtle)",
      }}
      aria-hidden
    >
      {index}
    </span>
  );
}

const STATUS_CHIP: Record<DealStep["status"], { label: string; cls: string } | null> = {
  done: { label: "Completed", cls: "chip-ok" },
  current: { label: "In progress", cls: "chip-info" },
  parallel: { label: "Alongside", cls: "chip-neu" },
  locked: { label: "Locked", cls: "chip-neu" },
};

export function DealStepper({ steps }: { steps: DealStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const reachable = s.href && s.status !== "locked";
        const chip = STATUS_CHIP[s.status];
        const title = reachable ? (
          <Link href={s.href as string} className="font-semibold hover:underline">
            {s.title} →
          </Link>
        ) : (
          <span className={s.status === "locked" ? "font-semibold text-[var(--text-muted)]" : "font-semibold"}>
            {s.title}
          </span>
        );
        return (
          <li key={s.key} className="relative flex gap-3.5">
            {/* The connector carries progress: green behind a completed
                step, grey from the current one onward. */}
            {!isLast && (
              <span
                aria-hidden
                className="absolute top-7 bottom-0 w-0.5 -translate-x-1/2 rounded-full"
                style={{
                  left: STEP_MARKER_PX / 2,
                  background: s.status === "done" ? "var(--ok-line)" : "var(--border-subtle)",
                }}
              />
            )}
            <StepMarker status={s.status} index={i + 1} />
            <div className="min-w-0 flex-1 pb-6 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <p className="lbl" style={{ color: "var(--text-subtle)" }}>
                    Step {i + 1}
                  </p>
                  <div className="mt-0.5">{title}</div>
                </div>
                {chip && (
                  <span className={`chip ${chip.cls} shrink-0`}>
                    {s.status === "locked" ? <LockGlyph /> : <span className="chip-dot" aria-hidden />}
                    {chip.label}
                  </span>
                )}
              </div>
              <p
                className="text-xs mt-1"
                style={{ color: s.status === "current" ? "var(--text)" : "var(--text-muted)" }}
              >
                {s.summary}
              </p>
              {/* Where the work actually is. The condition alone ("when the
                  demo report is shared") does not say which step owns it. */}
              {s.blockedBy && (
                <p className="text-xs mt-1.5 flex flex-wrap items-center gap-1">
                  <span style={{ color: "var(--warn-fg)" }}>Waiting on</span>
                  {s.blockedBy.href ? (
                    <Link href={s.blockedBy.href} className="font-medium hover:underline">
                      step {s.blockedBy.index} · {s.blockedBy.title} →
                    </Link>
                  ) : (
                    <span className="font-medium">
                      step {s.blockedBy.index} · {s.blockedBy.title}
                    </span>
                  )}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The single most important thing on the page: what to do now.
 *
 * Filled, not outlined (user-reported 2026-08-20: "this gets merged in the
 * page and users don't pay attention to it"). A white card with a thin
 * accent border sits at the same visual weight as every other card on a page
 * made of cards, so the one instruction read as another panel. Solid accent,
 * white type, its own shadow and an explicit affordance on the right — it
 * should be the first thing the eye lands on, because it is the only thing
 * on the page that says what to do.
 */

/**
 * The step is real, but it is not yours to take.
 *
 * A blue "next step · Continue" card said the opposite: it read as an action
 * for whoever was looking, it was the same accent as every genuine next step,
 * and — because the step happens on the page you are already on — clicking it
 * did nothing at all (user-reported 2026-08-24). This says who is expected to
 * do it and why, and carries the override rather than pretending to be one.
 */
export function WaitingOnCallout({
  title,
  who,
  detail,
  loggedBy,
  href,
  children,
}: {
  title: string;
  who: string;
  detail: string;
  /** Who created the record, when that is not the person it is waiting on. */
  loggedBy?: string;
  /** Offered only to an account allowed to step in — usually operations. */
  href?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="mb-8 flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[var(--r-md)] border p-5"
      style={{
        background: "var(--warn-bg)",
        borderColor: "var(--warn-line)",
        color: "var(--warn-fg)",
      }}
      role="status"
    >
      <div className="min-w-0">
        <p className="lbl mb-1">Waiting on {who}</p>
        <p className="text-[17px] font-semibold leading-snug">{title}</p>
        <p className="text-sm mt-0.5">{detail}</p>
        {loggedBy && (
          <p className="text-[13px] mt-1 opacity-80">Logged by {loggedBy} on their behalf.</p>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
      {href && !children && (
        <Link
          href={href}
          className="shrink-0 inline-flex items-center gap-2 rounded-[var(--r-pill)] border px-4 py-2 text-sm font-semibold no-underline"
          style={{ borderColor: "currentColor", color: "inherit" }}
        >
          Open it anyway →
        </Link>
      )}
    </div>
  );
}

export function NextStepCallout({
  next,
  eyebrow,
  done,
  inline,
  children,
}: {
  next: NextAction;
  eyebrow?: string;
  /** Render a control in place of the Continue affordance, and do not link. */
  inline?: boolean;
  children?: React.ReactNode;
  /**
   * What this step just finished, when the page has both. A green "done"
   * banner stacked directly above this blue one is two banners competing for
   * the same glance — the shape the user rejected on the demo ribbon
   * (2026-08-21). One card, the outcome above the next move.
   */
  done?: React.ReactNode;
}) {
  // When the step IS a control (assigning the survey, say), the card must not
  // also be a link — a card that both navigates and holds a <select> is a
  // click that does two things. Same body either way; only the wrapper
  // differs, so it is built once rather than as a component-in-a-component
  // (which would reset its state on every render).
  const body = (
    <>
      <div className="min-w-0">
        {done && (
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: "rgba(255,255,255,0.22)" }}
            >
              ✓
            </span>
            {done}
          </p>
        )}
        <p className="lbl mb-1" style={{ color: "rgba(255,255,255,0.75)" }}>
          {eyebrow ? `${eyebrow} · next step` : "Next step"}
        </p>
        <p className="text-[17px] font-semibold leading-snug">{next.label}</p>
        <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.85)" }}>
          {next.detail}
        </p>
      </div>
      {inline && children ? (
        <div className="shrink-0">{children}</div>
      ) : (
        /* An explicit target, so the card reads as something to click rather
           than as a notice that happens to be coloured. */
        <span
          className="shrink-0 inline-flex items-center gap-2 rounded-[var(--r-pill)] px-4 py-2 text-sm font-semibold transition-transform group-hover:translate-x-0.5"
          style={{ background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.30)" }}
          aria-hidden
        >
          Continue →
        </span>
      )}
    </>
  );

  const shell = "mb-8 flex w-full flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[var(--r-md)] p-5";
  const paint = { background: "var(--accent)", color: "#fff", boxShadow: "var(--e1)" } as const;

  if (inline) {
    return (
      <div className={shell} style={paint}>
        {body}
      </div>
    );
  }
  return (
    <Link
      href={next.href}
      className={`group ${shell} no-underline transition-shadow hover:shadow-[var(--e2)]`}
      style={paint}
    >
      {body}
    </Link>
  );
}

/**
 * A section heading that reads as a step. Used where a screen is itself one
 * stage of the deal broken into ordered parts (the survey's inventory →
 * candidate), so those parts use the same marker and chip language as the
 * spine instead of a bare "Step 1" label.
 */
export function StepHeading({
  index,
  title,
  status,
  hint,
  aside,
}: {
  index: number;
  title: string;
  status: DealStep["status"];
  hint?: string;
  aside?: React.ReactNode;
}) {
  const chip = STATUS_CHIP[status];
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-3">
      <div className="flex items-start gap-3 min-w-0">
        <StepMarker status={status} index={index} size={24} />
        <div className="min-w-0">
          <p className="lbl" style={{ color: "var(--text-subtle)" }}>
            Step {index}
          </p>
          <h2 className="text-[15px] font-semibold mt-0.5">{title}</h2>
          {hint && <p className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        {aside}
        {chip && (
          <span className={`chip ${chip.cls}`}>
            {status === "locked" ? <LockGlyph /> : <span className="chip-dot" aria-hidden />}
            {chip.label}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * "This step is done." One component, so every step page says it the same
 * way — the pattern was being retyped per screen and drifting
 * (user-asked 2026-08-20: "follow the standard on every steps page").
 *
 * Pair it with NextStepCallout: this says the step is finished, that says
 * where to go. A finished page with neither leaves the reader to work it out
 * from a wall of ticks.
 */
export function StepComplete({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-3 rounded-[var(--r-md)] border p-4"
      style={{ borderColor: "var(--ok-line)", background: "var(--ok-bg)", color: "var(--ok-fg)" }}
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold"
        style={{ background: "var(--ok-fg)", color: "var(--ok-bg)" }}
      >
        ✓
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children && <p className="text-sm">{children}</p>}
      </div>
    </div>
  );
}
