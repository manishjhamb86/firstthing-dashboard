"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText } from "@/components/ui";
import { setBatchCost } from "../../actions";

/** The batch's cost, correctable in place — closed until someone means to change it. */
export function BatchCost({ batchId, unitCost, unit }: { batchId: string; unitCost: number | null; unit: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(unitCost === null ? "" : String(unitCost));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const per = unit === "m" ? "metre" : "piece";
  if (!editing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        {unitCost !== null ? `₹${unitCost.toLocaleString("en-IN")} per ${per}` : <span style={{ color: "var(--warn-fg)" }}>Not recorded — stock from this batch is not valued</span>}
        <button type="button" className="text-[12px] font-semibold" style={{ color: "var(--accent)" }} onClick={() => setEditing(true)}>
          {unitCost === null ? "Add cost" : "Correct"}
        </button>
      </span>
    );
  }
  return (
    <span className="block space-y-1">
      <span className="flex items-center gap-2">
        <span>₹</span>
        <input aria-label={`Cost per ${per}`} type="number" step="any" min="0" className="field num w-32" value={v} onChange={(e) => setV(e.target.value)} />
        <span className="text-[12px]">per {per}, before GST</span>
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await setBatchCost(batchId, v.trim() === "" ? null : Number(v));
              if (r.error) setError(r.error);
              else {
                setError(null);
                setEditing(false);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </span>
      {error && <ErrorText>{error}</ErrorText>}
    </span>
  );
}
