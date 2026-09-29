"use client";

import { useState } from "react";
import { lightTypeKey } from "@/lib/light-type";
import type { StoredPhoto } from "../../../outbox-db";
import { useOutbox } from "../../../outbox-provider";
import { preparePhoto } from "../../../photo";
import { newItem, saveOnPhone } from "../../../queue";
import { WaitingItem } from "../../../waiting-item";

export type TypeCard = {
  key: string;
  label: string;
  surveyed: number;
  circuits: { id: string; location: string; state: string; metered: number; represented: number | null }[];
  unresolvable: string | null;
};

type Line = { deviceTypeId: string; count: string; wattage: string; hours: string; excluded: boolean };
type Photo = { blob: Blob; contentType: string; fileName: string; url: string };

const field = "field min-h-[48px] text-[16px]";
const MAX_PHOTOS = 12;
const STATE: Record<string, { label: string; color: string }> = {
  eligible: { label: "Eligible", color: "var(--ok-fg)" },
  surveyed: { label: "Waiting on an operations exception", color: "var(--warn-fg)" },
  ineligible: { label: "Not eligible — kept on record", color: "var(--bad-fg)" },
};

/**
 * SCR-012 on the phone: one card per light type from the inventory. The CON-16
 * checklist is recorded criterion by criterion, never as one tick; the panel is
 * photographed; and the one question nothing else can check — is this circuit
 * typical of the rest? — is answered here, in writing, by the person who saw both.
 */
