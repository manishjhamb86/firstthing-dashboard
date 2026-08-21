import { describe, expect, it } from "vitest";
import {
  calculateFeeLine,
  calculateMonth,
  contractedFeeFor,
  evaluateCompliance,
  extrapolate,
  measuredSavingsPct,
  resolvePricingBasis,
  toRupees,
  type CalculationTerms,
  type CircuitTerms,
} from "@/lib/monthly-calculation";

const TERMS: CalculationTerms = {
  tolerancePct: 10,
  societyRevenueSharePct: 58,
  unitElectricityRate: 8,
};

function circuit(over: Partial<CircuitTerms> = {}): CircuitTerms {
  return {
    circuitId: "ckt-1",
    lightType: "basement",
    meteredLightCount: 40,
    representedLightCount: 200,
    benchmarkSavingsPct: 68,
    baselineKwhPerDay: 10,
    contractedMonthlyFee: 1142.4,
    ...over,
  };
}

// ── TC-048-1 — the formula the whole product rests on ──────────────────────
describe("TC-048-1 — CON-11's per-circuit extrapolation and fee", () => {
  it("matches the test plan's fixture exactly", () => {
    const extrapolated = extrapolate({
      meteredKwh: 100,
      meteredLightCount: 40,
      representedLightCount: 200,
    });
    expect(extrapolated).toBe(500); // 200 ÷ 40 × 100

    const { savedKwh, savedValue, firsthingFee } = contractedFeeFor({
      extrapolatedConsumptionKwh: extrapolated,
      benchmarkSavingsPct: 68,
      unitElectricityRate: 8,
      societyRevenueSharePct: 58,
    });
    expect(savedKwh).toBe(340); // 500 × 68%
    expect(savedValue).toBe(2720); // 340 × ₹8
    expect(firsthingFee).toBeCloseTo(1142.4, 10); // 2,720 × 42%
  });

  // ── the identity that catches a baseline/actual mix-up ──────────────────
  it("bills the same on actual-metered as on fixed when a circuit is exactly at benchmark", () => {
    // If a circuit saves precisely what it contracted to save, the two
    // pricing bases MUST agree — actual-metered exists to bill what was
    // really saved, and what was really saved is the contracted amount.
    //
    // This is the assertion that catches multiplying post-install
    // consumption by the savings percentage instead of pre-install
    // consumption: it made actual-metered come out at 35% of fixed.
    const terms = {
      circuitId: "c1",
      lightType: "Tube Light",
      meteredLightCount: 100,
      representedLightCount: 400,
      benchmarkSavingsPct: 65,
      baselineKwhPerDay: 40,
      // 400/100 × 40 × 30 × 65% × ₹8 × 42%
      contractedMonthlyFee: 10_483.2,
    };
    // 14 kWh/day against a 40 kWh/day baseline is exactly 65% saved.
    const readings = { circuitId: "c1", meteredKwh: 420, coverageDays: 30, daysInMonth: 30 };
    const contract = { tolerancePct: 10, unitElectricityRate: 8, societyRevenueSharePct: 58 };

    const inBand = calculateFeeLine({
      terms,
      readings,
      contract,
      priorConsecutiveBreaches: 0,
      priorBreachAttributableAndUncorrected: false,
    });
    expect(inBand.measuredSavingsPct).toBeCloseTo(65, 10);
    expect(inBand.pricingBasis).toBe("fixed");
    // 4,800 kWh at baseline − 1,680 actual = 3,120 saved. NOT 1,092.
    expect(inBand.savedKwh).toBeCloseTo(3120, 10);
    expect(inBand.savedKwh).not.toBeCloseTo(1092, 2);
    expect(inBand.savedValue).toBeCloseTo(24_960, 10);

    // The identity itself. A circuit at its benchmark is by definition IN
    // band, so the basis cannot actually flip here — which is why this
    // asserts the arithmetic rather than the branch: what actual-metered
    // pricing WOULD charge equals the contracted fee, to the paisa.
    const whatActualMeteredWouldCharge = inBand.savedValue * 0.42;
    expect(whatActualMeteredWouldCharge).toBeCloseTo(terms.contractedMonthlyFee, 8);
    expect(whatActualMeteredWouldCharge).not.toBeCloseTo(3669.12, 2);
  });

  it("bills actual-metered BELOW the contracted fee when a circuit underperforms", () => {
    // The direction matters as much as the identity: an underperforming
    // circuit must cost the society less than its contracted fee, or
    // actual-metered pricing would be a penalty rather than a correction.
    const terms = {
      circuitId: "c1",
      lightType: "Tube Light",
      meteredLightCount: 100,
      representedLightCount: 400,
      benchmarkSavingsPct: 65,
      baselineKwhPerDay: 40,
      contractedMonthlyFee: 10_483.2,
    };
    // 20 kWh/day against 40 is 50% saved — well outside a ±10% band.
    const line = calculateFeeLine({
      terms,
      readings: { circuitId: "c1", meteredKwh: 600, coverageDays: 30, daysInMonth: 30 },
      contract: { tolerancePct: 10, unitElectricityRate: 8, societyRevenueSharePct: 58 },
      priorConsecutiveBreaches: 1,
      priorBreachAttributableAndUncorrected: true,
    });
    expect(line.measuredSavingsPct).toBeCloseTo(50, 10);
    expect(line.pricingBasis).toBe("actual_metered");
    // 4,800 × 50% = 2,400 kWh × ₹8 × 42% = ₹8,064
    expect(line.amount).toBeCloseTo(8064, 8);
    expect(line.amount).toBeLessThan(terms.contractedMonthlyFee);
  });

  it("credits the fee to the right party — 42% FirsThing, not 58%", () => {
    // This exact inversion has shipped twice in this project: nine places in a
    // mockup deck, and in this test case's own first draft. Asserting the
    // number alone would not have caught either. 2,720 × 58% = 1,577.60.
    const { firsthingFee } = contractedFeeFor({
      extrapolatedConsumptionKwh: 500,
      benchmarkSavingsPct: 68,
      unitElectricityRate: 8,
      societyRevenueSharePct: 58,
    });
    expect(firsthingFee).not.toBeCloseTo(1577.6, 2);
    expect(firsthingFee).toBeLessThan(2720 / 2);
  });

  it("sums independent per-type extrapolations, never a society-wide average", () => {
    // Two light types with genuinely different profiles. A society-wide
    // average of the two ratios would give 300 × (100+40) = a different, wrong
    // number; CON-11 was rewritten precisely to forbid that.
    const month = calculateMonth({
      contract: TERMS,
      circuits: [
        {
          terms: circuit({ circuitId: "a", meteredLightCount: 40, representedLightCount: 200 }),
          readings: { circuitId: "a", meteredKwh: 100, coverageDays: 30, daysInMonth: 30 },
          priorConsecutiveBreaches: 0,
          priorBreachAttributableAndUncorrected: false,
        },
        {
          terms: circuit({
            circuitId: "b",
            lightType: "staircase",
            meteredLightCount: 10,
            representedLightCount: 60,
          }),
          readings: { circuitId: "b", meteredKwh: 40, coverageDays: 30, daysInMonth: 30 },
          priorConsecutiveBreaches: 0,
          priorBreachAttributableAndUncorrected: false,
        },
      ],
    });
    expect(month.feeLines[0].extrapolatedConsumptionKwh).toBe(500); // 200÷40×100
    expect(month.feeLines[1].extrapolatedConsumptionKwh).toBe(240); // 60÷10×40
    expect(month.totalExtrapolatedKwh).toBe(740);
  });

  it("does not round the extrapolation", () => {
    // 7 ÷ 3 is not representable; rounding here lands in a rupee figure.
    const e = extrapolate({ meteredKwh: 100, meteredLightCount: 3, representedLightCount: 7 });
    expect(e).toBeCloseTo(233.3333333333, 10);
  });

  it("refuses to extrapolate from a circuit with no metered lights", () => {
    expect(() =>
      extrapolate({ meteredKwh: 100, meteredLightCount: 0, representedLightCount: 200 }),
    ).toThrow();
  });
});

