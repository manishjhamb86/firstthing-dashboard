# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md
@PROJECT_CONTEXT.md

`AGENTS.md` holds the hard rules (invariants INV-01..09, the Research Gate, repository rules,
validation). `PROJECT_CONTEXT.md` is the decision log — long and chronological; search it for a
topic rather than reading it top to bottom. **`README.md` is mostly stale**: only its "dev
database" section (the SSH tunnel) describes the current build; its structure, roles, features and
Supabase sections describe the archived pre-blueprint app in `archive/`. The blueprint itself is
indexed from `docs/README.md` (`docs/product/`, `docs/engineering/`, `docs/backlog.yaml`).

## Commands

```bash
pnpm dev                      # next dev via scripts/run-next.mjs; opens the DB tunnel itself
pnpm db:tunnel                # SSH forward localhost:5433 -> zenovaa firsthing_dev (idempotent)
pnpm worker                   # ADR-003 job runner (scripts/job-worker.ts) — separate long-lived process
pnpm exec tsc --noEmit        # type check
pnpm lint                     # eslint (flat config; archive/ ignored; date-format rule enforced)
pnpm build                    # required before calling any route/config change done
pnpm test                     # vitest run — whole suite (tests/*.test.ts, node environment)
pnpm vitest run tests/arrears.test.ts          # one file
pnpm vitest run tests/arrears.test.ts -t "stale" # one case by name
pnpm prisma migrate dev --name <slug>          # new migration (writes to the SHARED remote dev DB)
pnpm prisma migrate deploy / generate / db seed / studio
./scripts/deploy-stage.sh [branch]             # push + git-based deploy to stage.firsthing.earth
```

- Validation set for a change, smallest first: `tsc` → `lint` → `build` (structural changes) →
  `pnpm test`. All four must be clean; there is no accepted lint debt in `src/`.
- **After any migration, restart `next dev` (and the worker).** A long-lived process keeps the old
  generated Prisma client in memory; `prisma generate` alone does not fix `Unknown field` errors.
  This has cost time five separate times.
- After editing `next.config.ts`, `rm -rf .next` — Turbopack's cache does not invalidate.
- **There is exactly one dev database and it is remote**: `firsthing_dev` on `zenovaa`, reached
  through the tunnel on `localhost:5433`. Never create a local Postgres on 5433 — it shadows the
  tunnel silently. Migrations/seeds run from this machine land on that shared DB.
- `.env` holds `DATABASE_URL`/`PORT` (read by the Prisma CLI too); `.env.local` holds `AUTH_SECRET`,
  AWS S3, `GEMINI_API_KEY`, and optionally `DEMO_MODE=true` / `EWELINK_FAKE_METERS=1`.
- Seeded logins (dev + stage) all use password `password123`; the admin is `yogesh@firsthing.earth`.

## Architecture (the live `src/`, not the README's)

**Two surfaces, one Next 16 App Router deployment.** `/admin/*` is the back office (SUR-01);
`/portal/*` is the society portal (a role-scoped projection of the same app, tenancy-bounded by
INV-05, never a separate deployment). `/login`, `/api/auth/[...nextauth]`, `/api/session-ended`
and `/api/ewelink/callback` are the only other routes. Each route folder is `page.tsx` +
`actions.ts` (Server Actions) + a few `*-form.tsx`/`*-button.tsx` client components; reads are
Server Components querying `db` directly, writes are Server Actions. Route Handlers exist only
where a client must re-fetch without navigation.

**Identity is two tables, never one enum.** `AdminUser` (with `AdminPermission[]`: `manage_admins`,
`manage_users`, `manage_pipeline`, `manage_survey`, `release_billing`, plus an `AdminTeam`) and
`Profile` (portal accounts: `portalAuthority` office_bearer/committee/manager + `PortalGrant[]` for
module visibility). `src/lib/auth.ts` checks `AdminUser` first, so a `Profile` row can never mint an
admin session (INV-01). `src/proxy.ts` gates `/admin` and `/portal` by role from the JWT only — it
is **optimistic**; the real gate is in every page and action.

**The token proves who signed in; the row proves what they may do now.** Every gate goes through
`resolveAdmin()` / `requireAdminPage()` (`src/lib/admin-permissions.ts`) or `resolvePortalViewer()`
(`src/lib/portal-viewer.ts`) — `cache()`-memoized DB reads, never `session.user.permissions`. A
session whose row is gone/inactive is sent to `/api/session-ended` (redirecting to `/login`
instead loops through the proxy). Two recurring proxies: "PER-01 / operations" = holds BOTH
`manage_pipeline` and `manage_survey`; "the accountant" = `release_billing` only, which no amount
of ops permissions confers (`src/app/admin/billing/access.ts`).

**Server Action shape** (see `src/app/admin/inspections/actions.ts` for a canonical example):
`"use server"`, `resolveAdmin()`, permission check, return `{ error: string }` on refusal — **do not
throw** (`requireAdminPermission` throws and surfaces as an opaque digest in production; it has been
converted away three times). Every refusal and every binding act emits a `logger.warn/info`
line (`src/lib/logger.ts`, JSON to stdout, read via `pm2 logs`). A `"use server"` file may export
only async functions — pure helpers go in `src/lib/`.

