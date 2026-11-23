"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field } from "@/components/ui";
import {
  addShortfallToPurchaseRequirement,
  cancelPurchaseRequirement,
  markPurchaseRequirementSent,
  removePurchaseRequirementLine,
  updatePurchaseRequirementLines,
} from "../../workflow-actions";

type Line = { id: string; item: string; unit: string; society: string; shortfall: number; quantity: number; received: number; cost: number | null };
const fmt = (n: number, unit: string) => `${n.toLocaleString("en-IN")}${unit === "m" ? " m" : ""}`;

export function PrLinesEditor({ prId, editable, notes, lines }: { prId: string; editable: boolean; notes: string | null; lines: Line[] }) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(lines.map((l) => [l.id, String(l.quantity)])));
  const [reason, setReason] = useState(notes ?? "");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const below = lines.some((l) => Number(qty[l.id]) < l.shortfall);
  const dirty = lines.some((l) => Number(qty[l.id]) !== l.quantity) || reason !== (notes ?? "");

  function save() {
    start(async () => {
      setError(undefined);
      setSaved(false);
      const r = await updatePurchaseRequirementLines(prId, lines.map((l) => ({ lineId: l.id, quantity: Number(qty[l.id]) })), reason);
      if (r.error) setError(r.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }
  function remove(id: string) {
    start(async () => {
      setError(undefined);
      const r = await removePurchaseRequirementLine(id);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="tbl tbl-compact">
          <thead>
            <tr>
              <th>Item</th>
              <th>For</th>
              <th className="text-right">Shortfall</th>
              <th className="text-right">Ordering</th>
              {!editable && <th className="text-right">Received</th>}
              <th className="text-right">Last cost</th>
              {editable && <th />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="font-medium">{l.item}</td>
                <td className="text-[var(--text-muted)]">{l.society}</td>
                <td className="num text-right">{fmt(l.shortfall, l.unit)}</td>
                <td className="text-right">
                  {editable ? (
                    <>
                      <label htmlFor={`prq-${l.id}`} className="sr-only">
                        Quantity of {l.item} to order
                      </label>
                      <input
                        id={`prq-${l.id}`}
                        className="field field-auto num w-[96px] text-right"
                        inputMode="decimal"
                        value={qty[l.id]}
                        onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                      />
                    </>
                  ) : (
                    <span className="num">{fmt(l.quantity, l.unit)}</span>
                  )}
                </td>
                {!editable && (
                  <td className="num text-right" style={{ color: l.received >= l.quantity ? "var(--ok-fg)" : undefined }}>
                    {fmt(l.received, l.unit)}
                  </td>
                )}
                <td className="num text-right">{l.cost === null ? "—" : `₹${l.cost.toLocaleString("en-IN")}`}</td>
                {editable && (
                  <td className="text-right">
                    <button type="button" className="btn-secondary btn-sm" disabled={pending || lines.length <= 1} onClick={() => remove(l.id)}>
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? (
        <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] px-5 py-4">
          {below && (
            <Field label="Why less than the shortfall" htmlFor="pr-reason">
              <input id="pr-reason" className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Rest comes from the next lot" />
            </Field>
          )}
          <p className="text-[12.5px] text-[var(--text-muted)]">
            Ordering more than the shortfall keeps the rest as spare at the office. Stock received against this requirement is ordinary free stock — it is not held for the society it was ordered for.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary" disabled={pending || !dirty} onClick={save}>
              {pending ? "Saving…" : "Save quantities"}
            </button>
            {saved && !dirty && <span className="text-[13px] text-[var(--ok-fg)]">Saved.</span>}
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      ) : (
        notes && <p className="border-t border-[var(--border-subtle)] px-5 py-3 text-[12.5px] text-[var(--text-muted)]">Note: {notes}</p>
      )}
    </>
  );
}

export function PrActions({
  prId,
  code,
  status,
  suppliers,
  addable,
}: {
  prId: string;
  code: string;
  status: string;
  suppliers: { id: string; name: string }[];
  addable: { id: string; name: string }[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [supplierId, setSupplierId] = useState("");
  const [sentOn, setSentOn] = useState(today);
  const [poNumber, setPoNumber] = useState("");
  const [addId, setAddId] = useState(addable[0]?.id ?? "");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ error?: string }>) {
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <>
      {status === "draft" && (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-[15px] font-semibold">Send to a supplier</p>
          <Field label="Supplier" htmlFor="pr-supplier">
            <select id="pr-supplier" className="field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Choose a supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sent on" htmlFor="pr-sent">
              <input id="pr-sent" type="date" className="field" value={sentOn} max={today} onChange={(e) => setSentOn(e.target.value)} />
            </Field>
            <Field label="PO number (optional)" htmlFor="pr-po">
              <input id="pr-po" className="field" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
            </Field>
          </div>
          <button type="button" className="btn-primary" disabled={pending || !supplierId} onClick={() => run(() => markPurchaseRequirementSent(prId, { supplierId, sentOn, poNumber }))}>
            Mark as sent to supplier
          </button>
          {addable.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] pt-3">
              <label htmlFor="pr-add" className="lbl">
                Add another society&apos;s shortfall
              </label>
              <div className="flex gap-2">
                <select id="pr-add" className="field" value={addId} onChange={(e) => setAddId(e.target.value)}>
                  {addable.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-secondary btn-sm" disabled={pending || !addId} onClick={() => run(() => addShortfallToPurchaseRequirement(prId, addId))}>
                  Add
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {(status === "sent" || status === "partly_received") && (
        <Card className="flex flex-col gap-3 p-5">
          <p className="text-[15px] font-semibold">When it arrives</p>
          <p className="text-[13.5px] text-[var(--text-muted)]">
            Receive the supplier&apos;s invoice against this requirement. Each line becomes a batch with coded units at the office you choose, and the requirement moves to partly received or received by itself.
          </p>
          <Link href={`/admin/inventory/receive?pr=${prId}`} className="btn-primary text-center">
            Receive against {code}
          </Link>
        </Card>
      )}

      {status !== "received" && status !== "cancelled" && (
        <Card className="flex flex-col gap-2 p-5">
          {!showCancel ? (
            <button type="button" className="btn-secondary btn-sm self-start" onClick={() => setShowCancel(true)}>
              Cancel this requirement
            </button>
          ) : (
            <>
              <Field label="Why is it cancelled" htmlFor="pr-cancel">
                <input id="pr-cancel" className="field" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary btn-sm" disabled={pending || !cancelReason.trim()} onClick={() => run(() => cancelPurchaseRequirement(prId, cancelReason))}>
                  Cancel it
                </button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setShowCancel(false)}>
                  Keep it
                </button>
              </div>
            </>
          )}
        </Card>
      )}
      {error && <ErrorText>{error}</ErrorText>}
    </>
  );
}
