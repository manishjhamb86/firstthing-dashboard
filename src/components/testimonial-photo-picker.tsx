"use client";

import { useEffect, useMemo, useState } from "react";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/homepage-content";

/**
 * Choose one photo for a testimonial — the person, or their building — with a
 * preview. The file is uploaded by the form on submit, so nothing reaches the
 * bucket for a form that is never sent (this app's credentials cannot delete).
 */
export function TestimonialPhotoPicker({
  id,
  label,
  hint,
  round,
  currentUrl,
  file,
  onFile,
  onRemoveCurrent,
}: {
  id: string;
  label: string;
  hint: string;
  round?: boolean;
  currentUrl?: string | null;
  file: File | null;
  onFile: (f: File | null) => void;
  onRemoveCurrent?: () => void;
}) {
  const [error, setError] = useState<string>();
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  const shown = preview ?? currentUrl ?? null;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="lbl">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <div
          className={`grid shrink-0 place-items-center overflow-hidden border border-dashed border-[var(--border)] bg-[var(--surface-sunken)] text-xs text-[var(--text-subtle)] ${round ? "h-16 w-16 rounded-full" : "h-16 w-24 rounded-[var(--r-sm)]"}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shown ? <img src={shown} alt="" className="h-full w-full object-cover" /> : "No photo"}
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap gap-2">
            <label htmlFor={id} className="btn-secondary btn-sm cursor-pointer">
              {shown ? "Change photo" : "Choose a photo"}
            </label>
            {(file || currentUrl) && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  if (file) onFile(null);
                  else onRemoveCurrent?.();
                }}
              >
                Remove
              </button>
            )}
          </span>
          <span className="text-xs text-[var(--text-subtle)]">{hint}</span>
        </div>
        <input
          id={id}
          type="file"
          accept={PHOTO_TYPES.join(",")}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            e.target.value = "";
            setError(undefined);
            if (!f) return;
            if (!(PHOTO_TYPES as readonly string[]).includes(f.type)) return setError("Choose a JPG, PNG or WebP photo.");
            if (f.size > PHOTO_MAX_BYTES) return setError("Choose a photo under 5 MB.");
            onFile(f);
          }}
        />
      </div>
      {error && <span className="text-xs text-[var(--bad-fg)]">{error}</span>}
    </div>
  );
}

/** PUT a chosen photo with a presigned URL; returns the stored key. */
export async function uploadTestimonialPhoto(file: File, presign: (i: { contentType: string; size: number }) => Promise<{ uploadUrl: string; key: string } | { error: string }>): Promise<string> {
  const p = await presign({ contentType: file.type, size: file.size });
  if ("error" in p) throw new Error(p.error);
  const res = await fetch(p.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!res.ok) throw new Error(`The photo did not upload (${res.status}). Try again.`);
  return p.key;
}
