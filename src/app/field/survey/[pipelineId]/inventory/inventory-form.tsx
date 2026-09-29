"use client";

import { useState } from "react";
import { areaDisplay, areaKeyOf, contestedAreas, FIELD_AREA_TYPES, inventoryGaps } from "@/lib/survey-shell";
import { useOutbox } from "../../../outbox-provider";
import { newItem, saveOnPhone } from "../../../queue";
import { WaitingItem } from "../../../waiting-item";

export type Row = {
  id: string;
  area: string;
  areaKey: string;
  lightType: string;
  count: number;
  method: string;
  note: string;
  countedBy: string;
  countedByName: string;
  countedAt: string;
  onPhone?: boolean;
};

const field = "field min-h-[48px] text-[16px]";
const TYPE_LABEL = new Map(FIELD_AREA_TYPES);
const METHOD_LABEL: Record<string, string> = { walked: "Walked and counted", records: "Society's records", estimated: "Estimated" };

/**
 * SCR-011 on the phone. Rows saved here appear at once, marked "on this
 * phone"; the office's copy (as of the last load with signal) is shown with
 * them. Claims and contests are worked out from who counted each area.
 */
export function InventoryForm({
  surveyId,
  label,
  me,
  writable,
  state,
  rows,
  typeNames,
}: {
  surveyId: string;
  label: string;
  me: string;
  writable: boolean;
  state: string;
  rows: Row[];
  typeNames: string[];
}) {
  const outbox = useOutbox();
  const mine = outbox.items.filter((i) => (i.payload as { surveyId?: string } | null)?.surveyId === surveyId);

  // The office's rows with this phone's unsent changes laid over them.
  const all: Row[] = (() => {
    const removed = new Set(mine.filter((i) => i.kind === "survey.area_remove").map((i) => (i.payload as { rowId: string }).rowId));
    const settles = mine.filter((i) => i.kind === "survey.settle").map((i) => i.payload as { areaKey: string; keepCountedBy: string });
    const updates = new Map(mine.filter((i) => i.kind === "survey.area_update").map((i) => [(i.payload as { rowId: string }).rowId, i.payload as Partial<Row>]));
    const added: Row[] = mine
      .filter((i) => i.kind === "survey.area")
      .map((i) => {
        const p = i.payload as { rowId: string; areaType: string; label: string; lightType: string; count: number; method: string; note: string };
        const area = areaDisplay(TYPE_LABEL.get(p.areaType) ?? "Other", p.label, "");
        return { id: p.rowId, area, areaKey: areaKeyOf(p.areaType, p.label, area), lightType: p.lightType, count: p.count, method: p.method, note: p.note, countedBy: me, countedByName: "You", countedAt: "on this phone", onPhone: true };
      });
    return [...rows.filter((r) => !added.some((a) => a.id === r.id)), ...added]
      .filter((r) => !removed.has(r.id))
      .filter((r) => !settles.some((s) => s.areaKey === r.areaKey && s.keepCountedBy !== r.countedBy))
      .map((r) => (updates.has(r.id) ? { ...r, ...updates.get(r.id), onPhone: true } : r));
  })();

  const contests = contestedAreas(all.map((r) => ({ ...r, countedById: r.countedBy })));
  const uncontested = all.filter((r) => !contests.has(r.areaKey));
  const total = uncontested.reduce((n, r) => n + r.count, 0);
  const rollup = (() => {
    const m = new Map<string, { areas: number; lights: number }>();
    for (const r of uncontested) {
      const t = m.get(r.lightType) ?? { areas: 0, lights: 0 };
      t.areas += 1;
      t.lights += r.count;
      m.set(r.lightType, t);
    }
    return [...m.entries()];
  })();

  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const say = (tone: "ok" | "bad", text: string) => setMsg({ tone, text });

  // ── add an area ──
  const [areaType, setAreaType] = useState("staircase");
  const [areaLabel, setAreaLabel] = useState("");
  const [lightType, setLightType] = useState("Staircase");
  const [count, setCount] = useState("");
  const [method, setMethod] = useState("walked");
  const [note, setNote] = useState("");

  async function addArea() {
    const n = Number(count);
    if (!count || !Number.isInteger(n) || n < 1) return say("bad", "Enter how many lights are in this area.");
    if (!lightType.trim()) return say("bad", "Which type of lighting is this?");
    if (method === "estimated" && !note.trim()) return say("bad", "Say how the estimate was made — ops will see this.");
    if (n > 2000 && !confirm(`${n.toLocaleString("en-IN")} lights in one area? A mistyped digit is more likely than a stairwell that size.`)) return;
    const area = areaDisplay(TYPE_LABEL.get(areaType)!, areaLabel, "");
    const key = areaKeyOf(areaType, areaLabel, area);
    const other = all.find((r) => r.areaKey === key && r.countedBy !== me);
    if (other && !confirm(`${other.countedByName} counted ${area} (${other.countedAt}). Count it anyway? Both counts are kept and the area is contested until one is chosen.`)) return;
    const ok = await saveOnPhone(outbox, [
      newItem("survey.area", { surveyId, rowId: crypto.randomUUID(), areaType, label: areaLabel.trim(), lightType: lightType.trim(), count: n, method, note: note.trim() }, `${area}: ${n} lights · ${label}`),
    ]);
    if (ok) {
      setAreaLabel("");
      setCount("");
      setNote("");
      say("ok", `${area} saved on this phone.`);
    }
  }

  async function remove(r: Row) {
    if (!confirm(`Remove ${r.area} (${r.count} lights)?`)) return;
    await saveOnPhone(outbox, [newItem("survey.area_remove", { surveyId, rowId: r.id }, `Remove ${r.area} · ${label}`)]);
  }

  // ── settle a contest ──
  const [settleReason, setSettleReason] = useState<Record<string, string>>({});
  async function settle(key: string, keep: Row) {
    const reason = settleReason[key] ?? "";
    if (reason.trim().length < 5) return say("bad", "Say why this count is the right one — it is kept with the decision.");
    await saveOnPhone(outbox, [newItem("survey.settle", { surveyId, areaKey: key, keepCountedBy: keep.countedBy, reason }, `Settle ${keep.area}: keep ${keep.countedByName}'s count · ${label}`)]);
    say("ok", `Kept ${keep.countedByName}'s count for ${keep.area}.`);
  }

  // ── the section ──
  const gaps = inventoryGaps(all, [...contests.values()].map((l) => l[0].area));
  const [flagReason, setFlagReason] = useState("");
  const [flagging, setFlagging] = useState(false);
  async function complete() {
    if (gaps.length > 0) return say("bad", gaps.join(" "));
    const types = rollup.length;
    if (!confirm(`${total.toLocaleString("en-IN")} lights, ${types} type${types === 1 ? "" : "s"}. These counts are the billing basis for the whole term — nothing later re-counts them. Complete the section?`)) return;
    await saveOnPhone(outbox, [newItem("survey.section", { surveyId, section: "inventory", state: "complete", reason: "" }, `Inventory complete · ${label}`)]);
    say("ok", "Section marked complete.");
  }
  async function flag() {
    if (!flagReason.trim()) return say("bad", "Say why the count is incomplete.");
    await saveOnPhone(outbox, [newItem("survey.section", { surveyId, section: "inventory", state: "flagged", reason: flagReason }, `Inventory flagged · ${label}`)]);
    setFlagging(false);
    say("ok", "Section flagged — the office sees the reason and treats the roll-up as provisional.");
  }

  const dis = !writable;

  return (
    <div className="space-y-4">
      <section className="card p-4 sticky top-2 z-10" aria-live="polite">
        <p className="text-[20px] font-bold num">
          {total.toLocaleString("en-IN")} lights across {uncontested.length} area{uncontested.length === 1 ? "" : "s"}
        </p>
        {contests.size > 0 && <p style={{ color: "var(--warn-fg)" }}>{contests.size} contested area{contests.size === 1 ? " is" : "s are"} left out until settled.</p>}
      </section>

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

      {[...contests.entries()].map(([key, list]) => (
        <section key={key} className="card p-4 space-y-3" style={{ borderColor: "var(--warn-line)" }}>
          <h2 className="font-semibold">{list[0].area} — counted by {new Set(list.map((r) => r.countedBy)).size} people</h2>
          <p className="text-[var(--text-muted)]">Never added together. Choose the count that is right.</p>
          <input
            aria-label={`Why this count, ${list[0].area}`}
            placeholder="Why this count is right"
            className={field}
            disabled={dis}
            value={settleReason[key] ?? ""}
            onChange={(e) => setSettleReason((x) => ({ ...x, [key]: e.target.value }))}
          />
          <ul className="space-y-2">
            {[...new Map(list.map((r) => [r.countedBy, r])).values()].map((r) => {
              const theirs = list.filter((x) => x.countedBy === r.countedBy).reduce((n, x) => n + x.count, 0);
              return (
                <li key={r.countedBy} className="flex items-center justify-between gap-2 rounded-[var(--r-md)] border border-[var(--border)] p-3">
                  <span>
                    <span className="font-semibold num">{theirs}</span> by {r.countedByName}
                    <span className="text-[var(--text-muted)]"> · {r.countedAt}</span>
                  </span>
                  {!dis && (
                    <button type="button" className="btn-secondary min-h-[44px] px-3" onClick={() => void settle(key, r)}>
                      Keep this
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {rollup.length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">Extrapolation base — one circuit will be metered per type</h2>
          <ul className="mt-2 space-y-1">
            {rollup.map(([t, v]) => (
              <li key={t} className="flex justify-between gap-2">
                <span>
                  {t} <span className="text-[var(--text-muted)]">· {v.areas} area{v.areas === 1 ? "" : "s"}</span>
                </span>
                <span className="num font-semibold">{v.lights.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
          {rollup.some(([, v]) => v.lights < 50) && (
            <p className="mt-2" style={{ color: "var(--warn-fg)" }}>
              A type with fewer than 50 lights may have no eligible circuit — worth another walk while you are here.
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="lbl">Areas</h2>
        {uncontested.length === 0 && contests.size === 0 && (
          <p className="card p-4 text-[var(--text-muted)]">Add each area that has common lighting. Count basement and stilt parking separately.</p>
        )}
        <ul className="space-y-2">
          {uncontested.map((r) => (
            <li key={r.id} className="card p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold min-w-0">{r.area}</p>
                <p className="num font-semibold">{r.count}</p>
              </div>
              <p className="text-[var(--text-muted)]">
                {r.lightType} · {METHOD_LABEL[r.method] ?? r.method}
                {r.note ? ` — ${r.note}` : ""}
              </p>
              <p className="text-[var(--text-muted)]">
                {r.countedBy === me ? "You" : r.countedByName} · {r.countedAt}
                {r.onPhone ? " · on this phone" : ""}
              </p>
              {!dis && (
                <button type="button" className="underline min-h-[40px]" onClick={() => void remove(r)} aria-label={`Remove ${r.area}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {!dis && (
        <section className="card p-4 space-y-3">
          <h2 className="font-semibold">Add an area</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="in-type" className="lbl">Area</label>
              <select
                id="in-type"
                className={field}
                value={areaType}
                onChange={(e) => {
                  setAreaType(e.target.value);
                  const l = TYPE_LABEL.get(e.target.value);
                  if (l && e.target.value !== "other") setLightType(l);
                }}
              >
                {FIELD_AREA_TYPES.map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="in-label" className="lbl">Its name</label>
              <input id="in-label" className={field} value={areaLabel} placeholder="e.g. Tower B" maxLength={40} onChange={(e) => setAreaLabel(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="in-count" className="lbl">Lights</label>
              <input id="in-count" inputMode="numeric" className={`${field} num`} value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="in-light" className="lbl">Light type</label>
              <input id="in-light" list="in-light-types" className={field} value={lightType} onChange={(e) => setLightType(e.target.value)} />
              <datalist id="in-light-types">
                {typeNames.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="in-method" className="lbl">How was it counted</label>
            <select id="in-method" className={field} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="walked">Walked and counted</option>
              <option value="records">From the society&apos;s records</option>
              <option value="estimated">Estimated</option>
            </select>
          </div>
          {method === "estimated" && (
            <div className="space-y-1.5">
              <label htmlFor="in-note" className="lbl">How the estimate was made</label>
              <input id="in-note" className={field} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={() => void addArea()}>
            Add the area
          </button>
        </section>
      )}

      {!dis && (
        <section className="card p-4 space-y-3">
          <p>
            Section: <span className="font-semibold">{state.replace("_", " ")}</span>
          </p>
          {gaps.length > 0 && (
            <ul className="list-disc pl-5" style={{ color: "var(--warn-fg)" }}>
              {gaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
          <button type="button" className="btn-primary w-full min-h-[52px]" onClick={() => void complete()}>
            Complete this section
          </button>
          {flagging ? (
            <div className="space-y-2">
              <label htmlFor="in-flag" className="lbl">Why is the count incomplete?</label>
              <input id="in-flag" className={field} value={flagReason} placeholder="e.g. Tower D locked" onChange={(e) => setFlagReason(e.target.value)} />
              <button type="button" className="btn-secondary w-full min-h-[48px]" onClick={() => void flag()}>
                Flag the section
              </button>
            </div>
          ) : (
            <button type="button" className="underline min-h-[44px]" onClick={() => setFlagging(true)}>
              Leave it incomplete, with a reason
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
