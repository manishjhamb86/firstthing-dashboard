"use client";

import { useId, useRef, useState } from "react";
import { FileUp, X } from "lucide-react";

/**
 * The one file picker (2026-09-25, user-caught: the browser's bare "Choose
 * Files · no files selected" did not read as something to click). A dashed
 * box with an upload icon that says what to do and what it accepts, takes a
 * click or a drop, and names what was chosen inside itself.
 *
 * The real <input type="file"> stays in the page (visually hidden, still
 * focusable and labelled), so keyboard use, screen readers and tests that set
 * files on the input keep working.
 */
export function FileDrop({
  id,
  accept,
  multiple = false,
  files,
  onFiles,
  hint,
  disabled = false,
  label = multiple ? "Choose files or drop them here" : "Choose a file or drop it here",
  ariaLabel,
  name,
  compact = false,
}: {
  id?: string;
  accept?: string;
  multiple?: boolean;
  /** What is currently chosen — the parent owns it. */
  files: File[];
  onFiles: (files: File[]) => void;
  /** e.g. "PDF, up to 10 MB". Defaults to the accepted types, spelled out. */
  hint?: string;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
  /** For a form that posts the file itself. */
  name?: string;
  compact?: boolean;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    onFiles(multiple ? [...files, ...picked] : picked.slice(0, 1));
  };

  const accepts = hint ?? describeAccept(accept);

  return (
    <div className="space-y-2">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) pick(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer items-center gap-3 rounded-[var(--r-md)] border-2 border-dashed transition-colors ${compact ? "px-3 py-2.5" : "px-4 py-4"} ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]"}`}
        style={{
          borderColor: over ? "var(--accent)" : "var(--field-border)",
          background: over ? "var(--accent-subtle)" : "var(--surface)",
        }}
      >
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
          aria-hidden
        >
          <FileUp size={18} />
        </span>
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold" style={{ color: "var(--accent)" }}>
            {files.length > 0 && !multiple ? "Choose a different file" : label}
          </span>
          {accepts && (
            <span className="block text-[12px]" style={{ color: "var(--text-subtle)" }}>
              {accepts}
            </span>
          )}
        </span>
        <input
          ref={ref}
          id={inputId}
          name={name}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-label={ariaLabel}
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            // Choosing the same file again after removing it must still fire.
            if (!name) e.target.value = "";
          }}
        />
      </label>
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-2 rounded-[var(--r-sm)] px-3 py-1.5 text-[13px]"
              style={{ background: "var(--surface-sunken)" }}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
              <span className="num shrink-0 text-[12px]" style={{ color: "var(--text-subtle)" }}>
                {formatSize(f.size)}
              </span>
              {!disabled && !name && (
                <button
                  type="button"
                  className="shrink-0"
                  style={{ color: "var(--text-subtle)" }}
                  aria-label={`Remove ${f.name}`}
                  onClick={() => onFiles(files.filter((_, j) => j !== i))}
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "application/pdf,.png" → "PDF or PNG". */
function describeAccept(accept?: string): string {
  if (!accept) return "";
  const names = accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .map((a) =>
      a === "image/*"
        ? "a photo"
        : a === "application/pdf" || a === ".pdf"
          ? "PDF"
          : a === "text/csv" || a === ".csv"
            ? "CSV"
            : a === "application/zip" || a === ".zip"
              ? "ZIP"
              : a.startsWith(".")
                ? a.slice(1).toUpperCase()
                : a.split("/")[1]?.toUpperCase() ?? a,
    );
  const unique = [...new Set(names)];
  return unique.length <= 1 ? unique.join("") : `${unique.slice(0, -1).join(", ")} or ${unique[unique.length - 1]}`;
}
