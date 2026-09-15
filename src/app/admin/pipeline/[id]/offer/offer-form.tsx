"use client";

import { useMemo, useState, useTransition } from "react";
import type { BenchmarkSource } from "@prisma/client";
import type { ReactNode } from "react";
import { ErrorText, Field } from "@/components/ui";
import { ALLOWED_TOLERANCE_PCT, type PricingModel } from "@/lib/offer";
import {
  DAYS_IN_MONTH,
  defaultPreInstallBasis,
  deriveWorksheet,
  unitRateForSavedValue,
  type PreInstallBasis,
  type WorksheetCircuitInput,
} from "@/lib/offer-worksheet";
import type { OfferBaseRow } from "@/lib/offer-base";
import { counterOffer, generateOffer, updateOffer, type OfferCircuitInput, type OfferTermInput } from "./actions";

export type OfferFormDefaults = {
  benchmarkSource?: BenchmarkSource;
  tolerancePct?: number;
  pricingModel?: PricingModel;
  circuits?: OfferCircuitInput[];
  unitElectricityRate?: number;
  monthlyFee?: number | null;
  /** FirsThing's share to start the fee from when no fee is recorded yet. */
  firsthingSharePct?: number;
  termMonths?: number;
  spareStockCount?: number;
  exclusions?: string;
  amcTerms?: string;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kwh = (n: number) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })} kWh`;
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`);
const money = (n: number) => (Math.round(n * 100) / 100).toString();

type RowState = { lights: string; pct: string; basis: PreInstallBasis; watts: string; hours: string; pre: string };

/**
 * The offer as a worksheet (user-redesigned 2026-09-15).
 *
 * The negotiation happens in figures — how many lights, what they burn, what
 * the retrofit saves, what FirsThing is paid — and the share percentage is a
 * consequence. So the form asks for those figures in that order and derives
 * everything else live through the same pure module the server stores from.
 * Two pairs are bound both ways: unit rate ⇄ saving in ₹ (edit either, the
 * other follows), and fee ⇄ share (the fee is typed, the shares fall out).
 *
 * Controlled inputs throughout — every one of these can fail validation and
 * be resubmitted (the React 19 reset case in PROJECT_CONTEXT.md).
 */
