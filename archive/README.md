# Archive — the pre-blueprint application

**Archived:** 2026-08-13 · **Decision:** the user's, recorded in `PROJECT_CONTEXT.md`

Nothing in this folder is live, imported, or built. It is kept for reference and for the eventual
data migration, and for nothing else.

## Why this is here rather than deleted, and rather than migrated

The product blueprint in [`../docs/product/`](../docs/product/) describes a system this codebase
cannot be incrementally walked to. The gap is not cosmetic:

- **The data model is the wrong shape.** `archive/prisma/schema.prisma` has one benchmark and one
  tank/device notion per society. CON-11 requires **one metered circuit per light type**, each
  extrapolating only across its own type, each carrying its own `benchmarkSavingsPct`,
  `meteredLightCount`, `representedLightCount`, tolerance band and `pricingBasis`, each able to
  flip to `actual-metered` independently. A monthly invoice is a *set of per-circuit fee lines*.
  That is not a column addition, it is a different spine.
- **The core loop does not exist at all.** Ingest → validation → benchmark commissioning →
  per-circuit compliance → deviation review → invoice build → release is the product. The archived
  app has manual entry forms where that loop belongs.
- **Immutability and audit are foundational, not features.** INV-02 (every figure traces to the
  readings and the version that produced it) and INV-03 (invoices are never edited; a correction is
  a v2 and both stay) have to hold from the first write. Retrofitting them onto tables that were
  built to be edited in place is worse than starting clean.
- **Authority is per-act, not per-role.** CON-45's `office-bearer` / `committee` / `manager` split,
  recorded with the authority held *at that moment*, does not map onto the archived `Role` enum.

Migrating would have meant carrying all of that as debt into a system whose whole value proposition
is that a society can audit the number.

## What is worth keeping from it

This code was not wasted, and several decisions in it were correct and should be reused rather than
rediscovered. They are recorded in `PROJECT_CONTEXT.md` under Architecture Decisions — the S3
presigned-PUT upload pattern, the document naming convention, the Gemini extraction approach, the
admin/user table split, the Prisma 7 and `@auth/core` specifics, and the `PORT`-in-`.env` wrapper.
Read those before rebuilding the equivalent, because each one cost real debugging.

## What is in here

| Path | What it was | Fate |
|---|---|---|
| `src/` | The whole Next.js app — 7 admin screens, 4 customer pages, the shell, auth, S3 and Gemini helpers | Reference. Rebuilt against the blueprint |
| `prisma/` | Schema, migrations and seed for the old data model | Reference. The **migrations are load-bearing for the data migration** — they describe the shape the live data is actually in |
| `supabase/` | Two edge functions, already dead before archiving (replaced by Server Actions in Phase 3) | Reference only |
| `public/` | Next's default template SVGs. No real assets | Nothing of value |

## Data migration is deferred, deliberately

The decision was explicitly **build first, migrate later** — the migration is planned once the new
system is live, not as a precondition for building it. Live data still sits in the legacy Supabase
project referenced by `NEXT_PUBLIC_SUPABASE_URL`, and the direct Postgres credentials needed to
bulk-copy it have still not been supplied. When that work starts, `archive/prisma/migrations/` is
the record of what the source tables look like.

**Note the standing security issue** recorded in `PROJECT_CONTEXT.md`: that Supabase project has
RLS off, confirmed live — its anon key reads `profiles`, `invoices` and the rest with no session at
all. That is unchanged by this archiving and is worth flagging to whoever owns the project.

## Consequences of the move, so nobody is surprised

- `prisma.config.ts` at the root points at `prisma/schema.prisma`, which no longer exists. It
  becomes valid again when the new schema lands there; until then `pnpm prisma …` will fail.
- `package.json` scripts referencing the app (`dev`, `build`, `start`, `seed`) have nothing to run
  until the new `src/` exists.
- Root config (`next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`,
  `docker-compose.yml`) was **not** archived. It describes the toolchain, not the old app, and
  CON-05 keeps the same stack — Next.js 16, React 19, Tailwind v4, Postgres, Prisma, NextAuth v5.
- `design/brand` and `scripts/run-next.mjs` were not archived either, for the same reason.
- `main` and `newUI` are untouched. `stage.firsthing.earth` and `firsthing.earth` both continue to
  run from their own branches and are unaffected by anything on `blueprint`.
