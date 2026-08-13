# ADR-005: Append-only/versioned entities for provenance
**Status:** Accepted · **Date:** 2026-08-13 · **Reversibility:** permanent

## Context

Three invariants require this structurally, not just as a code-review convention: INV-02 (every
savings figure traces to the readings and benchmark version that produced it), INV-03 (invoices
are never edited once issued; a correction is a new version, both retained), and INV-07 (a
light-count rescale is a distinct, timestamped, deterministic event, never conflated with a
reviewed billing decision). `docs/backlog.yaml`'s GATE-01/GATE-02 name the exact features these
must be enforced in.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| Versioned rows (new row per change, `isCurrent`/`effectiveFrom`/`effectiveTo` or `superseded*` fields), never `UPDATE` on a released record | Makes INV-02/INV-03 true by construction — a query for "what was known when this bill was calculated" is just a query, not a reconstruction from application logs | More rows over time; every read path needs to know to filter for the current/relevant version | low |
| Application-level audit log (a separate `AuditLog` table recording every change to the "real" mutable tables) | Familiar pattern; doesn't change the primary tables' shape | The audit log becomes a second source of truth that can drift from the primary tables if any write path forgets to log; reconstructing "what a released calculation actually used" means joining live data against a log rather than reading an immutable snapshot directly | medium |
| Database-level append-only enforcement (e.g. a Postgres trigger rejecting `UPDATE`/`DELETE` on specific tables) | Removes the possibility of an application bug bypassing the convention entirely | Real operational friction for legitimate corrections (which still need to happen as new rows, not become impossible); adds a database-level mechanism this team would be solely responsible for maintaining | medium |

## Decision

Versioned rows, as sketched in `09-architecture.md` §5.2: `MeterReading.supersededValue/At/ByUserId`
for the FEAT-107 reconciliation model (superseded, not deleted), `Benchmark.effectiveFrom/effectiveTo/isCurrent`
for versioning, `MonthlyCalculation`/`Invoice`/`SavingsReport` treated as immutable once `released`
(no field-level supersession needed there — a correction is a new `MonthlyCalculation` for a
reopened month, per FEAT-107 rule 6b's "a closed month must be reopened before overwrite").
Enforcement lives in the query-layer convention (§9), not a database trigger, matching this team's
existing risk tolerance for convention-over-mechanism (the same choice already made for GATE-03's
tenancy scoping).

## Consequences

Easy: any dispute, audit, or "why did this number change" question is answerable by reading data,
not reconstructing history from logs. Hard: NFR-04's completeness test (every write to the tables
in NFR-03 carries its provenance) becomes load-bearing infrastructure, not a nice-to-have test —
without it, this ADR's guarantee is just a convention nobody's checking.

## Revisit when

If NFR-04's test suite repeatedly catches real violations post-launch (i.e., the convention is
proving too easy to bypass in practice), reconsider the database-trigger option above as a harder
backstop.
