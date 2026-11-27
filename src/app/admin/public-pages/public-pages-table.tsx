"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorText, StatusChip } from "@/components/ui";
import { setPublicPagesVisible } from "@/app/admin/societies/[id]/public-page-actions";

export type PublicPageRow = {
  id: string;
  name: string;
  location: string;
  slug: string;
  /** visible | hidden | closed (society terminated — never visible). */
  status: "visible" | "hidden" | "closed";
  shown: number;
  total: number;
};

type SortKey = "name" | "slug" | "status" | "shown";
const STATUS_ORDER = { visible: 0, hidden: 1, closed: 2 } as const;
const STATUS_META = {
  visible: { tone: "ok" as const, label: "Visible" },
  hidden: { tone: "neu" as const, label: "Hidden" },
  closed: { tone: "neu" as const, label: "Hidden — society closed" },
};

/**
 * Societies → Public pages' table (2026-11-28, user-asked): every column
 * sorts, and selected pages are made visible or hidden in one go.
 */
export function PublicPagesTable({ rows, canEdit }: { rows: PublicPageRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sorted = useMemo(() => {
    const cmp = (a: PublicPageRow, b: PublicPageRow) => {
      switch (sort.key) {
        case "status":
          return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name);
        case "shown":
          return a.shown - b.shown || a.name.localeCompare(b.name);
        case "slug":
          return a.slug.localeCompare(b.slug);
        default:
          return a.name.localeCompare(b.name);
      }
    };
    return [...rows].sort((a, b) => cmp(a, b) * sort.dir);
  }, [rows, sort]);

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setNote(null);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function apply(visible: boolean) {
    setError(null);
    setNote(null);
    start(async () => {
      try {
        const r = await setPublicPagesVisible({ societyIds: [...selected], visible });
        if (r.error) return setError(r.error);
        const parts = [`${r.changed} page${r.changed === 1 ? "" : "s"} ${visible ? "made visible" : "hidden"}.`];
        if (r.skipped && r.skipped.length > 0) parts.push(`Left hidden — society closed: ${r.skipped.join(", ")}.`);
        setNote(parts.join(" "));
        setSelected(new Set());
        router.refresh();
      } catch {
        setError("That did not complete — reload the page and try again.");
      }
    });
  }


  return (
    <>
      {canEdit && (selected.size > 0 || note || error) && (
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-sunken)" }}>
          {selected.size > 0 && (
            <>
              <span className="text-sm font-semibold">{selected.size} selected</span>
              <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => apply(true)}>
                {pending ? "Saving…" : "Make visible"}
              </button>
              <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => apply(false)}>
                Hide
              </button>
              <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </>
          )}
          {note && (
            <span className="text-sm font-semibold" style={{ color: "var(--ok-fg)" }} role="status">
              {note}
            </span>
          )}
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      )}
      <div className="relative overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              {canEdit && (
                <th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() => {
                      setNote(null);
                      setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
                    }}
                  />
                </th>
              )}
              <SortHeader sort={sort} onSort={toggleSort} k="name">Society</SortHeader>
              <SortHeader sort={sort} onSort={toggleSort} k="slug">Address</SortHeader>
              <SortHeader sort={sort} onSort={toggleSort} k="status">Status</SortHeader>
              <SortHeader sort={sort} onSort={toggleSort} k="shown">Sections shown</SortHeader>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const meta = STATUS_META[s.status];
              return (
                <tr key={s.id} style={selected.has(s.id) ? { background: "var(--accent-subtle)" } : undefined}>
                  {canEdit && (
                    <td>
                      <input type="checkbox" aria-label={`Select ${s.name}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                    </td>
                  )}
                  <td>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
                      {s.location}
                    </p>
                  </td>
                  <td className="tabular-nums">/{s.slug}</td>
                  <td>
                    <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                  </td>
                  <td className="tabular-nums">
                    {s.shown} of {s.total}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <a href={`/${s.slug}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                      {s.status === "visible" ? "Open" : "Preview"}
                    </a>
                    <Link href={`/admin/public-pages/${s.id}`} className="btn-secondary btn-sm">
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SortHeader({
  k,
  sort,
  onSort,
  children,
}: {
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  children: string;
}) {
  return (
    <th aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className="inline-flex items-center gap-1 font-[inherit] uppercase tracking-[inherit]" onClick={() => onSort(k)}>
        {children}
        <span aria-hidden style={{ opacity: sort.key === k ? 1 : 0.35 }}>
          {sort.key === k && sort.dir === -1 ? "↓" : "↑"}
        </span>
      </button>
    </th>
  );
}
