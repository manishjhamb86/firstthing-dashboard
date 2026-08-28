"use client";

import { useRef, type ReactNode } from "react";

/**
 * The recording flow behind a button, in a modal — the user's call
 * (2026-08-28): the always-open upload card pushed the stored readings below
 * the fold, and on this screen the READINGS are what the visit is for.
 *
 * A native <dialog>, the pattern this repo already settled on: Esc and
 * backdrop-click close for free, focus is trapped, and the page behind
 * cannot scroll out from under it.
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
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => ref.current?.showModal()}>
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
      <dialog
        ref={ref}
        onClick={(e) => {
          // A click on the backdrop (the dialog element itself, outside the
          // inner panel) closes; clicks inside the panel never bubble here
          // as the dialog target.
          if (e.target === ref.current) ref.current?.close();
        }}
        className="w-[min(880px,92vw)] rounded-[var(--r-lg)] p-0 backdrop:bg-black/50"
        style={{ background: "var(--ground)", border: "1px solid var(--border)" }}
      >
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-[15px] font-semibold">{label}</h2>
            <button type="button" className="btn-ghost btn-sm" onClick={() => ref.current?.close()}>
              Close
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}
