"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import { getSupplierInvoiceUploadUrl, receiveDelivery } from "../actions";

type Item = { id: string; name: string; tracking: "serial" | "length" | "quantity"; unit: string; defaultWarrantyMonths: number | null };
type Line = { itemTypeId: string; quantity: string; unitCost: string; supplierLot: string; manufacturedOn: string; warrantyMonths: string; warrantyBasis: "purchase" | "install"; serials: string };

const blankLine = (): Line => ({ itemTypeId: "", quantity: "", unitCost: "", supplierLot: "", manufacturedOn: "", warrantyMonths: "", warrantyBasis: "purchase", serials: "" });

export function ReceiveForm({
  suppliers,
  offices,
  items,
  today,
}: {
  suppliers: { id: string; name: string }[];
  offices: { id: string; name: string }[];
  items: Item[];
  today: string;
}) {
  const router = useRouter();
  const [head, setHead] = useState({ supplierId: "", invoiceNumber: "", invoiceDate: today, total: "", officeId: offices[0]?.id ?? "", receivedOn: today, notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const setLine = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        let key: string | null = null;
        if (file) {
          const u = await getSupplierInvoiceUploadUrl(file.name);
          if (u.error !== undefined || !u.uploadUrl) return setError(u.error ?? "Could not prepare the upload.");
          const put = await fetch(u.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
          if (!put.ok) return setError(`The invoice PDF did not upload (${put.status}) — try again.`);
          key = u.key!;
        }
        const r = await receiveDelivery({
          supplierId: head.supplierId,
          invoiceNumber: head.invoiceNumber,
          invoiceDate: head.invoiceDate,
          total: head.total ? Number(head.total) : null,
          invoiceS3Key: key,
          invoiceFileName: file?.name ?? null,
          receivedAtLocationId: head.officeId,
          receivedOn: head.receivedOn,
          notes: head.notes,
          lines: lines.map((l) => ({
            itemTypeId: l.itemTypeId,
            quantity: Number(l.quantity),
            unitCost: l.unitCost ? Number(l.unitCost) : null,
            supplierLot: l.supplierLot,
            manufacturedOn: l.manufacturedOn,
            warrantyMonths: l.warrantyMonths ? Number(l.warrantyMonths) : null,
            warrantyBasis: l.warrantyBasis,
            serialNumbers: l.serials.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
          })),
        });
        if (r.error !== undefined) return setError(r.error);
        const ids = r.batchIds ?? [];
        router.push(ids.length === 1 ? `/admin/inventory/batches/${ids[0]}` : "/admin/inventory?received=1");
      } catch {
        setError("The request did not complete — check the stock list before trying again, so nothing is received twice.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <CardTitle>The invoice</CardTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Supplier" htmlFor="rc-supplier">
            <select id="rc-supplier" className="field" value={head.supplierId} onChange={(e) => setHead((h) => ({ ...h, supplierId: e.target.value }))}>
              <option value="">Choose…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier's invoice number" htmlFor="rc-inv">
            <input id="rc-inv" className="field" value={head.invoiceNumber} onChange={(e) => setHead((h) => ({ ...h, invoiceNumber: e.target.value }))} />
          </Field>
          <Field label="Invoice date" htmlFor="rc-invdate">
            <input id="rc-invdate" type="date" className="field" value={head.invoiceDate} max={today} onChange={(e) => setHead((h) => ({ ...h, invoiceDate: e.target.value }))} />
          </Field>
          <Field label="Invoice total (₹)" htmlFor="rc-total">
            <input id="rc-total" type="number" step="any" className="field num" value={head.total} onChange={(e) => setHead((h) => ({ ...h, total: e.target.value }))} />
          </Field>
          <Field label="Invoice PDF" htmlFor="rc-file" hint="Kept privately with the purchase.">
            <input id="rc-file" type="file" accept="application/pdf" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <CardTitle>Where and when it arrived</CardTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Office" htmlFor="rc-office">
            <select id="rc-office" className="field" value={head.officeId} onChange={(e) => setHead((h) => ({ ...h, officeId: e.target.value }))}>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Arrived on" htmlFor="rc-on">
            <input id="rc-on" type="date" className="field" value={head.receivedOn} max={today} onChange={(e) => setHead((h) => ({ ...h, receivedOn: e.target.value }))} />
          </Field>
          <Field label="Notes" htmlFor="rc-notes">
            <input id="rc-notes" className="field" value={head.notes} onChange={(e) => setHead((h) => ({ ...h, notes: e.target.value }))} />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <CardTitle>What arrived — one line per batch</CardTitle>
        <div className="space-y-4">
          {lines.map((l, i) => {
            const item = items.find((x) => x.id === l.itemTypeId);
            return (
              <div key={i} className="rounded-[var(--r-sm)] border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label={`Item ${i + 1}`} htmlFor={`rl-item-${i}`}>
                    <select
                      id={`rl-item-${i}`}
                      className="field"
                      value={l.itemTypeId}
                      onChange={(e) => {
                        const it = items.find((x) => x.id === e.target.value);
                        setLine(i, { itemTypeId: e.target.value, warrantyMonths: it?.defaultWarrantyMonths ? String(it.defaultWarrantyMonths) : l.warrantyMonths });
                      }}
                    >
                      <option value="">Choose…</option>
                      {items.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={`Quantity${item ? ` (${item.unit})` : ""}`} htmlFor={`rl-qty-${i}`}>
                    <input id={`rl-qty-${i}`} type="number" step={item?.tracking === "length" ? "any" : "1"} className="field num" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  </Field>
                  <Field label={`Cost per ${item?.unit === "m" ? "metre" : "piece"} (₹)`} htmlFor={`rl-cost-${i}`} hint="As on the supplier's invoice, before GST. Values the stock.">
                    <input id={`rl-cost-${i}`} type="number" step="any" className="field num" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} />
                  </Field>
                  <Field label="Supplier's lot / batch no." htmlFor={`rl-lot-${i}`}>
                    <input id={`rl-lot-${i}`} className="field" value={l.supplierLot} onChange={(e) => setLine(i, { supplierLot: e.target.value })} />
                  </Field>
                  <Field label="Manufactured on" htmlFor={`rl-mfg-${i}`}>
                    <input id={`rl-mfg-${i}`} type="date" className="field" value={l.manufacturedOn} onChange={(e) => setLine(i, { manufacturedOn: e.target.value })} />
                  </Field>
                  <Field label="Warranty (months)" htmlFor={`rl-war-${i}`}>
                    <input id={`rl-war-${i}`} type="number" className="field num" value={l.warrantyMonths} onChange={(e) => setLine(i, { warrantyMonths: e.target.value })} />
                  </Field>
                  <Field label="Warranty runs from" htmlFor={`rl-basis-${i}`}>
                    <select id={`rl-basis-${i}`} className="field" value={l.warrantyBasis} onChange={(e) => setLine(i, { warrantyBasis: e.target.value as Line["warrantyBasis"] })}>
                      <option value="purchase">The invoice date</option>
                      <option value="install">Installation</option>
                    </select>
                  </Field>
                </div>
                {item?.tracking === "serial" && (
                  <div className="mt-3">
                    <Field
                      label="Manufacturer serials (optional)"
                      htmlFor={`rl-serials-${i}`}
                      hint="One per line, in the order the units are numbered — a SIM's ICCID, a meter's device id. Leave blank for lights."
                    >
                      <textarea id={`rl-serials-${i}`} className="field font-mono text-[12.5px]" rows={3} value={l.serials} onChange={(e) => setLine(i, { serials: e.target.value })} />
                    </Field>
                  </div>
                )}
                {lines.length > 1 && (
                  <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    Remove line
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
            + Add another item
          </button>
        </div>
      </Card>

      {error && <ErrorText>{error}</ErrorText>}
      <button type="button" className="btn-primary" disabled={pending} onClick={submit}>
        {pending ? "Receiving…" : "Receive stock"}
      </button>
    </div>
  );
}
