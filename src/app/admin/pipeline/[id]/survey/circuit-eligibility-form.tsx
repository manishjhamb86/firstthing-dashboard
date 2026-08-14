"use client";

import { useActionState, useState } from "react";
import { submitCircuitCandidate } from "./actions";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";

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

const CHECKLIST = [
  { name: "noSharedAppliances", label: "No non-installation appliances share this circuit" },
  { name: "wifiReachable", label: "WiFi/LAN reachable within 20–40m" },
  { name: "fixturesUnder15ft", label: "Fixtures ≤15 feet high" },
  { name: "notOnDrivewayOrRamp", label: "Not on a driveway/ramp" },
] as const;

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
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  return (
    <Card className="p-5">
      <CardTitle>Add a candidate circuit</CardTitle>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="siteSurveyId" value={siteSurveyId} />
        <input type="hidden" name="societyId" value={societyId} />
        <input type="hidden" name="serviceLine" value={serviceLine} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Light type" htmlFor="cand-lightType">
            <input
              id="cand-lightType"
              name="lightType"
              required
              value={lightType}
              onChange={(e) => setLightType(e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Wattage per light" htmlFor="cand-wattage">
            <input
              id="cand-wattage"
              name="wattage"
              type="number"
              step="0.1"
              min="0"
              required
              value={wattage}
              onChange={(e) => setWattage(e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Metered light count" htmlFor="cand-metered">
            <input
              id="cand-metered"
              name="meteredLightCount"
              type="number"
              min="1"
              required
              value={meteredLightCount}
              onChange={(e) => setMeteredLightCount(e.target.value)}
              className="field"
            />
          </Field>
          <Field label="Represented count (society-wide)" htmlFor="cand-represented">
            <input
              id="cand-represented"
              name="representedLightCount"
              type="number"
              min="1"
              required
              value={representedLightCount}
              onChange={(e) => setRepresentedLightCount(e.target.value)}
              className="field"
            />
          </Field>
        </div>
        <Field label="Working hours / day (optional)" htmlFor="cand-hours">
          <input
            id="cand-hours"
            name="workingHours"
            type="number"
            step="0.1"
            min="0"
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value)}
            className="field"
          />
        </Field>

        <fieldset className="space-y-2.5">
          <legend className="lbl mb-2">CON-16 eligibility checklist</legend>
          {CHECKLIST.map((item) => (
            <label key={item.name} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name={item.name}
                checked={checks[item.name] ?? false}
                onChange={(e) => setChecks((prev) => ({ ...prev, [item.name]: e.target.checked }))}
              />
              {item.label}
            </label>
          ))}
        </fieldset>

        {error && <ErrorText>{error}</ErrorText>}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Submitting…" : "Submit checklist"}
        </button>
      </form>
    </Card>
  );
}
