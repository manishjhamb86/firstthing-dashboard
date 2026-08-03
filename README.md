# FirstThing Dashboard

A Next.js dashboard for managing society-level energy, water tank, invoice, savings-report, and inspection data. Three roles share the app: **admin** (back-office management), **inspection** (field inspectors), and **customer** (a society's own view of its data).

> **Before writing code here**, read `node_modules/next/dist/docs/` — this repo runs a Next.js version with breaking changes from the Next.js you may already know (see [AGENTS.md](AGENTS.md)).

## Tech stack

- **Next.js 16** (App Router, Turbopack — configured via the top-level `turbopack` key in [next.config.ts](next.config.ts), not `experimental.turbo`)
- **React 19**
- **Tailwind CSS v4** — CSS-first config in `src/app/globals.css`, no `tailwind.config.js`
- **Supabase** — Postgres, Auth, Storage, and two Deno Edge Functions
- **shadcn/ui** (`radix-ui` + `lucide-react`) — primitives are scaffolded at the repo-root `components/ui/` but are not currently imported anywhere in `src/`; all app UI is hand-rolled Tailwind JSX

## Getting started

### 1. Environment variables

No `.env.example` exists yet. Create `.env.local` in the repo root with:

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

These are the only two variables the Next.js app reads (`src/lib/supabase.ts`). The two Edge Functions run separately under Supabase and need their own secrets — see [Supabase setup](#supabase-setup) below.

### 2. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## Project structure

```
src/app/                        App Router routes
├── login/                      public login (email/password via Supabase Auth)
├── profile/, invoices/,        customer-facing pages
│   reports/, water-tanks/
├── inspection-reports/         shared list + detail view; renders differently per role
├── inspection/                 "inspection" role portal (layout.tsx guards the role)
│   ├── new/, history/
└── admin/                      "admin" role portal (layout.tsx guards the role)
    ├── societies/, users/ (stub), tanks/, energy/,
    │   invoices/, reports/, inspection-reports/

src/components/                 app-specific components (layout, dashboard, charts, admin/FileUploader)
src/lib/                        supabase.ts (client singleton), auth.ts (getCurrentUser())

components/ui/, lib/utils.ts    shadcn primitives + cn() helper, at repo root (see note below)

supabase/functions/             two Edge Functions + their own README
DB_MIGRATION_INSPECTION.md      SQL setup guide for the inspection-role tables
```

**Path alias note:** `tsconfig.json` maps `@/*` to the repo root (`./*`), not `src/`. That's why shadcn generated `components/ui/` and `lib/utils.ts` at the root instead of under `src/`. Nothing in `src/` currently imports via `@/` — all imports there are relative paths.

## Roles & auth

Roles live in `profiles.role` (`admin` / `inspection` / `customer`) and are checked **entirely client-side** — there is no `middleware.ts`. Guarded layouts (`src/app/admin/layout.tsx`, `src/app/inspection/layout.tsx`) call `supabase.auth.getSession()` in a `useEffect`, look up the profile's role, and redirect via `window.location.href` if it doesn't match. This means a brief "checking permissions" state renders before any redirect, and there's no server-side enforcement.

Login (`src/app/login/page.tsx`) uses `supabase.auth.signInWithPassword`, then reads `profiles.role` and sends the user to `/admin`, `/inspection`, or `/` (customer).

Privileged admin actions that require the service-role key (creating/updating a society's login account) run server-side in the two Supabase Edge Functions, not in the Next.js app.

**Known gap:** `/water-tanks` has no auth check at all (unlike its sibling customer pages `/invoices`, `/reports`, `/profile`), so it's reachable without logging in.

## Features

- **Customer dashboard** (`/`) — energy stats, usage chart, device list, society insights
- **Water tanks** — customer view (`/water-tanks`) and full admin CRUD (`/admin/tanks*`), backed by `tank_configurations` / `tank_readings`
- **Invoices** — customer view (`/invoices`) and admin management (`/admin/invoices`)
- **Savings reports** — customer view (`/reports`) and admin management (`/admin/reports`), backed by `savings_reports`
- **Inspection portal** (`inspection` role) — checklist-style forms for lights/faults per society, submission history
- **Inspection reports** — admin PDF upload workflow (`/admin/inspection-reports`) plus a shared cross-role viewer (`/inspection-reports`, `/inspection-reports/[id]`) showing both uploaded PDFs and inspector-submitted forms
- **Society management** (admin) — create/edit/delete societies, per-society savings percentage, safe deletion
- **Society login credentials** (admin) — create a society's customer account and update its email/password via the Edge Functions
- **Society users** (`/admin/users`) — stub page, not yet implemented

## Supabase setup

**Tables referenced in code:** `devices`, `documents`, `energy_stats`, `inspection_form_items`, `inspection_forms`, `inspection_reports`, `invoices`, `meter_readings`, `profiles`, `savings_reports`, `societies`, `tank_configurations`, `tank_readings`.

**Storage:** one public bucket, `documents`, used by `src/components/admin/FileUploader.tsx` to upload and link inspection-report PDFs.

**Edge Functions** (`supabase/functions/`, deploy both to the project used by `NEXT_PUBLIC_SUPABASE_URL`):
- `create-society-user` — creates a society, its Auth account, and the linked `customer` profile
- `update-society-user` — updates the email/password on a society's linked customer profile (powers the admin "Save Login Details" button)

Both require `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` as function secrets and verify the caller has the `admin` profile role. See [supabase/functions/README.md](supabase/functions/README.md) for details.

**Inspection tables:** full `CREATE TABLE` / RLS setup is in [DB_MIGRATION_INSPECTION.md](DB_MIGRATION_INSPECTION.md). Schemas for the other tables above aren't documented in-repo yet — treat the Supabase dashboard as the source of truth for those until someone writes them up.

## Docs index

- [DB_MIGRATION_INSPECTION.md](DB_MIGRATION_INSPECTION.md) — SQL setup guide for `inspection_forms` / `inspection_form_items` and their RLS policies
- [supabase/functions/README.md](supabase/functions/README.md) — the two Edge Functions and their required secrets
- [AGENTS.md](AGENTS.md) — breaking-change notes for this Next.js version