**Pure decision module + thin action.** The rule that carries money or authority lives in a
hook-free `src/lib/<thing>.ts` (`refuseX()`, `decideX()`, `evaluateX()`) with a matching
`tests/<thing>.test.ts`; the action is a DB/logging shell around it. This is how `12-test-plan.md`'s
`unit` level is satisfiable at all. Modules that import `db` cannot be imported by client
components (it drags Prisma into the bundle) — split a plain module out (`circuit-label.ts`,
`portal-nav-entries.ts` are the pattern).

**Data rules the schema enforces (ADR-005, INV-02/03/07).** Versioned-not-mutated: benchmarks,
rescale events, offers, demo reports, contract terms, documents and invoices get a new
row/version; nothing billed on is edited in place. Soft delete everywhere via
`voidedAt/voidedById/voidReason` (reason required) — every read must filter `voidedAt: null`, and
removed rows stay visible in a disclosure, never hidden. Released billing (`releasedAt`) freezes
everything under it (GATE-02). Duplicates (societies, circuits, deal scopes) are **refused**, not
flagged-and-overridable — unique/partial-unique/exclusion constraints in Postgres, with an
app-level refusal in words in front of them. Dates typed by a person are stored/read at UTC
midnight; machine instants render in IST; **all rendering goes through `src/lib/format-date.ts`**
(eslint refuses `toLocaleDateString` anywhere else).

**Reading pipeline.** Vendor exports (CSV/XLSX) → `RawReadingFile` bytes in S3 under private
`Ingest/` (CON-30) → `src/lib/reading-normalize.ts` (pure; Gemini `inferStructure()` proposes a
column *mapping* only and never returns a number) → row-by-row review (CON-45) → `MeterReading`
(daily billing grain). Live meters: `MeterDevice` (eWeLink asset) ↔ `Circuit` (metering point) via
effective-dated `MeterInstallation`; `MeterHourlyReading` is the meter's own store and
`projectMeterStoreToCircuit` (`meter-billing-handoff.ts`) projects it into `MeterReading`.
Commissioning windows (`monitoring-window.ts`), rescales (`benchmark-rescale.ts`,
`effectiveBaselineAt()` replays events) and the monthly bill (`monthly-calculation.ts`, per-circuit
`CircuitFeeLine`, CON-11 extrapolation, 58% society / 42% FirsThing — name the party, this
inversion has shipped twice) all read from it.

**Background jobs.** `Job` table + `scripts/job-worker.ts` (pm2 `firsthing-job-worker` on stage).
Four types: `gatepass_sweep`, `meter_poll`, `tank_level_sample`, `arrears_sweep`. Recurring jobs
self-reschedule in a `finally`, claim via compare-and-set `updateMany({status:"pending"})`, and
refuse to seed a duplicate — a fork here doubles a suspension clock.

**External clients are read-only by construction** (INV-08): `tuya.ts` (tank levels),
`ewelink.ts` (meters, OAuth) know no write/control endpoint. `s3.ts` presigns PUTs (browser uploads
directly); `Documents/` is public-read by the user's decision, `Ingest/` private. The IAM user is
PutObject-only — test objects can never be deleted by this app. `gemini.ts` extracts fields from
one-page documents but only mappings from meter data.

**UI.** Tokens + `.card/.field/.btn-*/.chip/.tbl` in `src/app/globals.css`; hook-free primitives
in `src/components/ui.tsx`; `AppShell` (admin) and `portal-shell.tsx`; `StepSection`/`DealStepper`
driven by `src/lib/deal-progress.ts` (one module decides "you are here, do this next").
Theme (`light|dark|slate`) is stored on the account row and stamped server-side via
`resolveTheme()` — no `prefers-color-scheme`, by product rule. Forms that can fail and be
resubmitted must use controlled inputs (React 19 `useActionState` resets uncontrolled fields).
Use the existing `Modal` (`src/components/modal.tsx`), not a hand-rolled `<dialog>`. One solid
button per page; secondary actions are `btn-secondary`, not outline.

**Demo mode** (`src/lib/demo-mode.ts`): `DEMO_MODE=true` env AND the admin's own `demoMode`
column; bypasses time-based gates only, never money or authority rules.

## Data and environments

- `prisma/migrations/` (90+) includes **data migrations** — the 19 real societies, their contracts,
  demos and the device catalog ship with `migrate deploy`. Passwords, portal accounts and vendor
  credentials deliberately do not; they live in gitignored `restore/` (`scripts/rebuild-sql.sh`).
- Stage: `https://stage.firsthing.earth`, DB `firsthing_blueprint` on `zenovaa`, pm2 processes
  `firsthing-dashboard` + `firsthing-job-worker`. Backups must be size-checked (a 0-byte `pg_dump`
  once "succeeded"). `pg_dump` rejects Prisma's `?schema=public` suffix.
- `archive/` is the pre-blueprint app: reference only, excluded from tsc/eslint, never imported.

## Verification convention

Browser verification is done with throwaway Playwright scripts in the scratchpad (not in the
repo) against `pnpm dev`, asserting on **database rows and log lines**, not rendered text. A
permission refusal is only verified when driven through a path the client cannot pre-block (revoke
the permission in Postgres behind the open form, then submit) and confirmed by the action's own
`*_refused` log line — a hidden button proves nothing about the server. Fixtures are removed
afterwards and confirmed by count. Harness traps already recorded: `button[type=submit]` and
`form` match the sidebar's Sign out first; `.lbl` uppercases so match case-insensitively; wait on
`waitForURL`/DB state, not `networkidle`; `psql -tA` prints booleans as `t/f`.
