"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CustomerVisitPurpose } from "@prisma/client";
import { Camera, X } from "lucide-react";
import { Field } from "@/components/ui";
import { SearchSelect } from "@/components/search-select";
import { INTEREST_LABEL, PURPOSE_LABEL } from "@/lib/customer-visits";
import { getVisitPhotoUploadUrl, logVisit, updateVisit, type VisitFormInput } from "./actions";

export type VisitFormInitial = Omit<VisitFormInput, "location"> & { photoUrls: Record<string, string> };

const PURPOSE_HINT: Partial<Record<CustomerVisitPurpose, string>> = { feedback_upsell: "The one required each month" };

/**
 * Log a visit, or correct one still waiting or sent back (2026-11-18). Built
 * for a phone first — the relationship manager logs it at the society. The
 * phone's location is asked for when saving a new visit; refusing it still
 * saves, and the visit says the location was not shared.
 */
export function VisitForm({
  societies,
  initial,
  visitId,
  sentBackNote,
}: {
  societies: { id: string; label: string; sublabel?: string }[];
  initial: VisitFormInitial;
  visitId?: string;
  sentBackNote?: string | null;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>(initial.photoUrls);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<VisitFormInitial>) => setV((p) => ({ ...p, ...patch }));
  const feedback = v.purpose === "feedback_upsell";

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    if (!v.societyId) return setError("Choose the society first.");
    if (v.photoKeys.length >= 4) return setError("Up to 4 photos.");
    setError(null);
    setStep("Uploading the photo…");
    const p = await getVisitPhotoUploadUrl({ societyId: v.societyId, visitedAt: v.visitedAt, fileName: file.name, contentType: file.type || "image/jpeg" });
    if ("error" in p) {
      setStep(null);
      return setError(p.error);
    }
    const put = await fetch(p.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } }).catch(() => null);
    setStep(null);
    if (!put?.ok) return setError("The photo did not upload — check the connection and try again.");
    setPhotoUrls((u) => ({ ...u, [p.key]: URL.createObjectURL(file) }));
    set({ photoKeys: [...v.photoKeys, p.key] });
  }

  function locate(): Promise<VisitFormInput["location"]> {
    if (visitId || typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? null }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      );
    });
  }

  function save() {
    setError(null);
    start(async () => {
      setStep(visitId ? "Saving…" : "Getting your location…");
      const location = await locate();
      setStep("Saving…");
      const input: VisitFormInput = { ...v, location };
      const r = visitId ? await updateVisit(visitId, input) : await logVisit(input);
      setStep(null);
      if (r.error) return setError(r.error);
      const id = visitId ?? ("id" in r ? r.id : undefined);
      router.push(id ? `/admin/visits/${id}?saved=1` : "/admin/visits");
      router.refresh();
    });
  }

  const field = "field min-h-[48px] text-[16px]";
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-4">
      {sentBackNote && (
        <p className="card p-4 text-[14px]" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          Sent back: “{sentBackNote}”. Correct it and save — it goes back for approval.
        </p>
      )}
      <section className="card flex flex-col gap-4 p-4 sm:p-5">
        <Field label="Society" htmlFor="v-society">
          <SearchSelect id="v-society" options={societies} value={v.societyId || null} onCommit={(id) => set({ societyId: id ?? "" })} placeholder="Type a society's name" />
        </Field>
        <Field label="When" htmlFor="v-when">
          <input id="v-when" type="datetime-local" className={field} value={v.visitedAt} onChange={(e) => set({ visitedAt: e.target.value })} />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="lbl mb-2">Purpose</legend>
          {(Object.keys(PURPOSE_LABEL) as CustomerVisitPurpose[]).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={v.purpose === p}
              onClick={() => set({ purpose: p, ...(p === "feedback_upsell" ? {} : { rating: null, interests: [] }) })}
              className="min-h-[48px] rounded-[var(--r-md)] px-4 py-2 text-left text-[14px] font-semibold"
              style={v.purpose === p ? { background: "var(--accent-subtle)", color: "var(--accent)", border: "2px solid var(--accent)" } : { border: "1px solid var(--field-border)" }}
            >
              {PURPOSE_LABEL[p]}
              {PURPOSE_HINT[p] && <span className="block text-[12px] font-normal opacity-80">{PURPOSE_HINT[p]}</span>}
            </button>
          ))}
        </fieldset>
        <Field label="Agenda" htmlFor="v-agenda" hint="What the visit was for.">
          <textarea id="v-agenda" rows={2} className="field text-[16px]" value={v.agenda} onChange={(e) => set({ agenda: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Who you met" htmlFor="v-met">
            <input id="v-met" className={field} value={v.metName} onChange={(e) => set({ metName: e.target.value })} placeholder="Name" />
          </Field>
          <Field label="Their role" htmlFor="v-role">
            <input id="v-role" className={field} value={v.metRole} onChange={(e) => set({ metRole: e.target.value })} placeholder="e.g. Treasurer" />
          </Field>
        </div>
        <Field label="What happened" htmlFor="v-outcome">
          <textarea id="v-outcome" rows={3} className="field text-[16px]" value={v.outcome} onChange={(e) => set({ outcome: e.target.value })} />
        </Field>

        {feedback && (
          <section className="flex flex-col gap-3 rounded-[var(--r-md)] border p-4" style={{ borderColor: "var(--accent-line, var(--border))" }}>
            <p className="text-[13px] font-bold" style={{ color: "var(--accent)" }}>Feedback &amp; upselling</p>
            <fieldset>
              <legend className="lbl mb-2">How satisfied is the society?</legend>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={v.rating === n}
                    aria-label={`${n} of 5`}
                    onClick={() => set({ rating: n })}
                    className="min-h-[44px] rounded-[var(--r-md)] text-[15px] font-bold"
                    style={v.rating === n ? { background: "var(--accent)", color: "var(--text-on-accent, #fff)" } : { border: "1px solid var(--field-border)" }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-1">
              <legend className="lbl mb-2">Interest in other services</legend>
              {(Object.keys(INTEREST_LABEL) as (keyof typeof INTEREST_LABEL)[]).map((k) => (
                <label key={k} className="flex min-h-[44px] items-center gap-3 text-[14px]">
                  <input
                    type="checkbox"
                    className="h-[18px] w-[18px]"
                    checked={v.interests.includes(k)}
                    onChange={(e) => set({ interests: e.target.checked ? [...v.interests, k] : v.interests.filter((x) => x !== k) })}
                  />
                  {INTEREST_LABEL[k]}
                </label>
              ))}
            </fieldset>
          </section>
        )}

        <Field label="Follow-ups" htmlFor="v-follow" hint="Optional — what needs doing next.">
          <textarea id="v-follow" rows={2} className="field text-[16px]" value={v.followUps} onChange={(e) => set({ followUps: e.target.value })} />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="lbl">Photos</span>
          {v.photoKeys.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {v.photoKeys.map((k) => (
                <div key={k} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview or the filed photo */}
                  <img src={photoUrls[k]} alt="Visit photo" className="h-20 w-24 rounded-[var(--r-sm)] border border-[var(--border)] object-cover" />
                  <button type="button" aria-label="Remove photo" onClick={() => set({ photoKeys: v.photoKeys.filter((x) => x !== k) })} className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border bg-[var(--surface)]">
                    <X size={14} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
          {v.photoKeys.length < 4 && (
            <label className="flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-[var(--r-md)] border border-[var(--field-border)] text-[14px] font-semibold">
              <Camera size={18} aria-hidden /> Add a photo
              <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Add a photo" onChange={(e) => void addPhoto(e.target.files?.[0])} />
            </label>
          )}
        </div>
      </section>

      {error && <p role="alert" className="card p-3" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>{error}</p>}
      <div className="sticky bottom-0 z-10 bg-[var(--surface-sunken)] pb-2 pt-2">
        <button type="button" className="btn-primary min-h-[52px] w-full text-[16px]" disabled={pending || !!step || !v.societyId} onClick={save}>
          {step ?? (visitId ? "Save and send for approval" : "Save visit")}
        </button>
        {!visitId && <p className="mt-1 text-center text-[12.5px] text-[var(--text-muted)]">Your location is asked for when saving, to show the visit happened at the society.</p>}
      </div>
    </div>
  );
}
