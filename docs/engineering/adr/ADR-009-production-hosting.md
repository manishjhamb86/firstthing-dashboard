# ADR-009: Production hosting target for firsthing.earth
**Status:** Accepted (user confirmed 2026-08-13) · **Date:** 2026-08-13 · **Reversibility:** costly

## Context

CON-06 named this an open decision at Phase 0 and explicitly carried it into Phase 7. Today,
production (`firsthing.earth`) still runs the pre-migration Supabase codebase on `main`, and
staging (`stage.firsthing.earth`) runs on a self-managed box (`zenovaa`) — Ubuntu-class VPS, pm2
process manager, nginx reverse proxy, Let's Encrypt/certbot, a local Postgres instance
(`firsthing_prod`) on the same box. That staging setup is real, working, and already
runtime-verified (`PROJECT_CONTEXT.md`'s 2026-08-06 deploy notes) — it is the one option here with
actual operating history behind it in this specific project.

This is the one decision in this document with a recurring-cost, vendor-commitment shape that the
solo product owner should confirm rather than one an architecture document should assume on their
behalf — flagged accordingly rather than silently marked Accepted.

## Options considered

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| Continue the self-managed VPS pattern (a `zenovaa`-equivalent box, or `zenovaa` itself promoted) | Proven — staging already runs this exact shape successfully; full control over the Postgres instance for backup/WAL configuration (NFR-03); cheapest at this scale | All operational burden (patching, backups, monitoring, the pm2-restart crash-loop already observed once in staging) falls on the solo owner directly, with no managed-platform safety net | low, ongoing operational time cost |
| A managed app platform (Railway, Fly.io, Render) + managed Postgres (Neon, or the platform's own) | Deploys, rollbacks, and basic observability come largely built-in; less operational burden day to day | A new vendor relationship (or two) with its own learning curve; typically costs more than a bare VPS at this traffic level; migrating the working local-Postgres-on-the-box pattern to a managed DB is itself migration work | medium, less ongoing time cost |
| Vercel (app) + a managed Postgres (Neon/Supabase-as-DB-only, not Supabase Auth) | Best-in-class Next.js deployment ergonomics, generous free tier at this scale | Vercel's serverless execution model has real implications for COMP-11's background job runner (a persistent worker process doesn't fit Vercel's function model cleanly) — would likely require a *second* hosting decision just for the job runner, undermining the "one deployable" simplicity ADR-001 chose | medium, plus the split-runner complication |

## Decision

**Recommended: continue the self-managed VPS pattern**, either promoting `zenovaa` itself or
provisioning an equivalent dedicated box for production, kept separate from staging as today.
Rationale: it's the only option with real operating history in this exact project, it keeps
COMP-11's job runner as a simple persistent process (no serverless-execution-model mismatch), and
it matches "solo owner, no fixed deadline" — optimizing for proven-and-cheap over
managed-but-unproven is the right tradeoff at this stage, and the option is always open to migrate
to a managed platform later once real traffic patterns are known.

**User confirmed this recommendation directly** rather than it being decided unilaterally — surfaced
as the one question accompanying this document's delivery, per this session's standing rule to
raise genuine decisions individually rather than bundle them.

## Consequences

Easy (if accepted): production mirrors a pattern already proven in this exact codebase; no new
vendor account needed beyond what already exists (AWS for S3, and SES per ADR-008 if accepted).
Hard: the solo owner remains the entire on-call/ops function — §7's observability section is
already sized for this reality, not for a managed platform's built-in dashboards.

## Revisit when

Concurrent load, backup/restore drill results (NFR-03), or the owner's own available time for
operational burden change enough that a managed platform's cost premium becomes worth paying.
