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
      // The backdrop dimming is a plain CSS rule in globals.css
      // (`dialog.ft-modal::backdrop`), not Tailwind's `backdrop:` variant
      // (2026-10-07, user-caught across three unrelated modals: "doesn't
      // even close down" / page content visibly showing through). Checked
      // directly against the compiled stylesheet: this project's Tailwind
      // v4 setup was generating NO rule at all for `backdrop:bg-black/40` —
      // every dialog in the app has been falling back to the browser's own
      // ~10% default backdrop tint instead of an actual dimming overlay,
      // which is indistinguishable from "the modal isn't really modal."
      //
      // The REAL cause of "open by default / doesn't close on click"
      // (2026-10-08, user-caught — a dialog sitting visible on the page
      // whatever its open state, on every surface): `flex flex-col` is NOT
      // here any more. A plain author-origin CSS declaration — even one
      // class selector's worth — always wins over a user-agent stylesheet
      // rule, REGARDLESS of specificity. The browser's own built-in
      // `dialog:not([open]) { display: none }` is a user-agent rule, and an
      // unconditional `.flex { display: flex }` class sitting on the
      // element at all times outranks it no matter what. So the dialog was
      // being forced to render (display: flex, un-hidden) whether or not
      // `showModal()`/`close()` had ever run — every Modal on every page
      // was permanently visible, absolutely positioned wherever it sits in
      // the DOM, never truly `:modal`, with no backdrop and nothing to
      // close. Checked directly against a live stage dialog: `isModal:
      // false`, `position: "absolute"`, `display: "flex"` on a dialog whose
      // own `open` attribute was false. The fix is `dialog.ft-modal[open]`
      // in globals.css — display:flex now applies ONLY while the `open`
      // attribute (which showModal()/close() genuinely control) is present,
      // so a closed dialog has no competing author rule and the browser's
      // own display:none wins exactly when it should.
      className={`ft-modal m-auto ${
        size === "wide" ? "w-[min(56rem,calc(100vw-2rem))]" : "w-[min(34rem,calc(100vw-2rem))]"
      } max-h-[calc(100vh-4rem)] overflow-hidden rounded-[var(--r-md)] border p-0`}
      style={{
        borderColor: "var(--border)",
        background: "var(--surface)",
        color: "var(--text)",
        boxShadow: "var(--e2)",
      }}
    >
      <div className="flex shrink-0 items-start justify-between gap-4 border-b p-5" style={{ borderColor: "var(--border)" }}>
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
      {/* The scroll container is THIS div now, not the dialog itself
          (2026-10-07, user-caught — a form with several stacked fields on a
          short mobile viewport scrolled the header and footer away with the
          content, so the Save button could be out of view while a field
          further down was still being filled). Header and footer stay put;
          only the body between them scrolls.

          Deliberately NOT flex-1/flex-grow (reverted same day, user-caught —
          a short form, e.g. a one-field "Mark done" note, rendered with a
          large blank gap, and the whole dialog ballooned to near the page's
          other content on "New meeting"): a flex column with an indefinite
          (auto) height but a max-height cap hands a flex-grow child ALL the
          leftover room up to that cap, even when the child's own content is
          one short field — the dialog stops sizing to its content at all.
          Plain flex-shrink (the default) is all the long-content case
          actually needs: when total content exceeds max-height, header and
          footer are shrink-0 and refuse to shrink, so this div is the only
          one that can, and min-h-0 lets it shrink below its content's
          natural height and scroll — no grow involved either way. */}
      <div className="min-h-0 space-y-4 overflow-y-auto p-5">{children}</div>
      {footer && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-3 border-t p-5"
          style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}
        >
          {footer}
        </div>
      )}
    </dialog>
  );
}
