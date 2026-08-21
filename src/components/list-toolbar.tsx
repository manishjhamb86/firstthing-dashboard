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
 *     PageHeader (title · chip · subtitle · action)
 *     KPI tiles, where there are real figures to show
 *     ListToolbar (search · filters)
 *     the list
 */
export function ListToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">{children}</div>;
}

/** The KPI row, so its columns and spacing cannot drift page to page. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">{children}</div>;
}

export function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return (
    <div className="card p-4">
      <p className="lbl mb-1.5 min-h-[2.8em]">{label}</p>
      <p className="num text-[20px] font-semibold leading-none">{value}</p>
      {detail && <p className="mt-1.5 text-xs text-[var(--text-subtle)]">{detail}</p>}
    </div>
  );
}
