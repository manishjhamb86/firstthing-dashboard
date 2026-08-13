# ADR-001: Reconfirm the existing stack; one deployable monolith, not microservices
**Status:** Accepted · **Date:** 2026-08-13 · **Reversibility:** costly

## Context

CON-05 fixed the stack (Next.js 16, React 19, Tailwind v4, Postgres+Prisma, NextAuth v5, S3,
Gemini) at Phase 0 as "confirmed for now... formally revisited in Phase 7 rather than reopened
casually." Phase 7 is that revisit. Separately, Ecosystem mode (two surfaces: `00-intake.md` §2)
raises the question of whether SUR-01 and SUR-02 (and the society portal within SUR-01) should be
separate deployable services now that the domain model has grown to ~40 entities and 22
capabilities.

Team: solo product owner directing Claude Code, no specialist infra function, no fixed deadline
(`00-intake.md` §5). Scale: 200 societies, <1,000 concurrent users at 2 years (§7). These numbers
matter directly — they're the difference between "microservices solve a real problem here" and
"microservices are a tax with no offsetting benefit."

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| Keep the stack; one Next.js monolith | Working foundation already proven (NextAuth v5, Prisma 7, S3 presigned-PUT, Gemini all runtime-verified per `PROJECT_CONTEXT.md`); no new tooling to learn; matches team size | Prisma schema grows large in one process; a bug in one capability can theoretically affect another's request path | low |
| Keep the stack; split into services per surface (SUR-01 back office, SUR-01 portal, SUR-02 field) | Independent scaling/deploys; a portal outage wouldn't affect back-office | Auth/tenancy logic duplicated or shared via a new internal API, which is itself a new failure surface; two-to-three deploys to keep in sync; no current load pattern justifies it | high |
| Re-platform (different framework/DB) | Hypothetically better fit for some unstated need | No unstated need was found — every constraint that shaped `PROJECT_CONTEXT.md`'s prior stack decisions (Prisma 7 adapter requirement, `@auth/core` direct-dependency fix, S3 presigned-PUT pattern) is orthogonal to this choice and would have to be re-solved from scratch | very high |

## Decision

Keep the confirmed stack. Deploy as one Next.js application. The society portal is explicitly "a
role-scoped projection of SUR-01... separated by INV-05's tenancy boundary rather than by
deployment" (`04-flows-system-map.md` §3) — that's the argument in one sentence. SUR-02 is
architecturally distinct (offline-tolerant, XC-02) but that's a client-side property, addressed
separately in ADR-002, not a reason to stand up a second backend.

## Consequences

Easy: one migration history, one auth session model, shared domain logic with no network hop
between "check tenancy" and "read the data." Hard: schema/codebase organization has to do real
work to keep ~40 entities and 12 components legible without service boundaries to force it (see
`09-architecture.md` §9's directory structure) — that discipline is now a documentation/convention
problem, not something an architecture split would have enforced for free.

## Revisit when

Concurrent-user count materially exceeds NFR-11's 1,000 ceiling, or a specific component
(most likely COMP-11's job runner, or COMP-03's ingest pipeline under vendor-API load) shows a
resource-contention pattern that isolating it would fix and nothing else would.
