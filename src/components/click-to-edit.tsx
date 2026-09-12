"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";

/**
 * A prefilled field that reads as a fact until someone deliberately edits it
 * — the month and the inspection time on a new inspection are almost always
 * "now," so opening on an editable input reads as a blank waiting to be
 * filled in rather than a sensible default already chosen (2026-09-12).
 * Closed by default, showing `display`; clicking "Edit" swaps in `children`.
 * The same shape this codebase already uses for a benchmark override or a
 * meter-install-date correction: closed, prefilled, opened only on request.
 */
export function ClickToEdit({ display, children }: { display: ReactNode; children: ReactNode }) {
  const [editing, setEditing] = useState(false);

  if (editing) return <>{children}</>;

  return (
    <div className="field flex items-center justify-between gap-2">
      <span>{display}</span>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold"
        style={{ color: "var(--accent)" }}
        onClick={() => setEditing(true)}
      >
        <Pencil size={12} /> Edit
      </button>
    </div>
  );
}
