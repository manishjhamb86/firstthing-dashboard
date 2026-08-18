"use client";

import { useRouter } from "next/navigation";

/**
 * A table row that navigates when clicked anywhere.
 *
 * Deliberately a click handler and NOT a stretched ::after overlay: an
 * absolutely-positioned overlay needs its row to be a containing block, and
 * WebKit does not reliably make a <tr> one — which made the entire page
 * clickable. A handler cannot escape its own row.
 *
 * The row is not the accessible control; the anchor inside it still is. This
 * only adds a pointer shortcut on top, so keyboard and screen-reader users
 * lose nothing, and a text selection or a click on a nested control does not
 * navigate.
 */
export function ClickableRow({
  href,
  children,
  ...rest
}: { href: string; children: React.ReactNode } & React.HTMLAttributes<HTMLTableRowElement>) {
  const router = useRouter();

  return (
    <tr
      {...rest}
      className={`row-clickable ${rest.className ?? ""}`}
      onClick={(e) => {
        // Let a real link, button or input inside the row do its own job.
        if ((e.target as HTMLElement).closest("a, button, input, select, textarea, label")) return;
        // Dragging to select text should not navigate.
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
