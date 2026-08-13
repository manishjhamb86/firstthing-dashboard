# ADR-003: Postgres-backed job queue, not an external broker
**Status:** Accepted · **Date:** 2026-08-13 · **Reversibility:** cheap

## Context

Several requirements need reliable, time-driven, retryable execution outside a request/response
cycle: the scheduled vendor-API fetch (FEAT-104, sub-daily), SLA/escalation sweeps (CON-27,
CON-35), the suspension countdown (CON-13), the gate-pass provisional-release timeout (CON-40),
and notification retry/backoff (CON-39, NFR-10). None of this exists in the current codebase.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| A `Job` table in the existing Postgres DB, polled by a worker process | No new infrastructure dependency; transactional writes (e.g. "mark this job done" and "update the suspension state") can share one DB transaction; operationally simple for a solo owner | Shares I/O capacity with the OLTP workload if not isolated (RISK-04); polling has inherent latency vs. push-based brokers | low |
| Redis + BullMQ (or similar) | Purpose-built, lower latency, rich tooling | A new stateful service to provision, secure, and back up; another vendor/infra relationship for a team of one; the latency BullMQ buys isn't needed at NFR-11's volume | medium-high |
| A managed queue (SQS, or a serverless cron product) | Offloads operational burden entirely | Introduces AWS-specific (or another vendor's) coupling beyond the S3 usage already in place; harder to reason about transactionally with the Postgres writes it triggers | medium |
| Ad hoc `setTimeout`/cron entries per feature, no unified queue | Fastest to write per-feature | Exactly the anti-pattern §2 warns against — this is precisely where INV-02/INV-03/CON-13's guarantees would quietly rot, scattered across files with no shared retry/backoff/observability | N/A — rejected on correctness grounds, not cost |

## Decision

A `Job` table (§5.2's `Job` model) polled by a dedicated worker process, separate from the
request-serving process but sharing the same Postgres instance and Prisma client. Job types:
`vendor-fetch`, `sla-sweep`, `suspension-sweep`, `gatepass-sweep`, `notification-send`.

## Consequences

Easy: one place to observe queue depth and failure rate (§7's key SLI); transactional consistency
between "job succeeded" and the domain write it caused. Hard: this table becomes the busiest table
in the system (§5.1) and needs its own index/retention discipline (30-day completed-job purge) to
avoid becoming a maintenance burden itself; a stuck worker is now a real operational risk (RISK-04)
that didn't exist before this ADR introduced the mechanism.

## Revisit when

Queue depth or job latency (§7's SLIs) shows the shared-process/shared-DB design contending
visibly with request traffic, or job volume grows enough (e.g. from a much shorter vendor-fetch
interval, or a much larger portfolio) that polling latency becomes the bottleneck rather than the
vendor API itself.
