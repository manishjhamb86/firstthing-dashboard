"use client";

import { useActionState, useState } from "react";
import { submitCircuitCandidate } from "./actions";

const fieldStyle = { borderColor: "var(--field-border)", background: "var(--surface)", color: "var(--text)" };

async function action(_prev: string | undefined, formData: FormData) {
  const result = await submitCircuitCandidate({
    siteSurveyId: formData.get("siteSurveyId") as string,
    societyId: formData.get("societyId") as string,
    serviceLine: formData.get("serviceLine") as string,
    lightType: formData.get("lightType") as string,
    meteredLightCount: Number(formData.get("meteredLightCount")),
    representedLightCount: Number(formData.get("representedLightCount")),
    wattage: Number(formData.get("wattage")),
    workingHours: formData.get("workingHours") ? Number(formData.get("workingHours")) : undefined,
    noSharedAppliances: formData.get("noSharedAppliances") === "on",
    wifiReachable: formData.get("wifiReachable") === "on",
    fixturesUnder15ft: formData.get("fixturesUnder15ft") === "on",
    notOnDrivewayOrRamp: formData.get("notOnDrivewayOrRamp") === "on",
  });
  return result?.error;
}

// FEAT-007: CON-16's eligibility checklist. Controlled inputs throughout
// (React 19 form-reset finding, see login-form.tsx).
export function CircuitEligibilityForm({
  siteSurveyId,
  societyId,
  serviceLine,
}: {
  siteSurveyId: string;
  societyId: string;
  serviceLine: string;
}) {
  const [error, formAction, pending] = useActionState(action, undefined);
  const [lightType, setLightType] = useState("");
  const [meteredLightCount, setMeteredLightCount] = useState("");
  const [representedLightCount, setRepresentedLightCount] = useState("");
  const [wattage, setWattage] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [noSharedAppliances, setNoSharedAppliances] = useState(false);
  const [wifiReachable, setWifiReachable] = useState(false);
  const [fixturesUnder15ft, setFixturesUnder15ft] = useState(false);
  const [notOnDrivewayOrRamp, setNotOnDrivewayOrRamp] = useState(false);

  return (
    <form
      action={formAction}
      className="space-y-3 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-[var(--r-lg)] p-4"
    >
      <input type="hidden" name="siteSurveyId" value={siteSurveyId} />
      <input type="hidden" name="societyId" value={societyId} />
      <input type="hidden" name="serviceLine" value={serviceLine} />
      <p className="text-sm font-semibold">Add a candidate circuit</p>
      <div className="grid grid-cols-2 gap-3">
        <input
          name="lightType"
          placeholder="Light type"
          required
          value={lightType}
          onChange={(e) => setLightType(e.target.value)}
          className="border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
        <input
          name="wattage"
          type="number"
          step="0.1"
          min="0"
          placeholder="Wattage per light"
          required
          value={wattage}
          onChange={(e) => setWattage(e.target.value)}
          className="border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
        <input
          name="meteredLightCount"
          type="number"
          min="1"
          placeholder="Metered light count"
          required
          value={meteredLightCount}
          onChange={(e) => setMeteredLightCount(e.target.value)}
          className="border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
        <input
          name="representedLightCount"
          type="number"
          min="1"
          placeholder="Represented light count (society-wide)"
          required
          value={representedLightCount}
          onChange={(e) => setRepresentedLightCount(e.target.value)}
          className="border rounded-[var(--r-sm)] p-2 text-sm"
          style={fieldStyle}
        />
        <input
          name="workingHours"
          type="number"
          step="0.1"
          min="0"
          placeholder="Working hours/day (optional)"
          value={workingHours}
          onChange={(e) => setWorkingHours(e.target.value)}
          className="border rounded-[var(--r-sm)] p-2 text-sm col-span-2"
          style={fieldStyle}
        />
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-medium">CON-16 eligibility checklist</p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="noSharedAppliances"
            checked={noSharedAppliances}
            onChange={(e) => setNoSharedAppliances(e.target.checked)}
          />
          No non-installation appliances share this circuit
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="wifiReachable"
            checked={wifiReachable}
            onChange={(e) => setWifiReachable(e.target.checked)}
          />
          WiFi/LAN reachable within 20–40m
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="fixturesUnder15ft"
            checked={fixturesUnder15ft}
            onChange={(e) => setFixturesUnder15ft(e.target.checked)}
          />
          Fixtures ≤15 feet high
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="notOnDrivewayOrRamp"
            checked={notOnDrivewayOrRamp}
            onChange={(e) => setNotOnDrivewayOrRamp(e.target.checked)}
          />
          Not on a driveway/ramp
        </label>
      </div>

      {error && (
        <p className="text-xs" style={{ color: "var(--bad-fg)" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-60">
        {pending ? "Submitting…" : "Submit checklist"}
      </button>
    </form>
  );
}
