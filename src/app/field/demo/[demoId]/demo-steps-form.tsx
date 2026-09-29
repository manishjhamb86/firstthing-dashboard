"use client";

import { useState } from "react";
import { StatusChip } from "@/components/ui";
import { enqueue, type OutboxItem } from "../../outbox-db";
import { useOutbox } from "../../outbox-provider";
import { WaitingItem } from "../../waiting-item";

type Line = {
  id: string;
  name: string;
  count: number;
  options: { id: string; name: string; wattage: number | null }[];
  current: { replacementTypeId: string | null; count: number | null; wattage: number | null; exclude: boolean };
};

type LineInput = { replacementTypeId: string; count: string; wattage: string; exclude: boolean };

const field = "field min-h-[48px] text-[16px]";

/**
 * The two on-site steps of a demo, saved on the phone and sent in order —
 * so a replacement saved after a meter install is applied after it, even if
 * both were done in a basement. The office re-checks everything with the back
 * office's own step code; a refusal comes back named under More.
 */
export function DemoStepsForm({
  demoId,
  label,
  editable,
  today,
  tolerancePct,
  expectedWatts,
  meters,
  recorded,
  replacementReady,
  lines,
}: {
  demoId: string;
  label: string;
  editable: boolean;
  today: string;
  tolerancePct: number;
  expectedWatts: number;
  meters: { id: string; name: string }[];
  recorded: { meterId: string | null; meterInstalledOn: string | null; displayedLoad: number | null; replacedOn: string | null };
  replacementReady: { assigned: boolean; booked: boolean };
  lines: Line[];
}) {
  const outbox = useOutbox();
  const mine = outbox.items.filter((i) => (i.payload as { demoId?: string } | null)?.demoId === demoId);
  const meterQueued = mine.some((i) => i.kind === "demo.meter");

  const [meterId, setMeterId] = useState(recorded.meterId ?? "");
  const [installedOn, setInstalledOn] = useState(recorded.meterInstalledOn ?? today);
  const [load, setLoad] = useState(recorded.displayedLoad !== null ? String(recorded.displayedLoad) : "");
  const [replacedOn, setReplacedOn] = useState(recorded.replacedOn ?? today);
  const [lineInputs, setLineInputs] = useState<Record<string, LineInput>>(() =>
    Object.fromEntries(
      lines.map((l) => {
        const first = l.options[0];
        return [
          l.id,
          {
            replacementTypeId: l.current.replacementTypeId ?? first?.id ?? "",
            count: String(l.current.count ?? l.count),
            wattage: String(l.current.wattage ?? first?.wattage ?? ""),
            exclude: l.current.exclude,
          },
        ];
      }),
    ),
  );
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadW = load.trim() === "" ? null : Number(load);
  const diffPct = loadW !== null && Number.isFinite(loadW) && expectedWatts > 0 ? (Math.abs(loadW - expectedWatts) / expectedWatts) * 100 : null;

  const base = () => ({ id: crypto.randomUUID(), createdAt: Date.now(), refusals: 0, failures: 0, lastError: null, state: "pending" as const });

  async function save(item: OutboxItem, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      await enqueue([item]);
      void outbox.refresh().then(() => outbox.sendNow());
      setMsg({ tone: "ok", text: done });
    } catch {
      setMsg({ tone: "bad", text: "Could not save on this phone. Try again." });
    } finally {
      setBusy(false);
    }
  }

  function saveMeter() {
    if (meterId && (loadW === null || !Number.isFinite(loadW) || loadW <= 0)) {
      setMsg({ tone: "bad", text: "Enter the load the meter displays, in watts." });
      return;
    }
    void save(
      {
        ...base(),
        kind: "demo.meter",
        payload: { demoId, meterId: meterId || null, installedOn, displayedLoad: loadW },
        label: `Meter & load test · ${label}`,
      },
      "Meter install saved on this phone — sent to the office by itself.",
    );
  }

  function saveReplacement() {
    const payloadLines = lines.map((l) => {
      const v = lineInputs[l.id];
      return { lineId: l.id, replacementTypeId: v.replacementTypeId, count: Number(v.count), wattage: Number(v.wattage), exclude: v.exclude };
    });
    if (lines.length > 0 && payloadLines.every((l) => l.exclude)) {
      setMsg({ tone: "bad", text: "At least one line has to be replaced — a demo with every fixture excluded measures no saving." });
      return;
    }
    for (const [i, l] of payloadLines.entries()) {
      if (l.exclude) continue;
      if (!l.replacementTypeId) return setMsg({ tone: "bad", text: `Choose what replaced the ${lines[i].name}.` });
      if (!Number.isInteger(l.count) || l.count < 1 || l.count > lines[i].count) {
        return setMsg({ tone: "bad", text: `Replaced count for ${lines[i].name} must be a whole number from 1 to ${lines[i].count}.` });
      }
      if (!Number.isFinite(l.wattage) || l.wattage <= 0) return setMsg({ tone: "bad", text: `Enter the wattage fitted on ${lines[i].name}.` });
    }
    void save(
      { ...base(), kind: "demo.replacement", payload: { demoId, replacedOn, lines: payloadLines }, label: `Light replacement · ${label}` },
      "Replacement saved on this phone — sent to the office by itself, after anything saved before it.",
    );
  }

  const meterOnRecordOrQueued = recorded.meterInstalledOn !== null || meterQueued;
  const replacementBlocked = !recorded.replacedOn && (!replacementReady.assigned || !replacementReady.booked);

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
        <h2 className="font-semibold">Meter &amp; load test</h2>
        <div className="space-y-1.5">
          <label htmlFor="dm-meter" className="lbl">Meter</label>
          <select id="dm-meter" className={field} value={meterId} onChange={(e) => setMeterId(e.target.value)} disabled={!editable}>
            <option value="">No meter (a paper demo, re-entered)</option>
            {meters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="dm-on" className="lbl">Went in on</label>
            <input id="dm-on" type="date" className={field} value={installedOn} max={today} onChange={(e) => setInstalledOn(e.target.value)} disabled={!editable} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dm-load" className="lbl">Load shown (W)</label>
            <input id="dm-load" inputMode="decimal" className={`${field} num`} value={load} onChange={(e) => setLoad(e.target.value.replace(/[^\d.]/g, ""))} disabled={!editable} />
          </div>
        </div>
        <p className="text-[var(--text-muted)]">
          The lights on this demo should draw about <span className="num font-semibold">{Math.round(expectedWatts)} W</span>.{" "}
          {diffPct !== null && (
            <StatusChip tone={diffPct <= tolerancePct ? "ok" : "warn"}>
              {diffPct.toFixed(1)}% off {diffPct <= tolerancePct ? "— within" : "— outside"} ±{tolerancePct}%
            </StatusChip>
          )}
        </p>
        {diffPct !== null && diffPct > tolerancePct && (
          <p style={{ color: "var(--warn-fg)" }}>
            It still saves. Recheck the light count, wattage and anything else on the circuit — or operations overrides it with a reason.
          </p>
        )}
        <button type="button" className="btn-primary w-full min-h-[52px]" disabled={!editable || busy} onClick={saveMeter}>
          {recorded.meterInstalledOn ? "Save the correction" : "Save meter install"}
        </button>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-semibold">Light replacement</h2>
        {replacementBlocked ? (
          <p style={{ color: "var(--warn-fg)" }}>
            {!replacementReady.assigned
              ? "Not assigned to a crew yet — the office assigns it before the replacement can be recorded."
              : "The replacement day is not booked yet — the office books it with the society first."}
          </p>
        ) : !meterOnRecordOrQueued ? (
          <p style={{ color: "var(--warn-fg)" }}>Save the meter install first — the replacement is dated against it.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              <label htmlFor="dr-on" className="lbl">Last light replaced on</label>
              <input id="dr-on" type="date" className={field} value={replacedOn} max={today} onChange={(e) => setReplacedOn(e.target.value)} disabled={!editable} />
            </div>
            {lines.length === 0 && (
              <p className="text-[var(--text-muted)]">This circuit has no fixture lines recorded — only the date is saved.</p>
            )}
            {lines.map((l) => {
              const v = lineInputs[l.id];
              const set = (p: Partial<LineInput>) => setLineInputs((x) => ({ ...x, [l.id]: { ...x[l.id], ...p } }));
              return (
                <div key={l.id} className="rounded-[var(--r-md)] border border-[var(--border)] p-3 space-y-3">
                  <p className="font-semibold">
                    {l.count} × {l.name}
                  </p>
                  <label className="flex items-center gap-2 min-h-[44px]">
                    <input type="checkbox" className="h-5 w-5" checked={v.exclude} onChange={(e) => set({ exclude: e.target.checked })} disabled={!editable} />
                    Not replaced — exclude from the benchmark
                  </label>
                  {!v.exclude && (
                    <>
                      <div className="space-y-1.5">
                        <label htmlFor={`dr-type-${l.id}`} className="lbl">Replaced with</label>
                        <select
                          id={`dr-type-${l.id}`}
                          className={field}
                          value={v.replacementTypeId}
                          onChange={(e) => {
                            const opt = l.options.find((o) => o.id === e.target.value);
                            set({ replacementTypeId: e.target.value, ...(opt?.wattage ? { wattage: String(opt.wattage) } : {}) });
                          }}
                          disabled={!editable}
                        >
                          {l.options.length === 0 && <option value="">No compatible device on record</option>}
                          {l.options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label htmlFor={`dr-count-${l.id}`} className="lbl">How many</label>
                          <input id={`dr-count-${l.id}`} inputMode="numeric" className={`${field} num`} value={v.count} onChange={(e) => set({ count: e.target.value.replace(/[^\d]/g, "") })} disabled={!editable} />
                        </div>
                        <div className="space-y-1.5">
                          <label htmlFor={`dr-watt-${l.id}`} className="lbl">Watts each</label>
                          <input id={`dr-watt-${l.id}`} inputMode="decimal" className={`${field} num`} value={v.wattage} onChange={(e) => set({ wattage: e.target.value.replace(/[^\d.]/g, "") })} disabled={!editable} />
                        </div>
                      </div>
                      {Number(v.count) < l.count && Number(v.count) > 0 && (
                        <p className="text-[var(--text-muted)]">{l.count - Number(v.count)} kept on this line — their share comes off the saving.</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            <button type="button" className="btn-primary w-full min-h-[52px]" disabled={!editable || busy} onClick={saveReplacement}>
              {recorded.replacedOn ? "Save the correction" : "Save the replacement"}
            </button>
          </>
        )}
      </section>

      {msg && (
        <p role={msg.tone === "bad" ? "alert" : "status"} className="card p-3" style={msg.tone === "ok" ? { background: "var(--ok-bg)", color: "var(--ok-fg)", borderColor: "var(--ok-line)" } : { background: "var(--bad-bg)", color: "var(--bad-fg)", borderColor: "var(--bad-line)" }}>
          {msg.text}
        </p>
      )}

      <p className="text-[var(--text-muted)]">
        Gate passes are approved online, and readings come from the meter — both stay in the back office.
      </p>
    </div>
  );
}
