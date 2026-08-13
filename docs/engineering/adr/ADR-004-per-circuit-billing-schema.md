# ADR-004: Per-circuit billing model as first-class schema
**Status:** Accepted · **Date:** 2026-08-13 · **Reversibility:** permanent

## Context

CON-11 was materially corrected at the Phase 3 gate: billing is not one benchmark scaled from one
sample circuit to a whole society — it's one circuit metered per distinct light type, each
extrapolating only across its own type, with the society total as a sum of independent per-type
lines. The tolerance band, deviation review, and the `actual-metered` flip (CON-01c) all apply
**per circuit**, independently. `04-flows-system-map.md` §4 names this explicitly as "the
structural shift this phase confirms... a fan-out at `Circuit` and a fan-in at
`MonthlyCalculation`," and states `CircuitFeeLine` "does not exist in the current schema."

This is the single most consequential modeling decision in the whole schema — everything about
how a bill is computed, disputed, and audited depends on getting the grain right.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| `CircuitFeeLine` as its own table, many per `MonthlyCalculation`, each independently tracking compliance/pricing basis/streak state | Matches CON-11 exactly; a dispute or an `actual-metered` flip is legible at the circuit that caused it, not buried in a society-level aggregate | More joins to render a single invoice total; more rows at scale (~800/month vs. ~200) | low — the "cost" here is just normal relational design, not a real tradeoff |
| A single `MonthlyCalculation.total` with per-circuit detail flattened into a JSON blob | Fewer tables, simpler reads for the common "show me the total" case | Makes DeviationReview, the streak count (CON-01c), and per-circuit audit trail (INV-02) all live inside opaque JSON instead of queryable rows — directly breaks INV-02's traceability requirement and GATE-01 | N/A — rejected, violates an invariant |
| Keep the old society-level `Benchmark`/single-bill shape and add circuit detail as a reporting-only side table | Minimal schema change from the pre-blueprint app | The old shape is exactly what CON-11's correction was written to replace; carrying it forward would resurrect the bug the correction fixed | N/A — rejected |

## Decision

`Circuit`, `Benchmark` (versioned per circuit), and `CircuitFeeLine` (many per
`MonthlyCalculation`, one per circuit, carrying its own `complianceResult`, `pricingBasis`, and
`consecutiveBreachCount`) are first-class, queryable tables, exactly as sketched in
`09-architecture.md` §5.2. `DeviationReview` belongs to a `CircuitFeeLine`, not to a society or a
month.

## Consequences

Easy: every audit question ("why did this bill change," "which circuit triggered the flip")
resolves to a specific row with its own history. Hard: the calculation engine (COMP-04) has to
correctly sum independent per-circuit lines into one invoice total and one savings-report
narrative that doesn't read as fragmented to a society committee seeing a mixed-basis month for
the first time (`04-flows-system-map.md` FLOW-10 step 5's own stated risk) — that's a real UX
problem this schema makes possible to solve correctly, not one it solves by itself.

## Revisit when

Never, barring another commercial-model change of CON-11's own magnitude — this is the schema's
spine, and re-deriving it would be a second rebuild, not a migration.
