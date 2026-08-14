"use client";

import { useState, useTransition } from "react";
import type { BenchmarkSource } from "@prisma/client";
import { ErrorText, Field } from "@/components/ui";
import { ALLOWED_TOLERANCE_PCT } from "@/lib/offer";
import { counterOffer, generateOffer, type OfferTermInput } from "./actions";

type Defaults = Partial<OfferTermInput>;

// Controlled inputs throughout — every one of these can fail validation and
// be resubmitted, which is exactly the React 19 reset case documented in
// PROJECT_CONTEXT.md.
export function OfferForm({
  pipelineId,
  mode,
  counterOfId,
  defaults,
  hasDemoReport,
}: {
  pipelineId: string;
  mode: "generate" | "counter";
  counterOfId?: string;
  defaults?: Defaults;
  hasDemoReport: boolean;
}) {
  const [benchmarkSource, setBenchmarkSource] = useState<BenchmarkSource>(
    defaults?.benchmarkSource ?? (hasDemoReport ? "measured" : "negotiated_fixed"),
  );
  const [negotiatedPct, setNegotiatedPct] = useState(defaults?.negotiatedBenchmarkPct?.toString() ?? "65");
  const [tolerancePct, setTolerancePct] = useState((defaults?.tolerancePct ?? 5).toString());
  const [revenueSharePct, setRevenueSharePct] = useState((defaults?.revenueSharePct ?? 58).toString());
  const [unitRate, setUnitRate] = useState((defaults?.unitElectricityRate ?? 8).toString());
  const [termMonths, setTermMonths] = useState((defaults?.termMonths ?? 60).toString());
  const [spareStock, setSpareStock] = useState((defaults?.spareStockCount ?? 0).toString());
  const [exclusions, setExclusions] = useState(defaults?.exclusions ?? "");
  const [amcTerms, setAmcTerms] = useState(defaults?.amcTerms ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    const input: OfferTermInput = {
      benchmarkSource,
      negotiatedBenchmarkPct: benchmarkSource === "negotiated_fixed" ? Number(negotiatedPct) : null,
      tolerancePct: Number(tolerancePct),
      revenueSharePct: Number(revenueSharePct),
      unitElectricityRate: Number(unitRate),
      termMonths: Number(termMonths),
      spareStockCount: Number(spareStock) || 0,
      exclusions,
      amcTerms,
    };
    startTransition(async () => {
      const r =
        mode === "counter" && counterOfId
          ? await counterOffer(pipelineId, counterOfId, input, note)
          : await generateOffer(pipelineId, input);
      setError(r?.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
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

        {benchmarkSource === "negotiated_fixed" && (
          <Field
            label="Agreed benchmark %"
            htmlFor="of-bpct"
            hint="CON-20's 60–80% range. Consumption is still metered and monitored."
          >
            <input
              id="of-bpct"
              type="number"
              step="0.01"
              value={negotiatedPct}
              onChange={(e) => setNegotiatedPct(e.target.value)}
              disabled={pending}
              className="field"
            />
          </Field>
        )}

        <Field label="Tolerance band" htmlFor="of-tol" hint="CON-01a — one value per contract, applied per circuit.">
          <select
            id="of-tol"
            value={tolerancePct}
            onChange={(e) => setTolerancePct(e.target.value)}
            disabled={pending}
            className="field"
          >
            {ALLOWED_TOLERANCE_PCT.map((t) => (
              <option key={t} value={t}>
                ±{t}%
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Society's revenue share (%)"
          htmlFor="of-rev"
          hint="The society's half of the split — FirsThing takes the rest."
        >
          <input
            id="of-rev"
            type="number"
            step="0.01"
            value={revenueSharePct}
            onChange={(e) => setRevenueSharePct(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>

        <Field label="Unit electricity rate (₹/kWh)" htmlFor="of-rate">
          <input
            id="of-rate"
            type="number"
            step="0.01"
            value={unitRate}
            onChange={(e) => setUnitRate(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>

        <Field label="Term (months)" htmlFor="of-term">
          <input
            id="of-term"
            type="number"
            value={termMonths}
            onChange={(e) => setTermMonths(e.target.value)}
            disabled={pending}
            className="field"
          />
        </Field>

        <Field label="Contracted spare stock" htmlFor="of-spare" hint="CON-15 — no default, agreed per society.">
          <input
            id="of-spare"
            type="number"
            value={spareStock}
            onChange={(e) => setSpareStock(e.target.value)}
            disabled={pending}
            className="field"
          />
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
          <input
            id="of-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={pending}
            placeholder="Wants 62% share and a 36-month term."
            className="field"
          />
        </Field>
      )}

      {error && <ErrorText>{error}</ErrorText>}

      <button type="button" onClick={submit} disabled={pending} className="btn-primary">
        {pending ? "Saving…" : mode === "counter" ? "Record counter as a new version" : "Generate offer"}
      </button>
    </div>
  );
}
