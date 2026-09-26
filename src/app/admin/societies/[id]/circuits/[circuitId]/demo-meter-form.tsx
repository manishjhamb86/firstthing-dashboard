"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, ErrorText, Field } from "@/components/ui";
import { SearchSelect, type SearchSelectOption } from "@/components/search-select";
import { overrideDemoLoad, recordDemoMeter } from "./demo-step-actions";

/**
 * Meter install & load test for one demo (2026-09-26). The step picks the
 * meter — which writes the meter's history entry — and the day it went in, and
 * checks the displayed load against the circuit's lights. The meter is
 * optional for an old demo re-entered from paper; its days are then typed.
 */
export function DemoMeterForm({
  demoId,
  meters,
  meteredLightCount,
  wattage,
  canOverride,
  initial,
  failedPct,
}: {
  demoId: string;
  meters: SearchSelectOption[];
  meteredLightCount: number;
  wattage: number;
  canOverride: boolean;
  initial: { meterId: string | null; installedOn: string; displayedLoad: string; skipped: boolean };
  /** The recorded discrepancy when it is outside tolerance. */
  failedPct: number | null;
}) {
  const router = useRouter();
  const [meterId, setMeterId] = useState<string | null>(initial.meterId);
  const [skip, setSkip] = useState(initial.skipped);
  const [installedOn, setInstalledOn] = useState(initial.installedOn);
  const [load, setLoad] = useState(initial.displayedLoad);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const theoretical = meteredLightCount * wattage;

  function save() {
    setError(null);
    start(async () => {
      const r = await recordDemoMeter({
        demoId,
        meterId: skip ? null : meterId,
        installedOn,
        displayedLoad: load.trim() === "" ? null : Number(load),
      });
      if (r.error) setError(r.error);
      router.refresh();
    });
  }

  function override() {
    setError(null);
    start(async () => {
      const r = await overrideDemoLoad(demoId, reason);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Theoretical load: <span className="num">{meteredLightCount}</span> lights ×{" "}
        <span className="num">{wattage}</span> W = <span className="num">{theoretical}</span> W. The meter&apos;s displayed
        load has to be within ±10%.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} disabled={pending} />
        No meter for this demo — an old demo re-entered from its paper report; its days are typed by hand
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        {!skip && (
          <Field label="Meter" htmlFor="dm-meter" hint="Picking it records the meter on this circuit from the install date.">
            <SearchSelect id="dm-meter" options={meters} value={meterId} onCommit={setMeterId} placeholder="Type the meter's name…" />
          </Field>
        )}
        <Field label="Install date" htmlFor="dm-installed" hint="The pre-installation period starts after this day.">
          <input
            id="dm-installed"
            type="date"
            className="field"
            value={installedOn}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setInstalledOn(e.target.value)}
            disabled={pending}
          />
        </Field>
        <Field label={skip ? "Displayed load (W), if known" : "Meter's displayed load (W)"} htmlFor="dm-load">
          <input id="dm-load" type="number" className="field" value={load} onChange={(e) => setLoad(e.target.value)} disabled={pending} />
        </Field>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <button
        type="button"
        className="btn-primary"
        onClick={save}
        disabled={pending || !installedOn || (!skip && (!meterId || !load.trim()))}
      >
        {pending ? "Saving…" : "Save the meter install"}
      </button>

      {failedPct !== null && canOverride && (
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            The load was {failedPct.toFixed(1)}% off. Operations can override it (a known meter-display quirk) — recorded
            with the reason, never passed as normal.
          </p>
          <Field label="Override reason" htmlFor="dm-override">
            <input id="dm-override" className="field" value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} />
          </Field>
          <button type="button" className="btn-tone-warn" onClick={override} disabled={pending || !reason.trim()}>
            Override &amp; proceed
          </button>
        </div>
      )}
      {failedPct !== null && !canOverride && (
        <p className="text-xs text-[var(--text-muted)]">Only operations can override a failed load test.</p>
      )}
    </Card>
  );
}
