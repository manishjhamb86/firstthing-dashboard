<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Context Loading

Before analyzing, editing, or implementing a target, read `AGENTS.md`, `PROJECT_CONTEXT.md`, and `README.md` at the repository root. If a subfolder later gets its own `AGENTS.md`, that one adds to, rather than replaces, this one unless it explicitly states otherwise.

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