// ── The savings % is per day, not per month ────────────────────────────────
describe("measuredSavingsPct", () => {
  it("compares per day so a short month is not read as a saving", () => {
    // 25 days at 3 kWh against a 10 kWh/day baseline is a 70% saving, whether
    // the month reported 25 days or 31. Dividing 75 kWh by a full-month
    // baseline would read as 75.8% — a saving the lighting never made.
    expect(measuredSavingsPct({ meteredKwh: 75, coverageDays: 25, baselineKwhPerDay: 10 })).toBe(70);
    expect(measuredSavingsPct({ meteredKwh: 93, coverageDays: 31, baselineKwhPerDay: 10 })).toBe(70);
  });

  it("is zero rather than NaN when a month has no usable days", () => {
    expect(measuredSavingsPct({ meteredKwh: 0, coverageDays: 0, baselineKwhPerDay: 10 })).toBe(0);
  });

  it("goes negative when a circuit consumes more than its baseline", () => {
    expect(measuredSavingsPct({ meteredKwh: 330, coverageDays: 30, baselineKwhPerDay: 10 })).toBe(-10);
  });
});

// ── CON-01: the band is a compliance check, and it is one-sided ────────────
describe("evaluateCompliance", () => {
  it("is in band when the shortfall is inside the contracted tolerance", () => {
    const r = evaluateCompliance({ measuredSavingsPct: 60, benchmarkSavingsPct: 68, tolerancePct: 10 });
    expect(r.deviationPct).toBe(-8);
    expect(r.complianceResult).toBe("in_band");
  });

  it("is out of band when the shortfall exceeds it", () => {
    const r = evaluateCompliance({ measuredSavingsPct: 55, benchmarkSavingsPct: 68, tolerancePct: 10 });
    expect(r.deviationPct).toBe(-13);
    expect(r.complianceResult).toBe("out_of_band");
  });

  it("treats a ±5% contract more strictly than a ±10% one, on the same reading", () => {
    const reading = { measuredSavingsPct: 60, benchmarkSavingsPct: 68 };
    expect(evaluateCompliance({ ...reading, tolerancePct: 5 }).complianceResult).toBe("out_of_band");
    expect(evaluateCompliance({ ...reading, tolerancePct: 10 }).complianceResult).toBe("in_band");
  });

  it("never treats over-performance as a breach", () => {
    // 85% saved against a 68% benchmark is 17 points *better*. A symmetric
    // band would raise a deviation review here, which is nonsense: nobody is
    // owed anything and nothing is wrong.
    const r = evaluateCompliance({ measuredSavingsPct: 85, benchmarkSavingsPct: 68, tolerancePct: 10 });
    expect(r.deviationPct).toBe(17);
    expect(r.complianceResult).toBe("in_band");
  });

  it("puts a shortfall of exactly the band inside it, not outside", () => {
    const r = evaluateCompliance({ measuredSavingsPct: 58, benchmarkSavingsPct: 68, tolerancePct: 10 });
    expect(r.complianceResult).toBe("in_band");
  });
});

