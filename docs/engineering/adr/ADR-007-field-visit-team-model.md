# ADR-007: Field-visit team/area-claim model, not a single assignee
**Status:** Accepted · **Date:** 2026-08-13 · **Reversibility:** costly

## Context

CON-44 (added 2026-08-13, invalidating ASSUM-25) established that several field staff, each on
their own phone, can work the same visit simultaneously — on every visit type. The risk isn't data
corruption (device-generated IDs already make concurrent creates safe) but double-counting: two
people counting the same corridor inflates a light count, which sets `representedLightCount`
(CON-11), which sets the benchmark, which sets the fee. This has to be modeled correctly at the
schema level, not patched in later.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| `FieldVisitParticipant` (many-to-many roster) + `FieldVisitAreaClaim` (advisory, optimistic, per-area) — CON-44's own specified model | Matches the product decision exactly: work partitions by area, claiming an already-claimed area is allowed with a naming interstitial, two offline claims both sync and mark the area `contested`, rows are never summed or merged | Requires real UI/UX work for contested-area resolution (RISK-05) and a submission-blocking gate while any area is contested | medium |
| Pessimistic locking (only one participant may open an area at a time, enforced server-side) | Prevents double-entry by construction | Requires a lock to be acquirable, which CON-44 explicitly rules out offline ("a lock cannot be acquired offline") — this option doesn't function in the actual operating environment | N/A — rejected, doesn't meet the requirement |
| Single `assigneeId` on `FieldVisit`, unchanged from the pre-CON-44 assumption (ASSUM-25) | Simplest schema | Directly contradicts CON-44, which was raised specifically because this assumption was found to be false | N/A — rejected, superseded |

## Decision

`FieldVisitParticipant` and `FieldVisitAreaClaim` as separate tables (§5.2), replacing a single
`assigneeId`. Submission of the containing work (survey, installation day) is blocked at the
application layer while any `FieldVisitAreaClaim.status = contested` or any participant has
unsynced work — enforced the same way GATE-03's tenancy scoping is: a named convention with a test
suite behind it, not a database constraint (a `contested` state is a valid, expected intermediate
state, not an error condition a constraint should reject).

## Consequences

Easy: the schema can represent exactly what CON-44 describes, including the "advisory, not a real
lock" property. Hard: this is RISK-05 — the actual reconciliation UI (naming who claimed what,
letting the submitting person resolve a contest by hand with a recorded reason) is real, fiddly
product work that a schema alone doesn't solve, and it's on the critical path for FLOW-02 (survey)
and FLOW-07 (installation), both marked **critical** in the flow index.

## Revisit when

If field team sizes or area-partitioning conventions change materially (e.g. moving to
company-issued devices with better connectivity, per ADR-002's revisit condition), which might
make pessimistic locking viable again and simpler than the advisory-claim model.
