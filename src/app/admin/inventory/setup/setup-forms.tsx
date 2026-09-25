"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

/** One small add form per set-up record; errors in words, nothing written on refusal. */
export function SetupForm({ kind }: { kind: Kind }) {
  const router = useRouter();
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
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS[kind].map((f) => (
          <Field key={f.k} label={f.label} htmlFor={`${kind}-${f.k}`} hint={f.hint}>
            <input id={`${kind}-${f.k}`} className="field" value={v[f.k] ?? ""} onChange={(e) => setV((x) => ({ ...x, [f.k]: e.target.value }))} />
          </Field>
        ))}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <button type="button" className="btn-secondary btn-sm" disabled={pending || !(v.name ?? "").trim()} onClick={save}>
        {pending ? "Saving…" : kind === "office" ? "Add office" : "Add supplier"}
      </button>
    </div>
  );
}
