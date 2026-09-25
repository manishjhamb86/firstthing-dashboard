"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { MOVE_LABEL, type MoveKind } from "@/lib/inventory";
import { moveQuantity, moveUnits } from "./actions";

export type MoveContext = {
  offices: { id: string; name: string }[];
  societies: { id: string; name: string; circuits: { id: string; label: string }[] }[];
  today: string;
};

const UNIT_KINDS: MoveKind[] = ["deploy", "return_to_office", "transfer", "mark_faulty", "repair", "return_to_supplier", "scrap", "lost"];
const QTY_KINDS: MoveKind[] = ["deploy", "transfer", "return_to_office", "return_to_supplier", "scrap", "lost", "adjust"];
const NEEDS_REASON: MoveKind[] = ["mark_faulty", "scrap", "lost", "return_to_supplier", "adjust"];

function Destination({
  kind,
  ctx,
  v,
  set,
}: {
  kind: MoveKind;
  ctx: MoveContext;
  v: { toOfficeId: string; societyId: string; circuitId: string };
  set: (p: Partial<{ toOfficeId: string; societyId: string; circuitId: string }>) => void;
}) {
  if (kind === "deploy") {
    const circuits = ctx.societies.find((s) => s.id === v.societyId)?.circuits ?? [];
    return (
      <>
        <Field label="Society" htmlFor="mv-society">
          <select id="mv-society" className="field" value={v.societyId} onChange={(e) => set({ societyId: e.target.value, circuitId: "" })}>
            <option value="">Choose…</option>
            {ctx.societies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Circuit (optional)" htmlFor="mv-circuit">
          <select id="mv-circuit" className="field" value={v.circuitId} onChange={(e) => set({ circuitId: e.target.value })} disabled={circuits.length === 0}>
            <option value="">{circuits.length ? "Not a specific circuit" : "No circuits on record"}</option>
            {circuits.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </>
    );
  }
  if (kind === "transfer" || kind === "return_to_office") {
    return (
      <Field label="To office" htmlFor="mv-office">
        <select id="mv-office" className="field" value={v.toOfficeId} onChange={(e) => set({ toOfficeId: e.target.value })}>
          <option value="">Choose…</option>
          {ctx.offices.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return null;
}

/** Move one or more serialized units by code. */
export function MoveUnitsForm({
  codes,
  ctx,
  onDone,
}: {
  codes: string[];
  ctx: MoveContext;
  /** Called with the outcome when anything was recorded — the caller may unmount this form. */
  onDone?: (r: { done: number; failed: { code: string; error: string }[] }) => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<MoveKind>("deploy");
  const [v, setV] = useState({ toOfficeId: "", societyId: "", circuitId: "", on: ctx.today, reason: "" });
  const [result, setResult] = useState<{ done: number; failed: { code: string; error: string }[] } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setResult(null);
    startTransition(async () => {
      const r = await moveUnits({ codes, kind, ...v });
      setResult(r);
      if (r.done > 0) {
        router.refresh();
        onDone?.(r);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="What happened" htmlFor="mv-kind">
          <select id="mv-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as MoveKind)}>
            {UNIT_KINDS.map((k) => (
              <option key={k} value={k}>
                {MOVE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Destination kind={kind} ctx={ctx} v={v} set={(p) => setV((x) => ({ ...x, ...p }))} />
        <Field label="On" htmlFor="mv-on">
          <input id="mv-on" type="date" className="field" value={v.on} max={ctx.today} onChange={(e) => setV((x) => ({ ...x, on: e.target.value }))} />
        </Field>
        <Field label={NEEDS_REASON.includes(kind) ? "Why" : "Note (optional)"} htmlFor="mv-reason">
          <input id="mv-reason" className="field" value={v.reason} onChange={(e) => setV((x) => ({ ...x, reason: e.target.value }))} />
        </Field>
      </div>
      <button type="button" className="btn-primary btn-sm" disabled={pending || codes.length === 0} onClick={submit}>
        {pending ? "Recording…" : `${MOVE_LABEL[kind]} — ${codes.length} unit${codes.length === 1 ? "" : "s"}`}
      </button>
      {result && (
        <div className="text-[13px]">
          {result.done > 0 && <p style={{ color: "var(--ok-fg)" }}>{result.done} recorded.</p>}
          {result.failed.length > 0 && (
            <ul className="list-disc pl-5" style={{ color: "var(--bad-fg)" }}>
              {result.failed.slice(0, 20).map((f, i) => (
                <li key={i}>
                  {f.code ? `${f.code}: ` : ""}
                  {f.error}
                </li>
              ))}
              {result.failed.length > 20 && <li>…and {result.failed.length - 20} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Move part of a quantity or length batch out of one location. */
export function MoveQuantityForm({
  batchId,
  unit,
  holdings,
  ctx,
}: {
  batchId: string;
  unit: string;
  holdings: { locationId: string; name: string; balance: number }[];
  ctx: MoveContext;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<MoveKind>("deploy");
  const [v, setV] = useState({ fromLocationId: holdings[0]?.locationId ?? "", quantity: "", toOfficeId: "", societyId: "", circuitId: "", on: ctx.today, reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setOk(false);
    startTransition(async () => {
      const r = await moveQuantity({ batchId, kind, ...v, quantity: Number(v.quantity) });
      if (r.error) setError(r.error);
      else {
        setOk(true);
        setV((x) => ({ ...x, quantity: "", reason: "" }));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="What happened" htmlFor="mq-kind">
          <select id="mq-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as MoveKind)}>
            {QTY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k === "adjust" ? "Stock corrected (count was wrong)" : MOVE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From" htmlFor="mq-from">
          <select id="mq-from" className="field" value={v.fromLocationId} onChange={(e) => setV((x) => ({ ...x, fromLocationId: e.target.value }))}>
            {holdings.map((h) => (
              <option key={h.locationId} value={h.locationId}>
                {h.name} — {h.balance} {unit}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`How much (${unit})`} htmlFor="mq-qty">
          <input id="mq-qty" type="number" step="any" className="field num" value={v.quantity} onChange={(e) => setV((x) => ({ ...x, quantity: e.target.value }))} />
        </Field>
        <Destination kind={kind} ctx={ctx} v={v} set={(p) => setV((x) => ({ ...x, ...p }))} />
        <Field label="On" htmlFor="mq-on">
          <input id="mq-on" type="date" className="field" value={v.on} max={ctx.today} onChange={(e) => setV((x) => ({ ...x, on: e.target.value }))} />
        </Field>
        <Field label={NEEDS_REASON.includes(kind) ? "Why" : "Note (optional)"} htmlFor="mq-reason">
          <input id="mq-reason" className="field" value={v.reason} onChange={(e) => setV((x) => ({ ...x, reason: e.target.value }))} />
        </Field>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {ok && <p className="text-[13px]" style={{ color: "var(--ok-fg)" }}>Recorded.</p>}
      <button type="button" className="btn-primary btn-sm" disabled={pending || holdings.length === 0} onClick={submit}>
        {pending ? "Recording…" : "Record"}
      </button>
    </div>
  );
}
