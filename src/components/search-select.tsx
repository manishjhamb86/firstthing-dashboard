"use client";

import { useId, useMemo, useRef, useState } from "react";

export type SearchSelectOption = { id: string; label: string; sublabel?: string };

/**
 * A typeahead select that commits an ID, not free text — for pickers over a
 * list too long to scan as a plain `<select>` (2026-09-12, the society
 * picker on the inspection form). Filters client-side against options
 * already on the page; no round trip.
 *
 * `onCommit` fires once, the moment a real option is chosen (click or
 * Enter on a highlighted row) — never on every keystroke — so a caller can
 * advance focus to whatever comes next, the way choosing a society here
 * moves straight to the circuit it opens.
 */
export function SearchSelect({
  id,
  options,
  value,
  onCommit,
  placeholder,
  emptyLabel = "No matches",
}: {
  id?: string;
  options: SearchSelectOption[];
  value: string | null;
  onCommit: (id: string | null) => void;
  placeholder?: string;
  emptyLabel?: string;
}) {
  const selected = options.find((o) => o.id === value) ?? null;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options.slice(0, 30);
    return options.filter((o) => o.label.toLowerCase().includes(needle)).slice(0, 30);
  }, [query, options]);

  function commit(o: SearchSelectOption | null) {
    onCommit(o?.id ?? null);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        id={id}
        className="field"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder ?? "Type to search…"}
        value={open ? query : (selected?.label ?? "")}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          if (value !== null) onCommit(null);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (matches[highlight]) commit(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-[10px] border shadow-lg"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {matches.length === 0 ? (
            <p className="px-3.5 py-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
              {emptyLabel}
            </p>
          ) : (
            matches.map((o, i) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => commit(o)}
                className="block w-full px-3.5 py-2 text-left text-[13.5px]"
                style={i === highlight ? { background: "var(--accent-subtle)" } : undefined}
              >
                {o.label}
                {o.sublabel && (
                  <span className="ml-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {o.sublabel}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
