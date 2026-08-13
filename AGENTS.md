<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Context Loading

Before analyzing, editing, or implementing a target, read `AGENTS.md`, `PROJECT_CONTEXT.md`, and `README.md` at the repository root. If a subfolder later gets its own `AGENTS.md`, that one adds to, rather than replaces, this one unless it explicitly states otherwise.

## Blueprint & Scope

**`docs/README.md` is the entry point for what to build** — it indexes the full product blueprint (`docs/product/`, `docs/engineering/`) and links `docs/backlog.yaml`, the machine-readable spine (108 features, 553 acceptance criteria, 116 R0 stories, 8 milestones, and — as of Phase 9 — a `tests:` array on every R0 acceptance criterion). Start any implementation task from milestone MS-01 in `docs/engineering/11-development-plan.md` §3, not from assumptions about what the app should do — there is currently no `src/` on this branch at all.

**Scope changes go through the blueprint documents, not straight into code.** If an implementation surfaces a gap, ambiguity, or a reason to deviate from a spec, resolve it in the owning `docs/product/` or `docs/engineering/` document (and `docs/backlog.yaml` if it affects a feature/AC/screen), the same way every prior phase in this blueprint recorded its decisions — not silently in a PR description. Undocumented drift is how the blueprint becomes fiction within a fortnight.

**Invariants (`docs/product/00-intake.md` §4) are hard rules, not aspirations** — every one exists because of a specific failure mode:
- **INV-01**: a non-admin account can never acquire admin access by mistake (admin logins live in their own table, not a `role` enum value).
- **INV-02**: every "savings" figure shown to a society must trace to the readings and benchmark that produced it — a number they can't audit is a number they can dispute, and it's what they're billed on.
- **INV-03**: any bill-changing deviation decision needs an owner and a root-cause classification recorded, not just a fixable/not-fixable flag.
- **INV-04**: a document's period (`YYYY-MM`) is always an explicit user selection, never inferred.
- **INV-05**: a society user can only ever see their own society's data — enforce server-side on every query; `proxy.ts` (or its equivalent) is optimistic-only and does not count as enforcement.
- **INV-06**: every list surface defines loading, empty, error, and degraded states.
- **INV-07**: a light-count-triggered baseline rescale is a distinct, timestamped event, never conflated with a judgment-call billing decision (INV-03).
- **INV-08**: the platform is monitor-only for pump hardware — it reads sensor/status data but never issues actuation commands. No "start pump" / "open valve" UI, ever, in this blueprint's scope.
- **INV-09**: every monthly meter-reading upload runs anomaly detection before that month's bill generates.

**Definition of done** (`docs/engineering/11-development-plan.md` §8) — an item is done when its acceptance criteria pass (verified at the test level `docs/engineering/12-test-plan.md` assigns it), it's reviewed and merged, any invariant it touches is verified, `PROJECT_CONTEXT.md` is updated in the same change (already this repo's Research Gate convention below), and it's deployed to the milestone's target environment with no regression to a prior milestone's exit criteria.

## Research Gate

Before every material architecture, security, or data-model decision (a new dependency, a schema change, an auth strategy, anything touching the Prisma schema or the proxy/route-protection layer):

1. Inspect the relevant existing code and prior decisions (check `PROJECT_CONTEXT.md` first).
2. Research authoritative primary docs — for this repo that means `node_modules/next/dist/docs/` (breaking changes are real and have bitten this project before: `middleware.ts` → `proxy.ts`, Prisma 7's `prisma.config.ts` split, `@auth/core` needing to be a direct dependency for type augmentation to resolve under pnpm's strict `node_modules`) rather than assuming training-data defaults.
3. Record the decision and its rationale in `PROJECT_CONTEXT.md` (or the nearest owning doc, e.g. `docs/SCHEMA_REDESIGN_MIGRATION.md` for schema-specific calls).
4. Implement only after the decision is clear.

Routine mechanical changes (copy-editing, a straightforward bug fix, restyling a component) don't need new research — this gate is for decisions, not every edit.

## Repository Rules

- Keep the root limited to config files (`package.json`, `tsconfig.json`, `docker-compose.yml`, etc.), `.gitignore`, `AGENTS.md`, `PROJECT_CONTEXT.md`, and `README.md`. Feature-specific runbooks and reference docs (`DB_MIGRATION_INSPECTION.md`, `SCHEMA_REDESIGN_MIGRATION.md`, the design handoff bundle) live in `docs/`, not the root. Don't leave scratch/debug scripts at the root — delete them once they've served their purpose.
- Put new documentation in `docs/` unless it's genuinely code-adjacent (a README describing just one folder's contents is fine to keep local).
- **`archive/` is not live code.** It holds the pre-blueprint application, moved there 2026-08-13 when the decision was made to rebuild fresh rather than migrate — see `archive/README.md` and `PROJECT_CONTEXT.md`. Never import from it, never edit it to fix a bug, and never treat a pattern in it as the established convention. Read it for reference — several decisions in it were correct and cost real debugging to reach — but the blueprint in `docs/product/` is what the new build follows.
- Update `PROJECT_CONTEXT.md` in the same change as any meaningful architectural work, not as an afterthought.
- Never commit secrets, credentials, or API keys. `.env*` is gitignored — keep it that way, and don't paste real credentials into tracked files.

## Validation

Run the smallest existing check that covers a change: `pnpm exec tsc --noEmit` for type-only changes, `pnpm lint` for style/hook-rule issues, `pnpm build` before considering any structural change (route additions/removals, config changes) done. The known pre-existing lint debt that used to be called out here (an older `eslint-plugin-react-hooks` pattern flagged by a newer rule version) went into `archive/` with the code that carried it — the new build starts clean and should stay that way, so a lint failure now is a real one.
