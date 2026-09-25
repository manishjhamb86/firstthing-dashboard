"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusChip, type ChipTone } from "@/components/ui";
import { MoveUnitsForm, type MoveContext } from "../../move-forms";

export type UnitRow = { code: string; serialNumber: string | null; status: string; statusLabel: string; where: string; warranty: string; warrantyTone: ChipTone };

const STATUS_TONE: Record<string, ChipTone> = { in_stock: "info", deployed: "ok", faulty: "warn", returned_to_supplier: "neu", scrapped: "neu", lost: "bad" };

/** A batch's units — select some (or a numbered range) and record what happened to them. */
export function UnitsTable({ units, ctx }: { units: UnitRow[]; ctx: MoveContext }) {
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [range, setRange] = useState({ from: "", to: "" });
  // The move form unmounts once the selection clears, so its outcome is kept here.
  const [last, setLast] = useState<{ done: number; failed: { code: string; error: string }[] } | null>(null);
  const shown = useMemo(() => units.filter((u) => status === "all" || u.status === status), [units, status]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const u of units) c.set(u.status, (c.get(u.status) ?? 0) + 1);
    return c;
  }, [units]);

  function selectRange() {
    const a = Number(range.from);
    const b = Number(range.to || range.from);
    if (!(a > 0) || !(b >= a)) return;
    setSelected(new Set(shown.filter((u) => {
      const n = Number(u.code.split("-").pop());
      return n >= a && n <= b;
    }).map((u) => u.code)));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {["all", ...counts.keys()].map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            onClick={() => setStatus(s)}
            style={status === s ? { background: "var(--accent)", color: "var(--text-on-accent)", borderColor: "var(--accent)" } : undefined}
          >
            {s === "all" ? `All ${units.length}` : `${units.find((u) => u.status === s)?.statusLabel} ${counts.get(s)}`}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 text-[13px]">
        <span>Select units numbered</span>
        <input aria-label="From unit number" className="field field-auto num w-24" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} placeholder="1" />
        <span>to</span>
        <input aria-label="To unit number" className="field field-auto num w-24" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} placeholder="50" />
        <button type="button" className="btn-secondary btn-sm" onClick={selectRange}>
          Select range
        </button>
        {selected.size > 0 && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
            Clear {selected.size} selected
          </button>
        )}
      </div>
      {selected.size > 0 && (
        <div className="rounded-[var(--r-sm)] border p-3" style={{ borderColor: "var(--accent-line)", background: "var(--accent-subtle)" }}>
          <p className="mb-2 text-[13px] font-semibold">{selected.size} selected</p>
          <MoveUnitsForm
            codes={[...selected]}
            ctx={ctx}
            onDone={(r) => {
              setLast(r);
              setSelected(new Set());
            }}
          />
        </div>
      )}
      {last && selected.size === 0 && (
        <div className="text-[13px]">
          <p style={{ color: "var(--ok-fg)" }}>{last.done} recorded.</p>
          {last.failed.length > 0 && (
            <ul className="list-disc pl-5" style={{ color: "var(--bad-fg)" }}>
              {last.failed.slice(0, 20).map((f, i) => (
                <li key={i}>
                  {f.code ? `${f.code}: ` : ""}
                  {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="max-h-[560px] overflow-auto">
        <table className="tbl tbl-compact">
          <thead>
            <tr>
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  checked={shown.length > 0 && shown.every((u) => selected.has(u.code))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((u) => u.code)) : new Set())}
                />
              </th>
              <th>Code</th>
              <th>Maker&apos;s serial</th>
              <th>Status</th>
              <th>Where</th>
              <th>Warranty</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.code}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${u.code}`}
                    checked={selected.has(u.code)}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        if (n.has(u.code)) n.delete(u.code);
                        else n.add(u.code);
                        return n;
                      })
                    }
                  />
                </td>
                <td className="font-mono text-[12.5px]">
                  <Link href={`/admin/inventory/units/${u.code}`}>{u.code}</Link>
                </td>
                <td className="font-mono text-[12px]">{u.serialNumber ?? "—"}</td>
                <td>
                  <StatusChip tone={STATUS_TONE[u.status] ?? "neu"}>{u.statusLabel}</StatusChip>
                </td>
                <td>{u.where}</td>
                <td>
                  <StatusChip tone={u.warrantyTone}>{u.warranty}</StatusChip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
