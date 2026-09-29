"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Plus, Trash2 } from "lucide-react";
import { circuitLabelOf } from "@/lib/circuit-label";
import { monthLabel } from "@/lib/format-date";
import { parseInspectionPayload, SENSOR_STATUSES, type FieldInspectionPayload, type SensorStatus } from "@/lib/field-sync";
import { refuseInspectionFinalize, SENSOR_STATUS_META } from "@/lib/inspection";
import type { InspectionCircuitChoice, InspectionSocietyChoice } from "@/lib/inspection-choices";
import { clearDraft, enqueue, readDraft, writeDraft, type OutboxItem, type StoredPhoto } from "../../outbox-db";
import { useOutbox } from "../../outbox-provider";
import { preparePhoto } from "../../photo";

type Finding = FieldInspectionPayload["findings"][number];

type Draft = {
  societyId: string;
  circuitId: string;
  period: string;
  inspectedAt: string;
  total: string;
  totalTouched: boolean;
  repName: string;
  notes: string;
  findings: Finding[];
  photo: { blob: Blob; contentType: string; fileName: string } | null;
};

const DRAFT_KEY = "inspection-new";
const emptyFinding = (): Finding => ({ location: "", sensorStatus: "off", physicalDamage: false, actionReplace: false, remarks: "" });

