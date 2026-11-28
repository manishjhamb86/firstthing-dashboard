import type { InventoryGroup, InventoryTile } from "@/lib/inventory-categories";

const n = (v: number) => v.toLocaleString("en-IN");
const qty = (v: number, unit: string) => `${n(v)}${unit === "m" ? " m" : ""}`;

/**
 * The inventory summary strip and the by-category table (2026-11-28,
 * user-asked). The back office passes `setHref` so an item with nothing
 * recorded offers "Set count" instead of reading as 0; the portal does not.
 */
export function InventorySummary({ tiles }: { tiles: InventoryTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <section
      aria-label="Summary"
      className="card mb-5 grid grid-cols-2 overflow-hidden sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]"
    >
      {tiles.map((t, i) => (
        <div
          key={t.key}
          className={`border-[var(--border-subtle)] px-5 py-4 ${t.key === "lights" ? "col-span-2 sm:col-span-1" : ""} ${i > 0 ? "border-t sm:border-l sm:border-t-0" : ""}`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)]">{t.label}</p>
          <p className="num mt-1.5 text-[24px] font-bold leading-none">{qty(t.value, t.unit)}</p>
          {t.detail && <p className="mt-1.5 text-[12.5px] text-[var(--text-muted)]">{t.detail}</p>}
        </div>
      ))}
    </section>
  );
}

export function InventoryByCategory({ groups, setHref, note }: { groups: InventoryGroup[]; setHref?: string; note?: string }) {
  if (groups.length === 0) return null;
  // Demo / full installation columns only when there are lights to split.
  const split = groups.some((g) => g.rows.some((r) => r.demo !== undefined));
  const cols = 2 + (split ? 2 : 0) + (setHref ? 1 : 0);
  return (
    <section className="card mb-5 overflow-hidden">
      {/* Wide screens: one table with demo / full installation columns. */}
      <div className="relative hidden overflow-x-auto sm:block">
        <table className="tbl">
          <thead>
            <tr>
              <th>Device</th>
              {split && <th className="text-right">Demo</th>}
              {split && <th className="text-right">Full installation</th>}
              <th className="text-right">Installed</th>
              {setHref && (
                <th>
                  <span className="sr-only">Action</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((g) => [
              <tr key={`h-${g.title}`}>
                <td colSpan={cols} className="pt-5 text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--accent)]">
                  {g.title}
                </td>
              </tr>,
              ...g.rows.map((r) => (
                <tr key={r.key}>
                  <td className="font-semibold">{r.name}</td>
                  {split && <td className="num text-right">{r.demo !== undefined ? n(r.demo) : <span className="text-[var(--text-subtle)]">—</span>}</td>}
                  {split && <td className="num text-right">{r.full !== undefined ? n(r.full) : <span className="text-[var(--text-subtle)]">—</span>}</td>}
                  <td className="num text-right font-bold">
                    {r.installed === null ? <span className="font-sans text-[13px] font-medium text-[var(--warn-fg)]">Not recorded</span> : qty(r.installed, r.unit)}
                  </td>
                  {setHref && (
                    <td className="text-right">
                      {r.key.startsWith("stock:") && (
                        <a href={setHref} className="btn-ghost btn-sm">
                          {r.installed === null ? "Set count" : "Change"}
                        </a>
                      )}
                    </td>
                  )}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>

      {/* Phones: one row per device, demo and full as chips. */}
      <div className="sm:hidden">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-4 pb-1.5 pt-4 text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--accent)]">{g.title}</p>
            {g.rows.map((r) => (
              <div key={r.key} className="flex flex-col gap-1.5 border-t border-[var(--border-subtle)] px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[15px] font-semibold">{r.name}</p>
                  <p className="num text-[17px] font-bold">
                    {r.installed === null ? <span className="font-sans text-[13px] font-medium text-[var(--warn-fg)]">Not recorded</span> : qty(r.installed, r.unit)}
                  </p>
                </div>
                {r.demo !== undefined && (
                  <div className="flex flex-wrap gap-2 text-[12.5px]">
                    <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-[var(--text-muted)]">
                      Demo <b className="num text-[var(--text)]">{n(r.demo)}</b>
                    </span>
                    <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-[var(--text-muted)]">
                      Full installation <b className="num text-[var(--text)]">{n(r.full ?? 0)}</b>
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {note && <p className="border-t border-[var(--border-subtle)] px-5 py-3 text-[12.5px] text-[var(--text-muted)]">{note}</p>}
    </section>
  );
}
