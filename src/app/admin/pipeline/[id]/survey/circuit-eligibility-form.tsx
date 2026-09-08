"use client";

import { useRef, useState, useTransition } from "react";
import { submitCircuitCandidate, type CandidateLine } from "./actions";
import { proposeDeviceType } from "@/app/admin/device-catalog/actions";
import { Card, CardTitle, ErrorText, Field } from "@/components/ui";
import { CON16_HARD_CRITERIA } from "@/lib/circuit-eligibility";
import { inventoryCountFor, type InventoryType } from "@/lib/light-type";


export type CatalogOption = {
  id: string;
  name: string;
  defaultWattage: number | null;
  /** "proposed" until operations confirms it — see proposeDeviceType. */
  status?: string;
};

type LineDraft = {
  key: number;
  deviceTypeId: string;
  count: string;
  wattage: string;
  hours: string; // "24" | "12" | custom value
  /** On the circuit, but not part of the retrofit. */
  excluded: boolean;
};

type ProposeDraft = { forKey: number; name: string; watts: string; note: string };

function lineWith(key: number): LineDraft {
  return { key, deviceTypeId: "", count: "", wattage: "", hours: "24", excluded: false };
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
  inventory,
}: {
  siteSurveyId: string;
  societyId: string;
  serviceLine: string;
  catalog: CatalogOption[];
  /** Lights per type across the society, from this survey's own inventory. */
  inventory: InventoryType[];
}) {
  const [lightType, setLightType] = useState("");
  // Devices proposed from this form, held locally so the surveyor can carry
  // on recording the circuit instead of waiting on an approval.
  const [proposed, setProposed] = useState<CatalogOption[]>([]);
  const [propose, setPropose] = useState<ProposeDraft | null>(null);
  const [proposeError, setProposeError] = useState<string | null>(null);
  // Key allocation lives in a ref, NOT at module level: a module counter
  // increments across the dev server's renders while the client bundle
  // starts at 1, which is a guaranteed hydration-id mismatch.
  const nextKey = useRef(1);
  const [lines, setLines] = useState<LineDraft[]>([lineWith(0)]);
  const [representedLightCount, setRepresentedLightCount] = useState("");
  // Whether the operator has typed over the figure the inventory supplies. An
  // untouched field keeps tracking the chosen light type; once they change it
  // it is theirs, and a later type change must not silently overwrite it.
  const [representedTouched, setRepresentedTouched] = useState(false);
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

  // Deduped by id: the server query now returns proposed types too, so once
  // a refresh lands a device added here appears in BOTH lists. Without this
  // it renders twice and React warns about duplicate keys.
  const options = [...catalog, ...proposed.filter((p) => !catalog.some((c) => c.id === p.id))];

  const complete = lines.filter(
    (l) => l.deviceTypeId && l.count.trim() !== "" && l.wattage.trim() !== "" && l.hours.trim() !== "",
  );
  const meteredCount = complete.reduce((s, l) => s + (Number(l.count) || 0), 0);
  const connectedLoadW = complete.reduce((s, l) => s + (Number(l.count) || 0) * (Number(l.wattage) || 0), 0);
  const kwhOf = (l: LineDraft) =>
    ((Number(l.count) || 0) * (Number(l.wattage) || 0) * (Number(l.hours) || 0)) / 1000;
  // The WHOLE circuit — what the meter sees, and therefore what a
  // pre-installation reading is validated against (CON-17).
  const theoreticalKwh = complete.reduce((s, l) => s + kwhOf(l), 0);
  // The part that is not being retrofitted. Subtracted from both sides when
  // savings are computed, never from the reading check above.
  const excludedKwh = complete.filter((l) => l.excluded).reduce((s, l) => s + kwhOf(l), 0);
  const retrofitCount = complete.filter((l) => !l.excluded).reduce((s, l) => s + (Number(l.count) || 0), 0);

  // Which hard criteria are not confirmed right now — the same list the
  // survey page reads back off the stored checklist, so the warning here and
  // the verdict there cannot describe the circuit differently.
  const failedHard = CON16_HARD_CRITERIA.filter((k) => checks[k.name] !== true);

  // CON-11 computes the fee on the REPRESENTED count, not the metered one, so
  // a circuit left representing only the lights on it under-bills by the whole
  // extrapolation factor — Indiabulls Centrum Park was offered at 50 of 2,000
  // (user-caught 2026-09-08: "Why is it calculating for 50 lights, society
  // have 200 lights"). The survey's own inventory already knows the answer;
  // nothing had ever compared the two.
  const inventoryCount = inventoryCountFor(lightType, inventory);
  const representedNum = Number(representedLightCount);
  const representedMismatch =
    inventoryCount !== null &&
    representedLightCount.trim() !== "" &&
    Number.isFinite(representedNum) &&
    representedNum !== inventoryCount;

  function submit() {
    startTransition(async () => {
      const payload: CandidateLine[] = complete.map((l) => ({
        deviceTypeId: l.deviceTypeId,
        count: Number(l.count),
        wattage: Number(l.wattage),
        hoursPerDay: Number(l.hours),
        excludedFromCalculation: l.excluded,
      }));
      const result = await submitCircuitCandidate({
        siteSurveyId,
        societyId,
        serviceLine,
        lightType,
        representedLightCount: Number(representedLightCount),
        lines: payload,
        workingHours: workingHours.trim() === "" ? undefined : Number(workingHours),
        wifiReachable: checks.wifiReachable ?? false,
        fixturesUnder15ft: checks.fixturesUnder15ft ?? false,
        notOnDrivewayOrRamp: checks.notOnDrivewayOrRamp ?? false,
      });
      if (result && "error" in result && result.error) {
        setError(result.error);
      } else {
        setError(undefined);
        setLightType("");
        setLines([lineWith(nextKey.current++)]);
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
              onChange={(e) => {
                setLightType(e.target.value);
                // CON-11's extrapolation base is a fact the survey has already
                // recorded, so it is offered rather than asked for again.
                if (!representedTouched) {
                  const n = inventoryCountFor(e.target.value, inventory);
                  setRepresentedLightCount(n === null ? "" : String(n));
                }
              }}
              disabled={pending}
              className="field"
            />
          </Field>
          <Field
            label="Represented count (society-wide)"
            htmlFor="cand-represented"
            hint={
              inventoryCount === null
                ? "Every light of this type across the society — the population this circuit's benchmark is extrapolated to (CON-11)"
                : `The inventory above counted ${inventoryCount.toLocaleString("en-IN")} of this type across the society`
            }
          >
            <input
              id="cand-represented"
              type="number"
              min="1"
              value={representedLightCount}
              onChange={(e) => {
                setRepresentedTouched(true);
                setRepresentedLightCount(e.target.value);
              }}
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
          <div className="space-y-3">
            {lines.map((l, idx) => {
              const preset = l.hours === "24" || l.hours === "12" ? l.hours : "custom";
              const kwh =
                l.count && l.wattage && l.hours
                  ? ((Number(l.count) || 0) * (Number(l.wattage) || 0) * (Number(l.hours) || 0)) / 1000
                  : null;
              return (
                <div
                  key={l.key}
                  className="rounded-[var(--r-sm)] border border-[var(--border-subtle)] p-3 flex flex-wrap items-end gap-x-3 gap-y-2"
                >
                  <Field label="Device" htmlFor={`cand-dev-${l.key}`}>
                    <select
                      id={`cand-dev-${l.key}`}
                      value={l.deviceTypeId}
                      onChange={(e) => pickDevice(l, e.target.value)}
                      disabled={pending}
                      className="field field-auto max-w-full"
                    >
                      <option value="">Pick from the catalog…</option>
                      {options.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.status === "proposed" ? " — awaiting confirmation" : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Count" htmlFor={`cand-count-${l.key}`}>
                    <input
                      id={`cand-count-${l.key}`}
                      type="number"
                      min={1}
                      value={l.count}
                      onChange={(e) => patchLine(l.key, { count: e.target.value })}
                      disabled={pending}
                      className="field field-auto w-20"
                    />
                  </Field>
                  <Field label="W each" htmlFor={`cand-w-${l.key}`}>
                    <input
                      id={`cand-w-${l.key}`}
                      type="number"
                      min={1}
                      step="0.5"
                      value={l.wattage}
                      onChange={(e) => patchLine(l.key, { wattage: e.target.value })}
                      disabled={pending}
                      className="field field-auto w-24"
                    />
                  </Field>
                  <Field label="Runs" htmlFor={`cand-h-${l.key}`}>
                    <span className="inline-flex items-center gap-2">
                      <select
                        id={`cand-h-${l.key}`}
                        value={preset}
                        onChange={(e) =>
                          patchLine(l.key, { hours: e.target.value === "custom" ? "" : e.target.value })
                        }
                        disabled={pending}
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
                  </Field>
                  <span className="text-sm text-[var(--text-muted)] pb-2">
                    {kwh === null ? "— kWh/day" : <span className="num">{kwh.toFixed(2)} kWh/day</span>}
                  </span>
                  {/* Shares the circuit but is not being retrofitted, so the
                      meter sees it before AND after — its theoretical load
                      comes off both sides of the savings calculation. */}
                  {/* The fixture in front of the surveyor is not always in
                      the list, and waiting on an ops lead from a basement is
                      how a survey ends up written from memory afterwards. */}
                  <button
                    type="button"
                    className="btn-ghost pb-2 text-xs"
                    style={{ color: "var(--accent)" }}
                    disabled={pending}
                    onClick={() => {
                      setProposeError(null);
                      setPropose({ forKey: l.key, name: "", watts: "", note: "" });
                    }}
                  >
                    Not listed?
                  </button>
                  <label
                    className="flex items-center gap-1.5 pb-2 text-xs"
                    style={{ color: l.excluded ? "var(--warn-fg)" : "var(--text-muted)" }}
                  >
                    <input
                      type="checkbox"
                      checked={l.excluded}
                      onChange={(e) => patchLine(l.key, { excluded: e.target.checked })}
                      disabled={pending}
                      aria-label={`Exclude line ${idx + 1} from savings calculations`}
                    />
                    Exclude
                  </label>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                      disabled={pending}
                      aria-label={`Remove line ${idx + 1}`}
                      className="btn-ghost text-xs ml-auto"
                      style={{ color: "var(--bad-fg)" }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {propose && (
            <div
              className="rounded-[var(--r-sm)] border p-3.5"
              style={{ borderColor: "var(--accent-line)", background: "var(--accent-subtle)" }}
            >
              <p className="mb-2 text-sm font-semibold">Add a device that is not in the list</p>
              <p className="mb-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
                You can carry on recording the circuit straight away. Operations confirms the wattage
                before it is used — it feeds the load check and the savings benchmark, so a figure
                nobody else has seen cannot go that far on its own.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Device name" htmlFor="prop-name">
                  <input
                    id="prop-name"
                    className="field field-auto"
                    value={propose.name}
                    onChange={(e) => setPropose({ ...propose, name: e.target.value })}
                    placeholder="Surface light 18W"
                  />
                </Field>
                <Field label="Watts each" htmlFor="prop-watts">
                  <input
                    id="prop-watts"
                    type="number"
                    min={1}
                    max={2000}
                    step="0.5"
                    className="field field-auto w-24"
                    value={propose.watts}
                    onChange={(e) => setPropose({ ...propose, watts: e.target.value })}
                  />
                </Field>
                <Field label="Note (optional)" htmlFor="prop-note">
                  <input
                    id="prop-note"
                    className="field field-auto"
                    value={propose.note}
                    onChange={(e) => setPropose({ ...propose, note: e.target.value })}
                    placeholder="Where it is, what it looks like"
                  />
                </Field>
              </div>
              {proposeError && <ErrorText>{proposeError}</ErrorText>}
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setProposeError(null);
                      const r = await proposeDeviceType({
                        name: propose.name,
                        role: "original",
                        defaultWattage: propose.watts.trim() === "" ? null : Number(propose.watts),
                        note: propose.note,
                      });
                      if ("error" in r) return setProposeError(r.error);
                      const option: CatalogOption = {
                        id: r.id,
                        name: r.name,
                        defaultWattage: propose.watts.trim() === "" ? null : Number(propose.watts),
                        status: "proposed",
                      };
                      setProposed((prev) => [...prev, option]);
                      patchLine(propose.forKey, {
                        deviceTypeId: r.id,
                        wattage: propose.watts.trim() === "" ? "" : propose.watts,
                      });
                      setPropose(null);
                    })
                  }
                >
                  Add and use it
                </button>
                <button type="button" className="btn-secondary" onClick={() => setPropose(null)} disabled={pending}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          {proposed.length > 0 && (
            <p className="text-[12px]" style={{ color: "var(--warn-fg)" }}>
              {proposed.map((p) => p.name).join(", ")} {proposed.length === 1 ? "is" : "are"} waiting for
              operations to confirm. The circuit can be recorded now, but its load cannot be validated
              until then.
            </p>
          )}
          {complete.length > 0 && (
            <p className="text-sm">
              Derived: <span className="num font-semibold">{meteredCount}</span> lights ·{" "}
              <span className="num">{connectedLoadW.toFixed(0)}</span> W connected load ·{" "}
              <span className="num font-semibold">{theoreticalKwh.toFixed(2)}</span> kWh/day theoretical
              {meteredCount > 0 && meteredCount < 50 && (
                <span style={{ color: "var(--warn-fg)" }}> — below the 50-light minimum (CON-16)</span>
              )}
              {excludedKwh > 0 && (
                <span className="mt-1 block text-[13px]" style={{ color: "var(--text-muted)" }}>
                  Of that, <span className="num">{excludedKwh.toFixed(2)}</span> kWh/day is excluded from
                  savings — <span className="num">{retrofitCount}</span> lights are being retrofitted. Readings
                  are still checked against the full <span className="num">{theoreticalKwh.toFixed(2)}</span>,
                  because the meter measures the whole circuit.
                </span>
              )}
            </p>
          )}
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, lineWith(nextKey.current++)])}
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
          {/* Three unticked boxes and an enabled Submit produced a candidate
              that is ineligible the moment it is created, with no exception
              path and no way back but Remove — and nothing on the way in said
              so. Both circuits recorded on stage came out this way
              (user-reported 2026-09-08, twice). Tick-means-confirmed is what
              the stored flag records, so an unticked box is a FAIL, not a
              blank; the form has to say that before it is submitted, not
              afterwards through a chip. */}
          <p className="text-[12px] text-[var(--text-muted)] -mt-1 mb-1">
            Tick each one you confirmed on site. An unticked box records a fail — the candidate is
            recorded as ineligible until operations corrects it or approves an exception.
          </p>
          {CON16_HARD_CRITERIA.map((item) => (
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

        {representedMismatch && (
          <div className="text-[12px]" style={{ color: "var(--warn-fg)" }}>
            <p>
              This circuit would represent{" "}
              <span className="num">{representedNum.toLocaleString("en-IN")}</span> lights while the
              inventory counted{" "}
              <span className="num">{inventoryCount!.toLocaleString("en-IN")}</span> of this type
              across the society.
            </p>
            <p className="mt-1">
              The monthly fee is computed on the represented count (CON-11), not on the lights
              actually metered — so this is the figure the society is billed against. Deliberate
              when this deal covers only part of the society&apos;s lighting; otherwise use the
              inventory&apos;s figure.
            </p>
          </div>
        )}
        {failedHard.length > 0 && (
          <div className="text-[12px]" style={{ color: "var(--warn-fg)" }}>
            <p>
              Not confirmed: {failedHard.map((k) => k.label).join(" · ")}. Recorded as it stands,
              this candidate is <strong>ineligible</strong> and cannot be commissioned until
              operations either corrects the answers or approves an exception.
            </p>
            <p className="mt-1">
              If a box is simply unticked, tick it before submitting. If that is genuinely what the
              site is, record it — operations decides on the survey page whether the circuit
              proceeds anyway.
            </p>
          </div>
        )}
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
          {pending
            ? "Submitting…"
            : failedHard.length > 0
              ? "Record it as ineligible"
              : "Submit checklist"}
        </button>
      </div>
    </Card>
  );
}
