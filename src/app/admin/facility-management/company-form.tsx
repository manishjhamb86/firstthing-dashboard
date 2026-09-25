"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ErrorText, Field } from "@/components/ui";
import { createFmCompany, updateFmCompany, type FmCompanyInput } from "./actions";

const BLANK: FmCompanyInput = { name: "", gstin: "", contact: "", phone: "", email: "", address: "", notes: "" };
const FIELDS: Array<{ k: keyof FmCompanyInput; label: string; wide?: boolean }> = [
  { k: "name", label: "Company name", wide: true },
  { k: "gstin", label: "GSTIN (optional)" },
  { k: "contact", label: "Contact person (optional)" },
  { k: "phone", label: "Phone (optional)" },
  { k: "email", label: "Email (optional)" },
  { k: "address", label: "Address (optional)", wide: true },
  { k: "notes", label: "Notes (optional)", wide: true },
];

/** Add a company, or edit one — the same form either way. */
export function FmCompanyButton({
  company,
  label,
  onCreated,
  className = "btn-primary btn-sm",
}: {
  company?: FmCompanyInput & { id: string; active: boolean };
  label?: string;
  onCreated?: (c: { id: string; name: string }) => void;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<FmCompanyInput & { active: boolean }>(company ?? { ...BLANK, active: true });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const title = company ? "Edit company" : "Add a facility management company";
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label ?? (company ? "Edit" : "Add company")}
      </button>
      <Modal
        open={open}
        onClose={() => { setOpen(false); setError(null); }}
        title={title}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              disabled={pending || !v.name.trim()}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  if (company) {
                    const r = await updateFmCompany(company.id, v);
                    if (r.error) return setError(r.error);
                  } else {
                    const r = await createFmCompany(v);
                    if (r.error) return setError(r.error);
                    onCreated?.({ id: r.id!, name: r.name! });
                    setV({ ...BLANK, active: true });
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? "Saving…" : company ? "Save" : "Add company"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.k} className={f.wide ? "sm:col-span-2" : undefined}>
              <Field label={f.label} htmlFor={`fm-${f.k}`}>
                <input id={`fm-${f.k}`} className="field" value={v[f.k]} onChange={(e) => setV((x) => ({ ...x, [f.k]: e.target.value }))} />
              </Field>
            </div>
          ))}
          {company && (
            <label className="flex items-center gap-2 text-[13.5px] sm:col-span-2">
              <input type="checkbox" checked={v.active} onChange={(e) => setV((x) => ({ ...x, active: e.target.checked }))} />
              Still in business with us (untick to hide it from the pickers; history stays)
            </label>
          )}
        </div>
        {error && <ErrorText>{error}</ErrorText>}
      </Modal>
    </>
  );
}
