"use client";

import { useState } from "react";

export type TabDef = {
  id: string;
  label: string;
  count: number;
  /** true when this tab holds work that is stuck, not merely in progress */
  urgent?: boolean;
};

/**
 * Tabs inside a card, with the section title carried by the tab itself.
 *
 * Every tab shows its own count, and the count is the reason this is safe on
 * a monitoring board: a tab hides its CONTENT but must never hide its
 * SIGNAL. Without counts, work sitting in an unselected tab is invisible,
 * and this screen's whole job is that nobody leaves it thinking they are
 * done. For the same reason the caller picks the initial tab by urgency
 * rather than always opening the first one.
 */
export function CardTabs({
  tabs,
  panels,
  initial,
}: {
  tabs: TabDef[];
  panels: Record<string, React.ReactNode>;
  initial: string;
}) {
  const [active, setActive] = useState(initial);

  return (
    <div className="card overflow-hidden">
      <div
        role="tablist"
        aria-label="Monitoring sections"
        className="flex flex-wrap gap-1 border-b p-2"
        style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              onClick={() => setActive(t.id)}
              className="inline-flex items-center gap-2 rounded-[var(--r-sm)] px-3 py-2 text-sm font-semibold transition-colors"
              style={{
                background: on ? "var(--surface)" : "transparent",
                color: on ? "var(--text)" : "var(--text-muted)",
                boxShadow: on ? "var(--e1)" : undefined,
              }}
            >
              {t.label}
              <span
                className="num rounded-full px-1.5 py-0.5 text-[11px] leading-none"
                style={
                  t.count === 0
                    ? { background: "var(--surface-active)", color: "var(--text-subtle)" }
                    : t.urgent
                      ? { background: "var(--bad-bg)", color: "var(--bad-fg)" }
                      : { background: "var(--accent-subtle)", color: "var(--accent)" }
                }
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
      <div id={`panel-${active}`} role="tabpanel" className="p-5">
        {panels[active]}
      </div>
    </div>
  );
}
