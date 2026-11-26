"use client";

import { useState, type ReactNode } from "react";

/**
 * One day of the Days table (2026-11-26, user-asked): the figures row, its
 * corrections, and the details — who logged it, the society's review — which
 * stay folded until the row is clicked. A click on a link or button inside the
 * row does what it says and does not fold or unfold it.
 */
export function DayRow({
  day,
  cells,
  actions,
  details,
  note = null,
}: {
  day: number;
  /** The figures, after the day number. */
  cells: ReactNode;
  actions: ReactNode | null;
  details: ReactNode | null;
  /** Always shown — a blocked day's reason, which the crew needs before they travel. */
  note?: ReactNode | null;
}) {
  const [open, setOpen] = useState(false);
  const canOpen = !!details;
  return (
    <>
      <tr
        className={`${actions || note || (open && details) ? "day-main" : ""} ${canOpen ? "cursor-pointer" : ""}`}
        onClick={(e) => {
          if (!canOpen || (e.target as HTMLElement).closest("a,button,input,select,textarea,dialog")) return;
          setOpen((o) => !o);
        }}
      >
        <td className="num">
          {canOpen ? (
            <button
              type="button"
              className="inline-flex items-center gap-1"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} day ${day}'s details`}
              onClick={() => setOpen((o) => !o)}
            >
              <span aria-hidden className="text-[10px] text-[var(--text-subtle)]">{open ? "▾" : "▸"}</span>
              {day}
            </button>
          ) : (
            day
          )}
        </td>
        {cells}
      </tr>
      {actions && (
        <tr className="day-sub">
          <td />
          <td colSpan={7}>{actions}</td>
        </tr>
      )}
      {note && (
        <tr className="day-sub">
          <td />
          <td colSpan={7}>{note}</td>
        </tr>
      )}
      {open && details && (
        <tr className="day-sub">
          <td />
          <td colSpan={7}>{details}</td>
        </tr>
      )}
    </>
  );
}
