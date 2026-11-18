"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Camera, Download } from "lucide-react";
import { monthLabel } from "@/lib/format-date";
import { enqueue, listOutbox, type OutboxItem } from "../../outbox-db";
import { useOutbox } from "../../outbox-provider";
import { preparePhoto } from "../../photo";

/**
 * The step after saving an inspection on the phone (2026-11-18, user-asked):
 * 1. download the report PDF — available once the office has the inspection,
 *    since the PDF is generated there from the filed record;
 * 2. then photograph the signed copy. The photo is queued like everything
 *    else on the phone and sent after the inspection, so it works with no
 *    signal; the society can also upload it from its own portal.
 * Rendered in place of the form rather than on a new page: with no signal a
 * page this phone has never opened might not load.
 */
export function FieldInspectionDone({ itemId, societyName, period }: { itemId: string; societyName: string; period: string }) {
  const outbox = useOutbox();
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [stepTwo, setStepTwo] = useState(false);
  const [photoState, setPhotoState] = useState<"none" | "saving" | "queued" | "error">("none");

  useEffect(() => {
    if (inspectionId) return;
    let alive = true;
    const check = async () => {
      const pending = await listOutbox().catch(() => [] as OutboxItem[]);
      if (!alive) return;
      const still = pending.some((i) => i.id === itemId);
      setWaiting(still);
      if (still) return;
      const r = await fetch(`/api/field/inspection-receipt?item=${encodeURIComponent(itemId)}`, { cache: "no-store" }).catch(() => null);
      const body = r?.ok ? ((await r.json().catch(() => null)) as { inspectionId: string | null } | null) : null;
      if (alive && body?.inspectionId) setInspectionId(body.inspectionId);
    };
    void check();
    const t = setInterval(() => void check(), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [itemId, inspectionId]);

  async function takePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoState("saving");
    try {
      const photo = await preparePhoto(file);
      const photoId = crypto.randomUUID();
      await enqueue(
        [
          {
            id: crypto.randomUUID(),
            kind: "inspection.photo",
            payload: { inspectionItemId: itemId },
            photoId,
            label: `Signed inspection report · ${societyName} · ${monthLabel(period)}`,
            createdAt: Date.now(),
            refusals: 0,
            failures: 0,
            lastError: null,
            state: "pending",
          },
        ],
        [{ id: photoId, ...photo }],
      );
      setPhotoState("queued");
      void outbox.refresh().then(() => outbox.sendNow());
    } catch {
      setPhotoState("error");
    }
  }

  const btn = "w-full min-h-[52px] rounded-[var(--r-md)] font-semibold flex items-center justify-center gap-2 text-[16px]";

  return (
    <div className="space-y-4">
      <p role="status" className="card p-3" style={{ background: "var(--ok-bg)", color: "var(--ok-fg)", borderColor: "var(--ok-line)" }}>
        Inspection saved on this phone — {societyName}, {monthLabel(period)}. It is sent to the office by itself.
      </p>

      <section className="card p-4 space-y-3">
        <p className="lbl">Step 1 · The report</p>
        {inspectionId ? (
          <a href={`/api/inspections/${inspectionId}/pdf`} className={`btn-primary ${btn}`} onClick={() => setStepTwo(true)}>
            <Download size={20} aria-hidden /> Download the report (PDF)
          </a>
        ) : (
          <p className="text-[var(--text-muted)]">
            {waiting
              ? "The report PDF is made once the office has this inspection — it is being sent now, or as soon as there is signal."
              : "Getting the report ready…"}
          </p>
        )}
        {!stepTwo && (
          <button type="button" className="underline font-semibold min-h-[44px]" style={{ color: "var(--accent)" }} onClick={() => setStepTwo(true)}>
            {inspectionId ? "Already printed and signed — next" : "Next — I'll photograph the signed copy"}
          </button>
        )}
      </section>

      {stepTwo && (
        <section className="card p-4 space-y-3">
          <p className="lbl">Step 2 · The signed copy</p>
          {photoState === "queued" ? (
            <p style={{ color: "var(--ok-fg)" }}>Photo saved on this phone. It uploads after the inspection — with or without signal now.</p>
          ) : (
            <>
              <p className="text-[var(--text-muted)]">Photograph the printed report with both signatures and the stamp in one frame.</p>
              <label className={`${btn} border border-[var(--field-border)] cursor-pointer`}>
                <Camera size={20} aria-hidden />
                {photoState === "saving" ? "Saving…" : "Take a photo of the signed report"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  aria-label="Photo of the signed report"
                  disabled={photoState === "saving"}
                  onChange={(e) => void takePhoto(e.target.files?.[0])}
                />
              </label>
              {photoState === "error" && (
                <p role="alert" style={{ color: "var(--bad-fg)" }}>Could not save the photo on this phone — try again.</p>
              )}
              <p className="text-[var(--text-muted)]">Not signed yet? It can be uploaded later from the inspection, by you or by the society from its portal.</p>
            </>
          )}
        </section>
      )}

      <Link href="/field/inspections?saved=1" className={`btn-secondary ${btn}`}>
        Done
      </Link>
    </div>
  );
}
