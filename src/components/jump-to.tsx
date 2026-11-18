"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CornerDownLeft, FileText, Search } from "lucide-react";
import { jumpResults, type JumpPage, type JumpSociety } from "@/lib/jump-search";

/**
 * Jump to a page or a society (2026-11-19, user-asked with the navigation
 * redesign). Opens from the sidebar's search box or ⌘K / Ctrl+K anywhere in
 * the back office; arrow keys move, Enter goes, Esc closes. The pages are the
 * ones this viewer's sidebar already offers, so it never shows a link the
 * viewer could not open; societies come from the layout.
 */
export function JumpTo({ pages, societies }: { pages: JumpPage[]; societies: JumpSociety[] }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [mac, setMac] = useState(true);

  const results = useMemo(() => jumpResults(query, pages, societies), [query, pages, societies]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the platform is only known after mount
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      inputRef.current?.focus();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      go(results[cursor].href);
    }
  }

  const shortcut = mac ? "⌘K" : "Ctrl K";
  const firstSociety = results.findIndex((r) => r.kind === "society");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center gap-2 rounded-[var(--r-md)] border px-3 text-left text-[13.5px]"
        style={{ borderColor: "var(--chrome-border)", color: "var(--chrome-muted)", background: "transparent" }}
        aria-label="Jump to a page or society"
      >
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <span className="flex-1">Jump to…</span>
        <kbd className="hidden rounded border px-1.5 py-px font-sans text-[11px] lg:inline" style={{ borderColor: "var(--chrome-border)" }}>
          {shortcut}
        </kbd>
      </button>

      <dialog
        ref={dialogRef}
        onClose={close}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        aria-label="Jump to a page or society"
        className="m-auto mt-[12vh] w-[min(560px,calc(100vw-32px))] rounded-[var(--r-lg)] border p-0 backdrop:bg-black/30"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)", boxShadow: "var(--e2)" }}
      >
        <div className="flex items-center gap-2 border-b px-4" style={{ borderColor: "var(--border)" }}>
          <Search size={18} strokeWidth={1.75} aria-hidden style={{ color: "var(--text-muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onInputKey}
            placeholder="A page or a society…"
            aria-label="Search pages and societies"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="jump-results"
            aria-activedescendant={results[cursor] ? `jump-${cursor}` : undefined}
            className="h-14 flex-1 bg-transparent text-[16px] outline-none"
          />
          <kbd className="rounded border px-1.5 py-px font-sans text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            Esc
          </kbd>
        </div>
        <ul id="jump-results" role="listbox" className="max-h-[56vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-[13.5px]" style={{ color: "var(--text-muted)" }}>
              Nothing matches “{query}”.
            </li>
          )}
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.href}`} role="presentation">
              {(i === 0 || i === firstSociety) && (
                <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--text-subtle)" }}>
                  {r.kind === "page" ? "Pages" : "Societies"}
                </p>
              )}
              <button
                type="button"
                id={`jump-${i}`}
                role="option"
                aria-selected={i === cursor}
                onMouseMove={() => setCursor(i)}
                onClick={() => go(r.href)}
                className="flex w-full items-center gap-3 rounded-[var(--r-md)] px-3 py-2.5 text-left text-[14px]"
                style={{ background: i === cursor ? "var(--accent-subtle)" : "transparent" }}
              >
                {r.kind === "page" ? (
                  <FileText size={16} strokeWidth={1.75} aria-hidden style={{ color: "var(--text-muted)" }} />
                ) : (
                  <Building2 size={16} strokeWidth={1.75} aria-hidden style={{ color: "var(--text-muted)" }} />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{r.label}</span>
                {r.detail && (
                  <span className="shrink-0 truncate text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    {r.detail}
                  </span>
                )}
                {i === cursor && <CornerDownLeft size={14} aria-hidden style={{ color: "var(--text-muted)" }} />}
              </button>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
