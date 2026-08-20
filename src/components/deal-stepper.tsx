import Link from "next/link";
import type { DealStep, NextAction } from "@/lib/deal-progress";

// Presentational stepper for the deal spine and the circuit's commissioning
// sequence. Deliberately hook-free (same rule as ui.tsx) so Server
// Components render it directly.
//
// The rules it encodes visually:
// - done      → check, muted, one-line summary of what happened
// - current   → accent ring + accent left border; the summary is the
//               instruction
// - parallel  → hollow marker; runs alongside, link stays live
// - locked    → muted, NO link — a locked step that links anyway is exactly
//               the "six equal buttons" problem this replaces

function LockGlyph() {
  return (
    <svg width="9" height="10" viewBox="0 0 10 11" fill="none" aria-hidden>
      <rect x="1" y="4.5" width="8" height="6" rx="1.5" fill="currentColor" />
      <path d="M3 4.5V3a2 2 0 1 1 4 0v1.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

function Marker({ status, index }: { status: DealStep["status"]; index: number }) {
  const base =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold";
  if (status === "done") {
    return (
      <span className={base} style={{ background: "var(--ok-bg)", color: "var(--ok-fg)", border: "1px solid var(--ok-line)" }} aria-hidden>
        ✓
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className={base} style={{ background: "var(--accent)", color: "var(--accent-contrast, #fff)" }} aria-hidden>
        {index}
      </span>
    );
  }
  if (status === "parallel") {
    return (
      <span className={base} style={{ border: "1.5px dashed var(--text-muted)", color: "var(--text-muted)" }} aria-hidden>
        {index}
      </span>
    );
  }
  return (
    <span className={base} style={{ border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }} aria-hidden>
      {index}
    </span>
  );
}

export function DealStepper({ steps }: { steps: DealStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const isLast = i === steps.length - 1;
        const reachable = s.href && s.status !== "locked";
        const title = reachable ? (
          <Link href={s.href as string} className="font-medium hover:underline">
            {s.title} →
          </Link>
        ) : (
          <span className={s.status === "current" ? "font-medium" : "font-medium text-[var(--text-muted)]"}>
            {s.title}
          </span>
        );
        return (
          <li key={s.key} className="relative flex gap-3">
            {/* connector */}
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-3 top-6 bottom-0 w-px -translate-x-1/2"
                style={{ background: "var(--border-subtle)" }}
              />
            )}
            <Marker status={s.status} index={i + 1} />
            <div className="min-w-0 flex-1 pb-5 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {title}
                {/* A locked step used to be told apart from a done one only
                    by the colour of its marker — both summaries rendered as
                    the same muted line, so "Unlocks when …" read like a
                    record of something that had happened. */}
                {s.status === "locked" && (
                  <span className="chip chip-neu">
                    <LockGlyph />
                    Locked
                  </span>
                )}
              </div>
              <p
                className="text-xs mt-0.5"
                style={{ color: s.status === "current" ? "var(--text)" : "var(--text-muted)" }}
              >
                {s.summary}
              </p>
              {/* Where the work actually is. The condition alone ("when the
                  demo report is shared") does not say which step owns it. */}
              {s.blockedBy && (
                <p className="text-xs mt-1 flex flex-wrap items-center gap-1">
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

/** The single most important thing on the page: what to do now. */
export function NextStepCallout({ next }: { next: NextAction }) {
  return (
    <Link
      href={next.href}
      className="block w-full mb-8 rounded-[var(--r-md)] border p-4 no-underline transition-shadow hover:shadow-[var(--e1)]"
      style={{ borderColor: "var(--accent)", background: "var(--surface)" }}
    >
      <p className="lbl mb-1" style={{ color: "var(--accent)" }}>
        Next step
      </p>
      <p className="text-sm font-semibold">{next.label} →</p>
      <p className="text-xs text-[var(--text-muted)] mt-0.5">{next.detail}</p>
    </Link>
  );
}
