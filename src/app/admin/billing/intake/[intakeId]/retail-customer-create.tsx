"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { createRetailCustomer } from "../actions";

/**
 * Create a retail customer straight from the invoice's bill-to (2026-09-25).
 * The fields arrive filled from what the reader found; the operator checks
 * them. A duplicate by name or GSTIN is refused, not created twice.
 */
export function RetailCustomerCreate({
  prefill,
  societies,
  onCreated,
  label = "+ Create retail customer from this invoice",
}: {
  prefill: { name: string; gstin: string; address: string };
  societies: { id: string; name: string }[];
  onCreated: (c: { id: string; name: string }) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", gstin: "", address: "", phone: "", email: "", societyId: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openIt() {
    setF({ name: prefill.name, gstin: prefill.gstin, address: prefill.address, phone: "", email: "", societyId: "" });
    setError(null);
    setOpen(true);
  }
  function save() {
    setError(null);
    startTransition(async () => {
      const r = await createRetailCustomer({ ...f, societyId: f.societyId || null });
      if (r.error !== undefined) setError(r.error);
      else if (r.id && r.name) {
        onCreated({ id: r.id, name: r.name });
        setOpen(false);
      }
    });
  }
  const input = (k: keyof typeof f, id: string, type = "text") => (
    <input id={id} type={type} className="field" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
  );

  return (
    <>
      <button type="button" className="btn-secondary btn-sm" onClick={openIt}>
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New retail customer"
        description="Filled from the invoice's bill-to — check it. Retail customers have no portal access."
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={pending || !f.name.trim()} onClick={save}>
              {pending ? "Creating…" : "Create customer"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" htmlFor="rc-name">{input("name", "rc-name")}</Field>
          <Field label="GSTIN" htmlFor="rc-gstin" hint="Leave blank if they have none.">{input("gstin", "rc-gstin")}</Field>
          <Field label="Address" htmlFor="rc-address">{input("address", "rc-address")}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" htmlFor="rc-phone">{input("phone", "rc-phone", "tel")}</Field>
            <Field label="Email" htmlFor="rc-email">{input("email", "rc-email", "email")}</Field>
          </div>
          <Field label="Linked society (optional)" htmlFor="rc-society" hint="Only if this customer is, or belongs to, a society on record.">
            <select id="rc-society" className="field" value={f.societyId} onChange={(e) => setF((x) => ({ ...x, societyId: e.target.value }))}>
              <option value="">Not a society on record</option>
              {societies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}
