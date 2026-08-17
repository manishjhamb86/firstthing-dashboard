"use client";

import { useState, useTransition } from "react";
import { submitCircuitCandidate, type CandidateLine } from "./actions";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";

const CHECKLIST = [
  { name: "noSharedAppliances", label: "No non-installation appliances share this circuit" },
  { name: "wifiReachable", label: "WiFi/LAN reachable within 20–40m" },
  { name: "fixturesUnder15ft", label: "Fixtures ≤15 feet high" },
  { name: "notOnDrivewayOrRamp", label: "Not on a driveway/ramp" },
] as const;

export type CatalogOption = { id: string; name: string; defaultWattage: number | null };

type LineDraft = {
  key: number;
  deviceTypeId: string;
  count: string;
  wattage: string;
  hours: string; // "24" | "12" | custom value
};

let nextKey = 1;
function emptyLine(): LineDraft {
  return { key: nextKey++, deviceTypeId: "", count: "", wattage: "", hours: "24" };
}

// FEAT-007 + CON-45 (user's call, 2026-08-17): a candidate circuit is
// captured as an INVENTORY — device lines from the catalog, not a single
// type/wattage pair. The metered count and connected load are derived from
// the lines, so the CON-16 ≥50 check and CON-17's load validation read the
// record the inspector actually made. Controlled inputs throughout (React 19
// form-reset finding, see login-form.tsx).
export function CircuitEligibilityForm({
  siteSurveyId,
  societyId,
  serviceLine,
  catalog,
}: {
  siteSurveyId: string;
  societyId: string;
  serviceLine: string;
  catalog: CatalogOption[];
}) {
  const [lightType, setLightType] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [representedLightCount, setRepresentedLightCount] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function patchLine(key: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function pickDevice(line: LineDraft, deviceTypeId: string) {
    const t = catalog.find((c) => c.id === deviceTypeId);
    patchLine(line.key, {
      deviceTypeId,
      // Catalog default fills the wattage; the field stays editable — a
      // "20W tube light" measured at 18W is recorded at 18.
      wattage: line.wattage.trim() === "" && t?.defaultWattage ? String(t.defaultWattage) : line.wattage,
    });
  }

  const complete = lines.filter(
    (l) => l.deviceTypeId && l.count.trim() !== "" && l.wattage.trim() !== "" && l.hours.trim() !== "",
  );
  const meteredCount = complete.reduce((s, l) => s + (Number(l.count) || 0), 0);
  const connectedLoadW = complete.reduce((s, l) => s + (Number(l.count) || 0) * (Number(l.wattage) || 0), 0);
  const theoreticalKwh = complete.reduce(
    (s, l) => s + ((Number(l.count) || 0) * (Number(l.wattage) || 0) * (Number(l.hours) || 0)) / 1000,
    0,
  );

  function submit() {
    startTransition(async () => {
      const payload: CandidateLine[] = complete.map((l) => ({
        deviceTypeId: l.deviceTypeId,
        count: Number(l.count),
        wattage: Number(l.wattage),
        hoursPerDay: Number(l.hours),
      }));
      const result = await submitCircuitCandidate({
        siteSurveyId,
        societyId,
        serviceLine,
        lightType,
        representedLightCount: Number(representedLightCount),
        lines: payload,
        workingHours: workingHours.trim() === "" ? undefined : Number(workingHours),
        noSharedAppliances: checks.noSharedAppliances ?? false,
        wifiReachable: checks.wifiReachable ?? false,
        fixturesUnder15ft: checks.fixturesUnder15ft ?? false,
        notOnDrivewayOrRamp: checks.notOnDrivewayOrRamp ?? false,
      });
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setLightType("");
        setLines([emptyLine()]);
        setRepresentedLightCount("");
        setWorkingHours("");
        setChecks({});
      }
    });
  }

  return (
    <Card className="p-5">
      <CardTitle>Add a candidate circuit</CardTitle>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Light type / operating profile"
            htmlFor="cand-lightType"
            hint="Basement parking, staircase, lift lobby… — the profile this circuit represents (CON-11)"
          >
            <input
              id="cand-lightType"
              value={lightType}
              onChange={(e) => setLightType(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
          <Field label="Represented count (society-wide)" htmlFor="cand-represented">
            <input
              id="cand-represented"
              type="number"
              min="1"
              value={representedLightCount}
              onChange={(e) => setRepresentedLightCount(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
        </div>

        {/* CON-45 — what actually hangs off this circuit, line by line. */}
        <fieldset className="space-y-3">
          <legend className="lbl mb-1">Devices on this circuit</legend>
          <p className="text-xs text-[var(--text-muted)]">
            One line per device type — mixed wattages and running hours are normal. Every
            pre-installation reading will be judged against the theoretical figure these lines add
            up to.
          </p>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Count</th>
                  <th>W each</th>
                  <th>Runs (h/day)</th>
                  <th>kWh/day</th>
                  <th>{""}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const preset = l.hours === "24" || l.hours === "12" ? l.hours : "custom";
                  const kwh =
                    l.count && l.wattage && l.hours
                      ? ((Number(l.count) || 0) * (Number(l.wattage) || 0) * (Number(l.hours) || 0)) / 1000
                      : null;
                  return (
                    <tr key={l.key}>
                      <td>
                        <select
                          value={l.deviceTypeId}
                          onChange={(e) => pickDevice(l, e.target.value)}
                          disabled={pending}
                          aria-label="Device"
                          className="field field-auto"
                        >
                          <option value="">Pick from the catalog…</option>
                          {catalog.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={l.count}
                          onChange={(e) => patchLine(l.key, { count: e.target.value })}
                          disabled={pending}
                          aria-label="Count"
                          className="field field-auto w-20"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          step="0.5"
                          value={l.wattage}
                          onChange={(e) => patchLine(l.key, { wattage: e.target.value })}
                          disabled={pending}
                          aria-label="Wattage"
                          className="field field-auto w-24"
                        />
                      </td>
                      <td>
                        <span className="inline-flex items-center gap-2">
                          <select
                            value={preset}
                            onChange={(e) =>
                              patchLine(l.key, { hours: e.target.value === "custom" ? "" : e.target.value })
                            }
                            disabled={pending}
                            aria-label="Hours preset"
                            className="field field-auto"
                          >
                            <option value="24">24 h</option>
                            <option value="12">12 h</option>
                            <option value="custom">Custom…</option>
                          </select>
                          {preset === "custom" && (
                            <input
                              type="number"
                              min={1}
                              max={24}
                              step="0.5"
                              value={l.hours}
                              onChange={(e) => patchLine(l.key, { hours: e.target.value })}
                              disabled={pending}
                              aria-label="Custom hours per day"
                              className="field field-auto w-20"
                            />
                          )}
                        </span>
                      </td>
                      <td className="num">{kwh === null ? "—" : kwh.toFixed(2)}</td>
                      <td>
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                            disabled={pending}
                            className="btn-ghost text-xs"
                            style={{ color: "var(--bad-fg)" }}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {complete.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="font-medium">Derived</td>
                    <td className="num font-semibold">{meteredCount}</td>
                    <td className="num" colSpan={2}>
                      {connectedLoadW.toFixed(0)} W connected load
                    </td>
                    <td className="num font-semibold">{theoreticalKwh.toFixed(2)}</td>
                    <td className="text-xs text-[var(--text-muted)]">
                      {meteredCount < 50 ? "Below the 50-light minimum (CON-16)" : ""}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
            disabled={pending}
            className="btn-secondary"
          >
            Add another device line
          </button>
        </fieldset>

        <Field
          label="Working hours / day (optional)"
          htmlFor="cand-hours"
          hint="Circuit-level metadata (CON-10) — the per-line hours above drive the theoretical figure"
        >
          <input
            id="cand-hours"
            type="number"
            step="0.1"
            min="0"
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value)}
            disabled={pending}
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
                disabled={pending}
              />
              {item.label}
            </label>
          ))}
        </fieldset>

        {error && <ErrorText>{error}</ErrorText>}
        <button
          type="button"
          onClick={submit}
          disabled={
            pending ||
            lightType.trim() === "" ||
            complete.length === 0 ||
            complete.length !== lines.length ||
            representedLightCount.trim() === ""
          }
          className="btn-primary"
        >
          {pending ? "Submitting…" : "Submit checklist"}
        </button>
      </div>
    </Card>
  );
}
