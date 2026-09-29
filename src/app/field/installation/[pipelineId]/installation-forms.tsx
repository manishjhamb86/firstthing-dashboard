"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { enqueue, type OutboxItem, type StoredPhoto } from "../../outbox-db";
import { useOutbox } from "../../outbox-provider";
import { preparePhoto } from "../../photo";
import { WaitingItem } from "../../waiting-item";

export type FieldDay = {
  id: string;
  day: number;
  plannedDate: string;
  plannedLabel: string;
  time: string;
  areaKey: string;
  plannedCount: number;
  assignee: string | null;
  recorded: { state: string; installedCount: number } | null;
  gate: { status: string; canStart: boolean; reason: string | null };
  past: boolean;
};

const MAX_PHOTOS = 12; // installation-core.ts MAX_DAY_PHOTOS
const BLOCKER_TYPES: [string, string][] = [
  ["stock_shortage", "Stock shortage"],
  ["access_denied", "Access denied"],
  ["site_condition", "Site condition"],
  ["count_discrepancy", "Count discrepancy"],
  ["equipment_fault", "Equipment fault"],
];
const field = "field min-h-[48px] text-[16px]";
type Photo = Omit<StoredPhoto, "id"> & { url: string };

/**
 * The three acts an installation asks of the crew on site, each saved on the
 * phone first and sent in order (docs/engineering/19-field-app.md §15). The
 * office judges them with its own rules when they arrive — the review gate,
 * the photo rule, the completion checks — and a refusal comes back named.
 */
