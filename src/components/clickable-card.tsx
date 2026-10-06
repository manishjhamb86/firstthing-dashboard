"use client";

import { useRouter } from "next/navigation";

/**
 * `ClickableRow`'s own shape (src/components/clickable-row.tsx), for a `<div>`
 * card instead of a `<tr>` — the mobile-card side of a listing whose row can
 * also hold a real action button (Run the month, Reassign…) that must keep
 * working on its own rather than being swallowed by a wrapping `<Link>`.
 *
 * A click handler, not a stretched anchor: an anchor wrapping a nested
 * `<button>`/`<select>` is invalid HTML and makes the nested control's own
 * click unreliable. A handler on the card, ignoring clicks that land on a
 * real interactive element inside it, keeps both working.
 */
export function ClickableCard({
  href,
  children,
  className = "",
  ...rest
}: { href: string; children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  const router = useRouter();

  return (
    <div
      {...rest}
      role="link"
      tabIndex={0}
      className={`cursor-pointer ${className}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label")) return;
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) router.push(href);
      }}
    >
      {children}
    </div>
  );
}
