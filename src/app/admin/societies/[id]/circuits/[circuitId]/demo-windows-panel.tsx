"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { setDemoReading, setDemoWindows } from "./actions";

type Windows = { preFrom: string; preTo: string; postFrom: string; postTo: string };

/**
 * The demo periods (2026-09-25, user-asked): the only days that make the
 * baseline and the benchmark, and the only days the two demo reports show.
 * In demo mode, a day's reading can also be added or changed by hand here.
 */
export function DemoWindowsPanel({
  circuitId,
  initial,
  canEdit,
  demoMode,
  meterInstalledOn,
  replacedOn,
  counts,
}: {
  circuitId: string;
  initial: Windows;
  canEdit: boolean;
  demoMode: boolean;
  meterInstalledOn: string | null;
  replacedOn: string | null;
  counts: { pre: number; post: number; outside: number };
}) {
  const router = useRouter();
  const [w, setW] = useState<Windows>(initial);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rd, setRd] = useState({ date: "", kWh: "" });
  const [pending, startTransition] = useTransition();
  const set = initial.preFrom || initial.postFrom;
  const fmt = (s: string) => (s ? s.split("-").reverse().join("-") : "—");

  return (
    <div className="rounded-[var(--r-md)] border p-4" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold">Demo periods</h3>
        {canEdit && !editing && (
          <button type="button" className="text-[13px] font-semibold" style={{ color: "var(--accent)" }} onClick={() => setEditing(true)}>
            {set ? "Change" : "Set the demo periods"}
          </button>
        )}
      </div>
      {!editing ? (
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {set ? (
            <>
              Before installation {fmt(initial.preFrom)} to {fmt(initial.preTo)} · after installation {fmt(initial.postFrom)} to {fmt(initial.postTo)}.
              Only these days make the baseline and the benchmark and appear in the two demo reports — {counts.pre} before, {counts.post} after;{" "}
              {counts.outside} other stored {counts.outside === 1 ? "day is" : "days are"} kept but not counted.
            </>
          ) : (
            <>Not set — every day between the meter and the replacement counts as before, every day after it as after. Set the periods to count exactly the demo days.</>
          )}
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Before installation — from" htmlFor="dw-pf" hint={meterInstalledOn ? `After the meter went in (${fmt(meterInstalledOn)})` : undefined}>
              <input id="dw-pf" type="date" className="field" value={w.preFrom} onChange={(e) => setW((x) => ({ ...x, preFrom: e.target.value }))} />
            </Field>
            <Field label="Before installation — to" htmlFor="dw-pt">
              <input id="dw-pt" type="date" className="field" value={w.preTo} onChange={(e) => setW((x) => ({ ...x, preTo: e.target.value }))} />
            </Field>
            <Field label="After installation — from" htmlFor="dw-qf" hint={replacedOn ? `After the replacement (${fmt(replacedOn)})` : "Once the replacement is recorded"}>
              <input id="dw-qf" type="date" className="field" value={w.postFrom} onChange={(e) => setW((x) => ({ ...x, postFrom: e.target.value }))} />
            </Field>
            <Field label="After installation — to" htmlFor="dw-qt">
              <input id="dw-qt" type="date" className="field" value={w.postTo} onChange={(e) => setW((x) => ({ ...x, postTo: e.target.value }))} />
            </Field>
          </div>
          <p className="text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
            Saving re-derives the baseline and, unless it came from demos or an agreed figure, the benchmark — and the society&apos;s published months follow.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await setDemoWindows(circuitId, w);
                  if (r.error) return setError(r.error);
                  setMsg(`Saved. Baseline ${r.baseline != null ? `${r.baseline.toFixed(2)} kWh/day` : "not yet set"} · benchmark ${r.benchmark != null ? `${r.benchmark.toFixed(2)}%` : "not yet set"}.`);
                  setEditing(false);
                  router.refresh();
                })
              }
            >
              {pending ? "Saving…" : "Save periods"}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => { setW(initial); setEditing(false); setError(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && !editing && <p className="mt-2 text-[13px]" style={{ color: "var(--ok-fg)" }}>{msg}</p>}

      {canEdit && demoMode && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
          <p className="text-[13px] font-semibold">Add or change a day&apos;s reading (demo mode)</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Field label="Day" htmlFor="dr-date">
              <input id="dr-date" type="date" className="field field-auto" value={rd.date} onChange={(e) => setRd((x) => ({ ...x, date: e.target.value }))} />
            </Field>
            <Field label="kWh" htmlFor="dr-kwh">
              <input id="dr-kwh" type="number" step="0.01" min="0" className="field field-auto w-28" value={rd.kWh} onChange={(e) => setRd((x) => ({ ...x, kWh: e.target.value }))} />
            </Field>
            <button
              type="button"
              className="btn-secondary btn-sm"
              disabled={pending || !rd.date || rd.kWh === ""}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const r = await setDemoReading(circuitId, rd.date, Number(rd.kWh));
                  if (r.error) return setError(r.error);
                  setMsg(`Saved ${rd.kWh} kWh for ${fmt(rd.date)} — the figures re-derived.`);
                  setRd({ date: "", kWh: "" });
                  router.refresh();
                })
              }
            >
              Save reading
            </button>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-subtle)" }}>
            A day already stored keeps the value it replaced. Hand-entered days are marked as demo readings.
          </p>
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
