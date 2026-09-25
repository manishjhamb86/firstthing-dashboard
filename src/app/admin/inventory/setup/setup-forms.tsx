"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { createOffice, createSupplier } from "../actions";

type Kind = "office" | "supplier";

const FIELDS: Record<Kind, Array<{ k: string; label: string; hint?: string }>> = {
  office: [
    { k: "name", label: "Office name" },
    { k: "address", label: "Address" },
  ],
  supplier: [
    { k: "name", label: "Supplier name" },
    { k: "gstin", label: "GSTIN" },
    { k: "contact", label: "Contact person" },
    { k: "phone", label: "Phone" },
    { k: "email", label: "Email" },
    { k: "address", label: "Address" },
  ],
};

/**
 * A button that opens the add form in a dialog (2026-09-25, user-asked: the
 * forms stood open on the page; they sit behind buttons in the header now).
 * Errors in words, nothing written on refusal; the dialog stays open on one.
 */
export function SetupForm({ kind }: { kind: Kind }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>({ tracking: "quantity" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const g = (k: string) => v[k] ?? "";
      const r =
        kind === "office"
          ? await createOffice({ name: g("name"), address: g("address") })
          : await createSupplier({ name: g("name"), gstin: g("gstin"), contact: g("contact"), phone: g("phone"), email: g("email"), address: g("address") });
      if (r.error) setError(r.error);
      else {
        setV({ tracking: "quantity" });
        setOpen(false);
        router.refresh();
      }
    });
  }

  const label = kind === "office" ? "Add office" : "Add supplier";
  return (
    <>
      <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title={label}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={pending || !(v.name ?? "").trim()} onClick={save}>
              {pending ? "Saving…" : label}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS[kind].map((f) => (
              <Field key={f.k} label={f.label} htmlFor={`${kind}-${f.k}`} hint={f.hint}>
                <input id={`${kind}-${f.k}`} className="field" value={v[f.k] ?? ""} onChange={(e) => setV((x) => ({ ...x, [f.k]: e.target.value }))} />
              </Field>
            ))}
          </div>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
      </Modal>
    </>
  );
}
