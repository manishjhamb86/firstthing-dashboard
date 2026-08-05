# FirsThing Dashboard

A Next.js dashboard for managing society-level energy, water tank, invoice, savings-report, and inspection data. Four roles share the app: **admin** (back-office management), **socmgr** (a single society's manager — plumbing exists, dashboard screen not built yet), **inspection** (field inspectors), and **customer** (a society's own view of its data).

> **Before writing code here**, read `node_modules/next/dist/docs/` — this repo runs a Next.js version with breaking changes from the Next.js you may already know (see [AGENTS.md](AGENTS.md)). Also read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the current migration state before assuming anything about the backend.

## The app is mid-migration — two backends are live at once

This repo is moving off Supabase onto a standalone Postgres + Prisma + NextAuth stack. That migration is **partial**:

- **Auth, sessions, and route protection** already run on the new stack: NextAuth v5 (Credentials provider, JWT sessions) backed by Postgres via Prisma, enforced server-side by `src/proxy.ts`.
- **Almost every data page** (all of `admin/*`, `inspection/*`, `(customer)/*`, `inspection-reports/*`, plus `energy-chart.tsx` and `FileUploader.tsx`) still reads and writes Supabase directly with the anon key. This is real, working code — it isn't dead — it just hasn't been ported yet.
- Two Supabase Edge Functions (`supabase/functions/`) still handle privileged admin actions (creating/updating a society's login account) via Supabase Auth's admin API.

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the up-to-date phase, architecture decisions, and what's next. Don't assume the codebase is fully on one backend or the other.

## Tech stack

- **Next.js 16** (App Router, Turbopack — configured via the top-level `turbopack` key in [next.config.ts](next.config.ts), not `experimental.turbo`)
- **React 19**, **Tailwind CSS v4** (CSS-first config in `src/app/globals.css`, no `tailwind.config.js`) — a 5-theme design-token system lives there (`data-theme` attribute, swapped via the header's theme switcher)
- **Auth**: NextAuth v5 / Auth.js (Credentials + JWT), `src/lib/auth.ts`
- **Database**: Postgres (local Docker for now) via Prisma, `prisma/schema.prisma` — plus Supabase Postgres, still used directly by most pages (see above)
- **Storage**: Supabase Storage (`documents` bucket) for now; AWS S3 planned to replace it, not started
- Package manager is **pnpm** (there's a stray `package-lock.json` from early in the project's history — pnpm is what's actually in use; `npm` isn't installed on the reference dev machine)

## Getting started

### 1. Environment variables

Two separate `.env` files, for two separate reasons:

**`.env`** (read by both the Prisma CLI and Next.js — Prisma's CLI does not read `.env.local`):
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/firsthing?schema=public"
PORT=3000
```
`PORT` controls the dev/prod server port. Next.js itself can't read `PORT` from a `.env` file (its CLI binds the port before any env file loads — see `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`), so `pnpm dev`/`pnpm start` run through `scripts/run-next.mjs`, which loads `.env`/`.env.local` first and spawns `next` with `PORT` already in its environment. Override per-machine in `.env.local` if needed, or pass `-p <port>` directly (e.g. `pnpm dev -- -p 4000`), which still wins over `PORT`.

**`.env.local`** (Next.js only):
```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
AUTH_SECRET=<openssl rand -base64 32>
AUTH_TRUST_HOST=true
```
The two `NEXT_PUBLIC_SUPABASE_*` vars are still required — most pages won't render without them. `AUTH_SECRET` is required by NextAuth for signing session JWTs.

### 2. Local Postgres

```bash
docker compose up -d
pnpm prisma migrate deploy
pnpm prisma db seed
```

The seed creates 4 local accounts, all password `password123`: `admin@firsthing.local`, `customer@firsthing.local`, `inspector@firsthing.local`, `socmgr@firsthing.local`.

### 3. Install and run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000/login](http://localhost:3000/login) — **note:** `/` itself currently has no page (the customer dashboard hasn't been rebuilt on the new stack yet; logging in as the customer account lands on `/profile` as a stopgap). Other scripts: `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm prisma studio`.

## Project structure

```
src/app/                        App Router routes
├── login/                      public login — NextAuth signIn("credentials", ...)
├── api/auth/[...nextauth]/     NextAuth route handler
├── (customer)/                 route group: profile/, invoices/, reports/, water-tanks/
│                                (no page.tsx at "/" yet — see note above)
├── inspection-reports/         shared list + detail view; renders differently per role
├── inspection/                 "inspection" role portal (new/, history/)
├── socmgr/                     "socmgr" role portal — placeholder page only
└── admin/                      "admin" role portal
    ├── societies/, users/ (stub), tanks/, energy/,
    │   invoices/, reports/, inspection-reports/

src/components/
├── shell/                      AppShell, Sidebar, Header, ThemeSwitcher, EmptyState,
│                                StatusChip, DeltaChip — the role-aware app shell every
│                                layout composes (replaced 3 previously-duplicated sidebars)
├── admin/FileUploader.tsx      Supabase Storage upload (still Supabase)
├── charts/energy-chart.tsx     live meter-reading chart (still Supabase, uses Realtime)
└── layout/sidebar.tsx          legacy sidebar — still used by inspection-reports/* only

src/lib/
├── auth.ts, db.ts              NextAuth config + Prisma client singleton (new stack)
├── roles.ts, nav-config.ts,    role/nav/screen-title config for the app shell
│   screen-meta.ts
├── theme.ts, use-theme.ts      5-theme design system
├── use-role-guard.ts           client-side guard hook (NextAuth session)
├── use-nav-badge-counts.ts     sidebar badge counts
└── supabase.ts                 Supabase client factory — still used by most pages

src/proxy.ts                    server-side route protection (Next 16 renamed
                                 middleware.ts → proxy.ts); optimistic-only, see file comments
src/types/next-auth.d.ts        NextAuth Session/User/JWT type augmentation

prisma/                         schema.prisma, migrations/, seed.ts (new Postgres stack)
supabase/functions/             two Deno Edge Functions + their own README (still Supabase)
docker-compose.yml              local Postgres for development

docs/                           DB_MIGRATION_INSPECTION.md, SCHEMA_REDESIGN_MIGRATION.md,
                                 team onboarding guide, design handoff bundle
```

**Path alias:** `tsconfig.json` maps `@/*` to `./src/*`. New code (shell, lib, proxy) uses it; older pages still use relative imports (`../../lib/supabase`) — both work, no need to convert existing files just to be consistent.

## Roles & auth

Roles live in `profiles.role` (`admin` / `customer` / `inspection` / `socmgr`) — see `src/lib/roles.ts`. Two layers of enforcement now:

1. **`src/proxy.ts`** — server-side, runs before any page renders. Redirects unauthenticated requests to `/login?callbackUrl=...` and wrong-role sessions to that role's own home. Explicitly documented in the file as *optimistic-only* — it doesn't replace per-request checks in whatever eventually reads/writes data.
2. **`src/lib/use-role-guard.ts`** — client-side, used by every `AppShell`-wrapped layout for the loading/redirect UI and to hand the resolved profile down to `Sidebar`/pages.

Login (`src/app/login/page.tsx`) calls NextAuth's `signIn("credentials", ...)`, then reads the resulting session's role and redirects via `ROLE_HOME` in `src/lib/roles.ts`.

Privileged admin actions that need elevated privileges (creating/updating a society's login account) still run in the two Supabase Edge Functions — not yet ported to the new stack.

**Known gaps:**
- `/` has no page — see the migration note above.
- The 34 still-Supabase-backed pages read/write with the anon key against a Supabase project whose RLS is currently off (confirmed live — its anon key reads `profiles`/`invoices`/etc. with no session at all). That's a pre-existing issue on that project, independent of this migration.
- `/admin/users` is a stub, not yet implemented.

## Features

- **Customer dashboard** — energy stats, usage chart, device list, society insights (still Supabase; not yet rebuilt on the new stack, and not reachable at `/` right now — see above)
- **Water tanks** — customer view (`/water-tanks`) and full admin CRUD (`/admin/tanks*`), backed by `tank_configurations` / `tank_readings`
- **Invoices** — customer view (`/invoices`) and admin management (`/admin/invoices`)
- **Savings reports** — customer view (`/reports`) and admin management (`/admin/reports`), backed by `savings_reports`
- **Inspection portal** (`inspection` role) — checklist-style forms for lights/faults per society, submission history
- **Inspection reports** — admin PDF upload workflow (`/admin/inspection-reports`) plus a shared cross-role viewer (`/inspection-reports`, `/inspection-reports/[id]`) showing both uploaded PDFs and inspector-submitted forms
- **Society management** (admin) — create/edit/delete societies, per-society savings percentage, safe deletion
- **Society login credentials** (admin) — create a society's customer account and update its email/password via the Edge Functions
- **Society manager** (`socmgr` role) — account/role/login plumbing exists; the actual dashboard screen doesn't yet (placeholder page)

## Backend setup

**New stack (Postgres/Prisma):** see [docs/SCHEMA_REDESIGN_MIGRATION.md](docs/SCHEMA_REDESIGN_MIGRATION.md) for the full schema (verified against a live reference Supabase project, not guessed) and `prisma/schema.prisma` for its Prisma translation, already applied via `prisma/migrations/`.

**Supabase (still in use by most pages):**
- **Tables referenced in code:** `devices`, `energy_stats`, `inspection_form_items`, `inspection_forms`, `inspection_reports`, `invoices`, `meter_readings`, `profiles`, `savings_reports`, `societies`, `tank_configurations`, `tank_readings`. (`documents` is a **Storage bucket**, not a table.)
- **Storage:** one public bucket, `documents`, used by `src/components/admin/FileUploader.tsx`.
- **Edge Functions** (`supabase/functions/`, deploy both to the project used by `NEXT_PUBLIC_SUPABASE_URL`): `create-society-user`, `update-society-user` — both require `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` as function secrets and admin-only callers. See [supabase/functions/README.md](supabase/functions/README.md).
- **Inspection tables:** full legacy `CREATE TABLE`/RLS setup is in [docs/DB_MIGRATION_INSPECTION.md](docs/DB_MIGRATION_INSPECTION.md) (superseded by `docs/SCHEMA_REDESIGN_MIGRATION.md` for the new stack, kept for reference).

## Docs index

- [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — current phase, architecture decisions, blockers, next actions (read this first)
- [docs/SCHEMA_REDESIGN_MIGRATION.md](docs/SCHEMA_REDESIGN_MIGRATION.md) — the new Postgres schema, verified live
- [docs/DB_MIGRATION_INSPECTION.md](docs/DB_MIGRATION_INSPECTION.md) — legacy Supabase inspection-table SQL, kept for reference
- [docs/FirsThing_Dashboard_Team_Onboarding_Guide_v1.0.txt](docs/FirsThing_Dashboard_Team_Onboarding_Guide_v1.0.txt) — short pre-migration team onboarding cheat-sheet
- [docs/design_handoff_firsthing_platform/](docs/design_handoff_firsthing_platform/) — the UI redesign's design system, screens, and blueprint
- [supabase/functions/README.md](supabase/functions/README.md) — the two Edge Functions and their required secrets
- [AGENTS.md](AGENTS.md) — breaking-change notes, context-loading order, repository rules
