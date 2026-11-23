"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { generatePurchaseRequirement, setStockRequirement } from "../workflow-actions";

export function GeneratePrButton({ societyId }: { societyId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(undefined);
            const r = await generatePurchaseRequirement(societyId);
            if ("error" in r && r.error) setError(r.error);
            else if ("id" in r) router.push(`/admin/inventory/purchase-requirements/${r.id}`);
          })
        }
      >
        {pending ? "Generating…" : "Generate purchase requirement"}
      </button>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

type Item = { id: string; name: string; unit: string };
type Typed = { itemTypeId: string; name: string; quantity: number; unit: string; note: string | null };

export function TypedRequirementForm({ societyId, items, typed }: { societyId: string; items: Item[]; typed: Typed[] }) {
  const router = useRouter();
  const [itemTypeId, setItemTypeId] = useState(items[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const item = items.find((i) => i.id === itemTypeId);

  function save(id: string, q: number | null, n: string) {
    start(async () => {
      setError(undefined);
      const r = await setStockRequirement({ societyId, itemTypeId: id, quantity: q, note: n });
      if (r.error) setError(r.error);
      else {
        setQuantity("");
        setNote("");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {typed.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border-subtle)] rounded-[var(--r-md)] border border-[var(--border-subtle)]">
          {typed.map((t) => (
            <li key={t.itemTypeId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-[13.5px]">
              <span>
                <span className="font-medium">{t.name}</span> · <span className="num">{t.quantity.toLocaleString("en-IN")}{t.unit === "m" ? " m" : ""}</span>
                {t.note && <span className="text-[var(--text-muted)]"> — {t.note}</span>}
              </span>
              <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => save(t.itemTypeId, null, "")}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end">
        <Field label="Item" htmlFor="tr-item">
          <select id="tr-item" className="field" value={itemTypeId} onChange={(e) => setItemTypeId(e.target.value)}>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Needed${item?.unit === "m" ? " (metres)" : ""}`} htmlFor="tr-qty">
          <input id="tr-qty" className="field num" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Note (optional)" htmlFor="tr-note">
          <input id="tr-note" className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 1 router per tower" />
        </Field>
        <button type="button" className="btn-secondary" disabled={pending || !quantity.trim()} onClick={() => save(itemTypeId, Number(quantity), note)}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
