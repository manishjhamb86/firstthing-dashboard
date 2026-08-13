# ADR-010: Vendor meter API built behind a provider-agnostic ingest interface
**Status:** Accepted · **Date:** 2026-08-13 · **Reversibility:** cheap

## Context

CON-43's API ingest path (FEAT-104/105/106) rests entirely on ASSUM-24 — "the meter vendor exposes
a usable, documented, authenticated API... at a rate limit that supports ~800 meters fetched daily
or more often" — which is explicitly **unverified**, gated by `SPIKE-01` in `docs/backlog.yaml`.
CON-30's manual CSV path is the confirmed, load-bearing fallback regardless of the spike's outcome.
The architectural question is how to build toward FEAT-104/105/106 (since R0/R1 planning already
assumes some of this work) without coupling COMP-04's billing engine, or COMP-03's own
normalisation/reconciliation logic (FEAT-107), to any one vendor's API shape.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| A provider-agnostic ingest interface (`VendorReadingSource`, one implementation per vendor) that both the CSV path's AI-normalisation output and the API path's fetch output are mapped into before anything downstream sees them | Downstream (FEAT-107 reconciliation, COMP-04's calculation) only ever sees the canonical `MeterReading` shape, regardless of which path or which vendor produced it; if SPIKE-01 finds the API unviable, the interface has exactly one implementation removed, not a rewrite | A small amount of upfront abstraction for a feature that might never ship if the spike fails | low |
| Build FEAT-104 directly against the specific vendor's API shape, no interface | Slightly less code upfront | Couples the calculation engine's input assumptions to one vendor's response format; if the vendor changes their API or a second vendor is ever added (multiple vendors across 200 societies is plausible), every downstream consumer needs to change too | medium, back-loaded |
| Defer all API-path code until SPIKE-01 completes, build nothing now | Avoids any wasted work if the spike fails | R1's release plan (`backlog.yaml`) already schedules FEAT-104/105/106-adjacent work; waiting fully idle isn't necessary when the interface itself is cheap and useful even in a CSV-only world (it's also where FEAT-107's reconciliation logic naturally lives) | N/A — unnecessarily conservative given the interface's low cost |

## Decision

Build the `VendorReadingSource` interface now, as part of COMP-03, with the CSV path (Gemini
normalisation) as its first and — until SPIKE-01 resolves — only real implementation. FEAT-104's
scheduled fetch and FEAT-105's on-demand refresh are written against this interface from the start,
so SPIKE-01's finding only ever changes whether a second implementation gets written, never how
COMP-04 or FEAT-107 consume readings.

## Consequences

Easy: SPIKE-01 stays a contained, reversible bet — a negative finding costs nothing downstream.
FEAT-107's reconciliation logic (which already has to compare "the CSV path's view" against "the
API path's view" per its own spec) gets a natural place to live regardless of the spike's outcome.
Hard: none significant — this is a cheap, low-risk abstraction whose cost is paid once regardless
of which way the spike resolves.

## Revisit when

SPIKE-01 completes. A positive finding schedules FEAT-104/105/106's build against this interface's
second implementation; a negative finding closes those features out (matching `backlog.yaml`'s
existing `release: null` / `blocked_by_spike` treatment) with zero rework to anything already built.
