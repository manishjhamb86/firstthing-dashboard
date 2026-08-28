// How a pre-system society's figures were arrived at, where that differs from
// the standard the product now follows.
//
// These societies were commissioned before this system existed, and there was
// no single method: one agreement extrapolates the demo's MEASURED daily
// figure to the contracted light count, the next uses the theoretical; one
// averages two demos' percentages, another sums their totals; one starts
// billing the day after installation completes, another the same day.
//
// None of that can be corrected — it is what was signed and what the society
// has been billed on — so it is recorded instead. A figure whose basis is
// unstated is a figure that cannot be defended when it is questioned, which
// is what INV-02 exists to prevent. New deals follow one method; these carry
// their own, in writing, wherever the figure is shown.

export type DeviationCode =
  | "extrapolation-measured"
  | "extrapolation-theoretical"
  | "benchmark-single-demo"
  | "benchmark-mean-of-demo-percentages"
  | "benchmark-adjusted-for-excluded-devices"
  | "benchmark-from-superseded-annexure"
  | "benchmark-rounded-in-agreement"
  | "demos-run-in-batches"
  | "report-contradicts-its-own-table"
  | "report-share-differs-from-agreement"
  | "fee-device-charge-plus-share-of-net"
  | "billing-starts-on-completion-day"
  | "dates-inferred-from-readings"
  | "represented-count-from-invoice"
  | "eligibility-never-assessed"
  | "agreement-figures-do-not-reconcile"
  | "minimum-light-clause-not-enforced"
  | "billing-predates-agreement-execution"
  | "agreement-re-executed-after-changes"
  | "not-billing";

type Meta = { label: string; what: string; standard: string };

export const DEVIATIONS: Record<DeviationCode, Meta> = {
  "extrapolation-measured": {
    label: "Extrapolated from the measured demo",
    what: "The contracted monthly consumption scales the demo's MEASURED daily figure up to the contracted light count.",
    standard: "CON-11 extrapolates the measured circuit, so this one matches what the product now does.",
  },
  "extrapolation-theoretical": {
    label: "Extrapolated from the theoretical load",
    what: "The contracted monthly consumption is count × wattage × hours, not the demo's measured figure — a lower number, so a lower fee.",
    standard: "CON-11 extrapolates the MEASURED circuit. This agreement did not.",
  },
  "benchmark-single-demo": {
    label: "Benchmark from one demo",
    what: "One demonstration decided the benchmark.",
    standard: "This is the ordinary case.",
  },
  "benchmark-mean-of-demo-percentages": {
    label: "Benchmark is the mean of two demos' percentages",
    what: "Two demos over different sets of lights; the benchmark is the simple average of their savings percentages, not the ratio of their summed totals.",
    standard: "FEAT-014-AC-7 now defines this as the rule for multiple counting demos.",
  },
  "benchmark-adjusted-for-excluded-devices": {
    label: "Benchmark adjusted for fittings that were not replaced",
    what: "A fitting sharing the circuit is not part of the solution, so its theoretical load comes off both sides of the savings figure — the benchmark is higher than the raw meter ratio.",
    standard: "CON-16's amendment defines this, so it matches what the product now does.",
  },
  "benchmark-from-superseded-annexure": {
    label: "Benchmark from an annexure that was never updated",
    what: "The annexure fixed the benchmark on the first demo and states that it would be revised once a second reported. It never was, and billing follows the un-revised figure.",
    standard: "A benchmark would now be re-derived when a second demo counts.",
  },
  "benchmark-rounded-in-agreement": {
    label: "Agreed benchmark differs from the report's own arithmetic",
    what: "The percentage in the agreement is not exactly what the report's own figures divide to — a rounding slip carried into the contract.",
    standard: "Nothing is rounded automatically now; a difference is a recorded override.",
  },
  "demos-run-in-batches": {
    label: "Demonstrated in batches, weeks apart",
    what: "The circuit's lights were demonstrated in separate batches on different dates, so no single day measured the whole circuit.",
    standard: "A circuit is demonstrated once, or concurrently.",
  },
  "report-contradicts-its-own-table": {
    label: "The report disagrees with its own table",
    what: "The average the report prints is not the mean of the days it lists. The printed figure is what every downstream number was computed from, so it is the one on record, and the days stay as measured.",
    standard: "A stored average is computed from the stored days.",
  },
  "report-share-differs-from-agreement": {
    label: "The demo report states a different revenue share",
    what: "The report's closing line names a share the signed agreement does not carry. The agreement governs.",
    standard: "One share, stated once.",
  },
  "fee-device-charge-plus-share-of-net": {
    label: "Fixed device charge plus a share of what remains",
    what: "The monthly fee is a per-light hardware charge plus a percentage of the savings left after it — not a straight share of savings. Both halves scale with the light count, so it reduces to a constant effective share, which is what is stored.",
    standard: "A single revenue share of the verified savings.",
  },
  "billing-starts-on-completion-day": {
    label: "Billing began the day installation completed",
    what: "The first invoice's period starts on the completion day itself.",
    standard: "CON-22 starts billing the day AFTER completion.",
  },
  "dates-inferred-from-readings": {
    label: "Commissioning dates inferred, not stated",
    what: "Neither document gives the meter-install or light-replacement date. They are taken as the day before the first reading of each window.",
    standard: "Both dates are recorded as they happen.",
  },
  "represented-count-from-invoice": {
    label: "Represented light count taken from the invoice",
    what: "The society-wide count comes from the first invoice's own quantity rather than a walked inventory.",
    standard: "FEAT-006's inventory is walked at survey time.",
  },
  "eligibility-never-assessed": {
    label: "CON-16 eligibility was never assessed",
    what: "The circuit was already in service when it was recorded, so the eligibility checklist was never run against it.",
    standard: "FEAT-007 assesses eligibility before a circuit is selected.",
  },
  "billing-predates-agreement-execution": {
    label: "Billing began before the agreement was executed",
    what: "The contract's billing period starts months before the document governing it was signed. The agreement sets that period out itself, so it is backdated by intent rather than by accident.",
    standard: "A contract's term runs from the completion its own agreement records.",
  },
  "agreement-re-executed-after-changes": {
    label: "Signed twice — the second execution is the one on record",
    what: "An earlier version was signed, then the terms changed and the agreement was re-executed. The dates held here are the second signing; the earlier one is not on file.",
    standard: "An amendment is appended to the agreement it changes, and both stay retrievable.",
  },
  "minimum-light-clause-not-enforced": {
    label: "Fewer lights installed than the agreement's minimum",
    what: "The agreement states that below its minimum the full monthly charge stays payable. Fewer went in, and the charge was scaled to the actual count instead — in the society's favour.",
    standard: "An offer prices the lights actually contracted.",
  },
  "agreement-figures-do-not-reconcile": {
    label: "The agreement's own commercial figures do not reconcile",
    what: "The split, fee and monthly-savings figures printed in the agreement cannot all be true together. What the society is actually billed was taken from the invoice instead.",
    standard: "An offer's figures are computed, so they reconcile by construction.",
  },
  "not-billing": {
    label: "Commissioned but not billing",
    what: "The circuit has a confirmed benchmark but no fee line; its terms are on record and unused.",
    standard: "A commissioned circuit bills from its contract's term start.",
  },
};

export function describeDeviations(codes: string[]): { code: DeviationCode; meta: Meta }[] {
  return codes
    .filter((c): c is DeviationCode => c in DEVIATIONS)
    .map((code) => ({ code, meta: DEVIATIONS[code] }));
}
