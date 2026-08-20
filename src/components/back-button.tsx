"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * The way back.
 *
 * Three things were wrong with the breadcrumb it replaces (user-reported
 * 2026-08-20):
 *
 *  - it did not read as a control — muted text with an arrow beside it;
 *  - only the TEXT was clickable, because the arrow was a sibling of the
 *    link rather than inside it;
 *  - and it was not "back" at all. It was a hard-coded parent crumb, so the
 *    same control landed on the leads list from one screen, the society from
 *    another and the circuit from a third — "it takes to some random page at
 *    random places".
 *
 * This is one button, arrow included, that walks the browser's own history.
 * `fallbackHref` is the parent, used only when there is no history to walk:
 * a deep link, a new tab, or the first page of a session. Without it the
 * control would be dead exactly when someone needs it most.
 */
const STACK_KEY = "ft:nav-stack";

/**
 * Per-tab record of the pages this tab has actually visited.
 *
 * The App Router gives us nothing to work with here — measured, not assumed:
 * `history.state` is `{__NA, __PRIVATE_NEXTJS_INTERNALS_TREE}` on every
 * entry, hard load or client push alike, with no index (that was the Pages
 * Router). And `history.length` counts the tab's whole life including the
 * about:blank a new tab opens on, so it says 2 when there is nothing of ours
 * behind us — which is how back() lands on a blank page.
 *
 * sessionStorage is per-tab and survives both client navigation and reload,
 * which is exactly the scope of "can I go back within this app".
 */
function readStack(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STACK_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function BackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // Writes only — no state, so this cannot fight React's render.
  useEffect(() => {
    const stack = readStack();
    if (stack[stack.length - 1] !== pathname) {
      // Bounded: a long session should not grow this without limit.
      sessionStorage.setItem(STACK_KEY, JSON.stringify([...stack, pathname].slice(-30)));
    }
  }, [pathname]);

  return (
    <button
      type="button"
      className="btn-back"
      onClick={() => {
        const stack = readStack();
        // Drop this page, then see whether anything of ours is behind it.
        if (stack.length > 1) {
          sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(0, -1)));
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M10 3.5 5.5 8l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Back
    </button>
  );
}