export function InstallationForms({
  pipelineId,
  label,
  today,
  days,
  isOps,
  certificate,
  completionBlocks,
}: {
  pipelineId: string;
  label: string;
  today: string;
  days: FieldDay[];
  isOps: boolean;
  certificate: { signedLabel: string; signatory: string; billingLabel: string } | null;
  completionBlocks: string[];
}) {
  const outbox = useOutbox();
  const mine = outbox.items.filter((i) => (i.payload as { pipelineId?: string } | null)?.pipelineId === pipelineId);
  const queuedDays = new Set(mine.filter((i) => i.kind === "installation.day").map((i) => (i.payload as { plannedDayId: string }).plannedDayId));
  const certificateQueued = mine.some((i) => i.kind === "installation.certificate");
  const open = days.filter((d) => !d.recorded && !queuedDays.has(d.id) && d.gate.canStart);

  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = () => ({ id: crypto.randomUUID(), createdAt: Date.now(), refusals: 0, failures: 0, lastError: null, state: "pending" as const });

  async function save(item: OutboxItem, photos: StoredPhoto[], done: string): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      await enqueue([item], photos);
      void outbox.refresh().then(() => outbox.sendNow());
      setMsg({ tone: "ok", text: done });
      return true;
    } catch {
      setMsg({ tone: "bad", text: "Could not save on this phone. Try again." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ── the day ──
  const [dayId, setDayId] = useState(open[0]?.id ?? "");
  const chosen = days.find((d) => d.id === dayId) ?? null;
  const [installed, setInstalled] = useState("");
  const [removed, setRemoved] = useState("");
  const [skipped, setSkipped] = useState("");
  const [skippedReason, setSkippedReason] = useState("");
  const [location, setLocation] = useState("");
  const [workedOn, setWorkedOn] = useState(open[0] ? (open[0].past ? open[0].plannedDate : today) : today);
  const [waiver, setWaiver] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  // Previews are revoked when removed and when the page goes — never on a
  // change, which would blank the photos still on screen.
  const shown = useRef<Photo[]>([]);
  useEffect(() => {
    shown.current = photos;
  }, [photos]);
  useEffect(() => () => shown.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  // Keep the chosen day valid once one is saved (it leaves the open list).
  const firstOpen = open[0]?.id ?? "";
  const [prevFirst, setPrevFirst] = useState(firstOpen);
  if (prevFirst !== firstOpen) {
    setPrevFirst(firstOpen);
    if (!open.some((d) => d.id === dayId)) {
      setDayId(firstOpen);
      const d = open[0];
      if (d) setWorkedOn(d.past ? d.plannedDate : today);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const next: Photo[] = [];
    for (const f of Array.from(files).slice(0, room)) {
      const p = await preparePhoto(f);
      next.push({ ...p, url: URL.createObjectURL(p.blob) });
    }
    setPhotos((ps) => [...ps, ...next]);
  }

  async function saveDay() {
    if (!chosen) return;
    const n = (v: string) => (v.trim() === "" ? 0 : Number(v));
    const inst = n(installed);
    const skip = n(skipped);
    if (![inst, n(removed), skip].every((v) => Number.isInteger(v) && v >= 0)) return setMsg({ tone: "bad", text: "Counts must be whole numbers." });
    if (inst === 0 && skip === 0) return setMsg({ tone: "bad", text: "Record what was installed." });
    if (skip > 0 && !skippedReason.trim()) return setMsg({ tone: "bad", text: "Say why those fixtures were skipped — they stay in the outstanding scope." });
    if (photos.length === 0 && !chosen.past) return setMsg({ tone: "bad", text: "Take photos of the day's work — the society reviews the day against them." });
    if (photos.length === 0 && !waiver.trim()) return setMsg({ tone: "bad", text: "No photos for a past day — say why this record has none." });

    const stored: StoredPhoto[] = photos.map((p) => ({ id: crypto.randomUUID(), blob: p.blob, contentType: p.contentType, fileName: p.fileName }));
    const ok = await save(
      {
        ...base(),
        kind: "installation.day",
        payload: {
          pipelineId,
          plannedDayId: chosen.id,
          installedCount: inst,
          removedFittingsCount: n(removed),
          skippedCount: skip,
          skippedReason,
          locationDetail: location,
          workedOn,
          photosWaivedReason: photos.length === 0 ? waiver : "",
        },
        photoIds: stored.map((p) => p.id),
        label: `Day ${chosen.day} · ${inst} installed · ${label}`,
      },
      stored,
      `Day ${chosen.day} saved on this phone${stored.length ? ` with ${stored.length} photo${stored.length === 1 ? "" : "s"}` : ""} — sent to the office by itself.`,
    );
    if (ok) {
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setInstalled("");
      setRemoved("");
      setSkipped("");
      setSkippedReason("");
      setLocation("");
      setWaiver("");
    }
  }

  // ── a blocker ──
  const [bType, setBType] = useState("stock_shortage");
  const [bArea, setBArea] = useState("");
  const [bDetail, setBDetail] = useState("");
  const [bFound, setBFound] = useState("");
  const [bDate, setBDate] = useState("");

  async function saveBlocker() {
    if (!bDetail.trim()) return setMsg({ tone: "bad", text: "Describe the blocker — the office reads this, not the site." });
    if (bType === "count_discrepancy" && !(Number(bFound) > 0)) return setMsg({ tone: "bad", text: "A count discrepancy needs the count actually found on site." });
    const ok = await save(
      {
        ...base(),
        kind: "installation.blocker",
        payload: { pipelineId, type: bType, areaKey: bArea, detail: bDetail, affectedDate: bDate || null, discoveredLightCount: bType === "count_discrepancy" ? Number(bFound) : null },
        label: `Blocker: ${BLOCKER_TYPES.find(([k]) => k === bType)?.[1]} · ${label}`,
      },
      [],
      "Blocker saved on this phone — sent to the office by itself.",
    );
    if (ok) {
      setBDetail("");
      setBArea("");
      setBFound("");
      setBDate("");
    }
  }

  // ── the certificate ──
  const [cDate, setCDate] = useState(today);
  const [cName, setCName] = useState("");
  const [cRole, setCRole] = useState("");

  async function saveCertificate() {
    if (!cName.trim() || !cRole.trim()) return setMsg({ tone: "bad", text: "Record who signed and in what capacity." });
    await save(
      { ...base(), kind: "installation.certificate", payload: { pipelineId, signedAt: cDate, signatoryName: cName.trim(), signatoryRole: cRole.trim() }, label: `Completion certificate · ${label}` },
      [],
      "Certificate saved on this phone — the office checks every day is approved when it arrives.",
    );
  }

  const photoNote = useMemo(() => (photos.length ? `${photos.length} of ${MAX_PHOTOS}` : "none yet"), [photos.length]);

  return (
    <div className="space-y-4">
      {mine.length > 0 && (
        <section>
          <h2 className="lbl mb-2">On this phone · not sent yet</h2>
          <ul className="space-y-2">
            {mine.map((i) => (
              <WaitingItem key={i.seq} item={i} />
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Record a day</h2>
        {!chosen ? (
          <p className="text-[var(--text-muted)]">
            No day is open to record — each is recorded, saved on this phone, or waiting on the previous day&apos;s review.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <label htmlFor="iday" className="lbl">Day</label>
              <select
                id="iday"
                className={field}
                value={dayId}
                onChange={(e) => {
                  setDayId(e.target.value);
                  const d = days.find((x) => x.id === e.target.value);
                  if (d) setWorkedOn(d.past ? d.plannedDate : today);
                }}
              >
                {open.map((d) => (
                  <option key={d.id} value={d.id}>
                    Day {d.day} · {d.plannedLabel} · {d.areaKey} ({d.plannedCount})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="i-inst" className="lbl">Installed</label>
                <input id="i-inst" inputMode="numeric" className={`${field} num`} value={installed} onChange={(e) => setInstalled(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="i-rem" className="lbl">Old removed</label>
                <input id="i-rem" inputMode="numeric" className={`${field} num`} value={removed} onChange={(e) => setRemoved(e.target.value.replace(/\D/g, ""))} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="i-skip" className="lbl">Skipped</label>
                <input id="i-skip" inputMode="numeric" className={`${field} num`} value={skipped} onChange={(e) => setSkipped(e.target.value.replace(/\D/g, ""))} />
              </div>
            </div>
            {Number(skipped) > 0 && (
              <div className="space-y-1.5">
                <label htmlFor="i-skr" className="lbl">Why skipped</label>
                <input id="i-skr" className={field} value={skippedReason} onChange={(e) => setSkippedReason(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="i-loc" className="lbl">Where exactly (optional)</label>
              <input id="i-loc" className={field} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Tower B, floors 1–6" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="i-on" className="lbl">Work done on</label>
              <input id="i-on" type="date" className={field} value={workedOn} max={today} onChange={(e) => setWorkedOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="i-ph" className="lbl">Photos · {photoNote}</label>
              <input id="i-ph" type="file" accept="image/*" capture="environment" multiple className="block w-full" disabled={photos.length >= MAX_PHOTOS} onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
              {photos.length > 0 && (
                <ul className="grid grid-cols-4 gap-2">
                  {photos.map((p, i) => (
                    <li key={p.url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, not a served image */}
                      <img src={p.url} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-[var(--r-sm)] object-cover" />
                      <button type="button" className="absolute right-1 top-1 rounded bg-black/60 px-1.5 text-white" onClick={() => {
                          URL.revokeObjectURL(p.url);
                          setPhotos((ps) => ps.filter((x) => x !== p));
                        }} aria-label={`Remove photo ${i + 1}`}>
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {photos.length === 0 && chosen.past && (
              <div className="space-y-1.5">
                <label htmlFor="i-wv" className="lbl">No photos — why (recorded after the fact)</label>
                <input id="i-wv" className={field} value={waiver} onChange={(e) => setWaiver(e.target.value)} />
              </div>
            )}
            <button type="button" className="btn-primary w-full min-h-[52px]" disabled={busy} onClick={() => void saveDay()}>
              Save day {chosen.day}
            </button>
          </>
        )}
      </section>

      <details className="card p-4">
        <summary className="font-semibold min-h-[44px] flex items-center">Raise a blocker</summary>
        <div className="space-y-3 mt-3">
          <div className="space-y-1.5">
            <label htmlFor="b-type" className="lbl">What is in the way</label>
            <select id="b-type" className={field} value={bType} onChange={(e) => setBType(e.target.value)}>
              {BLOCKER_TYPES.map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="b-detail" className="lbl">Describe it</label>
            <textarea id="b-detail" className={`${field} min-h-[88px]`} value={bDetail} onChange={(e) => setBDetail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="b-area" className="lbl">Area (optional)</label>
              <input id="b-area" className={field} value={bArea} onChange={(e) => setBArea(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="b-date" className="lbl">Day affected (optional)</label>
              <input id="b-date" type="date" className={field} value={bDate} onChange={(e) => setBDate(e.target.value)} />
            </div>
          </div>
          {bType === "count_discrepancy" && (
            <div className="space-y-1.5">
              <label htmlFor="b-found" className="lbl">Lights actually found</label>
              <input id="b-found" inputMode="numeric" className={`${field} num`} value={bFound} onChange={(e) => setBFound(e.target.value.replace(/\D/g, ""))} />
              <p className="text-[var(--text-muted)]">This changes nothing billed by itself — the office decides on it.</p>
            </div>
          )}
          <button type="button" className="btn-secondary w-full min-h-[48px]" disabled={busy} onClick={() => void saveBlocker()}>
            Save the blocker
          </button>
        </div>
      </details>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Completion certificate</h2>
        {certificate ? (
          <p>
            Signed {certificate.signedLabel} by {certificate.signatory} · billing starts {certificate.billingLabel}.
          </p>
        ) : certificateQueued ? (
          <p className="text-[var(--text-muted)]">Saved on this phone — waiting to send.</p>
        ) : !isOps ? (
          <p className="text-[var(--text-muted)]">The operations lead records the society&apos;s signature once every day is approved.</p>
        ) : (
          <>
            {completionBlocks.length > 0 && (
              <div style={{ color: "var(--warn-fg)" }}>
                <p className="font-semibold">As the office last knew, not ready yet:</p>
                <ul className="list-disc pl-5">
                  {completionBlocks.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p>You can still save it; the office checks again when it arrives.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="c-date" className="lbl">Signed on</label>
              <input id="c-date" type="date" className={field} value={cDate} max={today} onChange={(e) => setCDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="c-name" className="lbl">Signed by</label>
              <input id="c-name" className={field} value={cName} onChange={(e) => setCName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="c-role" className="lbl">Their role</label>
              <input id="c-role" className={field} value={cRole} onChange={(e) => setCRole(e.target.value)} placeholder="e.g. Secretary" />
            </div>
            <button type="button" className="btn-secondary w-full min-h-[48px]" disabled={busy} onClick={() => void saveCertificate()}>
              Save the certificate
            </button>
          </>
        )}
      </section>

      {msg && (
        <p role={msg.tone === "bad" ? "alert" : "status"} className="card p-3" style={msg.tone === "ok" ? { background: "var(--ok-bg)", color: "var(--ok-fg)", borderColor: "var(--ok-line)" } : { background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
