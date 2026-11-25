"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { TestimonialPhotoPicker, uploadTestimonialPhoto } from "@/components/testimonial-photo-picker";
import { addTestimonial, getAdminTestimonialPhotoUploadUrl, reviewTestimonial, updateTestimonial } from "../actions";

type T = {
  id: string;
  quote: string;
  authorName: string;
  authorRole: string;
  place: string;
  priority: number;
  status: string;
  societyId: string;
  authorPhotoUrl: string | null;
  buildingPhotoUrl: string | null;
};

async function upload(file: File | null, role: "author" | "building", societyId: string): Promise<string | null> {
  return file ? uploadTestimonialPhoto(file, (i) => getAdminTestimonialPhotoUploadUrl({ role, societyId, ...i })) : null;
}

export function TestimonialRow({ t, meta }: { t: T; meta: ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [v, setV] = useState({ quote: t.quote, authorName: t.authorName, authorRole: t.authorRole, place: t.place, priority: String(t.priority) });
  const [note, setNote] = useState("");
  const [authorFile, setAuthorFile] = useState<File | null>(null);
  const [buildingFile, setBuildingFile] = useState<File | null>(null);
  const [dropAuthor, setDropAuthor] = useState(false);
  const [dropBuilding, setDropBuilding] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    start(async () => {
      setError(undefined);
      try {
        const r = await fn();
        if (r.error) setError(r.error);
        else {
          after?.();
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      }
    });
  }
  const attribution = [t.authorName, t.authorRole, t.place].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-3">
      {!editing ? (
        <>
          {(t.authorPhotoUrl || t.buildingPhotoUrl) && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {t.authorPhotoUrl && <img src={t.authorPhotoUrl} alt={`${t.authorName}`} className="h-14 w-14 rounded-full object-cover" />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {t.buildingPhotoUrl && <img src={t.buildingPhotoUrl} alt="The society's building" className="h-14 w-24 rounded-[var(--r-sm)] object-cover" />}
            </div>
          )}
          <blockquote className="text-[14.5px] leading-relaxed">&ldquo;{t.quote}&rdquo;</blockquote>
          <p className="text-[13px] font-medium">
            — {attribution}
            {t.status === "published" && <span className="ml-2 text-xs text-[var(--text-muted)]">order {t.priority}</span>}
          </p>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Quote" htmlFor={`tq-${t.id}`}>
              <textarea id={`tq-${t.id}`} className="field min-h-[90px]" value={v.quote} onChange={(e) => setV({ ...v, quote: e.target.value })} />
            </Field>
          </div>
          <Field label="Full name" htmlFor={`tn-${t.id}`}>
            <input id={`tn-${t.id}`} className="field" value={v.authorName} onChange={(e) => setV({ ...v, authorName: e.target.value })} placeholder="e.g. Ravi Sharma" />
          </Field>
          <Field label="Role (optional)" htmlFor={`tr-${t.id}`}>
            <input id={`tr-${t.id}`} className="field" value={v.authorRole} onChange={(e) => setV({ ...v, authorRole: e.target.value })} placeholder="e.g. Secretary" />
          </Field>
          <Field label="Society shown" htmlFor={`tp-${t.id}`}>
            <input id={`tp-${t.id}`} className="field" value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} placeholder="e.g. Prateek Laurel, Noida" />
          </Field>
          <TestimonialPhotoPicker
            id={`tap-${t.id}`}
            label="Person's photo"
            hint="JPG, PNG or WebP, up to 5 MB."
            round
            currentUrl={dropAuthor ? null : t.authorPhotoUrl}
            file={authorFile}
            onFile={setAuthorFile}
            onRemoveCurrent={() => setDropAuthor(true)}
          />
          <TestimonialPhotoPicker
            id={`tbp-${t.id}`}
            label="Building photo"
            hint="Up to 5 MB."
            currentUrl={dropBuilding ? null : t.buildingPhotoUrl}
            file={buildingFile}
            onFile={setBuildingFile}
            onRemoveCurrent={() => setDropBuilding(true)}
          />
          <Field label="Order (lower shows first)" htmlFor={`to-${t.id}`}>
            <input id={`to-${t.id}`} className="field num" inputMode="numeric" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })} />
          </Field>
        </div>
      )}
      {meta}
      {rejecting && (
        <Field label="Why it is rejected" htmlFor={`tx-${t.id}`}>
          <input id={`tx-${t.id}`} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Mentions a resident by name" />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={pending}
              onClick={() =>
                run(
                  async () => {
                    const a = await upload(authorFile, "author", t.societyId);
                    const bld = await upload(buildingFile, "building", t.societyId);
                    return updateTestimonial(t.id, {
                      ...v,
                      priority: Number(v.priority),
                      authorPhotoKey: a ?? (dropAuthor ? null : undefined),
                      buildingPhotoKey: bld ?? (dropBuilding ? null : undefined),
                    });
                  },
                  () => {
                    setEditing(false);
                    setAuthorFile(null);
                    setBuildingFile(null);
                    setDropAuthor(false);
                    setDropBuilding(false);
                  },
                )
              }
            >
              Save
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : rejecting ? (
          <>
            <button type="button" className="btn-primary btn-sm" disabled={pending || !note.trim()} onClick={() => run(() => reviewTestimonial(t.id, "rejected", note), () => setRejecting(false))}>
              Reject it
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {t.status !== "published" && (
              <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => reviewTestimonial(t.id, "published", ""))}>
                Publish
              </button>
            )}
            {t.status !== "held" && (
              <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => reviewTestimonial(t.id, "held", ""))}>
                {t.status === "published" ? "Take off the homepage" : "Hold"}
              </button>
            )}
            {t.status !== "rejected" && (
              <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => setRejecting(true)}>
                Reject
              </button>
            )}
            <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

