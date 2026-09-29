"use client";

import { useState } from "react";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CONDITIONS,
  generateUnits,
  pumpRoomGaps,
  refuseStructure,
  type Condition,
  type GeneratedUnit,
  type PumpStructure,
  type UnitAnswer,
} from "@/lib/pump-room";
import { monthLabel as formatMonthLabel } from "@/lib/format-date";
import type { StoredPhoto } from "../../../outbox-db";
import { useOutbox } from "../../../outbox-provider";
import { preparePhoto } from "../../../photo";
import { newItem, saveOnPhone } from "../../../queue";
import { WaitingItem } from "../../../waiting-item";

const field = "field min-h-[52px] text-[16px]";
const EMPTY: PumpStructure = { pumpType: "", pumpHp: null, pumpCount: null, feedPipe: "", outflowPipe: "", vfdArrangement: "", towers: [{ name: "Tower A", tanks: [{ type: "", capacityL: null }] }] };
const batch = () => Math.random().toString(36).slice(2, 10).padEnd(8, "0");

type Photo = { blob: Blob; contentType: string; fileName: string; url: string };

/**
 * SCR-013 on the phone. Two passes: the room's structure (six or seven
 * answers), then the units it implies, already named by tower and tank.
 * "Copy from" fills brand, model and condition from an answered unit — the
 * photo is still its own, because condition is per unit.
 */
