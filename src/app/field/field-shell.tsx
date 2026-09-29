"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, type ReactNode } from "react";
import { CalendarCheck, ClipboardList, ScanLine, Menu } from "lucide-react";
import { OutboxProvider, useOutbox } from "./outbox-provider";

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
  // The provider also registers the service worker, which keeps the pages
  // this phone has opened and sends saved work. Scoped to /field only.
  return (
    <OutboxProvider>
      <ShellFrame>{children}</ShellFrame>
    </OutboxProvider>
  );
}

/**
 * The header chip — the one line that answers "is my work safe?". Saved on
 * this phone vs sent to the office is the distinction 05-field.md §0.1 says
 * the field surface always shows; a blocked item is loud, never a count that
 * quietly stops moving.
 */
function syncChip(online: boolean, o: ReturnType<typeof useOutbox>): { tone: string; label: string; href?: string } {
  if (o.blocked > 0) return { tone: "bad", label: `${o.blocked} need${o.blocked === 1 ? "s" : ""} attention`, href: "/field/more" };
  if (o.signInNeeded && o.pending > 0) return { tone: "warn", label: "Sign in to send", href: "/field/more" };
  if (o.pending > 0) {
    return online ? { tone: "info", label: `Sending ${o.pending}…`, href: "/field/more" } : { tone: "warn", label: `${o.pending} saved on phone`, href: "/field/more" };
  }
  return online ? { tone: "ok", label: "All sent" } : { tone: "warn", label: "No signal" };
}

function ShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const online = useOnline();
  const outbox = useOutbox();
  const chip = syncChip(online, outbox);

  const active = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const chipEl = (
    <span role="status" className={`chip chip-${chip.tone}`}>
      <span className="chip-dot" aria-hidden />
      {chip.label}
    </span>
  );

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-sunken)]">
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-4 h-14 border-b border-[var(--chrome-border)]"
        style={{ background: "var(--chrome)", color: "var(--chrome-text)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/icon.svg" alt="" className="h-8 w-8" />
        <span className="text-[17px] font-semibold flex-1">FirsThing Field</span>
        {chip.href ? (
          <Link href={chip.href} aria-label={`${chip.label} — see what is waiting`}>
            {chipEl}
          </Link>
        ) : (
          chipEl
        )}
      </header>

      {!online && (
        <div
          className="px-4 py-2 text-[15px]"
          style={{ background: "var(--warn-bg)", color: "var(--warn-fg)", borderBottom: "1px solid var(--warn-line)" }}
        >
          No signal. Work you save is kept on this phone and sent when the signal returns.
        </div>
      )}
      {online && outbox.signInNeeded && outbox.pending > 0 && (
        <div
          className="px-4 py-2 text-[15px]"
          style={{ background: "var(--warn-bg)", color: "var(--warn-fg)", borderBottom: "1px solid var(--warn-line)" }}
        >
          Your session has ended. <Link href={`/login?callbackUrl=${encodeURIComponent(pathname)}`} className="underline font-semibold">Sign in again</Link> to send {outbox.pending} saved {outbox.pending === 1 ? "item" : "items"} — they are kept on this phone.
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
