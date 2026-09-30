"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { updateRetailCustomer } from "../actions";

/** Correct a customer's own record after it was created — the same
 *  duplicate rule as creating one applies. */
export function EditCustomerButton({
  customer,
  societies,
}: {
  customer: { id: string; name: string; gstin: string | null; address: string | null; phone: string | null; email: string | null; societyId: string | null; notes: string | null };
  societies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    name: customer.name,
    gstin: customer.gstin ?? "",
    address: customer.address ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    societyId: customer.societyId ?? "",
    notes: customer.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openIt() {
    setF({
      name: customer.name,
      gstin: customer.gstin ?? "",
      address: customer.address ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      societyId: customer.societyId ?? "",
      notes: customer.notes ?? "",
    });
    setError(null);
    setOpen(true);
  }
  function save() {
    setError(null);
    startTransition(async () => {
      const r = await updateRetailCustomer(customer.id, { ...f, societyId: f.societyId || null });
      if ("error" in r) return setError(r.error);
      setOpen(false);
      router.refresh();
    });
  }
  const input = (k: keyof typeof f, id: string, type = "text") => (
    <input id={id} type={type} className="field" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
  );

  return (
    <>
      <button type="button" className="btn-outline btn-sm" onClick={openIt}>
        Edit
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit retail customer"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={pending || !f.name.trim()} onClick={save}>
              {pending ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" htmlFor="rce-name">{input("name", "rce-name")}</Field>
          <Field label="GSTIN" htmlFor="rce-gstin" hint="Leave blank if they have none.">{input("gstin", "rce-gstin")}</Field>
          <Field label="Address" htmlFor="rce-address">{input("address", "rce-address")}</Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" htmlFor="rce-phone">{input("phone", "rce-phone", "tel")}</Field>
            <Field label="Email" htmlFor="rce-email">{input("email", "rce-email", "email")}</Field>
          </div>
          <Field label="Linked society (optional)" htmlFor="rce-society" hint="Only if this customer is, or belongs to, a society on record.">
            <select id="rce-society" className="field" value={f.societyId} onChange={(e) => setF((x) => ({ ...x, societyId: e.target.value }))}>
              <option value="">Not a society on record</option>
              {societies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes" htmlFor="rce-notes">
            <textarea id="rce-notes" className="field" rows={3} value={f.notes} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}
