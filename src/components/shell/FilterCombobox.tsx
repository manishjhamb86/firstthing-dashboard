"use client";

import { useMemo, useState } from "react";

export default function FilterCombobox({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    if (!value) return options.slice(0, 8);
    const needle = value.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(needle)).slice(0, 8);
  }, [value, options]);

  return (
    <div className="relative w-full">
      <label className="mb-1.5 block text-xs font-semibold text-ink">{label}</label>
      <div className="relative">
        <input
          className="w-full rounded-[10px] border border-border bg-card px-3.5 py-2.5 text-sm text-ink placeholder:text-m2 focus:outline-none"
          value={value}
          placeholder={placeholder ?? `Filter by ${label.toLowerCase()}…`}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-m2 hover:text-ink"
            aria-label={`Clear ${label} filter`}
          >
            ×
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-[10px] border border-border bg-card shadow-lg">
          {suggestions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className="block w-full px-3.5 py-2 text-left text-xs text-ink hover:bg-card-2"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
