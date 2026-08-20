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
      className="inline-flex items-center gap-2 rounded-[var(--r-pill)] border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors"
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
