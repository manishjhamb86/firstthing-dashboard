"use client";

import { useState, useTransition } from "react";
import { recordLightCountChange } from "./rescale-actions";
import { Card, ErrorText, Field } from "@/components/ui";
import { rescaleBaseline } from "@/lib/benchmark-rescale";
// HoursInput shares the same 24/12/custom preset picker the load-inventory
// panel's own add-line form uses — reused, not reimplemented.
import { HoursInput, type CatalogOption } from "./load-inventory-panel";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function RescaleForm({
  circuitId,
  currentLightCount,
  effectiveBaseline,
  wattage,
  catalog,
}: {
  circuitId: string;
  currentLightCount: number;
  effectiveBaseline: number;
  /** The circuit's own single wattage (CON-11 — one circuit, one light
   *  type). rescaleBaseline scales the measured baseline by count alone,
   *  which only holds if every new unit draws THIS wattage. */
  wattage: number;
  /** For the "different fixture" line below — the same device catalog the
   *  (now-locked) load inventory panel reads. */
  catalog: CatalogOption[];
}) {
  const [newLightCount, setNewLightCount] = useState("");
  const [verificationNote, setVerificationNote] = useState("");
  const [verificationPhotoUrl, setVerificationPhotoUrl] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [sameWattageConfirmed, setSameWattageConfirmed] = useState(false);
  // The different fixture — only asked for once the checkbox above is
  // unchecked. The load inventory itself is LOCKED from meter install
  // onward (addCircuitDevice refuses outright outside demo mode), so this
  // is the one place a genuinely different fixture can still be recorded
  // once a circuit is commissioned — the rescale action creates it as its
  // own excluded line (2026-10-26, user-caught: a hint pointing at the
  // locked panel was a dead end).
  const [newDeviceTypeId, setNewDeviceTypeId] = useState("");
  const [newDeviceCount, setNewDeviceCount] = useState("");
  const [newDeviceWattage, setNewDeviceWattage] = useState("");
  const [newDeviceHours, setNewDeviceHours] = useState("24");
  const [newDeviceNote, setNewDeviceNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const parsed = Number(newLightCount);
  const preview =
    Number.isInteger(parsed) && parsed > 0 && parsed !== currentLightCount
      ? rescaleBaseline(effectiveBaseline, currentLightCount, parsed)
      : null;
  const backdated = effectiveDate < todayISO();

  function pickNewDeviceType(id: string) {
    setNewDeviceTypeId(id);
    const t = catalog.find((c) => c.id === id);
    if (t?.defaultWattage && newDeviceWattage.trim() === "") setNewDeviceWattage(String(t.defaultWattage));
  }

  const newDeviceIncomplete =
    !newDeviceTypeId || newDeviceCount.trim() === "" || newDeviceWattage.trim() === "" || newDeviceHours.trim() === "";

  function submit() {
    startTransition(async () => {
      const result = await recordLightCountChange(circuitId, {
        newLightCount: parsed,
        verificationNote,
        verificationPhotoUrl,
        effectiveDate,
        sameWattageConfirmed,
        newExcludedLine:
          !sameWattageConfirmed && !newDeviceIncomplete
            ? {
                deviceTypeId: newDeviceTypeId,
                count: Number(newDeviceCount),
                wattage: Number(newDeviceWattage),
                hoursPerDay: Number(newDeviceHours),
                note: newDeviceNote,
              }
            : undefined,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(undefined);
      setNewDeviceTypeId("");
      setNewDeviceCount("");
      setNewDeviceWattage("");
      setNewDeviceHours("24");
      setNewDeviceNote("");
      setNewLightCount("");
      setVerificationNote("");
      setVerificationPhotoUrl("");
      setSameWattageConfirmed(false);
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        A verified light-count change rescales the baseline proportionally — deterministic math, not a
        renegotiation. The savings percentage itself is unchanged.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New metered light count" htmlFor="rs-count" hint={`Currently ${currentLightCount}.`}>
          <input
            id="rs-count"
            type="number"
            min="1"
            step="1"
            value={newLightCount}
            onChange={(e) => setNewLightCount(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
        <Field
          label="Effective from"
          htmlFor="rs-date"
          hint={backdated ? "Backdated — earlier months are not restated." : undefined}
        >
          <input
            id="rs-date"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>
      </div>

      {/* The operator sees the exact figure before committing it — this is
          a number the society is billed against, not a preference. */}
      {preview != null && (
        <div
          className="rounded-[var(--r-md)] border p-3 text-sm"
          style={{ borderColor: "var(--info-line)", background: "var(--info-bg)", color: "var(--info-fg)" }}
        >
          Baseline rescales{" "}
          <span className="num font-semibold">{effectiveBaseline.toFixed(2)}</span> →{" "}
          <span className="num font-semibold">{preview.toFixed(2)}</span> kWh/day
          <span className="text-xs">
            {" "}
            ({effectiveBaseline.toFixed(2)} ÷ {currentLightCount} × {parsed})
          </span>
        </div>
      )}

      {/* rescaleBaseline scales the baseline by count alone — correct only
          when every new unit draws the circuit's own wattage, which this
          form has no other way to know. A changed mix (a different-wattage
          fixture folded into the same count) would silently overstate or
          understate the rescaled figure, so the operator has to say so
          directly rather than it being assumed. */}
      <label className="flex items-start gap-2.5 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={sameWattageConfirmed}
          onChange={(e) => setSameWattageConfirmed(e.target.checked)}
          disabled={pending}
          className="mt-0.5"
        />
        <span>
          All {newLightCount || "the new"} units are the same {wattage}W type as this circuit&rsquo;s existing
          fixtures.
        </span>
      </label>

      {!sameWattageConfirmed && (
        <div
          className="rounded-[var(--r-md)] border p-3 space-y-3"
          style={{ borderColor: "var(--border)", background: "var(--surface-sunken)" }}
        >
          <p className="text-sm">
            Record the different fixture here — it stays on the circuit, excluded from this benchmark, rather than
            folded into the count above. &ldquo;New metered light count&rdquo; should count only the{" "}
            {wattage}W units; the fixture below is counted separately. (The load inventory itself is locked once
            the meter is installed, so this is the one place left to add it.)
          </p>

          <Field label="Device" htmlFor="rs-dev-type" hint="From the catalog — its wattage fills in and stays editable.">
            <select
              id="rs-dev-type"
              value={newDeviceTypeId}
              onChange={(e) => pickNewDeviceType(e.target.value)}
              disabled={pending}
              className="field"
            >
              <option value="">Pick from the catalog…</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Count" htmlFor="rs-dev-count">
              <input
                id="rs-dev-count"
                type="number"
                min={1}
                value={newDeviceCount}
                onChange={(e) => setNewDeviceCount(e.target.value)}
                disabled={pending}
                className="field"
              />
            </Field>
            <Field label="Watts each" htmlFor="rs-dev-watt">
              <input
                id="rs-dev-watt"
                type="number"
                min={1}
                step="0.5"
                value={newDeviceWattage}
                onChange={(e) => setNewDeviceWattage(e.target.value)}
                disabled={pending}
                className="field"
              />
            </Field>
          </div>

          <Field label="Runs for" htmlFor="rs-dev-hours">
            <HoursInput id="rs-dev-hours" hours={newDeviceHours} setHours={setNewDeviceHours} disabled={pending} />
          </Field>

          <Field label="Note" htmlFor="rs-dev-note" hint="Optional.">
            <input
              id="rs-dev-note"
              value={newDeviceNote}
              onChange={(e) => setNewDeviceNote(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
        </div>
      )}

      <Field
        label="How was the new count verified?"
        htmlFor="rs-note"
        hint="Required — an unverified count change is refused."
      >
        <textarea
          id="rs-note"
          rows={2}
          value={verificationNote}
          onChange={(e) => setVerificationNote(e.target.value)}
          disabled={pending}
          placeholder="Walked and counted with the society's electrician on 12 Sep; 4 fixtures added in the east corridor."
          className="field"
        />
      </Field>

      <Field label="Verification photo URL (optional)" htmlFor="rs-photo">
        <input
          id="rs-photo"
          value={verificationPhotoUrl}
          onChange={(e) => setVerificationPhotoUrl(e.target.value)}
          disabled={pending}
          placeholder="https://…"
          className="field"
        />
      </Field>

      {error && <ErrorText>{error}</ErrorText>}

      <button
        type="button"
        onClick={submit}
        disabled={
          pending ||
          !newLightCount.trim() ||
          !verificationNote.trim() ||
          (!sameWattageConfirmed && newDeviceIncomplete)
        }
        className="btn-primary"
      >
        {pending ? "Recording…" : "Record verified count change"}
      </button>
    </Card>
  );
}
