"use client";

/**
 * The one search control.
 *
 * Every listing had its own bare `<input className="field">`, which on a
 * page whose ground is already near-white reads as a gap rather than a
 * control — "the search bar should look distinct and not merged in the
 * background" (user-reported 2026-08-21). This gives it a magnifier, its own
 * surface and border, and a clear button, in one place so the six listings
 * cannot drift apart again.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = "w-full sm:w-80",
  name,
  defaultValue,
  disabled,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder: string;
  /** Accessible name — the placeholder disappears the moment there is a value. */
  label: string;
  className?: string;
  /** Set these instead of value/onChange to use it inside a GET form. */
  name?: string;
  defaultValue?: string;
  disabled?: boolean;
}) {
  // Uncontrolled (a real form that navigates) has no clear button: clearing
  // there means submitting an empty query, which is the form's own job.
  const controlled = onChange !== undefined;
  return (
    <div className={`search-field ${className}`}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        aria-label={label}
        disabled={disabled}
        {...(controlled
          ? { value: value ?? "", onChange: (e) => onChange?.(e.target.value) }
          : { name, defaultValue })}
      />
      {controlled && value !== "" && (
        <button type="button" onClick={() => onChange?.("")} aria-label="Clear the search">
          ×
        </button>
      )}
    </div>
  );
}
