# ADR-002: SUR-02 is a client of the same app; offline via IndexedDB outbox + Route Handlers
**Status:** Accepted · **Date:** 2026-08-13 · **Reversibility:** costly

## Context

SUR-02 (field: survey, commissioning, installation, inspection) is "the only surface with a hard
offline requirement (XC-02), and the only one where a *pending* state can block a person physically
standing on a site" (`04-flows-system-map.md` §3). ASSUM-12 already settled *that* it's mobile web,
not a native app. What's still open is *how* it stays usable without connectivity in basements and
pump rooms, and how captured work reaches the server once connectivity returns.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| Client-side IndexedDB outbox; Route Handlers as the sync API; Server Actions for online-only interactions | Route Handlers give a stable JSON contract a retry queue can call repeatedly and idempotently; IndexedDB survives app close/reload (NFR-09); no new backend service | Client-side sync logic is real engineering work — conflict handling, retry/backoff, per-section versioning (CONTRACT-03) | medium |
| Native app with local SQLite + platform sync framework | Mature offline patterns, background sync APIs | Directly contradicts ASSUM-12/CON-46 (mobile web, no app-store dependency); a second release train this team can't support | very high |
| Server-Sent Events / WebSocket "live" sync, no offline queue | Simpler mental model when online | Doesn't function at all with no connectivity — the actual, common case in basements/pump rooms (XC-02) | N/A — doesn't meet the requirement |
| PWA + Background Sync API only, no app-level outbox | Uses a browser-native primitive | Background Sync API browser support/reliability on the Android devices field staff actually use (ASSUM-27) is inconsistent enough that relying on it alone is a real risk, not a savings | medium-high |

## Decision

A client-side IndexedDB outbox queues captures locally; Route Handlers (not Server Actions) serve
as the sync endpoints per CONTRACT-01..11, because a Server Action is bound to a live RSC render
and doesn't suit a queued/retried caller that may submit an hour or a day after the user tapped
"save." The two blocking contracts (CONTRACT-04/05, gate pass) are the deliberate exception —
online-required by CON-18's own design, with CON-40's provisional-release timer (ADR-006) as the
answer to what happens when "online" doesn't happen in time.

## Consequences

Easy: no native release train, one shared session/auth model with SUR-01. Hard: every offline
contract needs its own partial-sync and conflict story worked out explicitly (this is why
`09-architecture.md` §4 specifies idempotency and ordering per contract rather than leaving it
implicit) — CON-44's area-claim model (ADR-007) is the sharpest example of that work.

## Revisit when

Field connectivity assumptions change materially (e.g. company-issued devices with a managed
connectivity plan replace ASSUM-27's personal-phone assumption), which would also reopen the
session-boundary tradeoffs in NFR-13.
