"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ErrorText, Field } from "@/components/ui";
import { installFromSlip, moveSlipDue, returnFromSlip } from "../workflow-actions";

type Line = { itemTypeId: string; name: string; unit: string; tracking: string; held: number };
type Mode = null | "due" | "install" | "return";

/**
 * The back office's hand on an open slip: move its date, or record an install
 * or a return for the employee (when they could not do it from their phone).
 */
export function SlipActions({
  slip,
  lines,
  offices,
}: {
  slip: { id: string; dueOn: string; issuedOn: string; fromOfficeId: string; employee: string };
  lines: Line[];
  offices: { id: string; name: string }[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<Mode>(null);
  const [dueOn, setDueOn] = useState(slip.dueOn);
  const [on, setOn] = useState(today);
  const [officeId, setOfficeId] = useState(slip.fromOfficeId);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [faulty, setFaulty] = useState("");
  const [faultyWhy, setFaultyWhy] = useState("");
  const [error, setError] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ error?: string; done?: number; failed?: { code: string; error: string }[] }>, ok: string) {
    start(async () => {
      setError(undefined);
      setMsg(undefined);
      const r = await fn();
      if (r.error) return setError(r.error);
      const failed = r.failed?.length ? ` ${r.failed.length} not recorded: ${r.failed.map((f) => `${f.code} (${f.error})`).join(", ")}.` : "";
      setMsg(ok + failed);
      setMode(null);
      setQty({});
      setFaulty("");
      router.refresh();
    });
  }
  const slipLines = () => lines.map((l) => ({ itemTypeId: l.itemTypeId, quantity: Number(qty[l.itemTypeId]) || 0, codes: [] }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setMode(mode === "due" ? null : "due")}>
          Move the install date
        </button>
        {lines.length > 0 && (
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setMode(mode === "install" ? null : "install")}>
              Record an install for {slip.employee}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setMode(mode === "return" ? null : "return")}>
              Record a return for {slip.employee}
            </button>
          </>
        )}
      </div>

      {mode === "due" && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="New install-by date" htmlFor="sl-due">
            <input id="sl-due" type="date" className="field" value={dueOn} min={slip.issuedOn} onChange={(e) => setDueOn(e.target.value)} />
          </Field>
          <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => run(() => moveSlipDue(slip.id, dueOn), "Install date moved.")}>
            Save
          </button>
        </div>
      )}

      {(mode === "install" || mode === "return") && (
        <div className="flex flex-col gap-3 rounded-[var(--r-md)] border border-[var(--border-subtle)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={mode === "install" ? "Installed on" : "Returned on"} htmlFor="sl-on">
              <input id="sl-on" type="date" className="field" value={on} min={slip.issuedOn} max={today} onChange={(e) => setOn(e.target.value)} />
            </Field>
            {mode === "return" && (
              <Field label="Back to" htmlFor="sl-office">
                <select id="sl-office" className="field" value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {lines.map((l) => (
            <Field key={l.itemTypeId} label={`${l.name} — ${l.held.toLocaleString("en-IN")}${l.unit === "m" ? " m" : ""} held`} htmlFor={`sl-q-${l.itemTypeId}`}>
              <input id={`sl-q-${l.itemTypeId}`} className="field num" inputMode="decimal" value={qty[l.itemTypeId] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [l.itemTypeId]: e.target.value }))} placeholder="0" />
            </Field>
          ))}
          {mode === "return" && lines.some((l) => l.tracking === "serial") && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Faulty unit codes (optional)" htmlFor="sl-faulty" hint="They come back marked faulty; not counted in the boxes above.">
                <input id="sl-faulty" className="field num" value={faulty} onChange={(e) => setFaulty(e.target.value)} placeholder="B2611-002-00031" />
              </Field>
              <Field label="What is wrong with them" htmlFor="sl-why">
                <input id="sl-why" className="field" value={faultyWhy} onChange={(e) => setFaultyWhy(e.target.value)} />
              </Field>
            </div>
          )}
          <button
            type="button"
            className="btn-primary self-start"
            disabled={pending}
            onClick={() =>
              mode === "install"
                ? run(() => installFromSlip({ slipId: slip.id, on, circuitId: "", lines: slipLines() }), "Install recorded.")
                : run(
                    () =>
                      returnFromSlip({
                        slipId: slip.id,
                        on,
                        toOfficeId: officeId,
                        lines: slipLines(),
                        faulty: faulty.split(/[\s,]+/).filter(Boolean).map((code) => ({ code, reason: faultyWhy })),
                      }),
                    "Return recorded.",
                  )
            }
          >
            {pending ? "Recording…" : mode === "install" ? "Record install" : "Record return"}
          </button>
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {msg && <p className="text-[13px] text-[var(--ok-fg)]">{msg}</p>}
    </div>
  );
}
