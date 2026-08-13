# ADR-008: Email provider for notifications (CAP-22)
**Status:** Proposed · **Date:** 2026-08-13 · **Reversibility:** cheap

## Context

CON-39 fixed email as the sole wired channel at launch, owned by one capability (CAP-22).
`04-flows-system-map.md` §7 explicitly left the provider as "TBD — Phase 7 decision." One of
those notifications (the pre-suspension warning, CON-13) "carries contractual weight" and its
delivery must be auditable; a hard bounce on a contractually-weighted event must halt the
suspension clock (FLOW-X2 step 6, NFR-10) — so deliverability and bounce-signal quality matter
more here than for a typical transactional-email use case.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| AWS SES | Same cloud vendor already in use for S3 — one IAM/billing relationship instead of two; mature bounce/complaint webhook support (SNS) that maps cleanly onto `NotificationDelivery.providerResult`; inexpensive at this volume (§5.1: tens of thousands/month at scale) | Sending-domain reputation starts cold like any provider; SES's own sandbox/production-access approval step needs to be done ahead of the first real suspension cycle (RISK-07) | low |
| Resend | Modern DX, good for a small team, webhook-based bounce handling | A new vendor relationship and a new API key to manage, with no offsetting technical advantage over SES for this system's needs | low-medium |
| Postmark | Excellent deliverability reputation specifically for transactional email | Pricier at scale than SES; still a new, separate vendor relationship | medium |
| Self-hosted SMTP | No vendor dependency | A solo owner running mail infrastructure is a deliverability and security liability disproportionate to the benefit — this is exactly the kind of "buy" decision that shouldn't be "build" | N/A — rejected |

## Decision

**Recommended: AWS SES**, reusing the existing AWS relationship (IAM, billing) already established
for S3, with SNS-based bounce/complaint webhooks feeding `NotificationDelivery.providerResult`
directly. Marked **Proposed**, not **Accepted** — this is a low-reversibility-cost, low-stakes-enough
choice that doesn't need to block the rest of this document, but it should be confirmed (or
overridden) before COMP-10 is implemented, since domain warm-up (RISK-07) needs lead time ahead of
the first real CON-13 suspension cycle.

## Consequences

Easy: one AWS account covers S3 + SES, one set of IAM credentials to manage under this team's
existing security convention. Hard: SES's sending-domain and production-access setup has to happen
early and be verified working (a test bounce, a test delivery) well before it's load-bearing for a
real suspension countdown — this is process work, not a technical risk, but a real one if skipped.

## Revisit when

SES's deliverability data (once real volume exists) shows a bounce/complaint rate that threatens
the account's sending reputation, or a specific need (e.g. WhatsApp as a second channel, already
named as a later addition in CON-39) requires a provider with broader multi-channel support.
