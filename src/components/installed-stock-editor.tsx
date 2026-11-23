"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { setInstalledCount } from "@/app/admin/inventory/workflow-actions";

type Row = { itemTypeId: string; name: string; unit: string; tracking: string; installed: number };

/**
 * Set how many of each item are installed at a society (2026-11-23,
 * user-asked) — for the societies installed before the stock flow existed.
 * Raising a count records the difference as stock already installed there;
 * lowering it needs a reason and takes the difference off as a correction.
 */
export function InstalledStockEditor({ societyId, rows, items }: { societyId: string; rows: Row[]; items: Row[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  // Rows come from the server (fresh after each save); an item just added
  // here shows at 0 until its first save lands.
  const [added, setAdded] = useState<string[]>([]);
  const shown: Row[] = [...rows, ...items.filter((i) => added.includes(i.itemTypeId) && !rows.some((r) => r.itemTypeId === i.itemTypeId)).map((i) => ({ ...i, installed: 0 }))];
  const [edit, setEdit] = useState<Record<string, { count: string; since: string; reason: string }>>({});
  const [addId, setAddId] = useState("");
  const [error, setError] = useState<{ id: string; text: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const notShown = items.filter((i) => !shown.some((r) => r.itemTypeId === i.itemTypeId));

  function save(r: Row) {
    const e = edit[r.itemTypeId]!;
    start(async () => {
      setError(null);
      setSaved(null);
      const res = await setInstalledCount({ societyId, itemTypeId: r.itemTypeId, count: Number(e.count), since: e.since, reason: e.reason });
      if ("error" in res && res.error) return setError({ id: r.itemTypeId, text: res.error });
      setEdit((x) => {
        const n = { ...x };
        delete n[r.itemTypeId];
        return n;
      });
      setSaved(r.itemTypeId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {shown.length === 0 ? (
        <p className="text-[13.5px] text-[var(--text-muted)]">No routers, SIM cards, valves or other equipment recorded here yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border-subtle)]">
          {shown.map((r) => {
            const e = edit[r.itemTypeId];
            const n = e ? Number(e.count) : r.installed;
            const lowering = !!e && n < r.installed;
            const raising = !!e && n > r.installed;
            return (
              <li key={r.itemTypeId} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[13.5px] font-medium">{r.name}</span>
                  {!e ? (
                    <span className="flex items-center gap-3">
                      <span className="num text-[15px] font-bold">
                        {r.installed.toLocaleString("en-IN")}
                        {r.unit === "m" ? " m" : ""}
                      </span>
                      <button type="button" className="btn-secondary btn-sm" onClick={() => setEdit((x) => ({ ...x, [r.itemTypeId]: { count: String(r.installed), since: today, reason: "" } }))}>
                        Update
                      </button>
                    </span>
                  ) : null}
                </div>
                {e && (
                  <div className="grid gap-2 sm:grid-cols-[120px_160px_1fr_auto] sm:items-end">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="lbl">Installed now</span>
                      <input className="field num" inputMode="decimal" value={e.count} onChange={(ev) => setEdit((x) => ({ ...x, [r.itemTypeId]: { ...e, count: ev.target.value } }))} />
                    </label>
                    {raising && (
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="lbl">Installed since</span>
                        <input type="date" className="field" max={today} value={e.since} onChange={(ev) => setEdit((x) => ({ ...x, [r.itemTypeId]: { ...e, since: ev.target.value } }))} />
                      </label>
                    )}
                    <label className={`flex flex-col gap-1 text-xs ${raising ? "" : "sm:col-span-2"}`}>
                      <span className="lbl">{lowering ? "Why it is lower" : "Note (optional)"}</span>
                      <input className="field" value={e.reason} onChange={(ev) => setEdit((x) => ({ ...x, [r.itemTypeId]: { ...e, reason: ev.target.value } }))} placeholder={lowering ? "e.g. Counted twice" : "e.g. From the society's records"} />
                    </label>
                    <span className="flex gap-2">
                      <button type="button" className="btn-primary btn-sm" disabled={pending || (!raising && !lowering) || (lowering && !e.reason.trim())} onClick={() => save(r)}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() =>
                          setEdit((x) => {
                            const m = { ...x };
                            delete m[r.itemTypeId];
                            return m;
                          })
                        }
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                )}
                {error?.id === r.itemTypeId && <ErrorText>{error.text}</ErrorText>}
                {saved === r.itemTypeId && !e && <p className="text-xs text-[var(--ok-fg)]">Saved.</p>}
              </li>
            );
          })}
        </ul>
      )}
      {notShown.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border-subtle)] pt-3">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs">
            <span className="lbl">Add an item installed here</span>
            <select className="field" value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">Choose an item</option>
              {notShown.map((i) => (
                <option key={i.itemTypeId} value={i.itemTypeId}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={!addId}
            onClick={() => {
              const it = items.find((i) => i.itemTypeId === addId)!;
              setAdded((a) => [...a, it.itemTypeId]);
              setEdit((x) => ({ ...x, [it.itemTypeId]: { count: "", since: today, reason: "" } }));
              setAddId("");
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