export function PumpRoomForm({
  surveyId,
  label,
  writable,
  state,
  flagReason,
  structure,
  answers,
  logbookNotMaintained,
  logbookMonthsWithPages,
  months,
}: {
  surveyId: string;
  label: string;
  writable: boolean;
  state: string;
  flagReason: string | null;
  structure: PumpStructure | null;
  answers: Record<string, UnitAnswer>;
  logbookNotMaintained: boolean;
  logbookMonthsWithPages: string[];
  months: string[];
}) {
  const outbox = useOutbox();
  const mine = outbox.items.filter((i) => (i.payload as { surveyId?: string } | null)?.surveyId === surveyId);
  const last = <T,>(kind: string) => [...mine].reverse().find((i) => i.kind === kind)?.payload as T | undefined;

  // The office's copy with this phone's unsent changes laid over it.
  const queuedStructure = last<{ structure: PumpStructure }>("survey.pump_structure")?.structure;
  const shownStructure = queuedStructure ?? structure;
  const allAnswers: Record<string, UnitAnswer> = { ...answers };
  for (const i of mine.filter((x) => x.kind === "survey.pump_unit")) {
    const p = i.payload as { unitKey: string; installed: boolean; brand: string; model: string; condition: Condition | null };
    const before = allAnswers[p.unitKey]?.photos ?? 0;
    allAnswers[p.unitKey] = { installed: p.installed, brand: p.brand, model: p.model, condition: p.condition, photos: before + (i.photoIds?.length ?? 0) };
  }
  const queuedLogbook = last<{ notMaintained: boolean }>("survey.logbook");
  const notMaintained = queuedLogbook ? queuedLogbook.notMaintained : logbookNotMaintained;
  const pageMonths = new Set([...logbookMonthsWithPages, ...mine.filter((i) => i.kind === "survey.logbook_page").map((i) => (i.payload as { month: string }).month)]);

  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const say = (tone: "ok" | "bad", text: string) => setMsg({ tone, text });
  const dis = !writable;

  // ── pass 1 ──
  const [editing, setEditing] = useState(!shownStructure);
  const [s, setS] = useState<PumpStructure>(shownStructure ?? EMPTY);
  const set = (patch: Partial<PumpStructure>) => setS((x) => ({ ...x, ...patch }));
  const setTower = (ti: number, patch: Partial<PumpStructure["towers"][number]>) => setS((x) => ({ ...x, towers: x.towers.map((t, i) => (i === ti ? { ...t, ...patch } : t)) }));
  const setTank = (ti: number, ki: number, patch: Partial<{ type: string; capacityL: number | null }>) =>
    setTower(ti, { tanks: s.towers[ti].tanks.map((k, i) => (i === ki ? { ...k, ...patch } : k)) });

  async function saveStructure() {
    const refusal = refuseStructure(s);
    if (refusal) return say("bad", refusal);
    const before = shownStructure ? generateUnits(shownStructure).map((u) => u.unitKey) : [];
    const after = new Set(generateUnits(s).map((u) => u.unitKey));
    const dropped = before.filter((k) => !after.has(k) && allAnswers[k]?.installed !== null && allAnswers[k] !== undefined);
    if (dropped.length > 0 && !confirm(`${dropped.length} answered unit${dropped.length === 1 ? "" : "s"} will be removed by this change. Continue?`)) return;
    const ok = await saveOnPhone(outbox, [newItem("survey.pump_structure", { surveyId, structure: s }, `Pump room structure · ${label}`)]);
    if (ok) {
      setEditing(false);
      say("ok", `Saved on this phone — ${after.size} units to go through.`);
    }
  }

  // ── pass 2 ──
  const units = shownStructure ? generateUnits(shownStructure) : [];
  const answered = units.filter((u) => allAnswers[u.unitKey]?.installed === false || (allAnswers[u.unitKey]?.installed === true && (allAnswers[u.unitKey]?.photos ?? 0) > 0)).length;
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [installed, setInstalled] = useState<"" | "yes" | "no">("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [condition, setCondition] = useState<Condition | "">("");
  const [photos, setPhotos] = useState<Photo[]>([]);

  function openRow(u: GeneratedUnit) {
    const a = allAnswers[u.unitKey];
    setOpenUnit(u.unitKey);
    setInstalled(a?.installed === true ? "yes" : a?.installed === false ? "no" : "");
    setBrand(a?.brand ?? "");
    setModel(a?.model ?? "");
    setCondition(a?.condition ?? "");
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
  }
  async function addPhotos(files: FileList | null, into: (p: Photo[]) => void, have: Photo[]) {
    if (!files) return;
    const next: Photo[] = [];
    for (const f of Array.from(files).slice(0, 12 - have.length)) {
      const p = await preparePhoto(f);
      next.push({ ...p, url: URL.createObjectURL(p.blob) });
    }
    into([...have, ...next]);
  }
  async function saveUnit(u: GeneratedUnit) {
    if (!installed) return say("bad", "Is one fitted here?");
    const had = allAnswers[u.unitKey]?.photos ?? 0;
    if (installed === "yes") {
      if (!brand.trim() || !model.trim()) return say("bad", "Brand and model — read it off the label, or write 'label unreadable'.");
      if (!condition) return say("bad", "What condition is it in?");
      if (had + photos.length === 0) return say("bad", `Photograph this one — an installed item without a photo isn't a complete audit.`);
    }
    const b = batch();
    const stored: StoredPhoto[] = installed === "yes" ? photos.map((p) => ({ id: crypto.randomUUID(), blob: p.blob, contentType: p.contentType, fileName: p.fileName })) : [];
    const ok = await saveOnPhone(
      outbox,
      [
        newItem(
          "survey.pump_unit",
          { surveyId, unitKey: u.unitKey, installed: installed === "yes", brand, model, condition: condition || null, photoBatch: b },
          `${u.label} — ${CATEGORY_LABEL[u.category].toLowerCase()} · ${label}`,
          stored.length ? { photoIds: stored.map((p) => p.id), upload: { purpose: "survey", surveyId, subject: "pump_unit", subjectKey: `${u.unitKey}.${b}` } } : {},
        ),
      ],
      stored,
    );
    if (ok) {
      setOpenUnit(null);
      say("ok", `${u.label} saved on this phone.`);
    }
  }
  function copyFrom(key: string) {
    const a = allAnswers[key];
    if (!a) return;
    setInstalled("yes");
    setBrand(a.brand);
    setModel(a.model);
    setCondition(a.condition ?? "");
  }

  // ── logbook ──
  const [lbMonth, setLbMonth] = useState(months[0]);
  const [lbPhotos, setLbPhotos] = useState<Photo[]>([]);
  async function saveLogbookPages() {
    if (lbPhotos.length === 0) return say("bad", "Photograph the page.");
    const b = batch();
    const stored: StoredPhoto[] = lbPhotos.map((p) => ({ id: crypto.randomUUID(), blob: p.blob, contentType: p.contentType, fileName: p.fileName }));
    const ok = await saveOnPhone(
      outbox,
      [
        newItem("survey.logbook_page", { surveyId, month: lbMonth, photoBatch: b }, `Logbook ${formatMonthLabel(lbMonth)} · ${label}`, {
          photoIds: stored.map((p) => p.id),
          upload: { purpose: "survey", surveyId, subject: "logbook", subjectKey: `${lbMonth}.${b}` },
        }),
      ],
      stored,
    );
    if (ok) {
      setLbPhotos([]);
      say("ok", `Logbook page for ${formatMonthLabel(lbMonth)} saved on this phone.`);
    }
  }
  async function toggleNotMaintained(v: boolean) {
    await saveOnPhone(outbox, [newItem("survey.logbook", { surveyId, notMaintained: v }, `Logbook ${v ? "not maintained" : "maintained"} · ${label}`)]);
  }

  // ── section ──
  const gaps = pumpRoomGaps({ structure: shownStructure, answers: new Map(Object.entries(allAnswers)), logbookNotMaintained: notMaintained, logbookPages: pageMonths.size });
  const [flagging, setFlagging] = useState(false);
  const [flagText, setFlagText] = useState("");
  async function complete() {
    if (gaps.length > 0) return say("bad", gaps.slice(0, 4).join(" ") + (gaps.length > 4 ? ` …and ${gaps.length - 4} more.` : ""));
    const unknown = units.filter((u) => allAnswers[u.unitKey]?.condition === "unknown");
    if (unknown.length && !confirm(`${unknown.length} unit${unknown.length === 1 ? " is" : "s are"} in unknown condition. Complete anyway?`)) return;
    await saveOnPhone(outbox, [newItem("survey.section", { surveyId, section: "pump_room", state: "complete", reason: "" }, `Pump room complete · ${label}`)]);
    say("ok", "Section marked complete.");
  }
  async function flag() {
    if (!flagText.trim()) return say("bad", "Say why — e.g. the pump room is locked.");
    await saveOnPhone(outbox, [newItem("survey.section", { surveyId, section: "pump_room", state: "flagged", reason: flagText }, `Pump room flagged · ${label}`)]);
    setFlagging(false);
    say("ok", "Flagged. The lighting survey is unaffected; pump automation can't be quoted until someone gets in.");
  }

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
        <h2 className="font-semibold">The room</h2>
        {!editing && shownStructure ? (
          <>
            <p>
              {shownStructure.pumpCount} × {shownStructure.pumpHp} HP {shownStructure.pumpType} · feed {shownStructure.feedPipe} · outflow {shownStructure.outflowPipe}
              {shownStructure.vfdArrangement === "shared" ? " · one shared VFD" : ""}
            </p>
            <p className="text-[var(--text-muted)]">
              {shownStructure.towers.map((t) => `${t.name}: ${t.tanks.length} tank${t.tanks.length === 1 ? "" : "s"}`).join(" · ")}
            </p>
            {!dis && (
              <button type="button" className="underline min-h-[44px]" onClick={() => { setS(shownStructure); setEditing(true); }}>
                Change the room
              </button>
            )}
          </>
        ) : (
          <>
            <p className="text-[var(--text-muted)]">Start with the room: how many pumps, how many towers, how many tanks. The equipment list builds itself from that.</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-3">
                <label htmlFor="pr-type" className="lbl">Pump type</label>
                <input id="pr-type" className={field} disabled={dis} value={s.pumpType} placeholder="e.g. Centrifugal" onChange={(e) => set({ pumpType: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pr-hp" className="lbl">HP each</label>
                <input id="pr-hp" inputMode="decimal" className={`${field} num`} disabled={dis} value={s.pumpHp ?? ""} onChange={(e) => set({ pumpHp: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pr-count" className="lbl">Pumps</label>
                <input id="pr-count" inputMode="numeric" className={`${field} num`} disabled={dis} value={s.pumpCount ?? ""} onChange={(e) => set({ pumpCount: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pr-vfd" className="lbl">VFDs</label>
                <select id="pr-vfd" className={field} disabled={dis} value={s.vfdArrangement} onChange={(e) => set({ vfdArrangement: e.target.value as PumpStructure["vfdArrangement"] })}>
                  <option value="">One per pump</option>
                  <option value="shared">One shared</option>
                </select>
              </div>
              <div className="space-y-1.5 col-span-3 grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label htmlFor="pr-feed" className="lbl">Feed pipe</label>
                  <input id="pr-feed" className={field} disabled={dis} value={s.feedPipe} placeholder="e.g. 2 in" onChange={(e) => set({ feedPipe: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="pr-out" className="lbl">Outflow pipe</label>
                  <input id="pr-out" className={field} disabled={dis} value={s.outflowPipe} placeholder="e.g. 3 in" onChange={(e) => set({ outflowPipe: e.target.value })} />
                </div>
              </div>
            </div>
            {s.towers.map((t, ti) => (
              <div key={ti} className="rounded-[var(--r-md)] border border-[var(--border)] p-3 space-y-2">
                <input aria-label={`Tower ${ti + 1} name`} className={field} disabled={dis} value={t.name} onChange={(e) => setTower(ti, { name: e.target.value })} />
                {t.tanks.map((k, ki) => (
                  <div key={ki} className="grid grid-cols-2 gap-2">
                    <input aria-label={`${t.name || `Tower ${ti + 1}`} tank ${ki + 1} type`} placeholder={`Tank ${ki + 1} type`} className={field} disabled={dis} value={k.type} onChange={(e) => setTank(ti, ki, { type: e.target.value })} />
                    <input aria-label={`${t.name || `Tower ${ti + 1}`} tank ${ki + 1} litres`} placeholder="Litres" inputMode="numeric" className={`${field} num`} disabled={dis} value={k.capacityL ?? ""} onChange={(e) => setTank(ti, ki, { capacityL: e.target.value === "" ? null : Number(e.target.value.replace(/\D/g, "")) })} />
                  </div>
                ))}
                {!dis && (
                  <div className="flex gap-4">
                    <button type="button" className="underline min-h-[44px]" onClick={() => setTower(ti, { tanks: [...t.tanks, { type: t.tanks[0]?.type ?? "", capacityL: t.tanks[0]?.capacityL ?? null }] })}>
                      + Tank
                    </button>
                    {t.tanks.length > 0 && (
                      <button type="button" className="underline min-h-[44px]" onClick={() => setTower(ti, { tanks: t.tanks.slice(0, -1) })}>
                        − Tank
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!dis && (
              <>
                <button type="button" className="underline min-h-[44px]" onClick={() => set({ towers: [...s.towers, { name: `Tower ${String.fromCharCode(65 + s.towers.length)}`, tanks: [{ type: s.towers[0]?.tanks[0]?.type ?? "", capacityL: s.towers[0]?.tanks[0]?.capacityL ?? null }] }] })}>
                  + Tower
                </button>
                <button type="button" className="btn-secondary w-full min-h-[52px]" onClick={() => void saveStructure()}>
                  Save the room
                </button>
              </>
            )}
          </>
        )}
      </section>

      {units.length > 0 && (
        <section className="space-y-3">
          <p className="card p-3 font-semibold">{answered} of {units.length} units recorded</p>
          {CATEGORY_ORDER.map((cat) => {
            const list = units.filter((u) => u.category === cat);
            if (!list.length) return null;
            return (
              <details key={cat} className="card p-4" open={list.some((u) => allAnswers[u.unitKey]?.installed == null)}>
                <summary className="font-semibold min-h-[44px] flex items-center">{CATEGORY_LABEL[cat]} · {list.length}</summary>
                <ul className="space-y-2 mt-2">
                  {list.map((u) => {
                    const a = allAnswers[u.unitKey];
                    const done = a?.installed === false || (a?.installed === true && a.photos > 0);
                    return (
                      <li key={u.unitKey} className="rounded-[var(--r-md)] border border-[var(--border)] p-3">
                        <button type="button" className="w-full text-left min-h-[44px]" disabled={dis} onClick={() => openRow(u)} aria-label={`${u.label}, ${CATEGORY_LABEL[u.category]}`}>
                          <span className="font-semibold">{u.label}</span>
                          <span className="block text-[var(--text-muted)]">
                            {a?.installed === false ? "Not fitted" : a?.installed ? `${a.brand} ${a.model} · ${CONDITIONS.find(([k]) => k === a.condition)?.[1] ?? ""}${a.photos ? ` · ${a.photos} photo${a.photos === 1 ? "" : "s"}` : " · needs a photo"}` : "Not answered"}
                            {done ? " ✓" : ""}
                          </span>
                        </button>
                        {openUnit === u.unitKey && (
                          <div className="space-y-3 mt-2">
                            <div className="flex gap-6">
                              {(["yes", "no"] as const).map((v) => (
                                <label key={v} className="flex items-center gap-2 min-h-[52px] text-[18px]">
                                  <input type="radio" name={`pu-${u.unitKey}`} className="h-6 w-6" checked={installed === v} onChange={() => setInstalled(v)} />
                                  {v === "yes" ? "Fitted" : "Not fitted"}
                                </label>
                              ))}
                            </div>
                            {installed === "yes" && (
                              <>
                                {units.some((x) => x.category === u.category && x.unitKey !== u.unitKey && allAnswers[x.unitKey]?.installed) && (
                                  <select aria-label="Copy from" className={field} value="" onChange={(e) => copyFrom(e.target.value)}>
                                    <option value="">Same as… (copies brand, model, condition)</option>
                                    {units.filter((x) => x.category === u.category && x.unitKey !== u.unitKey && allAnswers[x.unitKey]?.installed).map((x) => (
                                      <option key={x.unitKey} value={x.unitKey}>{x.label}</option>
                                    ))}
                                  </select>
                                )}
                                <input aria-label="Brand" placeholder="Brand" className={field} value={brand} onChange={(e) => setBrand(e.target.value)} />
                                <input aria-label="Model" placeholder="Model" className={field} value={model} onChange={(e) => setModel(e.target.value)} />
                                <select aria-label="Condition" className={field} value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
                                  <option value="">Condition</option>
                                  {CONDITIONS.map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                  ))}
                                </select>
                                <label className="lbl" htmlFor={`pu-ph-${u.unitKey}`}>Photo of this one {photos.length ? `· ${photos.length}` : ""}</label>
                                <input id={`pu-ph-${u.unitKey}`} type="file" accept="image/*" capture="environment" multiple className="block w-full" onChange={(e) => { void addPhotos(e.target.files, setPhotos, photos); e.target.value = ""; }} />
                              </>
                            )}
                            <button type="button" className="btn-primary w-full min-h-[52px]" onClick={() => void saveUnit(u)}>
                              Save {u.label}
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </section>
      )}

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Logbook</h2>
        <p className="text-[var(--text-muted)]">This month and up to 12 back. Fewer than 12 is normal — gaps show as gaps.</p>
        <ul className="grid grid-cols-7 gap-1" aria-label="Months photographed">
          {[...months].reverse().map((m) => (
            <li key={m} title={formatMonthLabel(m)} className="rounded text-center text-xs py-1" style={{ background: pageMonths.has(m) ? "var(--ok-bg)" : "var(--surface-2, var(--border-subtle))", color: pageMonths.has(m) ? "var(--ok-fg)" : "var(--text-muted)" }}>
              {m.slice(5)}
            </li>
          ))}
        </ul>
        {!dis && (
          <>
            <label className="flex items-center gap-2 min-h-[48px]">
              <input type="checkbox" className="h-6 w-6" checked={notMaintained} onChange={(e) => void toggleNotMaintained(e.target.checked)} />
              The room keeps no logbook
            </label>
            {!notMaintained && (
              <div className="space-y-2">
                <select aria-label="Logbook month" className={field} value={lbMonth} onChange={(e) => setLbMonth(e.target.value)}>
                  {months.map((m) => (
                    <option key={m} value={m}>{formatMonthLabel(m)}</option>
                  ))}
                </select>
                <input aria-label="Logbook page photo" type="file" accept="image/*" capture="environment" multiple className="block w-full" onChange={(e) => { void addPhotos(e.target.files, setLbPhotos, lbPhotos); e.target.value = ""; }} />
                <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={() => void saveLogbookPages()}>
                  Save {lbPhotos.length ? `${lbPhotos.length} page${lbPhotos.length === 1 ? "" : "s"}` : "the page"} for {formatMonthLabel(lbMonth)}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {!dis && (
        <section className="card p-4 space-y-3">
          <p>
            Section: <span className="font-semibold">{state.replace("_", " ")}</span>
            {state === "flagged" && flagReason ? ` — ${flagReason}` : ""}
          </p>
          <button type="button" className="btn-primary w-full min-h-[52px]" onClick={() => void complete()}>
            Complete this section
          </button>
          {flagging ? (
            <div className="space-y-2">
              <input aria-label="Why no pump room audit" className={field} value={flagText} placeholder="e.g. pump room locked" onChange={(e) => setFlagText(e.target.value)} />
              <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={() => void flag()}>
                Flag the section
              </button>
            </div>
          ) : (
            <button type="button" className="underline min-h-[44px]" onClick={() => setFlagging(true)}>
              No access — flag it with a reason
            </button>
          )}
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