export function FieldInspectionForm({
  societies,
  circuits,
  initialPeriod,
  initialInspectedAt,
}: {
  societies: InspectionSocietyChoice[];
  circuits: InspectionCircuitChoice[];
  initialPeriod: string;
  initialInspectedAt: string;
}) {
  const router = useRouter();
  const outbox = useOutbox();
  const [d, setD] = useState<Draft>({
    societyId: "",
    circuitId: "",
    period: initialPeriod,
    inspectedAt: initialInspectedAt,
    total: "",
    totalTouched: false,
    repName: "",
    notes: "",
    findings: [],
    photo: null,
  });
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loaded = useRef(false);

  // A form in progress lives on the phone, not just in this tab: a closed
  // tab, a dead battery or a phone call loses nothing (05-field.md §0.1).
  useEffect(() => {
    let alive = true;
    readDraft<Draft>(DRAFT_KEY)
      .then((saved) => {
        if (!alive) return;
        if (saved) {
          setD(saved);
          setRestored(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => void writeDraft(DRAFT_KEY, d).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [d]);

  const societyCircuits = useMemo(() => circuits.filter((c) => c.societyId === d.societyId), [circuits, d.societyId]);
  const circuit = societyCircuits.find((c) => c.id === d.circuitId) ?? null;
  const society = societies.find((s) => s.id === d.societyId) ?? null;

  const photoUrl = useMemo(() => (d.photo ? URL.createObjectURL(d.photo.blob) : null), [d.photo]);
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const setFinding = (i: number, patch: Partial<Finding>) =>
    setD((prev) => ({ ...prev, findings: prev.findings.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));

  function chooseCircuit(id: string) {
    const c = societyCircuits.find((x) => x.id === id);
    // The total starts at every light the circuit has — until someone types.
    set({ circuitId: id, ...(c && !d.totalTouched ? { total: String(c.representedLightCount) } : {}) });
  }

  async function takePhoto(file: File | undefined) {
    if (!file) return;
    set({ photo: await preparePhoto(file) });
  }

  async function save() {
    setError(null);
    const payload = {
      societyId: d.societyId,
      circuitId: d.circuitId || null,
      period: d.period,
      inspectedAt: d.inspectedAt,
      totalLightsChecked: d.total.trim() === "" ? NaN : Number(d.total),
      societyRepName: d.repName,
      notes: d.notes,
      findings: d.findings,
    };
    // The same checks the server makes, before anything is saved — so a
    // mistake is fixed here, not discovered after it has queued.
    const parsed = parseInspectionPayload(payload);
    if ("error" in parsed) return setError(parsed.error);
    const refusal = refuseInspectionFinalize({
      totalLightsChecked: parsed.totalLightsChecked,
      findings: parsed.findings.map((f, i) => ({ ...f, srNo: i + 1 })),
    });
    if (refusal) return setError(refusal);

    setSaving(true);
    try {
      const itemId = crypto.randomUUID();
      const label = `Inspection · ${society?.name ?? "society"} · ${monthLabel(d.period)}`;
      const base = { createdAt: Date.now(), refusals: 0, failures: 0, lastError: null, state: "pending" as const };
      const items: OutboxItem[] = [{ id: itemId, kind: "inspection.file", payload: parsed, label, ...base }];
      const photos: StoredPhoto[] = [];
      if (d.photo) {
        const photoId = crypto.randomUUID();
        photos.push({ id: photoId, ...d.photo });
        items.push({
          id: crypto.randomUUID(),
          kind: "inspection.photo",
          payload: { inspectionItemId: itemId },
          photoId,
          label: `Signed checklist photo · ${society?.name ?? "society"} · ${monthLabel(d.period)}`,
          ...base,
        });
      }
      // Saved on the phone first — only then is it anyone's job to send it.
      await enqueue(items, photos);
      await clearDraft(DRAFT_KEY);
      void outbox.refresh().then(() => outbox.sendNow());
      router.push("/field/inspections?saved=1");
    } catch {
      setError("Could not save on this phone. Nothing was lost from the form — try Save again.");
      setSaving(false);
    }
  }

  async function discardDraft() {
    if (!confirm("Clear this form? What you have typed will be lost.")) return;
    await clearDraft(DRAFT_KEY);
    setD({
      societyId: "",
      circuitId: "",
      period: initialPeriod,
      inspectedAt: initialInspectedAt,
      total: "",
      totalTouched: false,
      repName: "",
      notes: "",
      findings: [],
      photo: null,
    });
    setRestored(false);
  }

  const field = "field min-h-[48px] text-[16px]";

  return (
    <div className="space-y-5">
      {restored && (
        <div className="card p-3 flex items-center justify-between gap-3" style={{ background: "var(--info-bg)", borderColor: "var(--info-line)" }}>
          <span>Picked up where you left off.</span>
          <button type="button" className="underline font-semibold min-h-[44px]" onClick={discardDraft}>
            Start over
          </button>
        </div>
      )}

      <section className="card p-4 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="fi-society" className="lbl">Society</label>
          <select id="fi-society" className={field} value={d.societyId} onChange={(e) => set({ societyId: e.target.value, circuitId: "" })}>
            <option value="">Choose the society…</option>
            {societies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.location}
              </option>
            ))}
          </select>
        </div>

        {d.societyId && (
          <div className="space-y-1.5">
            <label htmlFor="fi-circuit" className="lbl">Circuit</label>
            <select id="fi-circuit" className={field} value={d.circuitId} onChange={(e) => chooseCircuit(e.target.value)}>
              <option value="">No specific circuit (whole society)</option>
              {societyCircuits.map((c) => (
                <option key={c.id} value={c.id}>
                  {circuitLabelOf(c.location, c.lightType)} — {c.representedLightCount} lights
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="fi-period" className="lbl">For month</label>
            <input id="fi-period" type="month" className={field} value={d.period} onChange={(e) => set({ period: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="fi-when" className="lbl">Inspected at</label>
            <input id="fi-when" type="datetime-local" className={field} value={d.inspectedAt} onChange={(e) => set({ inspectedAt: e.target.value })} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="lbl">Faulty fixtures · {d.findings.length}</h2>
        {d.findings.length === 0 && (
          <p className="text-[var(--text-muted)]">None yet. Add each faulty or notable fixture as you find it; healthy ones are not listed.</p>
        )}
        {d.findings.map((f, i) => (
          <div key={i} className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Fixture {i + 1}</span>
              <button
                type="button"
                aria-label={`Remove fixture ${i + 1}`}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center"
                onClick={() => setD((p) => ({ ...p, findings: p.findings.filter((_, j) => j !== i) }))}
              >
                <Trash2 size={20} aria-hidden />
              </button>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`fi-loc-${i}`} className="lbl">Location</label>
              <input id={`fi-loc-${i}`} className={field} value={f.location} placeholder="Tower B, level 3 lobby" onChange={(e) => setFinding(i, { location: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`fi-sensor-${i}`} className="lbl">Sensor</label>
              <select id={`fi-sensor-${i}`} className={field} value={f.sensorStatus} onChange={(e) => setFinding(i, { sensorStatus: e.target.value as SensorStatus })}>
                {SENSOR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {SENSOR_STATUS_META[s].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <label className="flex items-center gap-2 min-h-[44px]">
                <input type="checkbox" className="h-5 w-5" checked={f.physicalDamage} onChange={(e) => setFinding(i, { physicalDamage: e.target.checked })} />
                Physical damage
              </label>
              <label className="flex items-center gap-2 min-h-[44px]">
                <input type="checkbox" className="h-5 w-5" checked={f.actionReplace} onChange={(e) => setFinding(i, { actionReplace: e.target.checked })} />
                To be replaced
              </label>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`fi-rem-${i}`} className="lbl">Remarks</label>
              <input id={`fi-rem-${i}`} className={field} value={f.remarks} onChange={(e) => setFinding(i, { remarks: e.target.value })} />
            </div>
          </div>
        ))}
        <button
          type="button"
          className="w-full min-h-[48px] rounded-[var(--r-md)] border border-dashed border-[var(--field-border)] font-semibold flex items-center justify-center gap-2"
          style={{ color: "var(--accent-deep)" }}
          onClick={() => setD((p) => ({ ...p, findings: [...p.findings, emptyFinding()] }))}
        >
          <Plus size={20} aria-hidden /> Add a faulty fixture
        </button>
      </section>

      <section className="card p-4 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="fi-total" className="lbl">Total lights checked</label>
          <input
            id="fi-total"
            inputMode="numeric"
            className={`${field} num`}
            value={d.total}
            onChange={(e) => set({ total: e.target.value.replace(/[^\d]/g, ""), totalTouched: true })}
          />
          {circuit && <p className="text-[var(--text-muted)]">This circuit has {circuit.representedLightCount} lights.</p>}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="fi-rep" className="lbl">Society representative</label>
          <input id="fi-rep" className={field} value={d.repName} placeholder="Name of whoever signed" onChange={(e) => set({ repName: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="fi-notes" className="lbl">Notes</label>
          <textarea id="fi-notes" className="field text-[16px]" rows={3} value={d.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
        <div className="space-y-2">
          <span className="lbl block">Photo of the signed checklist</span>
          {photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- a local blob preview
            <img src={photoUrl} alt="The signed checklist, as photographed" className="w-full max-h-64 object-contain rounded-[var(--r-md)] border border-[var(--border)]" />
          )}
          <label className="w-full min-h-[48px] rounded-[var(--r-md)] border border-[var(--field-border)] font-semibold flex items-center justify-center gap-2 cursor-pointer">
            <Camera size={20} aria-hidden />
            {d.photo ? "Retake the photo" : "Take a photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Photo of the signed checklist"
              onChange={(e) => void takePhoto(e.target.files?.[0])}
            />
          </label>
          <p className="text-[var(--text-muted)]">Optional. Both signatures and the stamp in one frame. It uploads after the inspection itself.</p>
        </div>
      </section>

      {error && (
        <p role="alert" className="card p-3" style={{ background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          {error}
        </p>
      )}

      {/* One primary action, in a sticky bar above the tabs (05-field.md §0.4). */}
      <div className="sticky bottom-[76px] z-10 pt-2 pb-1 bg-[var(--surface-sunken)]">
        <button type="button" className="btn-primary w-full min-h-[52px] text-[16px]" disabled={saving || !d.societyId} onClick={save}>
          {saving ? "Saving…" : "Save inspection"}
        </button>
        <p className="text-center text-[var(--text-muted)] mt-1">Saved on this phone first, then sent — with or without signal.</p>
      </div>
    </div>
  );
}
