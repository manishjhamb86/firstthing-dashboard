"use client";

import { useEffect, useRef } from "react";

/**
 * A form that has to fit inside a table row will always lose: the row's
 * columns are sized for values, not for controls, so the last field gets
 * clipped by the card edge (user-reported on the load inventory, 2026-08-17).
 * A dialog gives the form its own space and its own width.
 *
 * Native <dialog> deliberately, not a hand-rolled overlay — showModal() brings
 * Esc-to-close, focus trapping, inertness of the page behind, and correct
 * accessibility semantics from the platform. The only things added here are
 * closing on a backdrop click and keeping React state in step when the user
 * closes it by a route the component did not initiate.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** "wide" for forms that carry a table or several columns. */
  size?: "default" | "wide";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Esc fires 'cancel'; both routes must tell the parent, or the parent's
      // state and the dialog's own state drift apart.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(e) => {
        // A click that lands on the dialog element itself is the backdrop —
        // clicks on the content hit a child and stop here.
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto ${
        size === "wide" ? "w-[min(56rem,calc(100vw-2rem))]" : "w-[min(34rem,calc(100vw-2rem))]"
      } max-h-[calc(100vh-4rem)] overflow-y-auto rounded-[var(--r-md)] border p-0 backdrop:bg-black/40`}
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        color: "var(--text)",
        boxShadow: "var(--e2)",
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--border)" }}>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>}
        </div>
        {/* A visible way out, always. A dialog whose only exit is Esc is a
            dialog some readers cannot leave — and a footerless one (the
            recording flow) had no exit at all. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="btn-ghost btn-sm shrink-0"
          style={{ minHeight: 28, padding: "4px 8px" }}
        >
          <svg viewBox="0 0 16 16" style={{ width: 14, height: 14 }} aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="p-5 space-y-4">{children}</div>
      {footer && (
        <div
          className="flex flex-wrap items-center gap-3 border-t p-5"
          style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}
        >
          {footer}
        </div>
      )}
    </dialog>
  );
}
