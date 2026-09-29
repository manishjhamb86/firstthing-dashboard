"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { CalendarCheck, ClipboardList, ScanLine, Menu } from "lucide-react";

// Bottom navigation, thumb-reachable (05-field.md §0.4: "never a top-right
// button — this surface is used one-handed"). Four tabs, every one a real
// link, every target at least 56px tall.
const TABS = [
  { href: "/field", label: "Today", icon: CalendarCheck, exact: true },
  { href: "/field/work", label: "Work", icon: ClipboardList },
  { href: "/field/scan", label: "Scan", icon: ScanLine },
  { href: "/field/more", label: "More", icon: Menu },
] as const;

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** Whether the phone currently has a connection. Server render assumes yes. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function FieldShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const online = useOnline();

  // The service worker keeps the pages this phone has opened, so a crew in a
  // basement can still read them. Scoped to /field only.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/field-sw.js", { scope: "/field", updateViaCache: "none" }).catch(() => {
      // A failed registration leaves the app working online; nothing to tell
      // the person here — More shows whether the phone copy is active.
    });
  }, []);

  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-sunken)]">
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-4 h-14 border-b border-[var(--chrome-border)]"
        style={{ background: "var(--chrome)", color: "var(--chrome-text)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/icon.svg" alt="" className="h-8 w-8" />
        <span className="text-[17px] font-semibold flex-1">FirsThing Field</span>
        {/* Saved-on-this-phone vs sent-to-the-office is the distinction the
            field surface always shows (05-field.md §0.1). Until the outbox
            lands this is the connection alone, stated plainly. */}
        <span
          role="status"
          className={`chip ${online ? "chip-ok" : "chip-warn"}`}
          aria-label={online ? "Online" : "No signal"}
        >
          <span className="chip-dot" aria-hidden />
          {online ? "Online" : "No signal"}
        </span>
      </header>

      {!online && (
        <div
          className="px-4 py-2 text-[15px]"
          style={{ background: "var(--warn-bg)", color: "var(--warn-fg)", borderBottom: "1px solid var(--warn-line)" }}
        >
          No signal. Pages you have already opened on this phone still work.
        </div>
      )}

      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-28 text-[15px]">{children}</main>

      <nav
        aria-label="Field app"
        className="fixed bottom-0 inset-x-0 z-20 flex border-t border-[var(--border)] bg-[var(--surface)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => {
          const on = active(t.href, "exact" in t ? t.exact : false);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[60px] text-[15px] font-semibold"
              style={{ color: on ? "var(--accent-deep)" : "var(--text-muted)" }}
            >
              <span
                className="flex items-center justify-center w-14 h-7 rounded-full"
                style={{ background: on ? "var(--accent-subtle)" : "transparent" }}
              >
                <Icon size={22} strokeWidth={1.9} aria-hidden />
              </span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