export function CircuitsForm({
  surveyId,
  label,
  writable,
  state,
  types,
  catalog,
}: {
  surveyId: string;
  label: string;
  writable: boolean;
  state: string;
  types: TypeCard[];
  catalog: { id: string; name: string; defaultWattage: number | null }[];
}) {
  const outbox = useOutbox();
  const mine = outbox.items.filter((i) => (i.payload as { surveyId?: string } | null)?.surveyId === surveyId);
  const queuedFor = (key: string) =>
    mine.filter((i) => (i.kind === "survey.circuit" || i.kind === "survey.unresolvable") && lightTypeKey((i.payload as { lightType: string }).lightType) === key);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const say = (tone: "ok" | "bad", text: string) => setMsg({ tone, text });

  // the open candidate
  const [location, setLocation] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [wifi, setWifi] = useState<"" | "yes" | "no">("");
  const [height, setHeight] = useState<"" | "yes" | "no">("");
  const [ramp, setRamp] = useState<"" | "yes" | "no">("");
  const [typical, setTypical] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [unres, setUnres] = useState("");

  function start(key: string) {
    setOpen(key);
    setLocation("");
    setLines([{ deviceTypeId: "", count: "", wattage: "", hours: "24", excluded: false }]);
    setWifi("");
    setHeight("");
    setRamp("");
    setTypical("");
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setUnres("");
    setMsg(null);
  }
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  // Every fitting on the circuit counts — the meter sees them all, kept ones included.
  const metered = lines.reduce((n, l) => n + (Number(l.count) || 0), 0);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const next: Photo[] = [];
    for (const f of Array.from(files).slice(0, MAX_PHOTOS - photos.length)) {
      const p = await preparePhoto(f);
      next.push({ ...p, url: URL.createObjectURL(p.blob) });
    }
    setPhotos((ps) => [...ps, ...next]);
  }

  async function saveCircuit(t: TypeCard) {
    if (!location.trim()) return say("bad", "Name the panel and where it is, so the installer finds it.");
    const bad = lines.find((l) => !l.deviceTypeId || !(Number(l.count) >= 1) || !(Number(l.wattage) > 0) || !(Number(l.hours) > 0 && Number(l.hours) <= 24));
    if (lines.length === 0 || bad) return say("bad", "Every fixture line needs its device, count, wattage and hours.");
    if (!wifi || !height || !ramp) return say("bad", "Answer all three checks — an incomplete checklist can't be confirmed.");
    if (typical.trim().length < 20) return say("bad", `Say why this circuit represents the other ${t.surveyed.toLocaleString("en-IN")} ${t.label} lights — same fixtures, hours, switching.`);
    if (photos.length === 0) return say("bad", "Photograph the panel — the installer finds the circuit by it.");
    const circuitId = crypto.randomUUID();
    const stored: StoredPhoto[] = photos.map((p) => ({ id: crypto.randomUUID(), blob: p.blob, contentType: p.contentType, fileName: p.fileName }));
    const ok = await saveOnPhone(
      outbox,
      [
        newItem(
          "survey.circuit",
          {
            surveyId,
            circuitId,
            lightType: t.label,
            location: location.trim(),
            lines: lines.map((l) => ({ deviceTypeId: l.deviceTypeId, count: Number(l.count), wattage: Number(l.wattage), hoursPerDay: Number(l.hours), excludedFromCalculation: l.excluded })),
            workingHours: Number(lines[0].hours) || null,
            wifiReachable: wifi === "yes",
            fixturesUnder15ft: height === "yes",
            notOnDrivewayOrRamp: ramp === "yes",
            typicalityNote: typical.trim(),
          },
          `${t.label} circuit: ${location.trim()} · ${label}`,
          { photoIds: stored.map((p) => p.id), upload: { purpose: "survey", surveyId, subject: "circuit", subjectKey: circuitId } },
        ),
      ],
      stored,
    );
    if (!ok) return say("bad", "Could not save on this phone. Try again.");
    const hardFail = wifi === "no" || height === "no" || ramp === "no";
    setOpen(null);
    say(
      hardFail ? "bad" : "ok",
      hardFail
        ? "Saved — but a failed check makes it ineligible. It stays on record; pick another circuit for this type, or say none is eligible."
        : metered < 50
          ? `Saved. With ${metered} lights it is under the 50-light minimum, so it waits on an operations exception — you can still finish the survey.`
          : "Circuit saved on this phone — sent with its panel photos.",
    );
  }

  async function saveUnresolvable(t: TypeCard) {
    if (unres.trim().length < 10) return say("bad", "Say what you found — the office decides from this.");
    await saveOnPhone(outbox, [newItem("survey.unresolvable", { surveyId, lightType: t.label, reason: unres.trim() }, `No eligible circuit: ${t.label} · ${label}`)]);
    setOpen(null);
    say("ok", `Recorded: no eligible circuit for ${t.label}. The office will leave it out of the deal or approve an exception.`);
  }

  async function complete() {
    const open = types.filter((t) => {
      const q = queuedFor(t.key);
      return !t.unresolvable && !t.circuits.some((c) => c.state !== "ineligible") && q.length === 0;
    });
    if (types.length === 0) return say("bad", "Count the lighting first — that decides which circuits are needed.");
    if (open.length > 0) return say("bad", open.map((t) => `${t.label}: select a circuit, or say why none is eligible.`).join(" "));
    await saveOnPhone(outbox, [newItem("survey.section", { surveyId, section: "circuits", state: "complete", reason: "" }, `Circuits complete · ${label}`)]);
    say("ok", "Section marked complete — the office checks every type again when it arrives.");
  }

  const dis = !writable;
  const resolved = types.filter((t) => t.unresolvable || t.circuits.some((c) => c.state !== "ineligible") || queuedFor(t.key).length > 0).length;

  return (
    <div className="space-y-4">
      <p className="card p-3">
        <span className="font-semibold">{resolved} of {types.length}</span> light types resolved
      </p>
      {types.length === 0 && (
        <p className="card p-4">
          Count the lighting first — that decides which circuits are needed.
        </p>
      )}
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

      {types.map((t) => (
        <section key={t.key} className="card p-4 space-y-3">
          <div>
            <h2 className="font-semibold">{t.label}</h2>
            <p className="text-[var(--text-muted)]">{t.surveyed.toLocaleString("en-IN")} lights in the inventory — one circuit will be metered for all of them.</p>
          </div>
          {t.circuits.map((c) => (
            <p key={c.id} style={{ color: STATE[c.state]?.color }}>
              {c.location || "A circuit"} · {c.metered} lights · {STATE[c.state]?.label ?? c.state}
            </p>
          ))}
          {t.unresolvable && <p style={{ color: "var(--warn-fg)" }}>No eligible circuit: {t.unresolvable}</p>}

          {!dis && open !== t.key && (
            <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={() => start(t.key)}>
              {t.circuits.length ? "Record another candidate" : "Select a circuit"}
            </button>
          )}
          {!dis && open === t.key && (
            <div className="space-y-3 border-t border-[var(--border-subtle)] pt-3">
              <div className="space-y-1.5">
                <label htmlFor={`cc-loc-${t.key}`} className="lbl">Panel / DB and where it is</label>
                <input id={`cc-loc-${t.key}`} className={field} value={location} placeholder="e.g. DB-3, Tower B stilt" onChange={(e) => setLocation(e.target.value)} />
              </div>
              <p className="lbl">What is on this circuit</p>
              {lines.map((l, i) => (
                <div key={i} className="rounded-[var(--r-md)] border border-[var(--border)] p-3 space-y-2">
                  <select
                    aria-label={`Device ${i + 1}`}
                    className={field}
                    value={l.deviceTypeId}
                    onChange={(e) => {
                      const d = catalog.find((c) => c.id === e.target.value);
                      setLine(i, { deviceTypeId: e.target.value, wattage: l.wattage || (d?.defaultWattage ? String(d.defaultWattage) : "") });
                    }}
                  >
                    <option value="">Choose the fitting</option>
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <input aria-label={`Count ${i + 1}`} placeholder="Count" inputMode="numeric" className={`${field} num`} value={l.count} onChange={(e) => setLine(i, { count: e.target.value.replace(/\D/g, "") })} />
                    <input aria-label={`Watts ${i + 1}`} placeholder="W each" inputMode="decimal" className={`${field} num`} value={l.wattage} onChange={(e) => setLine(i, { wattage: e.target.value.replace(/[^\d.]/g, "") })} />
                    <input aria-label={`Hours ${i + 1}`} placeholder="h/day" inputMode="numeric" className={`${field} num`} value={l.hours} onChange={(e) => setLine(i, { hours: e.target.value.replace(/\D/g, "") })} />
                  </div>
                  <label className="flex items-center gap-2 min-h-[40px]">
                    <input type="checkbox" className="h-5 w-5" checked={l.excluded} onChange={(e) => setLine(i, { excluded: e.target.checked })} />
                    On the circuit but not being replaced
                  </label>
                </div>
              ))}
              <button type="button" className="underline min-h-[40px]" onClick={() => setLines((ls) => [...ls, { deviceTypeId: "", count: "", wattage: "", hours: ls[0]?.hours ?? "24", excluded: false }])}>
                + Another fitting on this circuit
              </button>
              <p className="text-[var(--text-muted)]">{metered} lights on this circuit{metered > 0 && metered < 50 ? " — under the 50-light minimum; it will wait on an operations exception" : ""}.</p>

              {(
                [
                  ["WiFi or LAN reachable within 20–40 m", wifi, setWifi, "cc-wifi"],
                  ["Fixtures at 15 ft or lower", height, setHeight, "cc-height"],
                  ["Not on a driveway or ramp", ramp, setRamp, "cc-ramp"],
                ] as const
              ).map(([q, v, setV, id]) => (
                <fieldset key={id} className="space-y-1">
                  <legend className="lbl">{q}</legend>
                  <div className="flex gap-4">
                    {(["yes", "no"] as const).map((a) => (
                      <label key={a} className="flex items-center gap-2 min-h-[44px]">
                        <input type="radio" name={`${id}-${t.key}`} className="h-5 w-5" checked={v === a} onChange={() => setV(a)} />
                        {a === "yes" ? "Yes" : "No"}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}

              <div className="space-y-1.5">
                <label htmlFor={`cc-typ-${t.key}`} className="lbl">Is it typical of the rest?</label>
                <textarea
                  id={`cc-typ-${t.key}`}
                  className={`${field} min-h-[88px]`}
                  value={typical}
                  placeholder={`What makes this circuit representative of the other ${t.surveyed.toLocaleString("en-IN")} ${t.label} lights — same fixtures, same hours, same switching?`}
                  onChange={(e) => setTypical(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`cc-ph-${t.key}`} className="lbl">Photo of the panel · {photos.length ? `${photos.length}` : "required"}</label>
                <input id={`cc-ph-${t.key}`} type="file" accept="image/*" capture="environment" multiple className="block w-full" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
                {photos.length > 0 && (
                  <ul className="grid grid-cols-4 gap-2">
                    {photos.map((p, i) => (
                      <li key={p.url}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview */}
                        <img src={p.url} alt={`Panel photo ${i + 1}`} className="aspect-square w-full rounded-[var(--r-sm)] object-cover" />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <button type="button" className="btn-primary w-full min-h-[52px]" onClick={() => void saveCircuit(t)}>
                Save this circuit
              </button>

              <div className="space-y-1.5 border-t border-[var(--border-subtle)] pt-3">
                <label htmlFor={`cc-un-${t.key}`} className="lbl">No eligible circuit for {t.label}?</label>
                <input id={`cc-un-${t.key}`} className={field} value={unres} placeholder="Say what you found" onChange={(e) => setUnres(e.target.value)} />
                <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={() => void saveUnresolvable(t)}>
                  Record that none is eligible
                </button>
              </div>
              <button type="button" className="underline min-h-[40px]" onClick={() => setOpen(null)}>
                Cancel
              </button>
            </div>
          )}
        </section>
      ))}

      {!dis && types.length > 0 && (
        <section className="card p-4 space-y-2">
          <p>
            Section: <span className="font-semibold">{state.replace("_", " ")}</span>
          </p>
          <button type="button" className="btn-primary w-full min-h-[52px]" onClick={() => void complete()}>
            Complete this section
          </button>
        </section>
      )}

      {msg && (
        <p role={msg.tone === "bad" ? "alert" : "status"} className="card p-3" style={msg.tone === "ok" ? { background: "var(--ok-bg)", color: "var(--ok-fg)", borderColor: "var(--ok-line)" } : { background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

