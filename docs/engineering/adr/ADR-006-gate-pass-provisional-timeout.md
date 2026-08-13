# ADR-006: Gate-pass blocking approval resolved via a 30-minute provisional-release sweep
**Status:** Accepted · **Date:** 2026-08-13 · **Reversibility:** costly

## Context

CON-18 makes backend approval a precondition for a technician leaving a site; CON-40 already
resolved the *product* rule at Phase 4: if approval doesn't return within 30 minutes, the
technician may leave under a provisional gate pass, reviewed the same day. What Phase 7 has to
decide is the *mechanism* — how does "30 minutes, then provisional" actually get implemented
against CONTRACT-04/05's blocking, synchronous contract.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| Client polls/waits, and a server-side sweep job (COMP-11) flips any `submitted` gate pass older than 30 minutes to `provisional` | The timeout is enforced server-side against a server clock, not a device clock the technician could be tempted to trust incorrectly; reuses the job runner already justified by ADR-003 | The client still needs to know to stop waiting and re-check status, not just spin forever | low |
| Client-side timer: after 30 minutes with no response, the client itself declares the gate pass provisional | Simpler to implement, no server dependency | A device clock is exactly what CONTRACT-02's own contract already refuses to trust for a similar 24h-lockout decision, for the same reason: it can be wrong, and the consequence here (someone leaving a site) is higher-stakes, not lower | N/A — rejected on the same principle as CONTRACT-02 |
| Push notification to PER-01 the moment 30 minutes elapses, human decides in the moment | Keeps a human in the loop at the exact trigger point | Doesn't actually solve the connectivity-failure case CON-40 exists for — if backend is unreachable, a push notification prompting a human to approve doesn't help; the provisional state has to exist independent of anyone acting on it | N/A — doesn't meet the requirement |

## Decision

A `gatepass-sweep` job (part of ADR-003's queue) runs frequently enough to satisfy NFR-06 (flip to
`provisional` within 60 seconds of the 30-minute mark), evaluated against `GatePass.submittedAt`
on the server. The technician's client polls `CONTRACT-05` for a decision; a `provisional` result
is functionally identical to `approved` from the technician's point of view (they may leave), but
is flagged for same-day review per CON-40's own wording.

## Consequences

Easy: the 30-minute rule is enforced in exactly one place (the sweep job), not duplicated across
client and server. Hard: the sweep job's own reliability is now directly load-bearing for a
physical-world guarantee (a person not being stranded on site) — this is the sharpest instance of
RISK-04 in the whole system, and worth naming as such rather than treating the job runner as
"just infrastructure."

## Revisit when

If field connectivity data (once collected) shows the 30-minute window is systematically wrong for
some site types (e.g. basements taking longer to regain signal even after the technician leaves
the immediate work area), CON-40's own product rule — not just this mechanism — would need
revisiting first.
