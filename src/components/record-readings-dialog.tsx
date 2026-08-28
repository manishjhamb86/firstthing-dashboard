"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/modal";

/**
 * The recording flow behind a button — the user's call (2026-08-28): the
 * always-open upload card pushed the stored readings below the fold, and on
 * this screen the READINGS are what the visit is for.
 *
 * Uses the shared Modal rather than its own dialog. The first version
 * hand-rolled one and had to rediscover that `m-auto` is load-bearing —
 * which this component had already solved.
 */
export function RecordReadingsDialog({
  label,
  waiting = false,
  children,
}: {
  label: string;
  /** A file is already in the queue — worth saying on the button itself. */
  waiting?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        {label}
        {waiting && (
          <span
            className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}
          >
            1 waiting
          </span>
        )}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={label}
        description="Billing started after the completion certificate (CON-22). A released month can no longer be changed (INV-03)."
        size="wide"
      >
        {children}
      </Modal>
    </>
  );
}