// ── CON-01d — the amber warning, scaled to each contract's own band ────────
describe("evaluateCompliance — CON-01d's approaching state", () => {
  it("goes amber at 8% short on a ±10% contract", () => {
    const r = evaluateCompliance({ measuredSavingsPct: 60, benchmarkSavingsPct: 68, tolerancePct: 10 });
    expect(r.complianceResult).toBe("in_band");
    expect(r.approaching).toBe(true);
  });

  it("goes amber at 4% short on a ±5% contract — the same reading would not, on ±10%", () => {
    const reading = { measuredSavingsPct: 64, benchmarkSavingsPct: 68 };
    expect(evaluateCompliance({ ...reading, tolerancePct: 5 }).approaching).toBe(true);
    expect(evaluateCompliance({ ...reading, tolerancePct: 10 }).approaching).toBe(false);
  });

  it("is not amber when the month is comfortably inside the band", () => {
    const r = evaluateCompliance({ measuredSavingsPct: 67, benchmarkSavingsPct: 68, tolerancePct: 10 });
    expect(r.approaching).toBe(false);
  });

  it("is not amber once it is actually out of band — that is a breach, not a warning", () => {
    const r = evaluateCompliance({ measuredSavingsPct: 50, benchmarkSavingsPct: 68, tolerancePct: 10 });
    expect(r.complianceResult).toBe("out_of_band");
    expect(r.approaching).toBe(false);
  });

  it("never goes amber on over-performance", () => {
    expect(
      evaluateCompliance({ measuredSavingsPct: 78, benchmarkSavingsPct: 68, tolerancePct: 10 })
        .approaching,
    ).toBe(false);
  });
});

