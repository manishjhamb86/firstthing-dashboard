"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { renameDeal } from "./deal-name-actions";

/** Inline rename of a deal on the Service lines card (main admin only). */
export function DealNameEdit({ pipelineId, name }: { pipelineId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  if (!open)
    return (
      <button type="button" className="ml-2 text-xs font-semibold" style={{ color: "var(--accent)" }} onClick={() => { setValue(name); setOpen(true); }}>
        Edit name
      </button>
    );
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <input aria-label="Deal name" className="field field-auto" value={value} onChange={(e) => setValue(e.target.value)} disabled={pending} />
      <button
        type="button"
        className="btn-primary btn-sm"
        disabled={pending || !value.trim() || value.trim() === name}
        onClick={() =>
          start(async () => {
            setError(undefined);
            const r = await renameDeal(pipelineId, value);
            if (r.error) setError(r.error);
            else {
              setOpen(false);
              router.refresh();
            }
          })
        }
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => { setOpen(false); setError(undefined); }}>
        Cancel
      </button>
      {error && <span className="w-full text-xs" style={{ color: "var(--bad-fg)" }}>{error}</span>}
    </span>
  );
}
