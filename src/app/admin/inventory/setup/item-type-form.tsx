"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { createItemType } from "../actions";

const NEW = "__new__";

/**
 * Add an item type (2026-09-25, user-asked): the name is picked from the
 * catalog's light models (or typed when it is something else), the category
 * from the managed list — "Add a new category…" only when it is missing.
 */
export function AddItemType({ categories, catalogNames }: { categories: string[]; catalogNames: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", category: categories[0] ?? NEW, newCategory: "", tracking: "quantity", make: "", model: "", warranty: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await createItemType({
        name: f.name,
        category: f.category === NEW ? f.newCategory : f.category,
        tracking: f.tracking as "serial" | "length" | "quantity",
        make: f.make,
        model: f.model,
        defaultWarrantyMonths: f.warranty ? Number(f.warranty) : null,
      });
      if (r.error) setError(r.error);
      else {
        setOpen(false);
        setF((x) => ({ ...x, name: "", newCategory: "", make: "", model: "", warranty: "" }));
        router.refresh();
      }
    });
  }

  return (
    <>
      <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
        Add item type
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add item type"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={pending || !f.name.trim() || (f.category === NEW && !f.newCategory.trim())} onClick={save}>
              {pending ? "Saving…" : "Add item type"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Item name" htmlFor="it-name" hint="Pick a light from the catalog, or type the name of anything else.">
            <input id="it-name" className="field" list="it-catalog" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />
            <datalist id="it-catalog">
              {catalogNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </Field>
          <Field label="Category" htmlFor="it-category">
            <select id="it-category" className="field" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={NEW}>Add a new category…</option>
            </select>
          </Field>
          {f.category === NEW && (
            <Field label="New category" htmlFor="it-newcat">
              <input id="it-newcat" className="field" value={f.newCategory} onChange={(e) => setF((x) => ({ ...x, newCategory: e.target.value }))} />
            </Field>
          )}
          <Field label="Tracked" htmlFor="it-tracking" hint="One by one gets a printed code per unit.">
            <select id="it-tracking" className="field" value={f.tracking} onChange={(e) => setF((x) => ({ ...x, tracking: e.target.value }))}>
              <option value="serial">One by one (printed code per unit)</option>
              <option value="length">By length (metres)</option>
              <option value="quantity">By quantity</option>
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Make" htmlFor="it-make">
              <input id="it-make" className="field" value={f.make} onChange={(e) => setF((x) => ({ ...x, make: e.target.value }))} />
            </Field>
            <Field label="Model" htmlFor="it-model">
              <input id="it-model" className="field" value={f.model} onChange={(e) => setF((x) => ({ ...x, model: e.target.value }))} />
            </Field>
            <Field label="Warranty (months)" htmlFor="it-warranty">
              <input id="it-warranty" type="number" className="field num" value={f.warranty} onChange={(e) => setF((x) => ({ ...x, warranty: e.target.value }))} />
            </Field>
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}
