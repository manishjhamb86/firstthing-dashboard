import type { ReactNode } from "react";

/**
 * The row above a list: search on the left, its filters after it.
 *
 * Every listing had invented its own — search left on two pages and right on
 * another, filters inside the table card on one and outside it on the next,
 * the primary action sometimes in the page header and sometimes down here
 * ("it is absolutely inconsistent", 2026-08-21). This is the one shape, and
 * the primary action always belongs in PageHeader's own action slot, so a
 * page's structure reads the same wherever you land:
 *
 *     PageHeader (back · title · chip · subtitle · action)
 *     StatRow of Stat tiles, where there are real figures to show
 *     ListToolbar (search · filters)
 *     the list
 *
 * Stat/StatRow live in ui.tsx with the other presentational primitives —
 * they are not toolbar furniture, and non-page surfaces (the demo report)
 * use them too.
 */
export function ListToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">{children}</div>;
}

/**
 * A filter chip: the toolbar's own control, carrying its count.
 *
 * There were three of these — a bespoke pill in the demo board, a `.chip`
 * button in live monitoring, and nothing at all in the catalog — which is
 * the inconsistency the toolbar itself was introduced to end. One component,
 * so the count badge, the on state and the urgent tint cannot drift.
 *
 * `tone="warn"` tints the count when it is non-zero and the chip is off: a
 * filter that exists because something needs attention should say so before
 * it is pressed, which is the whole reason to offer it.
 */
export function FilterChip({
  on,
  count,
  tone = "neutral",
  onClick,
  children,
}: {
  on: boolean;
  count?: number;
  tone?: "neutral" | "warn";
  onClick: () => void;
  children: ReactNode;
}) {
  const urgent = tone === "warn" && !on && (count ?? 0) > 0;
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-[var(--r-pill)] border px-3 py-1.5 text-[13px] font-semibold transition-colors"
      style={{
        background: on ? "var(--accent)" : urgent ? "var(--warn-bg)" : "var(--surface)",
        color: on ? "var(--text-on-accent)" : urgent ? "var(--warn-fg)" : "var(--text-muted)",
        borderColor: on ? "var(--accent)" : urgent ? "var(--warn-line)" : "var(--field-border)",
      }}
    >
      {children}
      {count !== undefined && (
        <span
          className="num rounded-[var(--r-pill)] px-1.5 text-[11px] leading-[1.6]"
          style={
            on
              ? { background: "rgba(255,255,255,0.22)", color: "var(--text-on-accent)" }
              : urgent
                ? { background: "var(--warn-line)", color: "var(--warn-fg)" }
                : { background: "var(--neu-bg)", color: "var(--neu-fg)" }
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}