// ── CON-01c: sustained is two consecutive months, and month 1 never adjusts ─
describe("resolvePricingBasis — CON-01c", () => {
  it("month 1 out of band stays fixed and starts the streak", () => {
    const r = resolvePricingBasis({
      complianceResult: "out_of_band",
      priorConsecutiveBreaches: 0,
      priorBreachAttributableAndUncorrected: false,
    });
    expect(r.pricingBasis).toBe("fixed");
    expect(r.consecutiveBreachCount).toBe(1);
  });

  it("month 2 flips to actual-metered when the cause is FirsThing's and uncorrected", () => {
    const r = resolvePricingBasis({
      complianceResult: "out_of_band",
      priorConsecutiveBreaches: 1,
      priorBreachAttributableAndUncorrected: true,
    });
    expect(r.pricingBasis).toBe("actual_metered");
    expect(r.consecutiveBreachCount).toBe(2);
  });

  it("does NOT flip when the cause is society-caused, however long it runs", () => {
    // CON-01b's exclusion list: blocked sensors, layout changes, missing
    // society-side maintenance. An excluded shortfall leaves the bill
    // unchanged regardless of the streak.
    const r = resolvePricingBasis({
      complianceResult: "out_of_band",
      priorConsecutiveBreaches: 4,
      priorBreachAttributableAndUncorrected: false,
    });
    expect(r.pricingBasis).toBe("fixed");
    expect(r.consecutiveBreachCount).toBe(5);
  });

  it("an in-band month resets the streak to zero", () => {
    const r = resolvePricingBasis({
      complianceResult: "in_band",
      priorConsecutiveBreaches: 1,
      priorBreachAttributableAndUncorrected: true,
    });
    expect(r.pricingBasis).toBe("fixed");
    expect(r.consecutiveBreachCount).toBe(0);
  });
});

// ── The fee line as a whole ────────────────────────────────────────────────
describe("calculateFeeLine", () => {
  it("bills the contracted amount on a compliant month, not a recomputation", () => {
    // CON-01: the monthly bill is normally FIXED. The reading is the check.
    const line = calculateFeeLine({
      terms: circuit(),
      readings: { circuitId: "ckt-1", meteredKwh: 96, coverageDays: 30, daysInMonth: 30 },
      contract: TERMS,
      priorConsecutiveBreaches: 0,
      priorBreachAttributableAndUncorrected: false,
    });
    expect(line.complianceResult).toBe("in_band");
    expect(line.pricingBasis).toBe("fixed");
    expect(line.amount).toBe(1142.4);
  });

  it("derives the amount from the month's own reading once it flips", () => {
    // 30 days at 6 kWh/day against a 10 kWh baseline = 40% saved, 28 points
    // short of a 68% benchmark, on a second consecutive attributable breach.
    const line = calculateFeeLine({
      terms: circuit(),
      readings: { circuitId: "ckt-1", meteredKwh: 180, coverageDays: 30, daysInMonth: 30 },
      contract: TERMS,
      priorConsecutiveBreaches: 1,
      priorBreachAttributableAndUncorrected: true,
    });
    expect(line.measuredSavingsPct).toBe(40);
    expect(line.pricingBasis).toBe("actual_metered");
    // The saving is what the circuit did NOT consume, so it is measured from
    // the baseline, not from the bill. Baseline 200÷40 × (10 × 30) = 1,500
    // kWh; the circuit drew 200÷40 × 180 = 900; so it saved 600 — × ₹8 =
    // ₹4,800, × 42% = ₹2,016.
    //
    // This expectation used to read 1,209.6, from `900 × 40%` — multiplying
    // what the circuit consumed after the retrofit by the fraction it saved,
    // which is not a quantity that means anything. Its own comment said
    // "360 saved" about a circuit that saved 600.
    expect(line.savedKwh).toBeCloseTo(600, 10);
    expect(line.amount).toBeCloseTo(2016, 10);
    expect(line.amount).not.toBeCloseTo(1209.6, 2);
    expect(line.amount).toBeLessThan(line.savedValue);
  });
});