export function AddTestimonial({ societies }: { societies: { id: string; name: string }[] }) {
  const router = useRouter();
  const blank = { quote: "", authorName: "", authorRole: "", place: "", societyId: "" };
  const [v, setV] = useState(blank);
  const [authorFile, setAuthorFile] = useState<File | null>(null);
  const [buildingFile, setBuildingFile] = useState<File | null>(null);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Field label="Quote" htmlFor="ta-quote">
        <textarea id="ta-quote" className="field min-h-[90px]" value={v.quote} onChange={(e) => setV({ ...v, quote: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Full name" htmlFor="ta-name">
          <input id="ta-name" className="field" value={v.authorName} onChange={(e) => setV({ ...v, authorName: e.target.value })} placeholder="e.g. Ravi Sharma" />
        </Field>
        <Field label="Role (optional)" htmlFor="ta-role">
          <input id="ta-role" className="field" value={v.authorRole} onChange={(e) => setV({ ...v, authorRole: e.target.value })} placeholder="e.g. Secretary" />
        </Field>
        <Field label="Society (optional)" htmlFor="ta-soc">
          <select
            id="ta-soc"
            className="field"
            value={v.societyId}
            onChange={(e) => setV({ ...v, societyId: e.target.value, place: v.place || (societies.find((s) => s.id === e.target.value)?.name ?? "") })}
          >
            <option value="">None</option>
            {societies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Society shown" htmlFor="ta-place">
          <input id="ta-place" className="field" value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} placeholder="e.g. Prateek Laurel, Noida" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TestimonialPhotoPicker id="ta-author-photo" label="Person's photo (optional)" hint="JPG, PNG or WebP, up to 5 MB." round file={authorFile} onFile={setAuthorFile} />
        <TestimonialPhotoPicker id="ta-building-photo" label="Building photo (optional)" hint="Up to 5 MB." file={buildingFile} onFile={setBuildingFile} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(undefined);
              setDone(false);
              try {
                const authorPhotoKey = await upload(authorFile, "author", v.societyId);
                const buildingPhotoKey = await upload(buildingFile, "building", v.societyId);
                const r = await addTestimonial({ ...v, authorPhotoKey, buildingPhotoKey });
                if (r.error) setError(r.error);
                else {
                  setV(blank);
                  setAuthorFile(null);
                  setBuildingFile(null);
                  setDone(true);
                  router.refresh();
                }
              } catch (err) {
                setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
              }
            })
          }
        >
          {pending ? "Adding…" : "Add on hold"}
        </button>
        {done && <span className="text-[13px] text-[var(--ok-fg)]">Added to On hold.</span>}
      </div>
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}
