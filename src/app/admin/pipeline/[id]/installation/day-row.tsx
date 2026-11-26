"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * One day of the Days table (2026-11-26, user-asked): a single line of
 * figures, with the day's corrections behind one ⋯ menu at its end, and its
 * details — who logged it, the society's review — folded until the row is
 * clicked. A click on a link or button inside the row does what it says and
 * does not fold or unfold it.
 */
export function DayRow({
  day,
  cells,
  menu,
  primary = null,
  details,
  note = null,
}: {
  day: number;
  /** The figures, after the day number. */
  cells: ReactNode;
  /** The day's corrections — shown in the row's ⋯ menu. */
  menu: ReactNode | null;
  /** A day's next step (start it, skip the gate, reopen it) — shown in the row, not hidden in the menu. */
  primary?: ReactNode | null;
  details: ReactNode | null;
  /** Always shown — a blocked day's reason, which the crew needs before they travel. */
  note?: ReactNode | null;
}) {
  const [open, setOpen] = useState(false);
  const canOpen = !!details;
  return (
    <>
      <tr
        className={`${note || (open && details) ? "day-main" : ""} ${canOpen ? "cursor-pointer" : ""}`}
        onClick={(e) => {
          if (!canOpen || (e.target as HTMLElement).closest("a,button,input,select,textarea,dialog,[data-menu]")) return;
          setOpen((o) => !o);
        }}
      >
        <td className="num">
          {canOpen ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} day ${day}'s details`}
              onClick={() => setOpen((o) => !o)}
            >
              <span aria-hidden className="inline-block w-2 text-[10px] text-[var(--text-subtle)]">{open ? "▾" : "▸"}</span>
              {day}
            </button>
          ) : (
            <span className="pl-3.5">{day}</span>
          )}
        </td>
        {cells}
        <td className="text-right">
          <div className="inline-flex items-center justify-end gap-1" data-menu>
            {primary}
            {menu && <RowMenu label={`Day ${day}`}>{menu}</RowMenu>}
          </div>
        </td>
      </tr>
      {note && (
        <tr className="day-sub">
          <td />
          <td colSpan={8}>{note}</td>
        </tr>
      )}
      {open && details && (
        <tr className="day-sub day-details">
          <td />
          <td colSpan={8}>{details}</td>
        </tr>
      )}
    </>
  );
}

/** A ⋯ button opening a small panel of actions; closes on Escape or an outside click. */
export function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Fixed to the viewport, so the table's own scroll box cannot clip it.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = button.current?.getBoundingClientRect();
      if (!r) return;
      const right = window.innerWidth - r.right;
      // Opens upwards when there is no room for it below the button.
      setPos(r.bottom + 240 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      // A dialog opened from the menu lives in the top layer; clicks in it are not "outside".
      if (ref.current?.contains(t) || (t as HTMLElement).closest?.("dialog")) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  return (
    <div ref={ref} data-menu className="relative inline-block text-left">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} — corrections`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-[18px] leading-none text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && pos && (
        <div
          role="menu"
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="row-menu z-50 flex min-w-[220px] flex-col items-stretch gap-0.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-1.5 text-left shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}