// ── CON-22's prorated first month ─────────────────────────────────────────
describe("calculateMonth — the first billed month", () => {
  const oneCircuit = [
    {
      terms: circuit(),
      readings: { circuitId: "ckt-1", meteredKwh: 96, coverageDays: 30, daysInMonth: 31 },
      priorConsecutiveBreaches: 0,
      priorBreachAttributableAndUncorrected: false,
    },
  ];

  it("bills the whole fee when there is no first-month proration", () => {
    const m = calculateMonth({ circuits: oneCircuit, contract: TERMS });
    expect(m.proration).toBeNull();
    expect(m.total).toBe(1142.4);
  });

  it("prorates SCR-064's own worked example — signed 20 Aug, 11 of 31 days", () => {
    const m = calculateMonth({
      circuits: oneCircuit,
      contract: TERMS,
      firstMonthSignedAt: new Date(Date.UTC(2026, 7, 20)),
    });
    expect(m.proration!.proratedDays).toBe(11);
    expect(m.proration!.daysInMonth).toBe(31);
    expect(m.total).toBeCloseTo(1142.4 * (11 / 31), 10);
  });

  it("prorates the month's total once, not each line separately", () => {
    // Two lines prorated individually and summed can differ from the sum
    // prorated once, and the society accepted a monthly figure, not a set of
    // line figures.
    const m = calculateMonth({
      circuits: [
        oneCircuit[0],
        {
          terms: circuit({ circuitId: "b", contractedMonthlyFee: 333.33 }),
          readings: { circuitId: "b", meteredKwh: 96, coverageDays: 30, daysInMonth: 31 },
          priorConsecutiveBreaches: 0,
          priorBreachAttributableAndUncorrected: false,
        },
      ],
      contract: TERMS,
      firstMonthSignedAt: new Date(Date.UTC(2026, 7, 20)),
    });
    expect(m.subtotal).toBeCloseTo(1475.73, 10);
    expect(m.total).toBeCloseTo(1475.73 * (11 / 31), 10);
  });

  it("FEAT-051-AC-5: a termination prorates the final month by the days served", () => {
    // One mechanism, both ends. Service ending on 12 August of a 31-day month
    // bills 12 days — inclusive of the last served day, the mirror of the
    // start being inclusive of the first.
    const m = calculateMonth({
      circuits: oneCircuit,
      contract: TERMS,
      finalMonthEndsOn: new Date(Date.UTC(2026, 7, 12)),
    });
    expect(m.proration!.proratedDays).toBe(12);
    expect(m.proration!.daysInMonth).toBe(31);
    expect(m.total).toBeCloseTo(1142.4 * (12 / 31), 10);
  });

  it("prorates against February's own denominator, not a 30-day convention", () => {
    const m = calculateMonth({
      circuits: oneCircuit,
      contract: TERMS,
      finalMonthEndsOn: new Date(Date.UTC(2028, 1, 14)), // leap year
    });
    expect(m.proration!.daysInMonth).toBe(29);
    expect(m.proration!.fraction).toBeCloseTo(14 / 29, 10);
  });

  it("a signature on the last day of a month bills the next month in full", () => {
    const m = calculateMonth({
      circuits: oneCircuit,
      contract: TERMS,
      firstMonthSignedAt: new Date(Date.UTC(2026, 7, 31)),
    });
    expect(m.proration!.proratedDays).toBe(30); // 1–30 September
    expect(m.proration!.fraction).toBe(1);
    expect(m.total).toBe(1142.4);
  });
});

describe("toRupees", () => {
  it("rounds once, at the point the figure becomes money", () => {
    // 1,142.40 × 11/31 = 405.3677… — rounded once, here, and nowhere earlier.
    expect(toRupees(1142.4 * (11 / 31))).toBe(405.37);
    expect(toRupees(0.005)).toBe(0.01);
  });
});
