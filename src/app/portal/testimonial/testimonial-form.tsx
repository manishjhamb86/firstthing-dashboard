"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field } from "@/components/ui";
import { QUOTE_MAX, QUOTE_MIN } from "@/lib/homepage-content";
import { TestimonialPhotoPicker, uploadTestimonialPhoto } from "@/components/testimonial-photo-picker";
import { getTestimonialPhotoUploadUrl, submitTestimonial } from "./actions";

/**
 * On submit the form goes behind a spinner, then a thank-you replaces it
 * (2026-11-25, user-asked for every form) — with a way to share another.
 */
export function TestimonialForm({ societyName }: { societyName: string }) {
  const router = useRouter();
  const [quote, setQuote] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorRole, setAuthorRole] = useState("");
  const [consent, setConsent] = useState(false);
  const [authorPhoto, setAuthorPhoto] = useState<File | null>(null);
  const [buildingPhoto, setBuildingPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const thanks = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (sent) thanks.current?.focus();
  }, [sent]);

  if (sent)
    return (
      <Card className="p-8 text-center" >
        <div role="status" aria-live="polite">
          <div aria-hidden className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full text-[32px] font-bold" style={{ background: "var(--ok-bg)", color: "var(--ok-fg)" }}>
            ✓
          </div>
          <h2 ref={thanks} tabIndex={-1} className="text-[20px] font-bold outline-none">
            Thank you for sharing!
          </h2>
          <p className="mx-auto mt-2 max-w-[440px] text-[14px] text-[var(--text-muted)]">
            FirsThing will read it and may show it on our website with your name{societyName ? ` and ${societyName}` : ""}. You can see where it stands beside this form.
          </p>
          <button type="button" className="btn-secondary mt-6" onClick={() => setSent(false)}>
            Share another
          </button>
        </div>
      </Card>
    );

  const left = QUOTE_MAX - quote.trim().length;
  return (
    <Card className="relative p-6">
      {pending && (
        <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[inherit] font-semibold" style={{ background: "color-mix(in srgb, var(--surface) 94%, transparent)" }}>
          <span aria-hidden className="h-11 w-11 animate-spin rounded-full border-4 border-[var(--border)]" style={{ borderTopColor: "var(--accent)" }} />
          Sending…
        </div>
      )}
      <form
        className="flex flex-col gap-4"
        aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(undefined);
            try {
              // Photos go up only once the form is actually being sent.
              const authorPhotoKey = authorPhoto ? await uploadTestimonialPhoto(authorPhoto, (i) => getTestimonialPhotoUploadUrl({ role: "author", ...i })) : null;
              const buildingPhotoKey = buildingPhoto ? await uploadTestimonialPhoto(buildingPhoto, (i) => getTestimonialPhotoUploadUrl({ role: "building", ...i })) : null;
              const r = await submitTestimonial({ quote, authorName, authorRole, consent, authorPhotoKey, buildingPhotoKey });
              if (r.error) setError(r.error);
              else {
                setQuote("");
                setConsent(false);
                setAuthorPhoto(null);
                setBuildingPhoto(null);
                setSent(true);
                router.refresh();
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
            }
          });
        }}
      >
        <Field label="Your experience" htmlFor="tm-quote" hint={`What changed for your society? ${QUOTE_MIN}–${QUOTE_MAX} characters.`}>
          <textarea id="tm-quote" className="field min-h-[140px]" value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={QUOTE_MAX + 50} />
        </Field>
        <p className="-mt-2 text-right text-xs" style={{ color: left < 0 ? "var(--bad-fg)" : "var(--text-subtle)" }}>
          {left} characters left
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Your full name" htmlFor="tm-name" hint="As it should appear on the website.">
            <input id="tm-name" className="field" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="e.g. Ravi Sharma" autoComplete="name" />
          </Field>
          <Field label="Your role (optional)" htmlFor="tm-role">
            <input id="tm-role" className="field" value={authorRole} onChange={(e) => setAuthorRole(e.target.value)} placeholder="e.g. Secretary" />
          </Field>
          <Field label="Society" htmlFor="tm-society">
            <input id="tm-society" className="field" value={societyName} readOnly disabled />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TestimonialPhotoPicker id="tm-author-photo" label="Your photo (optional)" hint="A clear photo of your face. JPG, PNG or WebP, up to 5 MB." round file={authorPhoto} onFile={setAuthorPhoto} />
          <TestimonialPhotoPicker id="tm-building-photo" label="Photo of your society (optional)" hint="The building or its entrance. Up to 5 MB." file={buildingPhoto} onFile={setBuildingPhoto} />
        </div>
        <label className="flex items-start gap-2.5 text-[13.5px]">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I agree that FirsThing may show this on its website with my name{societyName ? `, ${societyName}` : ""} and any photos I have added.</span>
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <button type="submit" className="btn-primary self-start" disabled={pending}>
          Send to FirsThing
        </button>
      </form>
    </Card>
  );
}
