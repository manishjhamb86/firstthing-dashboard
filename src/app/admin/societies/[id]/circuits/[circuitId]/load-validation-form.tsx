"use client";

import { useState, useTransition } from "react";
import { submitLoadValidation, overrideLoadValidation } from "./actions";
import { Card, ErrorText, Field } from "@/components/ui";

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
  // Defaults to today, because that is the normal case — the meter is being
  // validated as it goes in. Editable because a circuit commissioned before
  // this system has a real install date in the past, and that date sets the
  // pre-install window start.
  const [installedOn, setInstalledOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | undefined>();
  const [failed, setFailed] = useState(lastDiscrepancyPct != null && lastDiscrepancyPct > 10);
  const [overrideReason, setOverrideReason] = useState("");
  const [pending, startTransition] = useTransition();

  const theoreticalLoad = meteredLightCount * wattage;

  function submit() {
    startTransition(async () => {
      const result = await submitLoadValidation(circuitId, Number(meterDisplayedLoad), installedOn);
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
      const result = await overrideLoadValidation(circuitId, overrideReason, installedOn);
      setError(result?.error);
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Theoretical load (recorded): <span className="num">{meteredLightCount}</span> lights ×{" "}
        <span className="num">{wattage}</span>W = <span className="num">{theoreticalLoad}</span>W
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Meter's displayed load (W)" htmlFor="lv-load">
          <input
            id="lv-load"
            type="number"
            value={meterDisplayedLoad}
            onChange={(e) => setMeterDisplayedLoad(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
        <Field
          label="Install date"
          htmlFor="lv-installed"
          hint="Today unless this is an older circuit — the baseline window starts the day after."
        >
          <input
            id="lv-installed"
            type="date"
            value={installedOn}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setInstalledOn(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <button
        type="button"
        onClick={submit}
        disabled={pending || !meterDisplayedLoad.trim()}
        className="btn-primary"
      >
        {pending ? "Validating…" : "Validate & confirm install"}
      </button>

      {failed && canOverride && (
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            PER-01 override (e.g. a known meter-display quirk) — recorded on the circuit&apos;s record, not
            silently accepted as a normal pass.
          </p>
          <Field label="Override reason" htmlFor="lv-override">
            <input
              id="lv-override"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
          <button
            type="button"
            onClick={submitOverride}
            disabled={pending || !overrideReason.trim()}
            className="btn-tone-warn"
          >
            Override & proceed
          </button>
        </div>
      )}
      {failed && !canOverride && (
        <p className="text-xs text-[var(--text-muted)]">Only PER-01 can override a persistently failed validation.</p>
      )}
    </Card>
  );
}
