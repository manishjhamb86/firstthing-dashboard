"use client";

import { useState, useTransition } from "react";
import { submitLoadValidation, overrideLoadValidation } from "./actions";

export function LoadValidationForm({
  circuitId,
  meteredLightCount,
  wattage,
  canOverride,
  lastDiscrepancyPct,
}: {
  circuitId: string;
  meteredLightCount: number;
  wattage: number;
  canOverride: boolean;
  lastDiscrepancyPct: number | null;
}) {
  // FEAT-011-AC-2 — the meter's live reading is never pre-filled; the
  // theoretical inputs are shown as reference (already recorded via
  // FEAT-007/FEAT-040), not retyped blind.
  const [meterDisplayedLoad, setMeterDisplayedLoad] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [failed, setFailed] = useState(lastDiscrepancyPct != null && lastDiscrepancyPct > 10);
  const [overrideReason, setOverrideReason] = useState("");
  const [pending, startTransition] = useTransition();

  const theoreticalLoad = meteredLightCount * wattage;

  function submit() {
    startTransition(async () => {
      const result = await submitLoadValidation(circuitId, Number(meterDisplayedLoad));
      if (result?.error) {
        setError(result.error);
        setFailed(true);
        return;
      }
      setError(undefined);
      setFailed(false);
    });
  }

  function submitOverride() {
    startTransition(async () => {
      const result = await overrideLoadValidation(circuitId, overrideReason);
      setError(result?.error);
    });
  }

  const fieldStyle = { borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" };

  return (
    <div className="max-w-md space-y-3">
      <p className="text-sm text-[var(--text-muted)]">
        Theoretical load (recorded): {meteredLightCount} lights × {wattage}W = {theoreticalLoad}W
      </p>
      <label className="block text-sm">
        Meter&apos;s displayed load (W)
        <input
          type="number"
          value={meterDisplayedLoad}
          onChange={(e) => setMeterDisplayedLoad(e.target.value)}
          disabled={pending}
          className="w-full border rounded-[var(--r-sm)] p-2 text-sm mt-1"
          style={fieldStyle}
        />
      </label>
      {error && (
        <p className="text-sm" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={pending || !meterDisplayedLoad.trim()}
        className="btn-primary text-sm disabled:opacity-60"
      >
        {pending ? "Validating…" : "Validate & confirm install"}
      </button>

      {failed && canOverride && (
        <div className="pt-3 mt-3 border-t border-[var(--border-subtle)] space-y-2">
          <p className="text-xs text-[var(--text-muted)]">
            PER-01 override (e.g. a known meter-display quirk) — recorded on the circuit&apos;s record, not
            silently accepted as a normal pass.
          </p>
          <input
            placeholder="Override reason"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            disabled={pending}
            className="w-full border rounded-[var(--r-sm)] p-2 text-sm"
            style={fieldStyle}
          />
          <button
            type="button"
            onClick={submitOverride}
            disabled={pending || !overrideReason.trim()}
            className="text-sm font-semibold disabled:opacity-60"
            style={{ color: "var(--accent)" }}
          >
            Override & proceed
          </button>
        </div>
      )}
      {failed && !canOverride && (
        <p className="text-xs text-[var(--text-muted)]">Only PER-01 can override a persistently failed validation.</p>
      )}
    </div>
  );
}
