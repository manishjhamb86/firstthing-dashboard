"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { codeFromScan } from "@/lib/inventory";
import { SerialScanButton } from "@/components/serial-scan";
import { enqueue } from "../../outbox-db";
import { useOutbox } from "../../outbox-provider";

type Line = { itemTypeId: string; name: string; unit: string; tracking: string; held: number };
type Mode = "install" | "return";
const fmt = (n: number, unit: string) => `${n.toLocaleString("en-IN")}${unit === "m" ? " m" : ""}`;

/**
 * Install or return what is held on a slip — saved on the phone and sent in
 * order (field-sync "stock.install" / "stock.return"), applied by the same
 * rules as the back office (stock-workflow.ts).
 *
 * Coded items are scanned (a code not on this slip is set aside here and named
 * again by the office); a count without scanning picks units held on the slip.
 */
export function SlipForm({
  slip,
  lines,
  units,
  offices,
  circuits,
  initialMode,
}: {
  slip: { id: string; code: string; society: string; issuedOn: string; fromOfficeId: string };
  lines: Line[];
  units: { code: string; itemTypeId: string }[];
  offices: { id: string; name: string }[];
  circuits: { id: string; label: string }[];
  initialMode: Mode;
}) {
  const router = useRouter();
  const outbox = useOutbox();
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [on, setOn] = useState(today);
  const [circuitId, setCircuitId] = useState(circuits.length === 1 ? circuits[0]!.id : "");
  const [officeId, setOfficeId] = useState(slip.fromOfficeId);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [scanned, setScanned] = useState<Record<string, string[]>>({});
  const [strays, setStrays] = useState<string[]>([]);
  const [faulty, setFaulty] = useState<Record<string, string>>({}); // code → what is wrong
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>();

  const unitByCode = new Map(units.map((u) => [u.code, u]));
  function onScan(text: string) {
    const code = codeFromScan(text);
    const u = unitByCode.get(code);
    if (!u) {
      setStrays((s) => (s.includes(code) ? s : [...s, code]));
      return;
    }
    setScanned((s) => {
      const have = s[u.itemTypeId] ?? [];
      return have.includes(code) ? s : { ...s, [u.itemTypeId]: [...have, code] };
    });
  }
  const amount = (l: Line) => (l.tracking === "serial" && (scanned[l.itemTypeId]?.length ?? 0) > 0 ? scanned[l.itemTypeId]!.length : Number(qty[l.itemTypeId]) || 0);
  const over = lines.find((l) => amount(l) > l.held + 1e-9);
  const faultyList = Object.entries(faulty);
  const total = lines.reduce((s, l) => s + amount(l), 0) + (mode === "return" ? faultyList.length : 0);
  const missingWhy = mode === "return" && faultyList.some(([, why]) => !why.trim());

  async function save() {
    setError(undefined);
    if (over) return setError(`${over.name}: only ${fmt(over.held, over.unit)} on this slip.`);
    if (missingWhy) return setError("Say what is wrong with each faulty unit.");
    if (total <= 0) return setError(mode === "install" ? "Scan or count what was installed." : "Enter what is coming back.");
    setSaving(true);
    const slipLines = lines
      .map((l) => ({ itemTypeId: l.itemTypeId, quantity: l.tracking === "serial" && scanned[l.itemTypeId]?.length ? 0 : Number(qty[l.itemTypeId]) || 0, codes: scanned[l.itemTypeId] ?? [] }))
      .filter((l) => l.quantity > 0 || l.codes.length > 0);
    const summary = lines
      .filter((l) => amount(l) > 0)
      .map((l) => `${fmt(amount(l), l.unit)} ${l.name}`)
      .join(", ");
    try {
      await enqueue([
        {
          id: crypto.randomUUID(),
          kind: mode === "install" ? "stock.install" : "stock.return",
          payload:
            mode === "install"
              ? { slipId: slip.id, on, circuitId, lines: slipLines }
              : { slipId: slip.id, on, toOfficeId: officeId, lines: slipLines, faulty: faultyList.map(([code, reason]) => ({ code, reason })) },
          label: `${mode === "install" ? "Installed at" : "Returned from"} ${slip.society} · ${summary || `${faultyList.length} faulty`}`,
          createdAt: Date.now(),
          refusals: 0,
          failures: 0,
          lastError: null,
          state: "pending",
        },
      ]);
      void outbox.refresh().then(() => outbox.sendNow());
      setSaved(mode === "install" ? "Install saved on this phone — it goes to the office as soon as there is signal." : "Return saved on this phone — it goes to the office as soon as there is signal.");
      setQty({});
      setScanned({});
      setFaulty({});
      setStrays([]);
      router.refresh();
    } catch {
      setError("Could not save on this phone. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 rounded-[var(--r-md)] border border-[var(--border)] p-1" role="tablist">
        {(["install", "return"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className="min-h-[44px] rounded-[var(--r-sm)] text-[15px] font-semibold"
            style={mode === m ? { background: "var(--accent)", color: "var(--text-on-accent)" } : undefined}
            onClick={() => {
              setMode(m);
              setError(undefined);
              setSaved(undefined);
            }}
          >
            {m === "install" ? "Install at site" : "Return to office"}
          </button>
        ))}
      </div>

      {saved && (
        <p role="status" className="rounded-[var(--r-md)] px-3.5 py-3 text-[14px]" style={{ background: "var(--ok-bg)", color: "var(--ok-fg)" }}>
          {saved}
        </p>
      )}

      {lines.length === 0 ? (
        <p className="text-[var(--text-muted)]">Nothing is left on this slip.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="lbl">{mode === "install" ? "Installed on" : "Returned on"}</span>
              <input type="date" className="field" min={slip.issuedOn} max={today} value={on} onChange={(e) => setOn(e.target.value)} />
            </label>
            {mode === "install" ? (
              circuits.length > 0 && (
                <label className="flex flex-col gap-1">
                  <span className="lbl">Circuit (optional)</span>
                  <select className="field" value={circuitId} onChange={(e) => setCircuitId(e.target.value)}>
                    <option value="">Not on a circuit</option>
                    {circuits.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )
            ) : (
              <label className="flex flex-col gap-1">
                <span className="lbl">Back to</span>
                <select className="field" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {lines.some((l) => l.tracking === "serial") && (
            <div className="card p-4">
              <p className="mb-2 font-semibold">Scan the labels</p>
              <SerialScanButton onScan={onScan} label="Open the camera" />
              {strays.length > 0 && (
                <p className="mt-2 text-[13.5px]" style={{ color: "var(--bad-fg)" }}>
                  Not on this slip, set aside: <span className="num">{strays.join(", ")}</span>
                </p>
              )}
            </div>
          )}

          {lines.map((l) => {
            const codes = scanned[l.itemTypeId] ?? [];
            return (
              <div key={l.itemTypeId} className="card flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-semibold">{l.name}</span>
                  <span className="num text-[13px] text-[var(--text-muted)]">{fmt(l.held, l.unit)} with you</span>
                </div>
                {l.tracking === "serial" && codes.length > 0 ? (
                  <>
                    <p className="text-[14px]">
                      Scanned <span className="num font-bold">{codes.length}</span> of {l.held}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {codes.map((c) => (
                        <span key={c} className="num rounded-md px-2 py-0.5 text-[12px]" style={{ background: "var(--ok-bg)", color: "var(--ok-fg)" }}>
                          …{c.slice(-6)}
                          {mode === "return" && (
                            <button
                              type="button"
                              className="ml-1.5 underline"
                              onClick={() => {
                                setScanned((s) => ({ ...s, [l.itemTypeId]: (s[l.itemTypeId] ?? []).filter((x) => x !== c) }));
                                setFaulty((f) => ({ ...f, [c]: f[c] ?? "" }));
                              }}
                            >
                              faulty
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                    <button type="button" className="btn-secondary btn-sm self-start" onClick={() => setScanned((s) => ({ ...s, [l.itemTypeId]: [] }))}>
                      Clear scans
                    </button>
                  </>
                ) : (
                  <label className="flex items-center gap-2">
                    <span className="sr-only">
                      How many {l.name} {mode === "install" ? "installed" : "coming back"}
                    </span>
                    <input className="field num w-[120px]" inputMode="decimal" value={qty[l.itemTypeId] ?? ""} placeholder="0" onChange={(e) => setQty((q) => ({ ...q, [l.itemTypeId]: e.target.value }))} />
                    <span className="text-[14px] text-[var(--text-muted)]">{l.unit === "m" ? "metres" : l.tracking === "serial" ? "— or scan them" : "pieces"}</span>
                  </label>
                )}
              </div>
            );
          })}

          {mode === "return" && faultyList.length > 0 && (
            <div className="card flex flex-col gap-3 p-4">
              <p className="font-semibold">Coming back faulty</p>
              {faultyList.map(([code, why]) => (
                <label key={code} className="flex flex-col gap-1">
                  <span className="text-[13px]">
                    <span className="num font-semibold">{code}</span> — what&apos;s wrong
                  </span>
                  <input className="field" value={why} onChange={(e) => setFaulty((f) => ({ ...f, [code]: e.target.value }))} placeholder="e.g. Sensor doesn't trigger" />
                </label>
              ))}
              <p className="text-[12.5px] text-[var(--text-muted)]">Faulty units go back marked faulty and are held for checking.</p>
            </div>
          )}
          {mode === "return" && lines.some((l) => l.tracking === "serial") && (
            <p className="text-[12.5px] text-[var(--text-muted)]">To return a unit as faulty, scan it and tap &ldquo;faulty&rdquo; on its code.</p>
          )}
        </>
      )}

      {error && (
        <p role="alert" className="text-[14px]" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}

      {lines.length > 0 && (
        <div className="sticky bottom-[72px] -mx-4 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <button type="button" className="btn-primary min-h-[52px] w-full text-[15px]" disabled={saving || total <= 0} onClick={save}>
            {saving
              ? "Saving…"
              : total <= 0
                ? mode === "install"
                  ? "Scan or count what was installed"
                  : "Enter what is coming back"
                : `${mode === "install" ? "Record" : "Return"} ${total.toLocaleString("en-IN")} item${total === 1 ? "" : "s"}${mode === "install" ? " installed" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
