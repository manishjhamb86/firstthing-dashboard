"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDemoMode } from "@/app/demo-mode-actions";

/**
 * The demo/normal switch, beside the theme switcher.
 *
 * Rendered only where DEMO_MODE is set in the environment — on any other
 * deployment the control does not exist, and the Server Action refuses
 * regardless. Both switches must be on for a single gate to be bypassed.
 *
 * While it is ON this is the ONLY thing on screen saying so: the page-wide
 * ribbon was removed (2026-08-21) because a second amber bar above whatever
 * the page itself was warning about is one too many. So it pulses — gently,
 * and not at all under prefers-reduced-motion, where the amber fill and the
 * word DEMO carry it instead. A screenshot still shows the mode it was
 * taken in, which is the property the ribbon existed for.
 */
export function DemoModeToggle({ on, surface }: { on: boolean; surface: "chrome" | "content" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const idle = surface === "chrome" ? "var(--chrome-text-muted)" : "var(--text-muted)";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "Demo mode on — switch to normal mode" : "Demo mode off — switch to demo mode"}
      title={
        on
          ? "Demo mode: date and window checks are bypassed. Click for normal mode."
          : "Normal mode. Click to bypass date and window checks."
      }
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setDemoMode(!on);
          router.refresh();
        })
      }
      className={`demo-toggle inline-flex items-center gap-2 rounded-[var(--r-pill)] border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors${
        on ? " demo-toggle-on" : ""
      }`}
      style={{
        borderColor: on ? "var(--warn-line)" : "var(--border)",
        background: on ? "var(--warn-bg)" : "transparent",
        color: on ? "var(--warn-fg)" : idle,
        opacity: pending ? 0.6 : 1,
      }}
    >
      <span
        aria-hidden
        className="inline-flex h-3.5 w-6 shrink-0 items-center rounded-full p-[2px] transition-colors"
        style={{ background: on ? "var(--warn-fg)" : "var(--border)" }}
      >
        <span
          className="h-2.5 w-2.5 rounded-full bg-white transition-transform"
          style={{ transform: on ? "translateX(10px)" : "translateX(0)" }}
        />
      </span>
      {on ? "Demo" : "Normal"}
    </button>
  );
}
