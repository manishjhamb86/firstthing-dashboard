import type { ReactNode } from "react";
import type { StepStatus } from "@/lib/deal-progress";

// The accordion the circuit page's commissioning sequence renders as.
//
// User-specified arrangement (2026-08-15): only the step that needs action
// right now is an open form; everything else is a closed header — done steps
// marked done with their record reachable behind a toggle (which also
// carries any still-live controls, e.g. a gate-pass approval), future steps
// disabled headers so it's clear no action is needed yet.
//
// Done steps use a native <details>, so this stays hook-free and renderable
// straight from a Server Component (same rule as ui.tsx / deal-stepper.tsx).

function Marker({ status, index }: { status: StepStatus; index: number }) {
  const base =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold";
  if (status === "done") {
    return (
      <span
        className={base}
        style={{ background: "var(--ok-bg)", color: "var(--ok-fg)", border: "1px solid var(--ok-line)" }}
        aria-hidden
      >
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
  return (
    <span className={base} style={{ border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }} aria-hidden>
      {index}
    </span>
  );
}

export function StepSection({
  index,
  title,
  status,
  summary,
  chip,
  children,
}: {
  index: number;
  title: string;
  status: StepStatus;
  /** done: what happened. current: the instruction. locked: what unlocks it. */
  summary?: string;
  chip?: ReactNode;
  children?: ReactNode;
}) {
  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
      <Marker status={status} index={index} />
      <span className={status === "locked" ? "font-medium text-[var(--text-muted)]" : "font-medium"}>{title}</span>
      {chip}
      {summary && (
        <span className="basis-full sm:basis-auto text-xs text-[var(--text-muted)] sm:ml-1">{summary}</span>
      )}
    </div>
  );

  // Future work: a disabled header is the whole point — no link, no toggle,
  // visibly not-yet-actionable.
  if (status === "locked") {
    return (
      <div
        className="rounded-[var(--r-md)] border px-4 py-3 text-sm"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface)", opacity: 0.65 }}
      >
        {header}
      </div>
    );
  }

  // The active step is the one open form on the page.
  if (status === "current" || status === "parallel") {
    return (
      <section
        className="rounded-[var(--r-md)] border text-sm"
        style={{ borderColor: "var(--accent)", background: "var(--surface)", boxShadow: "var(--e1)" }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          {header}
        </div>
        <div className="p-4">{children}</div>
      </section>
    );
  }

  // Done with nothing worth reopening: a plain closed row.
  if (!children) {
    return (
      <div
        className="rounded-[var(--r-md)] border px-4 py-3 text-sm"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
      >
        {header}
      </div>
    );
  }

  // Done with a record (and possibly still-live controls, e.g. gate-pass
  // approval) — closed by default, one toggle away.
  return (
    <details
      className="rounded-[var(--r-md)] border text-sm group"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface)" }}
    >
      <summary className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        {header}
        <span className="text-xs underline text-[var(--text-muted)] shrink-0">
          <span className="group-open:hidden">View</span>
          <span className="hidden group-open:inline">Close</span>
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: "var(--border-subtle)" }}>
        {children}
      </div>
    </details>
  );
}