export function OfferForm({
  pipelineId,
  mode,
  offerId,
  counterOfId,
  baseRows,
  hasDemoReport,
  defaults,
  aside,
}: {
  pipelineId: string;
  mode: "generate" | "edit" | "counter";
  offerId?: string;
  counterOfId?: string;
  baseRows: OfferBaseRow[];
  hasDemoReport: boolean;
  defaults?: OfferFormDefaults;
  /** The next act after saving (Issue), rendered beside Save so the page keeps one solid button. */
  aside?: ReactNode;
}) {
  const [benchmarkSource, setBenchmarkSource] = useState<BenchmarkSource>(
    defaults?.benchmarkSource ?? (hasDemoReport ? "measured" : "negotiated_fixed"),
  );
  const [tolerancePct, setTolerancePct] = useState((defaults?.tolerancePct ?? 5).toString());
  const [pricingModel, setPricingModel] = useState<PricingModel>(defaults?.pricingModel ?? "revenue_share");
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const byId = new Map((defaults?.circuits ?? []).map((c) => [c.circuitId, c]));
    const out: Record<string, RowState> = {};
    for (const r of baseRows) {
      const d = byId.get(r.circuitId);
      const lights = d?.agreedLightCount ?? r.representedLightCount;
      const watts = d?.wattagePerLight ?? r.wattagePerLight;
      const hours = d?.hoursPerDay ?? r.hoursPerDay;
      out[r.circuitId] = {
        lights: lights.toString(),
        pct: (d?.agreedBenchmarkSavingsPct ?? r.demoBenchmarkSavingsPct ?? "").toString(),
        // A fresh sheet starts on the HIGHER of demo and theoretical (the user's rule).
        basis:
          d?.preInstallBasis ??
          defaultPreInstallBasis({ preInstallBaseline: r.preInstallBaseline, meteredLightCount: r.meteredLightCount, agreedLightCount: lights, wattagePerLight: watts, hoursPerDay: hours }),
        watts: watts != null ? (Math.round(watts * 100) / 100).toString() : "",
        hours: hours != null ? (Math.round(hours * 100) / 100).toString() : "",
        // Typed per MONTH (user-asked 2026-09-15); the module works per day.
        pre: d?.preInstallKwhPerDay != null ? (Math.round(d.preInstallKwhPerDay * DAYS_IN_MONTH * 100) / 100).toString() : "",
      };
    }
    return out;
  });
  const [unitRate, setUnitRate] = useState((defaults?.unitElectricityRate ?? 8).toString());
  // The ₹ saving is DERIVED unless the operator typed it — then the rate follows it.
  const [savedValueTyped, setSavedValueTyped] = useState<string | null>(null);
  const [fee, setFee] = useState(defaults?.monthlyFee != null ? money(defaults.monthlyFee) : "");
  const [feeTouched, setFeeTouched] = useState(defaults?.monthlyFee != null);
  const [termMonths, setTermMonths] = useState((defaults?.termMonths ?? 60).toString());
  const [spareStock, setSpareStock] = useState((defaults?.spareStockCount ?? 0).toString());
  const [exclusions, setExclusions] = useState(defaults?.exclusions ?? "");
  const [amcTerms, setAmcTerms] = useState(defaults?.amcTerms ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const startShare = defaults?.firsthingSharePct ?? 42;

  const circuitInputs: WorksheetCircuitInput[] = useMemo(
    () =>
      baseRows.map((r) => {
        const s = rows[r.circuitId];
        return {
          circuitId: r.circuitId,
          lightType: r.lightType,
          location: r.location,
          meteredLightCount: r.meteredLightCount,
          preInstallBaseline: r.preInstallBaseline,
          demoBenchmarkSavingsPct: r.demoBenchmarkSavingsPct,
          agreedLightCount: Number(s?.lights),
          agreedBenchmarkSavingsPct: Number(s?.pct),
          preInstallBasis: s?.basis ?? "demo",
          wattagePerLight: s?.watts === "" || s?.watts == null ? null : Number(s.watts),
          hoursPerDay: s?.hours === "" || s?.hours == null ? null : Number(s.hours),
          preInstallKwhPerDayOverride: s?.pre === "" || s?.pre == null ? null : Number(s.pre) / DAYS_IN_MONTH,
        };
      }),
    [baseRows, rows],
  );

  // kWh first (it does not depend on money), then the rate — from the typed ₹
  // saving if there is one, else the rate field — then the fee.
  const kwhOnly = useMemo(
    () => deriveWorksheet({ circuits: circuitInputs, unitElectricityRate: 0, monthlyFee: 0 }),
    [circuitInputs],
  );
  const effectiveRate =
    savedValueTyped != null
      ? (unitRateForSavedValue(kwhOnly.totals.savedKwhPerMonth, Number(savedValueTyped)) ?? Number(unitRate))
      : Number(unitRate);
  const provisional = deriveWorksheet({ circuits: circuitInputs, unitElectricityRate: effectiveRate, monthlyFee: 0 });
  const effectiveFee = feeTouched ? Number(fee) : provisional.totals.savedValuePerMonth * (startShare / 100);
  const ws = deriveWorksheet({ circuits: circuitInputs, unitElectricityRate: effectiveRate, monthlyFee: effectiveFee });
  const t = ws.totals;
  const anyNotDerivable = ws.circuits.some((c) => c.notDerivable);

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
  }

  function submit() {
    const input: OfferTermInput = {
      benchmarkSource,
      tolerancePct: Number(tolerancePct),
      pricingModel,
      circuits: baseRows.map((r) => ({
        circuitId: r.circuitId,
        agreedLightCount: Number(rows[r.circuitId]?.lights),
        agreedBenchmarkSavingsPct: Number(rows[r.circuitId]?.pct),
        preInstallBasis: rows[r.circuitId]?.basis ?? "demo",
        wattagePerLight: rows[r.circuitId]?.watts ? Number(rows[r.circuitId].watts) : null,
        hoursPerDay: rows[r.circuitId]?.hours ? Number(rows[r.circuitId].hours) : null,
        preInstallKwhPerDay:
          rows[r.circuitId]?.basis === "custom" && rows[r.circuitId]?.pre !== "" ? Number(rows[r.circuitId].pre) / DAYS_IN_MONTH : null,
      })),
      unitElectricityRate: effectiveRate,
      monthlyFee: effectiveFee,
      termMonths: Number(termMonths),
      spareStockCount: Number(spareStock) || 0,
      exclusions,
      amcTerms,
    };
    setSaved(false);
    startTransition(async () => {
      const r =
        mode === "counter" && counterOfId
          ? await counterOffer(pipelineId, counterOfId, input, note)
          : mode === "edit" && offerId
            ? await updateOffer(pipelineId, offerId, input)
            : await generateOffer(pipelineId, input);
      setError(r?.error);
      if (!r?.error) {
        setSaved(true);
        // The fee that went up is now the stored figure, not a starting share.
        setFee(money(effectiveFee));
        setFeeTouched(true);
      }
    });
  }

  const lumpSum = pricingModel === "lump_sum";

  return (
    <div className="space-y-6">
      {/* 1. The lights, and what they burn — per light type (CON-11). */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">1. Lights and what they burn today</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Benchmark source" htmlFor="of-src">
            <select
              id="of-src"
              value={benchmarkSource}
              onChange={(e) => setBenchmarkSource(e.target.value as BenchmarkSource)}
              disabled={pending || mode === "counter"}
              className="field"
            >
              <option value="measured" disabled={!hasDemoReport}>
                Measured from the demo
              </option>
              <option value="negotiated_fixed">Negotiated fixed — demo skipped (CON-25)</option>
            </select>
          </Field>
          <Field label="Tolerance band" htmlFor="of-tol" hint="CON-01a — one value per contract, applied per circuit.">
            <select id="of-tol" value={tolerancePct} onChange={(e) => setTolerancePct(e.target.value)} disabled={pending} className="field">
              {ALLOWED_TOLERANCE_PCT.map((v) => (
                <option key={v} value={v}>
                  ±{v}%
                </option>
              ))}
            </select>
          </Field>
        </div>

        {baseRows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--warn-fg)" }}>
            There is no circuit on this deal to price an offer on — select a demo-circuit candidate on the site survey first.
          </p>
        ) : (
          <div className="space-y-3">
            {ws.circuits.map((c) => {
              const r = rows[c.circuitId];
              return (
                <div key={c.circuitId} className="rounded-[var(--r-md)] border p-3 space-y-3" style={{ borderColor: "var(--border)" }}>
                  <p className="text-sm font-medium">
                    {c.lightType}
                    {c.location && <span className="text-[var(--text-muted)]"> · {c.location}</span>}
                    <span className="ml-2 text-xs text-[var(--text-subtle)]">
                      {c.meteredLightCount} metered on the demo circuit
                      {c.demoBenchmarkSavingsPct != null ? ` · demo measured ${c.demoBenchmarkSavingsPct.toFixed(2)}%` : ""}
                    </span>
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Lights as per agreement" htmlFor={`of-l-${c.circuitId}`} hint="The population the fee is priced on.">
                      <input
                        id={`of-l-${c.circuitId}`}
                        type="number"
                        inputMode="numeric"
                        min="1"
                        step="1"
                        value={r?.lights ?? ""}
                        onChange={(e) => setRow(c.circuitId, { lights: e.target.value })}
                        disabled={pending}
                        className="field"
                      />
                    </Field>
                    <Field
                      label="Pre-installation consumption"
                      htmlFor={`of-basis-${c.circuitId}`}
                      hint={
                        r?.basis === "demo" && c.demoKwhPerDay != null
                          ? `${(c.preInstallBaseline! / Math.max(c.meteredLightCount, 1)).toFixed(3)} kWh/day per light from the demo × lights${c.theoreticalKwhPerDay != null && c.theoreticalKwhPerDay > c.demoKwhPerDay ? " — the theoretical figure is higher" : ""}.`
                          : r?.basis === "theoretical" && c.theoreticalKwhPerDay != null
                            ? `Lights × ${r.watts || "?"} W × ${r.hours || "?"} h ÷ 1000${c.demoKwhPerDay != null && c.demoKwhPerDay > c.theoreticalKwhPerDay ? " — the demo's figure is higher" : ""}.`
                            : "What these lights burn today, for the agreed count — usually the higher of demo and theoretical."
                      }
                    >
                      <select
                        id={`of-basis-${c.circuitId}`}
                        value={r?.basis ?? "demo"}
                        onChange={(e) => setRow(c.circuitId, { basis: e.target.value as PreInstallBasis })}
                        disabled={pending}
                        className="field"
                      >
                        <option value="demo" disabled={c.demoKwhPerDay == null}>
                          {c.demoKwhPerDay != null ? `From the demo — ${kwh(c.demoKwhPerDay)}/day` : "From the demo — not measured"}
                        </option>
                        <option value="theoretical">
                          {c.theoreticalKwhPerDay != null ? `Theoretical — ${kwh(c.theoreticalKwhPerDay)}/day` : "Theoretical — give the wattage and hours"}
                        </option>
                        <option value="custom">Custom — type a figure</option>
                      </select>
                    </Field>                    <Field
                      label="Agreed savings %"
                      htmlFor={`of-b-${c.circuitId}`}
                      hint={
                        c.demoBenchmarkSavingsPct != null
                          ? c.benchmarkNegotiated
                            ? `Differs from the demo's ${c.demoBenchmarkSavingsPct.toFixed(2)}% — recorded as negotiated.`
                            : "The demo's figure. Change it only if the agreement says otherwise."
                          : "CON-20's 60–80% band."
                      }
                    >
                      <input
                        id={`of-b-${c.circuitId}`}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="60"
                        max="80"
                        value={r?.pct ?? ""}
                        onChange={(e) => setRow(c.circuitId, { pct: e.target.value })}
                        disabled={pending}
                        className="field"
                      />
                    </Field>
                  </div>
                  {r?.basis === "theoretical" && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Watts per light (old fitting)" htmlFor={`of-w-${c.circuitId}`} hint="From the circuit's load inventory; change if the agreement says otherwise.">
                        <input id={`of-w-${c.circuitId}`} type="number" inputMode="decimal" min="0" step="0.1" value={r?.watts ?? ""} onChange={(e) => setRow(c.circuitId, { watts: e.target.value })} disabled={pending} className="field" />
                      </Field>
                      <Field label="Hours a day" htmlFor={`of-h-${c.circuitId}`} hint="24 for lights that never switch off; 12 for dusk-to-dawn.">
                        <input id={`of-h-${c.circuitId}`} type="number" inputMode="decimal" min="0" max="24" step="0.5" value={r?.hours ?? ""} onChange={(e) => setRow(c.circuitId, { hours: e.target.value })} disabled={pending} className="field" />
                      </Field>
                    </div>
                  )}
                  {r?.basis === "custom" && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field
                        label="Pre-installation consumption (kWh/month)"
                        htmlFor={`of-p-${c.circuitId}`}
                        hint={`For the agreed number of lights — ${r?.pre ? `${kwh(Number(r.pre) / DAYS_IN_MONTH)} a day` : "the daily figure follows"}.`}
                      >
                        <input id={`of-p-${c.circuitId}`} type="number" inputMode="decimal" min="0" step="1" value={r?.pre ?? ""} onChange={(e) => setRow(c.circuitId, { pre: e.target.value })} disabled={pending} className="field" />
                      </Field>
                    </div>
                  )}
                  <p className="text-xs text-[var(--text-muted)]">
                    Priced on <span className="num">{kwh(c.preInstallKwhPerDay)}</span>/day · <span className="num">{kwh(c.preInstallKwhPerDay * 30)}</span>/month before
                    → projected saving <span className="num">{kwh(c.savedKwhPerDay)}</span>/day ·{" "}
                    <span className="num">{kwh(c.savedKwhPerDay * 30)}</span>/month
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. The money — rate ⇄ ₹ saving bound both ways, fee typed, shares derived. */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">2. What the saving is worth, and who gets what</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Projected energy saving" hint={t.savingsPct != null ? `${t.savingsPct.toFixed(2)}% of ${kwh(t.preInstallKwhPerMonth)}/month.` : undefined}>
            <p className="field num" aria-readonly>
              {kwh(t.savedKwhPerMonth)}/month
            </p>
          </Field>
          <Field label="Unit electricity rate (₹/kWh)" htmlFor="of-rate" hint="Change either this or the ₹ saving — the other follows.">
            <input
              id="of-rate"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={savedValueTyped != null ? money(effectiveRate) : unitRate}
              onChange={(e) => {
                setSavedValueTyped(null);
                setUnitRate(e.target.value);
              }}
              disabled={pending}
              className="field"
            />
          </Field>
          <Field label="Total expected saving (₹/month)" htmlFor="of-saved" hint="Saved kWh × unit rate. Type an agreed figure and the rate adjusts to match.">
            <input
              id="of-saved"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={savedValueTyped ?? money(t.savedValuePerMonth)}
              onChange={(e) => setSavedValueTyped(e.target.value)}
              disabled={pending || !(kwhOnly.totals.savedKwhPerMonth > 0)}
              className="field"
            />
          </Field>
          <Field label="Monthly payable to FirsThing (₹)" htmlFor="of-fee" hint={feeTouched ? undefined : `Starting at ${startShare}% of the saving — type the agreed amount.`}>
            <input
              id="of-fee"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={feeTouched ? fee : money(effectiveFee)}
              onChange={(e) => {
                setFeeTouched(true);
                setFee(e.target.value);
              }}
              disabled={pending}
              className="field"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-raised)" }}>
          <div>
            <p className="lbl">Society keeps</p>
            <p className="num text-lg font-semibold" style={t.societyKeepsPerMonth < 0 ? { color: "var(--bad-fg)" } : undefined}>
              {inr(t.societyKeepsPerMonth)}
            </p>
            <p className="text-xs text-[var(--text-muted)]">per month · saving minus the fee</p>
          </div>
          <div>
            <p className="lbl">Society&apos;s share</p>
            <p className="num text-lg font-semibold">{pct(t.societySharePct)}</p>
            <p className="text-xs text-[var(--text-muted)]">of the saving</p>
          </div>
          <div>
            <p className="lbl">FirsThing&apos;s share</p>
            <p className="num text-lg font-semibold">{pct(t.firsthingSharePct)}</p>
            <p className="text-xs text-[var(--text-muted)]">of the saving</p>
          </div>
        </div>
        {t.monthlyFee >= t.savedValuePerMonth && t.savedValuePerMonth > 0 && (
          <p className="text-sm" style={{ color: "var(--bad-fg)" }}>
            The fee is more than the whole projected saving — the society would keep less than nothing.
          </p>
        )}
        {anyNotDerivable && (
          <p className="text-sm" style={{ color: "var(--warn-fg)" }}>
            A light type has no pre-installation consumption yet — type what those lights burn today.
          </p>
        )}

        <Field
          label="How the fee is billed each month"
          htmlFor="of-model"
          hint={
            lumpSum
              ? "A flat amount every month regardless of what the meter measures. A short month is still billed in proportion (CON-01c)."
              : "As FirsThing's share of the saving the meter measures (CON-11) — the amount above is what that share comes to at the agreed benchmark."
          }
        >
          <select id="of-model" value={pricingModel} onChange={(e) => setPricingModel(e.target.value as PricingModel)} disabled={pending} className="field">
            <option value="revenue_share">Share of the measured saving</option>
            <option value="lump_sum">Fixed monthly amount</option>
          </select>
        </Field>
      </section>

      {/* 3. The rest of the terms. */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">3. Term and stock</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Term (months)" htmlFor="of-term">
            <input id="of-term" type="number" inputMode="numeric" min="1" step="1" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} disabled={pending} className="field" />
          </Field>
          <Field label="Spare lights as per agreement" htmlFor="of-spare" hint="CON-15 — no default, agreed per society.">
            <input id="of-spare" type="number" inputMode="numeric" min="0" step="1" value={spareStock} onChange={(e) => setSpareStock(e.target.value)} disabled={pending} className="field" />
          </Field>
        </div>
        <Field label="Exclusions (one per line)" htmlFor="of-excl" hint="CON-01b's list, in this contract's wording.">
          <textarea
            id="of-excl"
            rows={3}
            value={exclusions}
            onChange={(e) => setExclusions(e.target.value)}
            disabled={pending}
            placeholder={"Common-area festive lighting\nClubhouse and gym fittings"}
            className="field"
          />
        </Field>
        <Field label="AMC terms" htmlFor="of-amc">
          <textarea
            id="of-amc"
            rows={2}
            value={amcTerms}
            onChange={(e) => setAmcTerms(e.target.value)}
            disabled={pending}
            placeholder="Quarterly preventive maintenance; replacement within 72 hours of a reported failure."
            className="field"
          />
        </Field>
        {mode === "counter" && (
          <Field label="What the society asked for" htmlFor="of-note">
            <input id="of-note" value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} placeholder="Wants ₹30,000 a month and a 36-month term." className="field" />
          </Field>
        )}
      </section>

      {error && <ErrorText>{error}</ErrorText>}
      {saved && !error && (
        <p className="text-sm" style={{ color: "var(--ok-fg)" }}>
          Saved.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={pending || baseRows.length === 0} className="btn-primary">
          {pending ? "Saving…" : mode === "counter" ? "Record counter as a new version" : mode === "edit" ? "Save changes" : "Create the offer"}
        </button>
        {aside}
      </div>
    </div>
  );
}
