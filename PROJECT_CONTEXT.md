# FirsThing Dashboard Project Context

## Last Updated

2026-08-14

## Decision of record — greenfield rebuild, migration deferred (2026-08-13, the user's call)

**The pre-blueprint application has been archived, not migrated.** `src/`, `prisma/`, `supabase/`
and `public/` moved to `archive/` on the `blueprint` branch. The new system is built fresh against
the product blueprint in `docs/product/`, and **data migration is deliberately deferred until the
new system is live** — it is not a precondition for building it.

Why, in one line: the blueprint describes a system this codebase cannot be incrementally walked to.
CON-11 alone (one metered circuit *per light type*, each with its own benchmark, band, represented
count and pricing basis, each independently able to flip to `actual-metered`, with a monthly
invoice as a *set of per-circuit fee lines*) is a different spine, not a column addition. INV-02
and INV-03 — every figure traceable to the readings and version that produced it, invoices never
edited — have to hold from the first write, and retrofitting them onto tables built to be edited
in place is worse than starting clean. `archive/README.md` has the full reasoning and the
consequences of the move.

**What this does not mean.** The archived work was not wasted and must not be rediscovered from
scratch. The Architecture Decisions section below stays authoritative for everything it records —
the S3 presigned-PUT pattern, the document naming convention, the Gemini extraction approach, the
admin/user table split, the Prisma 7 and `@auth/core` specifics, the `PORT`-in-`.env` wrapper. Each
cost real debugging. Read them before rebuilding the equivalent.

**Everything in "Current Repository State" below describes the archived application**, kept as the
record of what was built and why. It is history, not a description of the working tree.

## Current Phase

**Product blueprint, Phase 6 (Prioritization & Backlog) — done.** Phase 5 closed out with all 51
priority-1 screens specified, all 6 mockup decks built and published, and a navigation map +
screen↔feature coverage matrix (`docs/product/05-screens/README.md` §3-§6). Phase 6 produced
`docs/product/08-prioritization.md` (method, RICE scores for all 108 features, the dependency
graph incl. one genuine source-spec cycle found and resolved, a walking-skeleton MVP definition
walking JTBD-01/FLOW-09→10, four release slices R0–R3, MoSCoW, cut list, R0 story decomposition,
an explicitly-unobserved capacity check) and `docs/backlog.yaml` (the machine-readable spine —
108 features, 553 acceptance criteria, 116 R0 stories, 51 screens, 4 gates — validator-clean
modulo 15 errors / 263 warnings, all one documented/accepted class each, see the doc's §11).
**Key finding from Phase 6, not obvious before computing the closure**: JTBD-01's walking
skeleton isn't "the monthly loop with fixture data" — FEAT-040 (circuit registry) structurally
depends on FEAT-007 (survey-time circuit selection) in the spec as written, so there is no
backend-only shortcut to create a billable circuit. The MVP is one real deal walked start to
finish (lead → survey → commissioning → offer → agreement → installation → first bill), 41
features / 175 agent-sessions. Effort is scored in **agent-sessions**, not person-weeks — the
user confirmed build capacity is "user + Claude Code, mostly," which also means pace is currently
**unobserved** (§10 of the doc states this as a placeholder, not a finding, to be recalibrated
after R0's first few sessions).

**Branding-phase gap closed out (2026-08-13), found by the user, not by this phase's own exit
check.** `05a-theme-system.md` covered palette/type/components/charts from the start but never
produced an actual identity — the archived app's sidebar was plain text, no logomark, no favicon.
Closed via `docs/product/brand/`: an FT monogram ("The Reading" — F's bar carries into T's
crossbar, T's stem extends into a single lime dot reusing the system's existing "lime marks a
verified value" rule). Explicitly **not** derived from the existing production logo (a
circuit-board "FT" badge) — the user asked for fresh directions, not iterations on it; three were
explored and rendered as marks, not swatches, before this one was picked. Two real, user-caught
defects along the way, both fixed and recorded in `05a-theme-system.md` §3.11: the tile colour
(`#2E9E68`, deliberately **not** the theme's `--accent` token) was picked only after measuring
white-text contrast on four candidates — the shade the user was initially drawn to cleared just
1.95:1 and would have shipped the least legible element in the product; and the dot's placement
relative to the FT letterforms was inconsistent across the four asset files until traced to one
canonical, scaled geometry.

**Phase 7 (Architecture & Technical Decisions) — approved 2026-08-13.**
`docs/engineering/09-architecture.md` (12 sections per the skill's template) plus 10 ADRs under
`docs/engineering/adr/`. Reconfirms CON-05's stack and commits to **one Next.js deployment**, not
microservices — the society portal stays "a role-scoped projection of SUR-01... separated by
INV-05's tenancy boundary rather than by deployment" exactly as `04-flows-system-map.md` §3 already
argued, and SUR-02 (field) is a client of the same app with an IndexedDB offline outbox rather than
a separate service (ADR-001/002). The greenfield Prisma schema is designed at ~40 models, organized
by the 12-component capability map, with three structural rules applied throughout: versioned-not-
mutated entities for provenance (`Benchmark`, `MeterReading` supersession — ADR-005, serving
INV-02/INV-03/INV-07), `CircuitFeeLine` as the first-class per-circuit billing grain that makes
CON-11's corrected extrapolation model queryable rather than buried in JSON (ADR-004), and
`FieldVisitParticipant`/`FieldVisitAreaClaim` replacing a single visit assignee to match CON-44's
team/area-claim model (ADR-007). All 12 cross-surface contracts (XS-01..12) from Phase 4 are
specified as concrete Route Handler contracts with idempotency/versioning semantics; the two
blocking ones (gate-pass submit/approve, CON-18) are resolved by a 30-minute provisional-release
sweep job (ADR-006) rather than an indefinite client-side wait. A new background-job component
(Postgres-backed queue, ADR-003) is introduced as the one piece of infrastructure with no precedent
in the current codebase — it now carries every time-driven guarantee in the product (SLA escalation,
the CON-13 suspension countdown, the gate-pass timeout, notification retries), flagged in the risk
register (RISK-04) as the closest thing this design has to a new single point of failure. Vendor
meter-API work (FEAT-104/105/106) is built behind a provider-agnostic ingest interface (ADR-010) so
SPIKE-01's still-unverified finding (ASSUM-24) can only ever remove one implementation, never force
a rewrite of the billing engine. **Two items were deliberately raised rather than decided
unilaterally, and both are now resolved**: production hosting for `firsthing.earth` (ADR-009) — the
user confirmed the recommended default, continuing the `zenovaa`-style self-managed VPS pattern
already proven in staging, closing `CON-06`'s long-open item; and whether `Contract.tolerancePct`
is schema-level per-contract or per-circuit (RISK-02 — the source constraints (CON-01a, CON-11)
could be read either way) — user confirmed one value per contract, applied independently per
circuit, matching the schema as already designed; `00-intake.md` CON-01a updated with the scope
confirmation. No open items remain against the Phase 7 document. A new
non-technical spike (SPIKE-02) was added to `docs/backlog.yaml` for an India DPDP Act compliance
review — the PII footprint (committee contacts, field-staff location data, signature/premises
photos at 200-society scale) was validated against GST-only tax rules at Phase 0 (ASSUM-10) but
never checked against data-protection law specifically, and this session did not resolve that
either, only surfaced it. `docs/backlog.yaml` otherwise unchanged in shape — `architecture_notes`
added to 8 features, `phases_complete` now includes `7` — validator still 15 errors/263 warnings,
same documented/accepted class as Phase 6, confirmed by re-running it after every edit.

**Phase 8 (Development Plan) — drafted 2026-08-13, approved 2026-08-14.**
`docs/engineering/11-development-plan.md` breaks R0 (41 features, 175 raw feature-sessions) into 8
sequential milestones (MS-01 through MS-08, recorded in `docs/backlog.yaml`'s new `milestones:`
section, one entry per R0 feature now carrying a `milestone:` field). **MS-01 is a genuine
from-scratch walking skeleton, not a formality** — there is currently no `src/` on the `blueprint`
branch at all (the pre-blueprint app is entirely in `archive/`), so this milestone covers
initializing the Next.js app, migrating Phase 7's Prisma schema, wiring NextAuth v5, and reaching a
staged deploy before any feature work starts. The remaining 7 milestones follow the deal-to-bill
spine exactly (`08-prioritization.md` §3.1): accounts/authority → survey → commissioning →
offer/agreement → installation → ingest → calculation/release, each demoable and strictly
sequential, since R0 by design walks one deal start to finish. **A real estimation gap was found
and corrected, not just carried forward**: `08-prioritization.md`'s own 175-session/~29-week figure
was raw feature effort only, with no platform-scaffold or non-feature-work allowance — this plan
adds 8 scaffold sessions and the method's own 30–50% non-feature-work allowance, producing a wider,
more honest 238–275 session range (~24 to ~69 weeks depending on which of the three paces from
`08-prioritization.md` §10 turns out to be real). The background job runner (COMP-11, new
infrastructure per ADR-003) is explicitly threaded into MS-04 (gate-pass timeout) rather than given
its own milestone, since MS-04 is the first point it's actually load-bearing, and MS-08 reuses it
for the suspension clock rather than rebuilding it. Both spikes (SPIKE-01 vendor API, SPIKE-02 DPDP
review) are scheduled off the R0 critical path — neither blocks a milestone, matching that neither
is needed until R1. A five-item risk register was added at the plan level (pace being genuinely
unobserved is named as the single highest-likelihood, highest-impact risk, with MS-01 itself
flagged as the cheapest early signal if the whole estimate is wrong) alongside the two technical
risks carried forward from Phase 7 that actually touch an R0 milestone (the job runner, and CON-44's
area-claim complexity). `docs/backlog.yaml` validator re-run after every edit: still 15 errors/263
warnings, `Milestones: 8` now reported correctly.

**Phase 9 (Test & Quality Plan) — drafted 2026-08-13, approved 2026-08-14 (after a fix — see the
review-pass entry below).**
`docs/engineering/12-test-plan.md` traces all 210 of R0's acceptance criteria to a named test case
at the cheapest level that can verify it, using a mechanical, reproducible level-assignment rule
rather than a per-AC judgment call: CAP-02/CAP-04 (pure computation) happy/edge ACs → `unit`,
`permission`-type ACs → `integration` (GATE-03/04's enforcement is a real Prisma query under a real
session, not meaningfully mockable), everything else defaults to `integration`, and 4 ACs are
`manual` where no assertion can replace human judgment (photo/label legibility, report
defensibility). 7 ACs — one per R0 milestone, the AC that most directly represents that milestone's
demoable outcome — additionally get an end-to-end test on top of their base-level coverage,
detailed in full (preconditions/steps/expected result) in §4 alongside 2 more: the CON-11 billing
formula (FEAT-048-AC-1, asserted to the rupee, not approximately) and the CON-13 suspension-safety
rule (FEAT-087-AC-3, the specific "never suspend on stale payment data" case the invariant exists to
prevent). All 12 XS-01..12 cross-surface contracts get a producer/consumer test pairing (§5); all 15
NFRs get a measurement method and pass threshold, with 2 (NFR-10 notifications, NFR-14 dashboard
latency) honestly deferred since their owning components aren't built until R1/R2 (§6); 7 of 9
invariants get an automated gate, the other 2 (INV-04, INV-08) correctly have no R0 write path to
gate yet. **R1–R3's 343 acceptance criteria are explicitly out of scope, not silently skipped** —
same "near-term release only" discipline this blueprint has applied since Phase 5's screens and
Phase 8's milestones, with a stated plan to repeat this phase's method once R1 is
milestone-decomposed. `docs/backlog.yaml`'s 210 R0 ACs each gained a real `tests:` array (a `TC-`
id, plus a `-E2E` id for the 7 anchors) in the same change; validator re-run with
`--check-coverage`: **16 errors/263 warnings**, one new expected error class ("343 acceptance
criteria have no test cases," all R1–R3) joining the existing 15, AC test coverage reported as
210/553 (37% system-wide, 100% of R0).

**Handoff — `docs/README.md` written 2026-08-14, closing out the blueprint workflow's 10th and
final stage.** Ran the method's consistency sweep before writing the index rather than assuming
the seams held, and it found two real, on-disk staleness defects, both fixed in the same change:
`docs/product/05-screens/README.md`'s own status line still read "Draft — per-screen loop running
on priority 1 (29 of 51)" despite the underlying work having finished (git history shows the loop
completed through "all 51 priority-1 screens specified," all 6 mockup decks built, and the nav
map/matrix drawn) — corrected to Approved. The same file's own directory index table had also gone
stale: it named `03-back-office-ops.md`/`04-society-portal.md` in the opposite order from what's
actually on disk (`03-society-portal.md`/`04-back-office-ops.md`), and pointed at a
`07-headless.md` that was never created — HL-01..05 are specified inline in the README's own §1.9,
not delegated to a surface file. Both fixed; the index table now matches the 7 files that actually
exist. **One gap was surfaced, not silently patched over**: Phases 6 (`08-prioritization.md`), 8
(`11-development-plan.md`), and 9 (`12-test-plan.md`) were each drafted and then built upon under
this session's "continue unless a real decision needs surfacing" instruction, but never given an
explicit approval checkpoint the way Phase 7 got (two individually-surfaced questions, both
answered) — `08-prioritization.md` in particular still has no "User approval: granted/pending" line
at all, predating that convention. `docs/README.md`'s own "Current state" section states this
directly as the single next action, rather than marking all three Approved without an approval
having actually happened. `AGENTS.md` also updated (per the method's "agent-executable handoff"
step) with a new "Blueprint & Scope" section: a pointer to `docs/README.md`/`backlog.yaml`, all 9
invariants restated as hard rules with why each exists, and the Phase 8 Definition of Done — so an
agent starting cold in this repo finds the blueprint without being told where to look.

**Full-blueprint review pass and final approval (2026-08-14).** The user asked for a genuine review
of everything drafted so far, not a rubber stamp, before signing off Phases 6/8/9. Checked, all
programmatically verified rather than eyeballed: milestone↔feature coverage in `backlog.yaml` (all
41 R0 features in exactly one milestone, session sums exact to the session — 13/15/27/27/20/21/52
plus MS-01's 8), the `tests:` population from Phase 9 (all 210 R0 ACs covered, zero duplicate `TC-`
ids, exactly 7 `-E2E` ids matching the 7 feature-bearing milestones), and `12-test-plan.md`'s
traceability matrix against `backlog.yaml` itself (byte-exact match, 210/210 rows, no transcription
drift from the manual paste into the doc). All clean. **Two real defects turned up, both fixed in
the same pass**: `TC-048-1` (the CON-11 billing-formula unit test, written in Phase 9) had the
revenue-share split inverted — computed FirsThing's fee as 2,720×58% (₹1,577.60) when CON-11's own
worked example is 58% *society* / 42% FirsThing, meaning the correct figure is 2,720×42%
(₹1,142.40). This is the identical class of bug `05-screens/README.md` §6 already caught once,
independently, in a mockup deck ("labelled the revenue share 58% FirsThing / 42% society — exactly
inverted... nine places") — worth naming because a test suite that only asserts the number without
asserting which party it belongs to would not have caught either instance. Separately,
`docs/README.md`'s own first draft overclaimed "ADRs: Accepted (10/10)" — ADR-008 (email provider)
is deliberately still Proposed (low-stakes, not needed until R2's notification work) — corrected to
9/10. Phases 6, 8, and 9 are now marked Approved in their own document headers and in
`docs/README.md`, closing the one open item the handoff index itself had flagged. Next action: MS-01.

## MS-01 done (2026-08-14) — real `src/` on this branch for the first time, staged and verified live

**All three exit criteria are now genuinely met, not just locally.** An admin logs in and lands on
a real Server Component reading Postgres (locally and on `https://stage.firsthing.earth`), the same
build deploys to staging with zero console/page errors, and the accounts/society/circuit Prisma
subset migrates cleanly. `prisma/schema.prisma` now has the accounts/society/circuit subset of
`09-architecture.md` §5.2
(`AdminUser`, `Profile`, `Society`, `SocietyContact`, `Circuit` plus the enums each needs) — the
full ~40-model schema is filled in milestone by milestone, not all at once, matching §5.2's own
"representative, not exhaustive" framing. `CircuitState`'s exact values are explicitly marked
provisional in a schema comment — real commissioning-lifecycle design is MS-04's job, not MS-01's;
MS-01 only needs the table to exist and migrate. Migrated cleanly against a **reset** local
`firsthing-postgres` container — its volume still held the old archived-schema tables (`profiles`,
`invoices`, `tank_readings`, etc. from before the 2026-08-13 archive move); dropped and recreated
the database rather than trying to migrate old data forward, consistent with the standing
migration-deferred decision (this is disposable local dev data, not customer data). Seeded with one
`AdminUser` (`yogesh@firsthing.earth`) and one `Society` — just enough for the exit criterion,
real seed data grows with each milestone's own tables.

`src/lib/db.ts`, `auth.ts`, `roles.ts`, `types/next-auth.d.ts`, and `proxy.ts` reuse the exact
proven patterns from `archive/src/` (separate `AdminUser` table per INV-01, JWT sessions, optimistic
proxy-layer gating with independent per-page `auth()` checks) — `roles.ts` is deliberately scoped to
`Role = "admin"` only for now; society-portal roles (office-bearer/committee/manager, FEAT-108) get
added when MS-02 builds the `Profile`-based login path, not preemptively. Login page uses a Server
Action (`useActionState` + `next-auth`'s `signIn`) rather than the archived client-side
`signIn()` + `alert()` pattern, matching this repo's own established "writes are Server Actions"
convention.

**Two real bugs found and fixed during this milestone, not just planned-around:**
1. **`tsconfig.json` and `eslint.config.mjs` did not exclude `archive/`.** Running `tsc --noEmit`
   surfaced dozens of errors from dead archived code, and — more seriously — a real type-safety
   hazard: `archive/src/types/next-auth.d.ts`'s ambient `declare module "next-auth"` augmentation
   was merging with the new `src/types/next-auth.d.ts`, since TypeScript module augmentation is
   global and doesn't care which folder a `.d.ts` lives in. This silently required the new
   `authorize()` return value to carry `archive`'s old `societyId`/`societyName` fields, which don't
   exist in the new schema at all — a bug that would have been very confusing to debug later, found
   here instead because MS-01 happened to touch `auth.ts` directly. Fixed by excluding `archive/`
   from both tsc's `include` and ESLint's `globalIgnores`, per `AGENTS.md`'s own rule that archive
   is reference-only, never part of the live build.
2. **Missing NextAuth API route handler.** `src/lib/auth.ts` exports `handlers`, but nothing
   exposed them at `/api/auth/[...nextauth]/route.ts` — every `/api/auth/*` call (csrf, session,
   callback) 404'd until this was added. Caught by an actual curl-driven login flow, not by
   `tsc`/`lint`/`build` (which all passed while this was still missing, since nothing imports a
   route handler that's never called).

**Also removed**: `@supabase/supabase-js` from `package.json` — confirmed nothing in the new `src/`
imports it (Supabase was fully replaced by standalone Postgres well before the greenfield decision,
see Architecture Decisions below), so it was dead weight carried over from the pre-archive
`package.json`, not a live dependency.

**Verified end to end via curl** (real HTTP requests against a running dev server, not just
`tsc`/`lint`/`build`): unauthenticated `GET /admin` redirects to `/login`; correct credentials
create a real JWT session (`role: "admin"`, permissions carried through); a wrong password is
rejected with no session created; an authenticated `GET /admin` returns 200 rendering "Societies in
Postgres: 1" and "Settlement Nexus / Bengaluru" — a real Server Component reading a real Postgres
row, MS-01's own exit criterion made literal. Dev server log clean of errors on the successful run
(the one `MissingCSRF` line in the log is from an earlier deliberately-malformed test request, not
a real failure). `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` all pass clean.

**Staged deploy to `stage.firsthing.earth` (2026-08-14): done, replacing the old archived-app
deployment there, per the user's explicit choice** (offered a run-alongside-on-a-separate-port
option first; user chose to replace it outright). Three deploy-shape decisions were surfaced to the
user rather than picked unilaterally, since each was a genuinely different risk class from local,
reversible file edits:
- **How code reaches the box**: rsync of the working tree, not `git pull` — `origin`
  (`github.com/manishjhamb86/firstthing-dashboard.git`) is a **public, third-party-owned repo**, and
  this session's standing constraint is nothing gets pushed there. The old checkout was preserved
  (moved aside to `firsthing-dashboard-newui-archived-20260814`, not deleted) rather than overwritten
  in place.
- **Whether to replace the live URL**: user chose replace-now over running the new build alongside
  on a separate port.
- **The database**: a `DROP DATABASE firsthing_prod` (after a `pg_dump` backup) was **blocked
  outright by Claude Code's auto-mode safety classifier**. Per the classifier's own instruction, this
  was not retried or worked around in any form — stopped, explained the exact command and reasoning
  to the user, and asked how to proceed. **User's explicit instruction: "create a new db."**
  `firsthing_prod` (the old archived app's database) was never dropped, modified, or even connected
  to for writes — a wholly separate `firsthing_blueprint` database was created instead
  (`CREATE DATABASE firsthing_blueprint OWNER firsthing;`), confirmed via `psql -l` to exist
  side-by-side with the untouched `firsthing_prod`, and the server's `.env.local` `DATABASE_URL` was
  repointed at it via a remote-only `sed` (never printing the credential locally). Migration and seed
  ran cleanly against this fresh database.

**One real bug found and fixed post-deploy, not caught by any pre-deploy check**: the login flow's
server-side redirect resolved to `https://localhost:3005/admin` instead of
`https://stage.firsthing.earth/admin` — the session cookie was correctly set and a manual
`curl` straight to the correct public URL with that cookie rendered the real page fine, so this was
purely a redirect-URL-construction bug, not an auth/session/DB defect. Root-caused by reading
`@auth/core@0.41.3` and `next-auth@5.0.0-beta.32` source directly rather than guessing:
`next-auth`'s Server-Action helpers (`signIn()`/`signOut()`/`getSession()`, used by
`src/app/login/actions.ts`) build their target URL via `createActionURL()`, which correctly prefers
`x-forwarded-host`/`x-forwarded-proto` headers — confirmed by direct testing (manually adding
`X-Forwarded-Host` to a request produced a correct `callback-url` cookie). But the actual
`GET`/`POST` **Route Handler** path (`src/app/api/auth/[...nextauth]/route.ts`, hit for the real
`/api/auth/callback/credentials` POST) goes through `@auth/core`'s `toInternalRequest()`, which
builds the request URL from `new URL(req.url)` directly — Next.js's own `NextRequest.url` for a
self-hosted `next start` process, **not** re-derived from any proxy header, confirmed by testing
that manually overriding `Host` alone made no difference either. So nginx not sending
`X-Forwarded-Host` (added anyway, since it's still needed for the Server-Action code path and is
correct practice) was a real but insufficient fix on its own. The actual, sufficient fix — and the
officially documented pattern for exactly this deployment shape — is setting `AUTH_URL` in the
server's `.env.local` (`AUTH_URL=https://stage.firsthing.earth`): `next-auth`'s `reqWithEnvURL()`
rewrites the request's origin from this env var *before* it ever reaches `Auth()`, for both the
Server Action and Route Handler code paths alike, sidestepping the proxy-header detection gap
entirely. Applied, `pm2 restart --update-env`'d, and reverified against the live public domain:
correct `302` to `https://stage.firsthing.earth/admin`, correct non-`localhost` cookies, and the
admin page rendering real Postgres data ("Settlement Nexus") through the full public HTTPS path —
not just via a bypassing curl. Full regression pass afterward (unauthenticated `/admin` → `307` to
`/login`, `/login` → `200`, `/` → `307`) plus a flushed-and-rechecked `pm2` log came back with zero
errors or warnings.

`docker-compose.yml`'s `firsthing-postgres` container is running locally for this session; not yet
decided whether local Docker Postgres stays the long-term dev convention or whether a future
milestone should also touch the production-hosting groundwork from ADR-009 (this MS-01 deploy is
staging only, not a production decision).

## MS-02 (partial, 2026-08-14) — portal login, GATE-04's binding act, and NFR-05's first slice

**Honest framing up front: this is MS-02's exit-criteria slice, not the full milestone.**
`docs/backlog.yaml` MS-02 lists three features (FEAT-085 society lifecycle, FEAT-086 internal
ops/support account management, FEAT-108 portal accounts & authority) and this session built none
of FEAT-085's or FEAT-086's screens at all — no society-lifecycle CRUD, no internal-user
management UI. What it did build, fully and runtime-verified, is the milestone's own three literal
exit criteria (`docs/backlog.yaml`): an admin and a society office-bearer/committee/manager account
each log in with role-correct access; a non-office-bearer is refused a binding act server-side
(GATE-04), not just hidden in the UI; and NFR-05's tenancy-scoping test suite exists and passes —
a first slice, not full coverage. **`docs/backlog.yaml`'s MS-02 status is deliberately left
`proposed`, not flipped to `done`** — flipping it would overstate FEAT-085/086 progress that
didn't happen. Follow-up work (the two features' actual screens) is still open.

**Why this slice, not the full milestone**: prompted by the user asking to "finish off one flow
completely" after seeing MS-01's bare admin page. FEAT-108's binding-act check (GATE-04) is the
smallest genuinely complete, demoable vertical slice available at this point in the build — it
doesn't depend on any entity later milestones haven't built yet (unlike FEAT-108-AC-1's "accept an
offer", which needs the Offer entity from MS-05+). The concrete binding act implemented is
FEAT-108-AC-5 (an office-bearer transfers the designation to another account of the same society)
— a real existing AC, not a fabricated stand-in, chosen because it's the one binding act fully
expressible against MS-01's existing schema.

**What's new:**
- `src/lib/logger.ts` — structured JSON-to-stdout logging, implementing `09-architecture.md` §7's
  "Structured JSON logs to stdout, captured by pm2" design, which nothing in `src/` had used until
  now (the user caught this gap directly: "the logs that we designed are still not used anywhere").
  Wired into `auth.ts` (every login success/failure, with reason) and the GATE-04/INV-05 refusal
  paths in `portal/actions.ts` — every access-control decision this milestone makes is now a real,
  greppable `pm2 logs` line, not silent.
- `src/lib/roles.ts` — `Role` extended from `admin`-only to `admin | office_bearer | committee |
  manager`; `ROLE_HOME` and a new `isPortalRole()` guard added.
- `src/lib/auth.ts` — a second `authorize()` branch resolving `Profile` (checked only after
  `AdminUser` misses, per the existing INV-01 pattern) — a `Profile` row can still never mint an
  admin session, by construction. `portalAuthority` becomes the session `role` directly.
- `src/lib/portal-authority.ts` — the GATE-04 + INV-05 authorization decision for the transfer act,
  factored out as a **pure function** deliberately so it's unit-testable without a live Next.js
  request context (`auth()`'s `cookies()`/`headers()` calls only work inside one) — this is what
  `tests/portal-authority.test.ts` (NFR-05's first slice, 8 cases, Vitest) actually exercises.
  `src/app/portal/actions.ts`'s `transferOfficeBearer` Server Action is a thin DB/logging shell
  around it.
- `src/app/portal/` — a role-scoped landing page (society name, the viewer's own authority, the
  society's other portal accounts) plus the transfer control, rendered only for an office-bearer
  viewer; a committee/manager viewer sees "Only the office-bearer can change this" instead
  (FEAT-108-AC-2's "the screen names who can perform it," reused for the transfer act since no
  Offer exists yet to test the AC's literal wording against).
- `src/proxy.ts` — `/portal` added to `ROUTE_ROLES`, gated to the three portal roles.
- **Vitest chosen over Jest** — `12-test-plan.md` line 42 explicitly deferred this pick to
  MS-01/02 ("decide at MS-01, not a Phase 9 concern"). Chosen here: named first throughout the
  test plan, ESM/TS work with no transform config alongside this repo's Turbopack-based Next.js
  setup. `vitest.config.mts` (the `.mts` extension, not `.ts`, avoids a config-loader ESM/CJS
  warning without touching `package.json`'s module type — `next.config`/PostCSS config elsewhere in
  the repo still assume CommonJS).
- `prisma/seed.ts` — a second society (ASF Insignia) and 3 `Profile` rows (2 office-bearers, one
  per society, plus a committee account) — enough to log in as either authority and to prove INV-05
  against a real foreign society, not just an assertion.

**Three real bugs found and fixed while browser-verifying this, not just planned around:**
1. **`transfer-button.tsx` called `useActionState`'s dispatch function directly from an `onClick`
   handler** (`formAction(profileId)`), outside a `<form>` and outside `startTransition` — React
   warned "called outside of a transition" in the browser console, and the click's effect was
   unreliable. Fixed by switching to the same `<form action={formAction}>` + hidden-input pattern
   `login-form.tsx` already established, rather than inventing a second convention.
2. **A real, pre-existing routing bug, only exposed now that a second role exists**: `src/app/
   page.tsx` unconditionally `redirect("/admin")`ed, and `login/page.tsx`/`login/actions.ts`
   defaulted `callbackUrl` to `"/admin"` whenever none was supplied — harmless while admin was the
   only role, wrong the moment a portal account logs in without an explicit `callbackUrl` (e.g.
   navigating straight to `/login`). `proxy.ts`'s own mismatch-redirect does correct the *content*
   shown (confirmed via curl: a direct `GET /admin` with a portal session correctly 307s to
   `/portal`), but a client-side Server Action redirect into a route the session doesn't hold
   didn't keep the browser's URL bar in sync with the corrected content — confusing regardless of
   whether it's a security hole. Fixed at the root: `page.tsx` now reads the session and redirects
   via `ROLE_HOME[role]`; the login fallback changed from `"/admin"` to `"/"`. This avoids ever
   routing a session to a role it doesn't hold, rather than relying on `proxy.ts` to catch it after
   the fact.
3. **No favicon** — every page 404'd on `/favicon.ico` (a pre-existing gap, not introduced this
   session, but caught by the browser-console-errors check this milestone's verification added).
   Fixed properly rather than stubbed: `docs/product/brand/logomark.svg` (the approved FT monogram
   from the branding-phase work, 2026-08-13) copied to `src/app/icon.svg`, which Next.js's App
   Router auto-detects as the favicon with no route file needed.

**One real limitation found and deliberately left open, not silently shipped**: the transfer test
surfaced that a JWT session's `role` doesn't refresh when the underlying `Profile.portalAuthority`
changes — immediately after Asha Rao transfers the office-bearer designation away from herself, her
*existing* browser session still carries the stale `role: "office_bearer"` claim (confirmed: her
own now-`committee` row still rendered a transfer button, since the page's render check reads the
stale session, not a fresh DB lookup) and could, in principle, transfer it back to herself before
the JWT naturally expires. This isn't a cross-account privilege escalation — she's not gaining an
authority she never had — but it does mean a just-revoked authority stays exercisable from that
session until expiry, which is a real gap for a *binding* act specifically. `09-architecture.md`
NFR-13 already sets portal session lifetime at 90 days, meaning this window could be long. Not
fixed here — the right fix (force a session refresh/invalidation on a portal authority change, or
re-verify `portalAuthority` against the DB per binding-act request rather than trusting the JWT)
is a real architectural decision, not a one-line patch, and belongs in `09-architecture.md` §6 or a
new ADR before FEAT-108's other binding acts (offer acceptance, batch approval) are built on the
same session model. **Closed 2026-08-14** — see "Stale sessions" below; the decision was made
rather than deferred again, because the identical root cause turned out to be crashing the admin
side too.

**Verified end to end via a browser** (Playwright driving system Chrome from a scratchpad project,
same proven pattern as the archived app's write-flow verification — not just `tsc`/`lint`/`build`,
which also all pass clean, nor `pnpm test`'s 8 Vitest cases, which also all pass): 19/19 checks —
office-bearer login lands on `/portal` and sees the society, itself, and the committee account;
clicking "Make office-bearer" actually flips both accounts' authority in Postgres and the page
re-renders it correctly; the now-demoted account no longer sees the transfer control and instead
sees who can perform it; a foreign society's office-bearer (ASF Insignia) sees only their own
society's data, never Settlement Nexus's (INV-05); unauthenticated `/portal` redirects to `/login`;
admin login is unaffected (no regression); an admin session hitting `/portal` is correctly refused.
Zero browser console errors, zero page errors, across all five scenarios.

## MS-02 done (2026-08-14) — FEAT-085/086 real screens, a systemic form-reset bug, and the missing logo

**`docs/backlog.yaml`'s MS-02 status flipped from `proposed` to `done`.** The previous session left
it `proposed` specifically because FEAT-085 (society lifecycle) and FEAT-086 (internal account
management) had no real screens yet, even though the milestone's own three literal exit criteria
were already met. Both now have real, runtime-verified screens: `/admin/societies` (list +
`EmptyState` per INV-06/FEAT-085-AC-2),  `/admin/societies/new` (create, defaulting to
`prospect` per FEAT-085-AC-1), `/admin/societies/[id]` (status control + portal-account
management), and `/admin/users` (admin account CRUD, permission-gated). **One AC is a known,
explicit gap, not silently skipped**: FEAT-085-AC-5 (a society's per-service-line independent
engagement state) needs an `Engagement` entity this milestone's schema doesn't have — documented
inline in `src/app/admin/societies/actions.ts`'s own comment, left for whichever future milestone
actually builds multi-service-line societies, same "state the gap honestly" discipline as
`12-test-plan.md`'s NFR-10/14 deferrals.

**What's new**, built by porting proven patterns from `archive/src/app/admin/` rather than
reinventing them (per `AGENTS.md`'s own "read archive, don't treat it as convention" guidance):
`src/lib/admin-permissions.ts` (`requireAdmin`/`requireAdminPermission`), `src/app/admin/
societies/actions.ts` (`createSociety` with FEAT-085-AC-3's duplicate-flag-not-silently-create
check, `updateSocietyStatus`), `src/app/admin/societies/[id]/portal-actions.ts`
(`createPortalAccount`, `deactivatePortalAccount` — refuses deactivating a society's sole active
office-bearer), `src/app/admin/users/admin-actions.ts` (`createAdminUser`/`updateAdminUser`/
`deleteAdminUser`, both self-lockout guards from the archived `AdminPermission` pattern: can't
remove the last `manage_admins` holder, can't self-delete). Every mutation logs through
`src/lib/logger.ts` (the structured-JSON logger MS-02's first slice introduced), continuing the
"every access-control decision is a greppable `pm2 logs` line" convention.

**A critical, systemic bug found while browser-verifying FEAT-085's duplicate-confirm retry flow,
not something anyone was looking for**: submitting `new-society-form.tsx` with a duplicate name,
checking "create it anyway," and resubmitting did **nothing** — no network request, no error, no
loading state. Root-caused through a rigorous elimination process (a temporary `/admin/debug-form`
diagnostic route, testing `pnpm dev` and a production `pnpm build && pnpm start` server alike to
rule out a dev-mode/HMR artifact) to **React 19's own documented behavior**: `useActionState` +
`<form action={formAction}>` resets every *uncontrolled* field to its default (empty, absent a
`defaultValue`) after **every** submission, success or failure. Combined with HTML5 `required`,
the browser's native validation then silently blocks the next submit attempt before it ever reaches
the Server Action — no error, no console warning, nothing, which reads exactly like "the button is
broken." **This affected every form in the app that used uncontrolled inputs, including the very
first one every user touches**: `login-form.tsx` (a mistyped password wiped both fields, so retry
silently did nothing), plus `new-society-form.tsx`, `portal-account-form.tsx`, and
`new-admin-form.tsx`. Fixed in all four by converting to controlled inputs (`useState` +
`value`/`onChange` instead of bare `defaultValue`-less `<input required>`) — confirmed via a
dedicated retry-scenario browser suite (10/10 checks: values survive a failed submit, and a
corrected resubmit succeeds, for all four forms) that this is now correct. **Any new form added to
this codebase going forward must use controlled inputs if it can fail and be resubmitted** — an
uncontrolled `required` field is not just a style preference here, it's a latent version of this
exact bug.

**A second real gap, this one user-caught rather than found during verification**: the approved FT
wordmark (`docs/product/brand/`, picked and contrast-tested in the branding phase) had only ever
been wired in as the browser-tab favicon (`src/app/icon.svg`, MS-01) — it never actually appeared
*inside* the product itself. Login, admin, and portal all rendered plain text ("FirsThing" as an
`<h1>`, or nothing at all in `admin-nav.tsx`). Fixed by copying `wordmark-lockup-light.svg` (icon +
"FirsThing" text, the variant `docs/product/brand/README.md` specifies for light/Slate working
surfaces) into a new `public/brand/` (the first `public/` directory on this branch — didn't exist
post-archive) and a shared `src/components/brand-mark.tsx`, used in `login/page.tsx`,
`admin/admin-nav.tsx` (now a header bar, not a bare text-link row), and `portal/page.tsx`. The
redundant plain-text "FirsThing admin" `<h1>` on the admin Portfolio page was simplified to just
"Portfolio" now that the mark itself carries the brand name.

**Full regression + retry-scenario verification (2026-08-14)**: 17/17 checks on the FEAT-085/086/
108 regression suite, 10/10 on the new retry-scenario suite, `tsc`/`lint`/`build`/`vitest` all
clean. **One verification-process finding worth recording**: a prior, interrupted verification run
had left real drift in the local dev database — a leftover test `AdminUser` row, `yogesh@firsthing.
earth`'s `manage_admins` permission actually stripped (a side effect of that earlier, never-reset
self-lockout test), and two seeded portal accounts' `portalAuthority` left swapped from an earlier
GATE-04 transfer test. This silently produced 3 false test failures on the first re-run of this
session (traced and confirmed via direct `psql` inspection and isolated manual reproduction of each
flow — the underlying app logic was correct in all three cases) before being identified as stale
data, not a code defect, and reset via `psql` back to `prisma/seed.ts`'s canonical state. Two of the
test script's own wait conditions (`page.waitForLoadState("networkidle")` after a Server-Action
redirect, and a URL regex that incidentally matched the literal path segment `new`) were also
tightened (`page.waitForURL` with a `(?!new$)` exclusion) — the same class of RSC-navigation-timing
issue already fixed once for the login-retry check, now generalized.

**A fourth real bug, this one only surfaced by deploying to stage — never visible under `pnpm
dev`**: `/admin/societies` (and, for the same reason, `/admin/societies/[id]`) had no `auth()` call
of their own, unlike `admin/page.tsx` and `admin/users/page.tsx`, which both independently check the
session (proxy.ts's own matcher is documented as optimistic-only, per `AGENTS.md`). Consequence
beyond the consistency gap: with no `cookies()`/`auth()` call anywhere in the page, Next.js's static
analysis had been silently prerendering `/admin/societies` as a **static** route at `pnpm build`
time (`○` in the build's route table, confirmed by re-reading it after the fact) — so every visitor
was served whatever society list existed *at the moment of the last build*, not a live query. Caught
live on stage: reseeded a second society, restarted, and the deployed `/admin/societies` still
showed only the first one, while `/admin` (Portfolio, which does call `auth()`) correctly showed
both. `next dev` never exposes this class of bug (dev always re-renders), which is exactly why
`pnpm build` is in this repo's own required validation set for structural changes, not just `tsc`/
`lint` — worth remembering the next time a page reads live data but has no reason to call `auth()`
on its own. Fixed by adding the same `auth()` + role check both pages' siblings already had; this
forces per-request dynamic rendering as a side effect (confirmed: the route table now shows `ƒ` for
`/admin/societies`), with no separate `export const dynamic` needed.

## Theme system: Light/Dark/Slate wired in (2026-08-14) — user-caught gap, closed same day

**The approved theme system (`docs/product/05a-theme-system.md`) had been designed since the
branding phase but never actually implemented** — `globals.css` had carried a one-line placeholder
since MS-01 ("gets wired in properly once real screens start landing, starting MS-02"). Real MS-02
screens landed, but the theme system itself stayed unbuilt until the user asked directly: "where is
the theme switcher, that's missing." Closed in the same session as a real gap, not a cosmetic
add-on — matching the doc's own explicit intent, not a new design decision.

**What's implemented**: the full palette (content + chrome tokens for Light/Dark/Slate, `globals.css`)
and the switcher itself. **Deliberately not yet adopted**, and said so in `globals.css`'s own
comment rather than silently: the type scale, space steps, elevation, and the `.roomy` density
modifier (§3.3/3.4/3.6) — existing pages still use Tailwind's default scale for those. A full
component-library build-out (buttons/chips/tables/etc., §3.7) is a bigger lift than a switcher needs
and stays open for whenever a screen actually requires one of those components.

**Persistence matches §3.2b exactly, including the part that's easy to get wrong**: "the choice
belongs to the account, not the browser." `AdminUser.themePreference` / `Profile.themePreference`
(new nullable `Theme` enum column on both, migration `20260814043557_add_theme_preference`) —
**not** the JWT session, and not `localStorage` for logged-in surfaces. The reason is the exact
staleness bug already documented for `portalAuthority` in this file's MS-02 section: a JWT field
written once at login would drift the moment the switcher persists a new choice. `src/lib/
resolve-theme.ts`'s `resolveTheme()` reads the DB fresh every request instead (wrapped in React's
`cache()` so the root layout and `AdminNav`/the portal header share one lookup per request, not
three). `src/app/layout.tsx` stamps `data-theme` server-side before first paint — no flash, no
client bootstrap script needed, unlike the archived app's `localStorage`-only approach (still the
right fallback for a genuinely logged-out surface, but every surface that exists today is
authenticated). Per **`prefers-color-scheme` is explicitly absent** — the doc calls this out as a
product rule, not an implementation detail ("a committee member who picked Light in the morning
gets handed Dark at sunset... which is exactly what the rule forbids"), so there is no media query
anywhere in `globals.css`, deliberately.

**`src/components/theme-switcher.tsx`** — three `lucide-react` icons (Sun/Contrast/Moon) in a
`role="radiogroup"`, wired into `AdminNav` and the portal page header (both rebuilt as dark chrome
bars per §3.2b, previously a plain text nav with no background at all). On click: applies
`data-theme` to `<html>` immediately (no wait for the round trip), calls the new `setThemePreference`
Server Action (`src/app/theme-actions.ts`, writes to whichever table minted the session — the same
`AdminUser`/`Profile` split every other action in this codebase respects), then `router.refresh()`
to re-sync the SSR-resolved value from the DB.

**One real bug found by the user's own screenshot, not by this session's own (headless, so
visually blind) Playwright checks**: `AdminNav` and the portal header hardcoded
`<BrandMark variant="dark">`, correct for Slate/Dark (dark chrome, needs light wordmark text) but
silently wrong for Light — Light's chrome is white, so the light-text wordmark variant rendered as
barely-visible light-gray-on-white, exactly what the user's screenshot showed. All of this session's
own automated checks passed regardless, because they asserted `data-theme` attributes and computed
background colors, never wordmark legibility. Fixed by deriving the variant from the actual resolved
theme (`variant={theme === "light" ? "light" : "dark"}`) instead of hardcoding it, in both places.
**Worth remembering**: an automated check that the right CSS variable is set is not the same claim
as "this is legible" — the two only diverged here because a two-asset variant swap (wordmark
light/dark SVGs) was a manual `variant="dark"` prop, not itself driven by the same theme state the
rest of the component already read correctly.

**Retrofit scope**: every page built so far (`login`, `admin` Portfolio/Societies/Users, `portal`)
had its hardcoded Tailwind grays/emeralds/reds replaced with the token set — confirmed by grepping
the whole `src/app`/`src/components` tree for `text-black`/`bg-white`/`emerald-`/`red-`/`amber-`
afterward and finding zero matches. A `.btn-primary` utility class was added to `globals.css` for
the handful of primary-action buttons, since inline `style` props can't express `:hover` — everything
else uses Tailwind's arbitrary-value syntax (`bg-[var(--surface)]`) directly, which does support
`hover:`/`focus:` variants natively.

**Verified end to end via a browser** (Playwright/system Chrome): defaults to Slate on first visit
for a never-chosen account; clicking Dark applies `data-theme` instantly and the computed body
background actually changes color (not just the attribute); Light/Dark both persist across a reload
(server-rendered, confirmed no flash by checking the attribute is present in the initial HTML, not
patched in after hydration); the theme carries across navigation to a different admin route;
choosing Slate explicitly renders identically to never having chosen (no attribute either way); a
second, independent portal account defaults to Slate on its own first visit and can choose Dark
without affecting the admin account's separately-stored Slate choice — the account-not-browser
requirement, actually exercised across two real accounts, not just asserted. Zero console errors,
zero page errors. `tsc`/`lint`/`build`/`vitest` all clean; the route table shows every page as `ƒ`
(dynamic) now except `/icon.svg`, since the root layout's `resolveTheme()` call forces the whole
tree dynamic — a stricter default than the per-page `auth()` calls alone provided, and a nice side
effect for the exact class of static-rendering bug found and fixed earlier this session.

## Mobile responsive fix, two rounds (2026-08-14) — user-caught, twice, in the same session

**Round 1: real overflow bug, `flex-wrap` fix.** The user sent 3 mobile-viewport screenshots
("In mobile its looking like this.") showing `AdminNav` and several list-row layouts clipping
content on narrow viewports — the theme switcher pushed off-screen entirely, nav links and row
content cut off. Root cause: every `flex items-center justify-between` header/row layout added
during the theme-system and FEAT-085/086 work had no `flex-wrap`, so content overflowed the
viewport instead of reflowing. Fixed across all 6 affected files (`admin-nav.tsx`,
`admin/users/admin-row.tsx`, `admin/page.tsx`, `admin/societies/page.tsx`,
`admin/societies/[id]/page.tsx`, `portal/page.tsx`) by adding `flex-wrap` +
`gap-x-*`/`gap-y-*` (replacing single `gap-*`) so items reflow onto new lines instead of
clipping. `tsc`/`lint`/`build`/`vitest` clean; Playwright-verified at 390px (iPhone-width)
viewport across `/admin`, `/admin/societies`, `/admin/societies/[id]`, `/admin/users` — zero
horizontal overflow, zero page errors, no desktop regression at 1280px.

**Round 2: the fix itself was a real regression, caught immediately by the user, not by any
automated check.** Screenshotting the "fixed" `/admin/users` page and sending it back, the user
correctly identified that `flex-wrap` alone was the wrong fix — it stopped clipping but grew
`AdminNav` into 2–3 stacked rows on mobile (brand mark, then nav links, then the theme switcher,
each wrapping separately), which (a) doesn't match the design system's actual intent
(`05a-theme-system.md` §3.7 lists "sidebar nav with counts" as the real target component —
`AdminNav`'s own comment already documented it as "minimal, not the full shell," a placeholder
top bar, not the designed nav) and (b) pushed page content — specifically the "New admin" form on
`/admin/users` — below the fold, requiring a scroll that wasn't there on desktop. A wrap-based fix
that avoids clipping but silently regresses on vertical space is a real defect, not just an
aesthetic complaint — this is exactly the kind of gap only a real screenshot catches, since my own
automated checks only asserted "no horizontal overflow," never total header height or scroll
position. **Fixed by replacing wrap with a proper mobile collapse**, following the archived app's
already-proven pattern (`archive/src/components/shell/Sidebar.tsx` — a compact bar with a
"Menu"/"Close" toggle below `md`, an off-canvas panel above it) rather than reinventing one.
`admin-nav.tsx` split into a thin server shell (`resolveTheme()` lookup only) and a new client
component, `admin-nav-client.tsx` (nav links + `ThemeSwitcher`, `useState`-driven open/closed):
below `sm`, the header collapses to brand mark + a "Menu" toggle in one compact row, with links and
the switcher hidden behind it until tapped, appearing as a dropdown panel below the bar rather than
pushing it; at `sm` and above, everything renders inline as before, matching desktop exactly. The
simpler 2-item `portal/page.tsx` header (brand mark + switcher only, no nav links) was left on the
Round-1 `flex-wrap` fix — verified it never actually wraps at 390px since two items comfortably fit
one row, so the collapse treatment wasn't needed there.

**Re-verified end to end** (Playwright/system Chrome, 390px viewport): `/admin` and `/admin/users`
both render as a single compact header row by default; tapping "Menu" reveals nav links + theme
switcher in a dropdown, tapping again (or a link) closes it; the "New admin" form on `/admin/users`
is now fully visible with zero scrolling; `/admin/societies/[id]` and `/portal` (logged in as a
real seeded portal account, `bearer@settlement-nexus.test`) both render correctly at the same
width. Zero console errors, zero page errors, across every page checked. `tsc`/`lint`/`build`/
`vitest` all clean; route table unchanged (`AdminNav`'s client-component split doesn't affect which
routes render statically vs dynamically — that's still governed by each page's own `auth()`/
`resolveTheme()` calls). **Worth remembering**: a fix that resolves the literal bug report
(clipping) can still be visually and functionally wrong in a way no automated assertion catches —
the user's second screenshot round was the only thing that caught the pushed-down-form regression,
consistent with the pattern already recorded above for the hardcoded-`BrandMark`-variant bug this
same session.

**A third, smaller user-caught bug in the same round**: a screenshot flagged "uneven width of
cards" on `/admin/users` — `new-admin-form.tsx` carried its own `max-w-md`, nested inside the
page's already-constraining `max-w-xl` wrapper, while its sibling admin-list `<ul>` had no width
cap of its own and filled the full `max-w-xl` — the two cards rendered at visibly different widths.
Fixed by dropping the form's redundant `max-w-md` (`d2c711a`); both other form/card pairs in the
app (`societies/new`'s standalone form, and the society-detail page's list+form sharing one
container) were checked and don't have the same double-constraint. Verified both locally and on
stage: both cards measure identically (310px at 390px viewport, 576px at 1280px).

## Missing sign-out control (2026-08-14) — user-caught, a real rebuild gap

**There was no way to sign out anywhere in the product.** `src/lib/auth.ts` has exported NextAuth's
`signOut` since MS-01, but nothing ever called it — no button, no menu item, on either `AdminNav` or
the portal header. The design docs do specify sign-out behavior (`05-field.md`'s "Sign out" row:
refused while unsynced work exists, purges cached data), and the archived pre-blueprint app had a
working "Sign out" button (`archive/src/components/shell/Sidebar.tsx`) — this was a real gap
introduced by the greenfield rebuild never carrying that control forward into the new chrome, not a
missing design decision or an intentional scope cut.

Fixed with `src/app/logout-actions.ts` (`logoutAction`, a Server Action calling `signOut({
redirectTo: "/login" })`, mirroring `login/actions.ts`'s own Server-Action pattern) and a shared
`src/components/sign-out-button.tsx` (a plain `<form action={logoutAction}>`), wired into both
`admin-nav-client.tsx` (desktop inline row and the mobile collapsed-menu panel) and `portal/page.tsx`'s
header. **Field-specific sign-out rules from `05-field.md`** (refuse while unsynced work exists,
purge local cache) are SUR-02's own concern, not SUR-01/portal's — out of scope here since the field
surface itself isn't built yet.

**Verified end to end via Playwright** (6/6 checks): admin desktop and mobile (behind the "Menu"
toggle), and portal, all correctly end the session — confirmed not just by landing on `/login`, but
by re-requesting the now-signed-out route (`/admin`, `/portal`) and getting redirected back to
`/login`, proving the session was actually destroyed server-side, not just the tab navigated away.
`tsc`/`lint`/`build`/`vitest` all clean, route table unchanged.

## MS-03 done (2026-08-14) — lead to confirmed survey, the deal's first real vertical slice

**All 4 features built** (`docs/backlog.yaml` MS-03 status flipped to `done`): FEAT-001 (log a new
lead), FEAT-002 (demo proposal, 3-outcome decision), FEAT-006 (whole-society lighting inventory by
area), FEAT-007 (demo-circuit selection & CON-16 eligibility checklist). New `AdminPermission`
values `manage_pipeline` (CAP-15, PER-07 sales) and `manage_survey` (CAP-16, PER-04 field survey)
gate this area, kept as two separate permissions rather than one broader flag — a real deployment
has different staff for sales vs. field work, and PER-01 (ops) is expected to hold both, which
becomes the technical proxy for "PER-01 specifically" wherever an AC calls for it (see below).

**New schema, MS-03 scope only** (`09-architecture.md` §5.2's "representative, not exhaustive"
convention, same as MS-01's Circuit/CircuitState): `Pipeline` (one per `(societyId, serviceLine)` —
CON-24's `@@unique` is the structural guarantee, not just an app check), `SiteSurvey` (one per
Pipeline, the umbrella FEAT-006/007 data attaches to — CAP-16's full scope, governance profile,
pump-room audit, logbook, is explicitly not built here), `LightingInventoryArea`. `Circuit` gained
`siteSurveyId` and the light-count-exception fields.

**The "PER-01 specifically" technical-proxy decision** (Research Gate item — several ACs,
FEAT-007-AC-4 among them, require an actor distinct from both PER-04 and PER-07, and the permission
model has no third marker for it): resolved by requiring the actor to hold **both** `manage_survey`
and `manage_pipeline`, on the reasoning that a real PER-01 account holds every back-office
permission. Applied consistently at every point this gap recurs across this batch (FEAT-007's
light-count exception approval, FEAT-011's load-validation override, every gate-pass approval) —
recorded here once rather than re-derived at each site.

**FEAT-039/040 followed in dependency order, closing a gap FEAT-085's own comment had flagged**:
`Engagement` (one row per `(societyId, serviceLine)`, `EngagementStatus active | inactive`) is the
entity the MS-02 session's `societies/actions.ts` comment was explicitly waiting on
(FEAT-085-AC-5's per-service-line independent state) — `enrollServiceLine()` and a "Service lines"
panel on the society detail page are the first things to use it. FEAT-040 added `Circuit.location`
and `workingHoursEffectiveAt` (a working-hours edit is metadata only, per CON-10 — recorded with an
effective date, never triggers a rescale on its own) plus a dedicated
`/admin/societies/[id]/circuits` registry screen, editing gated to the PER-01 proxy above
(FEAT-040-AC-4: PER-04 reads, doesn't edit).

## MS-04 (partial, 2026-08-14) — circuit commissioning: meter install through benchmark, FEAT-041 still open

**6 of MS-04's 7 features built; `docs/backlog.yaml` MS-04 status deliberately left `proposed`, not
flipped to `done`** — same "don't overstate an incomplete milestone" discipline as MS-02's own
partial entry above. FEAT-041 (light-count-triggered baseline rescale, INV-07) depends on FEAT-014
and wasn't attempted this batch; all three of MS-04's own exit criteria (circuit registry with a
load-validated meter; a gate pass resolving via explicit approval or the 30-minute provisional
timeout with the job runner live; baseline/post-install windows completing to a benchmark inside
CON-20's 60-80% band) are met by the 6 built features, but the milestone's `features:` list isn't
fully done, so the status field says so honestly.

**New infrastructure: ADR-003's Postgres-backed job queue, the first piece of infrastructure this
build has needed with no precedent** (per `09-architecture.md`'s own risk register, RISK-04). A
`Job` table (`type`, `runAt`, `status`, `attempts`, `payload`) plus `scripts/job-worker.ts`, a
standalone long-polling process (`pnpm worker`, 15s poll interval) — not a request-handler-driven
mechanism, since these jobs are time-driven. The one job type implemented, `gatepass_sweep`
(ADR-006), flips any `submitted` `GatePass` older than 30 minutes to `provisional` and
**self-reschedules** on every run (a recurring job re-inserting its own next `Job` row, since this
queue has no separate cron primitive) — chosen over a fixed interval loop inside the worker itself
so the schedule stays inspectable/adjustable via the same `Job` table every other job type will use.
**Genuinely runtime-verified, not just code-reviewed**: ran `pnpm worker` against the real local
Postgres, confirmed via direct `psql` query that it seeded its first sweep job, processed it
(`status: done`), and re-queued the next one — the exact self-perpetuating behavior the design
depends on, not assumed from reading the code.

**`GatePass` (CON-18)**: `kind` is a real enum (`demo_install`, `demo_install_completion`) rather
than a free string even with two values today — FEAT-011's install pass and FEAT-013's completion
pass are two instances of the same cross-cutting component (`09-architecture.md` §5), sharing one
`submitGatePass`/`approveGatePass`/`rejectGatePass` action set parameterized by `kind`, each gated
to the circuit state it belongs after. Approval is gated to the PER-01 proxy (both permissions);
submission (PER-04, `manage_survey` alone) is what actually unblocks the next step per ADR-006 —
**backend approval is never the blocking event**, matching the architecture doc's own reasoning for
why the provisional-release sweep exists at all. **Deliberate, documented gap**: gate-pass photo
capture is a plain URL field, not a wired upload widget — this greenfield `src/` has no
file-storage infrastructure at all yet (the archived app's S3 presigned-PUT pipeline, see
Architecture Decisions below, was never ported), so there was nothing to reuse. Same class of
honestly-left-open gap as the 5 still-unbuilt document upload types noted further down this file;
a real upload widget is follow-up work, not silently stubbed as done.

**FEAT-011 load validation (CON-17)**: `submitLoadValidation` computes the discrepancy between the
meter's displayed load and (light count × wattage) and only writes `state: meter_installed` inside
±10% — outside it, the delta and inputs are still persisted (so a subsequent override has something
real to record against) but the state doesn't advance, and the exact percentage is returned to the
UI (FEAT-011-AC-3's "exact delta shown," not a generic failure). `overrideLoadValidation` is the
PER-01-proxy path (FEAT-011-AC-5): it writes `loadValidationOverrideById`/`Reason` alongside the
state transition, so an overridden circuit is visibly distinguishable from one that passed normally
going forward, not silently indistinguishable.

**FEAT-012/014's monitoring windows are one shared mechanism** (`src/lib/monitoring-window.ts` +
`monitoring-actions.ts`), not two parallel implementations — FEAT-014's own spec says it "mirrors
FEAT-012's mechanism" exactly, so duplicating it would have been the wrong call. **Deliberately
smaller than MS-07's future full CSV/vendor-API reading ingest**: PER-04 records one reading per
calendar day directly against the circuit being commissioned (`CommissioningReading`, distinct from
whatever `MeterReading` MS-07 eventually builds for production billing ingest) — a real, separate,
intentionally minimal mechanism scoped to commissioning, not a stand-in for the eventual pipeline.
**A missing day is deliberately not a third status value** — it's the absence of a row for that
date, distinguished from an actively-flagged `anomaly` row by presence rather than an enum value
(FEAT-012-AC-5), and naturally doesn't force a window restart on its own (only an anomaly does, and
only once PER-04 explicitly records a fix — FEAT-012-AC-3's "resets... starting the next midnight"
is implemented literally: the fix action computes tomorrow's midnight and moves
`Circuit.pre/postInstallWindowStartAt` forward to it, so evaluation is always just "valid readings
on/after `windowStartAt`," with no separate counter to keep in sync). The window-start dates
themselves are set at the moments CON-19/CON-10 say the pivot day should be excluded: pre-install
starts the day after `meterInstalledAt` (set inside FEAT-011's own actions, not a separate step);
post-install starts the day after `lightReplacementDate` (FEAT-013-AC-5 — only the *last* light's
replacement day is the excluded pivot, satisfied for free since only one date is ever recorded).
Completion computes the average of the chronologically first 5 valid readings and, for the
post-install window, the CON-10 savings percentage against the stored `preInstallBaseline` — inside
CON-20's 60-80% band, `benchmarkSavingsPct` is written and the circuit reaches `benchmark_confirmed`
(FEAT-014-AC-1); outside it, the circuit moves to `benchmark_review` and no benchmark is written,
routing to FEAT-015 (not built) rather than being silently accepted (FEAT-014-AC-5). **FEAT-014-AC-4's
"benchmark-writing is a system computation, not a manual entry"** is satisfied structurally, not by
a runtime check — there is deliberately no action anywhere in this codebase that accepts
`benchmarkSavingsPct` as user input.

**FEAT-013** ties the two windows together: `recordLightReplacement` refuses to run
(FEAT-013-AC-3's departure-gating rule) unless a `demo_install_completion` gate pass has already
been *submitted* for the circuit — submission, not approval, is the gate, consistent with
ADR-006's reasoning throughout this milestone.

**Six new `CircuitState` values added** to the MS-01-era provisional enum (`meter_installed`,
`pre_install_monitoring`, `post_install_pending`, `post_install_monitoring`, `benchmark_review`,
plus renaming the placeholder `benchmarking` out entirely in favor of the two `*_monitoring` states
that actually distinguish pre- from post-install) — safe as a destructive enum migration only
because zero `Circuit` rows existed yet in any environment this touches; would need a real data
migration path if attempted after commissioning data exists.

**Validated this batch**: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, and `pnpm test`
(existing 8 Vitest cases, unaffected) all clean after every migration in this batch. **Not yet
browser-verified** — this batch was built back-to-back per the user's explicit instruction ("complete
next 10 in a row, after that we will test everything thoroughly"), deferring the interactive
end-to-end pass (the pattern every prior milestone in this file used) to a dedicated follow-up
session rather than interleaving it here. The job-worker's self-scheduling behavior is the one piece
independently confirmed live against Postgres (see above); the full commissioning flow (eligible →
meter-installed → gate pass → pre-install window → light replacement → completion gate pass →
post-install window → benchmark) has not been driven end to end yet and is the natural starting
point for that follow-up pass.

## Commissioning monitoring: sheet upload, a status dashboard, and the deferred E2E pass finally run (2026-08-14)

**The user asked directly for three things, all scoped to the commissioning flow just built**: finish
the demo-installation monitoring flow, a daily status view of each meter's variation against its
benchmark, and a sheet upload for manual readings. Asked one clarifying question before building —
whether "sheet upload" meant extending the commissioning-scoped mechanism just built or pulling
FEAT-043/MS-07's full CSV+Gemini production ingest pipeline forward out of milestone order (it
depends on MS-05/MS-06, neither built) — user confirmed **commissioning-scoped**, so this stayed
additive to FEAT-012/014 rather than a new milestone jump.

**Sheet upload**: `src/lib/monitoring-window.ts`'s `parseCommissioningCsv()` — a deliberately simple
comma-separated parser (no quoted-field support; the only content is a date and a number), sorted
chronologically regardless of file order since the row-level rules below are order-sensitive.
`uploadCommissioningReadingsCsv()` (`monitoring-actions.ts`) applies each row through the exact same
per-day rules a manual entry uses — refactored into a shared `applyCommissioningReading()` helper so
the two entry points (one form field vs. a whole sheet) can't drift apart. **Stops at the first
failing row rather than skipping past it** (an open anomaly gate, a window already complete, a bad
value) and reports how many rows actually landed — a partial, honestly-reported result beats
silently reordering or dropping rows PER-04 would then have to reconcile by hand. Explicitly **not**
FEAT-043's CON-30 pipeline: no raw-file retention, no Gemini normalization — a plain client-side
`file.text()` read, sent straight to the server action, since there's no file-storage
infrastructure in this `src/` at all yet (see MS-04's own gate-pass-photo gap above, same class of
honestly-scoped-down decision).

**Daily status dashboard** (`/admin/monitoring`, nav-gated to `manage_survey`): every circuit
currently mid-window, across every society, in one place — the bird's-eye view drilling into one
circuit at a time never gave. Two new pure helpers in `monitoring-window.ts` compute a live,
dashboard-only signal that's never written to the DB: `latestVarianceFromAveragePct()` (pre-install
— how far today's reading sits from the running average, a stability check before there's a
benchmark to compare against) and, combined with `averageOfValid()`, a **projected savings
percentage** for post-install windows (today's average vs. the stored `preInstallBaseline`) — so ops
can watch the number trend toward or away from CON-20's 60-80% band before the 5th day actually
lands, not just find out on completion day. A third "Recently resolved" section lists
`benchmark_confirmed`/`benchmark_review` circuits with their final percentage, for a complete
picture in one screen.

**The deferred end-to-end pass finally ran, and found one real bug** (Playwright/system Chrome, the
established pattern this repo has used since the archived app): the long-running local dev server
process had a **stale generated Prisma Client** — it predated the last few schema migrations in this
session's own MS-04 batch, so every `db.circuit.findMany`/`findUnique` call including relations added
this session (`gatePasses`, `commissioningReadings`) threw `PrismaClientValidationError: Unknown
field`. `pnpm prisma generate` alone doesn't help a process that's already loaded the old client into
memory — the dev server itself has to restart. **Worth remembering**: after any `prisma migrate dev`
that changes the schema mid-session, restart whatever `next dev` process is actually serving
requests, don't just re-run `generate` and assume a long-lived process picks it up. Once restarted,
the full flow was walked for real, not assumed: a lead's site survey → lighting inventory → circuit
candidate (eligible, 60 lights) → load validation (1100W meter reading against a 1080W theoretical
load, 1.85% — within CON-17's ±10%) → install gate pass submitted → pre-install window backdated via
`psql` to simulate elapsed days (Playwright can't fast-forward real calendar time) → **2 valid days,
1 anomaly flagged, the fix-and-restart action correctly zeroed the count and excluded the pre-anomaly
readings** → the remaining 5 valid days supplied via a real CSV upload through the browser's file
input → window completed with `preInstallBaseline = 1078` (exact average, confirmed via direct
`psql` query, not just UI text) → completion gate pass → light replacement recorded (the departure
gate genuinely blocks this step without a submitted completion gate pass — confirmed by the section
only appearing once the gate pass existed) → post-install window (5 valid days via the manual
single-day form, exercising the other entry path) → **`benchmarkSavingsPct = 70.32%` computed and
confirmed inside CON-20's band**, matching the hand-calculated value exactly. A second circuit was
walked partway (2 pre-install days, one deliberately left mid-window) specifically to verify the
dashboard's **active-window** rows, not just its empty and resolved states — confirmed showing "Day 2
of 5" and the correct `+3.1%` live variance figure. Zero console errors, zero page errors, across
every step. All Playwright-created circuits/readings/gate passes and the one lighting-inventory-area
were deleted via `psql` afterward — the pipeline/society/survey they were built against pre-existed
this session's testing and was left alone, same "don't touch what you didn't create" discipline as
every prior verification pass in this file.

**`docs/backlog.yaml` unchanged this round** — this was additive UI/UX on top of already-built
FEAT-012/014, not a new tracked feature or milestone shift.

## Deployed to `stage.firsthing.earth` (2026-08-14) — MS-03, MS-04 (partial), commissioning monitoring, and ADR-003's worker live for the first time

**What went out**: everything built this session — MS-03 (lead-to-survey), MS-04's partial slice
(circuit registry through benchmark confirmation, FEAT-041 still open), and the commissioning
monitoring follow-on (CSV sheet upload, the `/admin/monitoring` dashboard). Same rsync-based deploy
convention as every prior deploy in this file (origin is a public third-party repo — nothing gets
pushed there; code reaches `zenovaa` via `rsync -az --delete`, excluding `.git`/`node_modules`/
`.next`/`.env*`/`archive`). All 6 pending migrations
(`20260814072148_add_pipeline_survey` through `20260814074730_add_commissioning_monitoring_windows`)
applied cleanly against `firsthing_blueprint` via `prisma migrate deploy` — the same database MS-01
created, still correctly separate from the old archived app's `firsthing_prod` on the same box.
`pnpm install --frozen-lockfile` reported "Already up to date" (no new dependencies this session).
`pnpm build` succeeded, all 13 routes built including the new `/admin/monitoring`. No `.env.local`
changes needed — `AUTH_URL`/`AUTH_TRUST_HOST` were already set correctly from the MS-01 deploy.

**ADR-003's background job runner is now live infrastructure, not just local-verified code** —
started as its own pm2 process, `firsthing-job-worker` (`pm2 start "pnpm worker" --name
firsthing-job-worker --cwd /zenovaa/code/firsthing-dashboard`, saved via `pm2 save` alongside the
existing `firsthing-dashboard` process). Confirmed genuinely running, not just started: its own
stdout log showed `job.worker_started` then `job.gatepass_sweep_seeded` within half a second of
boot, and a direct `psql` query against `firsthing_blueprint` moments later showed the seeded
`gatepass_sweep` job already flipped to `status: done` with a fresh `pending` one rescheduled 5
minutes out — the same self-rescheduling behavior already verified locally, now proven against the
real staging database and a real pm2-managed process, not a dev-only script run.

**Verified end to end, logged in over the public HTTPS path** (Playwright/system Chrome against
`https://stage.firsthing.earth`, not a bypassing curl): `yogesh@firsthing.earth` login succeeds,
redirects to `/admin`, and `/admin`, `/admin/pipeline`, `/admin/monitoring`, `/admin/societies` all
return 200 with zero console errors and zero page errors. `pm2 logs firsthing-dashboard` reviewed
specifically for lines *after* this restart (not the pre-existing, already-documented
`[ELIFECYCLE] Command failed` artifact from earlier restarts on this box, harmless and
self-stabilizing per the 2026-08-06 deploy entry above) — clean, only expected `info`-level
auth/theme/pipeline events, no errors or stack traces. `pm2 describe firsthing-dashboard` confirmed
`status: online`, `unstable restarts: 0`.

**`docs/backlog.yaml`/`MEMORY.md` unchanged this round** — this was a deploy of already-recorded
work (MS-03 done, MS-04 still `proposed` pending FEAT-041), not a new decision or milestone shift.

## Missing lead-approval action (2026-08-14) — user-caught on stage, FEAT-001-AC-2 half-built

**A real gap, found by the user testing the live deployment, not by any prior verification pass**:
FEAT-001-AC-2 (a lead logged by PER-01 on PER-07's behalf goes into a `pending-approval` sub-state
and PER-07 is notified) was only ever half-implemented — `Pipeline.authoritative: false` and the
`pipeline.pending_approval_notify` log line both existed, and both the pipeline list and detail
pages correctly *showed* the "Pending approval" banner, but nothing anywhere let the actual sales
owner (PER-07) act on it. A lead logged on someone's behalf was stuck not-authoritative forever —
exactly the state the user hit: a lead they'd had logged for them, now sitting at `survey_pending`
with no way to clear the pending-approval flag. This was a real, silent gap in FEAT-001, not a
misunderstanding of intended scope — MS-03's own "done" status was premature on this one AC.

**Fixed**: `approveLead(pipelineId)` (`src/app/admin/pipeline/actions.ts`) — deliberately gated to
`session.user.id === pipeline.salesOwnerId`, not `manage_pipeline` in general, since this is PER-07's
own approval to give, not a broader permission check (every possible `salesOwnerId` already holds
`manage_pipeline` by construction, since `new-lead-form.tsx`'s owner picker only ever lists such
accounts). `ApproveLeadButton` (`src/app/admin/pipeline/[id]/approve-lead-button.tsx`) follows the
established `useTransition` + plain `onClick` pattern from `exception-approval-button.tsx`, not the
`useActionState`-in-`onClick` anti-pattern already documented as a bug class earlier in this file —
rendered inside the existing pending-approval banner on `/admin/pipeline/[id]`, visible only to the
signed-in sales owner viewing their own pending lead.

**Verified directly against the live stage deployment** (rsync + `pnpm build` + `pm2 restart`, no
schema change needed) — the exact pipeline the user was looking at
(`cmssu1xww0001n4qsrzg69vjt`, logged by `admin@firsthing.earth` for `yogesh@firsthing.earth`,
already at `survey_pending`) was used as the live test case: logged in as the sales owner, banner
and approve control both present, clicked approve, banner cleared with zero console/page errors,
and a direct `psql` check against `firsthing_blueprint` confirmed `authoritative` flipped to `true`.
`tsc`/`lint` clean.

## Design-system build-out + flow-review pass (2026-08-14) — user-caught: "the screens look very childish"

**The user asked for a full review — flow issues and visual quality alike — after testing the live
stage deployment.** Both halves were real. The visual half traces to a specific, documented shortcut:
the theme system was wired in as *palette tokens only*, with `globals.css` itself stating that the
type scale, space steps, elevation, density modifier and the whole §3.7 component library were
"deliberately not yet adopted." Every screen since MS-02 was then built out of raw Tailwind
utilities against that half-adopted system — which is exactly how it ends up reading as unstyled.
This pass closes that gap rather than restyling screen by screen.

**What was actually wrong, visually** — not opinion, mechanically checkable:
- **`.btn-primary` had no padding of its own.** Every button that didn't happen to also carry
  `px-4 py-2` utilities rendered with its label flush against the button's own background. This
  affected ~10 buttons across the circuit/monitoring/society screens — the exact screens the user
  was looking at.
- **No elevation anywhere.** `05a-theme-system.md` §3.4 defines `--e1`/`--e2` and DIR-02 ("Console")
  is explicitly elevation-led; nothing in `src/` had a `box-shadow`. Flat bordered rectangles on a
  flat ground is the single biggest reason the screens read as unfinished.
- **No focus-visible treatment**, no `accent-color` (so every checkbox rendered browser-default
  blue against a green system), no tabular figures for the numeric columns the whole product is
  about, and inputs styled ad hoc — 14 files carried their own copy-pasted
  `style={{borderColor: "var(--field-border)", background: …, color: …}}` object.
- **Placeholder-as-label throughout.** `new-society-form`, `portal-account-form`, the survey forms
  and others used bare placeholders, which vanish the moment a field has a value — a real
  accessibility problem, and one this repo had already fixed once in the archived app.
- **`AdminNav` was a self-described placeholder** ("minimal, not the full shell") — a text top bar,
  where §3.7's actual target component is a sidebar nav.

**What was built**: a real component layer, not per-screen patches. `globals.css` now carries the
full DIR-02 token set (content + chrome for all three themes, radius, elevation, plus `.card`,
`.field`, four button variants, `.chip`, `.tbl`, `.lbl`, `.num`, a global `:focus-visible` ring and
`accent-color`). `src/components/ui.tsx` adds the presentational primitives (`Card`, `CardTitle`,
`PageHeader`, `EmptyState`, `Field`, `ErrorText`, `StatusChip`, `KpiTile`) — deliberately hook-free
so Server and Client Components share them. `src/lib/status-maps.ts` centralises every status →
label + chip-tone pairing. `src/components/app-shell.tsx` + a new `src/app/admin/layout.tsx` replace
the per-page `<AdminNav />` with one sidebar shell (`admin-nav.tsx`/`admin-nav-client.tsx` deleted).
**Every admin/portal/login screen was then swept onto that layer** — the 14 duplicated inline field
styles are gone, tables replaced the flex-row lists on list surfaces, and `/admin` (still MS-01's
"Societies in Postgres: 1" walking-skeleton stub) was rebuilt as a real Portfolio overview: 4 KPI
tiles, recent leads, and a "needs a decision" queue, all real queries with no fabricated figures.

**Four real functional bugs found by reading the flow against `docs/backlog.yaml`, not by
looking at the UI:**
1. **The pending-approval sub-state was purely cosmetic (FEAT-001-AC-2).** `submitProposal` never
   checked `authoritative`, so a lead logged on someone's behalf advanced straight through the
   proposal to `survey_pending` while still awaiting its owner's approval — which is exactly the
   state the user's own stage lead was sitting in. The approve action added earlier this session
   gave PER-07 a way to *clear* the flag; it never made the flag *mean* anything. Now the proposal
   is refused with a named owner until approved, and the proposal form isn't rendered at all.
2. **The lead flow's quick-create had no duplicate-society check.** `/admin/societies/new` has had
   FEAT-085-AC-3's check since MS-02, but `createLead`'s own inline society creation didn't — so the
   lead path could silently create a second society with the same name and location. **This had
   already happened in real data**: two separate "Mahagun Puram / Noida" rows, visible in the
   societies list. Now the same flag-and-confirm flow as the other path.
3. **`Engagement` was never created by the lead flow (FEAT-039-AC-1).** MS-03 built the entity and
   a manual "Enroll service line" control, but logging a lead — which *is* the act of engaging a
   society on a service line — never created one, so the society-detail service-lines panel stayed
   empty for every society that arrived through the pipeline. Now auto-enrolled, logged as
   `society.service_line_enrolled` with `via: "lead"`.
4. **A decided-proposal record vanished from the UI.** The outcome, summary and closed-lost reason
   were written to the DB and then never rendered anywhere once the stage moved on. Now shown as its
   own card. Also fixed: `proposalDecidedAt` was being stamped for the "undecided" outcome, claiming
   a decision that hadn't happened, and `createLead` accepted any string as a service line and any
   unparseable string as a meeting date.

**One real CSS bug found only by screenshotting** (the class the design skill warns about, and the
same class as this file's earlier hardcoded-`BrandMark`-variant finding): the society-detail status
`<select>` rendered full-bleed across the page header. Cause is a cascade-layer collision —
Tailwind v4 puts utilities in a `@layer`, so an unlayered `.field { width: 100% }` beats
`w-auto` regardless of class order. Fixed with an explicit `.field-auto` opt-out declared after
`.field`, not by reordering classes (which would not have worked).

**Verified end to end in a browser** (Playwright/system Chrome — 24 checks across four scripts, all
passing, zero page errors, zero console errors): the full deal spine walked live — duplicate-society
refusal on the lead path *and* the create-anyway confirm, a genuinely new lead creating its
engagement, proposal → `survey_pending`, lighting inventory, a CON-16 candidate reaching `eligible`,
load validation at 1100W against a 1080W theoretical load (1.85%, inside CON-17) advancing to
`meter_installed` and opening the pre-install window; plus all three themes actually repainting
(asserted on computed `background-color`, not just the `data-theme` attribute), zero horizontal
overflow at 390px on every screen including the two deep ones, the users page's save button
correctly disabled until something changes, and the portal still rendering its office-bearer
transfer control. `tsc`/`lint`/`build`/`vitest` (8 cases) all clean. All test data created during
verification (the "Vista Greens" society and its pipeline/survey/circuit/engagement/area rows) was
deleted via `psql` afterward.

**Two test-harness findings worth keeping** — both cost real debugging time here:
`page.click('button[type="submit"]')` now matches the shell's **Sign out** button, since the sidebar
renders before `<main>` in the DOM — a submit-selector that worked for two milestones silently
started logging the test out mid-flow (confirmed from the dev server's own log showing
`logoutAction()` firing on a `POST /admin/pipeline/new`). Use `getByRole("button", { name })`.
Separately, `.lbl` applies `text-transform: uppercase`, and `innerText` returns the *rendered* text
— so an assertion matching a `CardTitle`'s source casing now fails; match case-insensitively.

**Deployed to `stage.firsthing.earth`** — rsync + `pnpm build` + `pm2 restart` (no schema change, so
no migration). Re-verified over the public HTTPS path logged in as a real account: all 5 admin routes
200, the sidebar shell live, zero console/page errors, `status: online` with 0 unstable restarts, and
the `firsthing-job-worker` process still online and untouched.

## MS-04 done (2026-08-14) — FEAT-041's benchmark rescale, and an INV-07 hole FEAT-040 had left open

**`docs/backlog.yaml` MS-04 status flipped from `proposed` to `done`.** The earlier partial entry
above deliberately left it `proposed` because FEAT-041 (light-count change & benchmark rescale) was
the one unbuilt feature of the seven, even though all three of the milestone's own exit criteria
were already met. It's now built, unit-tested, browser-verified, and the milestone is honestly
complete.

**The design decision that makes INV-07 true by construction, not by discipline**: a rescale writes
a new `BenchmarkRescaleEvent` row and **never touches `Circuit.preInstallBaseline`**. The
commissioned baseline stays as commissioned forever; the baseline actually in force on any given
date is *replayed* from the event log (`effectiveBaselineAt()`), exactly ADR-005's
versioned-not-mutated rule. This is what makes FEAT-041-AC-2 ("a circuit that has never had a count
change compares against its original baseline") and AC-5 ("forward-only — an already-invoiced month
is never restated") true for free rather than as separate code paths that could drift. It also
means INV-07's own requirement — that a rescale is a *distinct, timestamped event*, never conflated
with INV-03's judgment-call billing adjustment — is a property of the schema, not of remembering to
log something: `benchmark_rescale_events` carries the old and new counts, both baselines, the
verification note/photo, the effective date, and who recorded it, and there is no other write path
to a rescaled baseline anywhere in the codebase.

**All the arithmetic and every refusal rule live in one pure module**, `src/lib/benchmark-rescale.ts`
(`rescaleBaseline`, `refuseRescale`, `REFUSAL_MESSAGE`, `effectiveBaselineAt`,
`effectiveLightCountAt`) — the same "factor the real decision into a pure function, make the Server
Action a thin shell" convention established at MS-02 for `portal-authority.ts`, and the reason
`12-test-plan.md`'s `unit` level assignment for AC-1/AC-5 is actually satisfiable. **18 new Vitest
cases** (`tests/benchmark-rescale.test.ts`, suite now 26 across 2 files) including CON-10's worked
example asserted exactly (`100 ÷ 50 × 54 = 108`), a deliberate no-rounding assertion
(`1078 ÷ 60 × 64 = 1149.8666…` to 10 places — rounding here would push error straight into a rupee
figure the society is billed on, INV-02), an inclusive effective-date boundary, a rescale backdated
into an already-invoiced month leaving that month's figure alone, and a multi-event replay ordered
by effective date rather than insertion order.

**A real INV-07 hole in already-shipped code, found by building FEAT-041 rather than by testing
it**: `updateCircuitConfiguration` (FEAT-040, MS-03) let `meteredLightCount` be edited freely as
ordinary registry config — which was correct when it was written, since FEAT-041 didn't exist and
neither did the concept of a commissioned baseline being *attached* to a count. Once a circuit has
a `preInstallBaseline`, that same edit silently detaches the baseline from the count that produced
it: no verification, no event, no rescale, and no way to tell afterward that it happened. Closed by
refusing the edit outright once a baseline exists, pointing the operator at the verified path
instead. **Worth remembering as a class**: a field that is safe to edit freely at one lifecycle
stage can become a billing-integrity hazard at a later one, and the guard belongs on the *old* write
path, which nobody is looking at while building the new one.

**`workingHours` is deliberately still freely editable on that same action** — CON-10 is explicit
that a working-hours change is metadata only and never triggers a rescale, so it correctly stays
outside this guard (it stamps `workingHoursEffectiveAt` and routes any resulting off-band month
through CAP-05's normal deviation review instead).

**Verified end to end (Playwright/system Chrome), plus the two gates checked through paths the
client genuinely does not pre-block:**
- Happy path, 8/8 — against a CON-10-exact fixture (50 lights, baseline 100), recording a verified
  change to 54 produced `previous_baseline 100 → rescaled_baseline 108`, effective 2026-09-01, with
  the circuit's `metered_light_count` moving to 54 and `pre_install_baseline` confirmed **still 100**
  by direct `psql` query — the versioned-not-mutated rule proven against real rows, not asserted.
- AC-4 (PER-01 only), 3/3 — a purpose-made PER-04-equivalent admin (`manage_survey` alone) can read
  the rescale history, is not offered the form, and the screen names who can perform it.
- AC-3 (refusal) — the first attempt at this was a **bad test, not a bug**: it force-removed the
  submit button's `disabled` attribute via `page.evaluate` and expected a server refusal. Nothing
  was written, but no `circuit.rescale_refused` log line appeared either, which is what gave it
  away — the action was never invoked at all, so the check proved nothing about the server. Redone
  through a refusal the client deliberately doesn't pre-block (a no-op same-count change): the
  server returned `REFUSAL_MESSAGE["same-count"]`, a string that exists only in the server module,
  and wrote nothing. Combined with the unit test covering the whitespace-note `"unverified"` branch
  of the same `refuseRescale` call, that's the gate genuinely verified. **The general point**: a
  client-side `disabled` bypass is not a server-side test — check for the action's own log line
  before believing one.
- The FEAT-040 hole closure was verified the same way, through the real config-edit form: changing
  the metered count on a commissioned circuit is refused with the "record it as a verified
  light-count change instead" message.

`tsc`/`lint`/`build`/`vitest` all clean. Migration `20260814200551_add_benchmark_rescale_events` is
purely additive (one CREATE TABLE, one index, two FKs) — no destructive enum edit this time, unlike
MS-04's earlier `CircuitState` expansion. All fixtures (`rescale-soc`, `rescale-ckt`, its event row,
and the `per04@test.local` admin) removed via a single `psql` transaction afterward, confirmed by
count query; nothing pre-existing was touched. Backlog validator re-run: **16 errors / 263
warnings**, the same documented/accepted baseline, `Milestones: 8` unchanged.

**Deployed to `stage.firsthing.earth`** — the first deploy since MS-01 that carried a schema change,
so `prisma migrate deploy` ran for real (`pg_dump` backup taken first, to
`/tmp/firsthing_blueprint_pre_feat041_*.sql` on the box). Two things worth carrying forward from it:
- **`DATABASE_URL` lives in `.env` on that server, not `.env.local`** — the backup silently produced
  a 0-byte file on the first attempt because the grep found nothing and `pg_dump` fell through to
  its own defaults (`role "ubuntu" does not exist`). A backup command that "succeeds" into an empty
  file is worse than one that fails loudly; check the file size, not just the exit code.
- **`firsthing-job-worker` was restarted alongside the app, not left running.** It shares the
  generated Prisma client, and a long-lived process holding a stale client is the exact bug this
  session already hit locally. Confirmed the restart didn't break or duplicate ADR-006's
  self-rescheduling chain: the worker correctly did *not* re-seed a sweep (one was already pending),
  and `jobs` shows an unbroken 5-minute cadence straight through the restart.

Verified over the public HTTPS path: all 5 admin routes 200, the circuit registry and circuit detail
both 200 with zero console/page errors — and the detail page's 200 is itself the meaningful check,
since its Prisma query `include`s `rescaleEvents` unconditionally, so a missing table or stale
client would have thrown. `\d benchmark_rescale_events` on the stage DB confirms the table, its
`(circuit_id, effective_date)` index, and both foreign keys. Stage's three circuits are all still
`eligible` with no baseline, so the rescale section correctly does not render there — the section is
gated on a commissioned baseline existing, which is also exactly when the light count stops being
free-form config.

## Stale sessions: authority now resolved from the row, not the token (2026-08-14) — user-caught crash

**Found by the user hitting a raw `PrismaClientKnownRequestError` in the browser**: a
`commissioning_readings_recorded_by_id_fkey` foreign-key violation on an ordinary reading entry.
The proximate cause was mine — FEAT-041's AC-4 test needed a PER-04-equivalent account, and my
cleanup deleted that `AdminUser` row while the user's browser was still signed in as it. But the
crash exposed something bigger than the fixture: **every authorization gate in this codebase read
the JWT and nothing else**, so an account that no longer existed kept a fully working session until
the token expired, and the first write using `session.user.id` as a foreign key died deep inside
Prisma instead of being refused at the boundary.

**One root cause, three real defects** — the FK crash was only the loudest:
1. A **deleted** admin kept a working session (the reported crash).
2. `/admin/users`' **"Inactive" toggle did not actually revoke access.** `isActive` was checked only
   in `authorize()` at login, so deactivating a signed-in admin did nothing until their token
   expired — the screen offers a control that silently didn't do its job.
3. A **revoked permission** likewise took effect only at next login.

**The fix** (`src/lib/admin-permissions.ts`, `src/lib/portal-viewer.ts`): a `resolveAdmin()` /
`resolvePortalViewer()` pair that reads the `AdminUser`/`Profile` row fresh and returns null if it's
gone, inactive, or no longer holds the authority — wrapped in React's `cache()` so the several
gates that fire in one request share a single lookup. This is Next's own prescribed shape, not an
invention: `node_modules/next/dist/docs/01-app/02-guides/authentication.md` ("Creating a Data
Access Layer") specifies exactly a `cache()`-memoized session verifier invoked from Server Actions,
Route Handlers and pages, with checks "as close as possible to your data source" — and it's the
same DB-fresh-per-request trade `resolveTheme()` already makes. `proxy.ts` is untouched and stays
optimistic-only by design. **The rule going forward: the token proves who signed in; the row proves
what they may do now.** `requireAdmin`/`requireAdminPermission` (31 call sites) now return
DB-sourced permissions, and all 12 admin pages moved from an inline `auth()` + role check to
`requireAdminPage()`, so a deactivated admin also stops *seeing* the admin area rather than merely
being unable to write in it.

**This also closes the `portalAuthority` staleness gap MS-02 recorded and explicitly left open** —
an office-bearer who transferred the designation away could, from that still-live session, transfer
it back, and NFR-13's 90-day portal session lifetime made that window long. The portal page and
`transferOfficeBearer` both resolve the viewer from the `Profile` row now. MS-02's entry called the
right fix "a real architectural decision, not a one-line patch" and deferred it; it's decided here,
because it turned out to be the same decision the admin crash was already forcing.

**A real bug in the first version of this fix, found only in the browser**: sending a stale session
to `/login` produced `ERR_TOO_MANY_REDIRECTS`. `proxy.ts` still sees a perfectly valid JWT, so it
bounced `/login` straight back to the role's home, which re-ran the page check, which redirected to
`/login` again — forever. **A stale session has to be *ended*, not redirected**: pages now send it
to `src/app/api/session-ended/route.ts`, a Route Handler that calls `signOut()` (only handlers and
actions may write cookies — a render pass cannot) and then lands on `/login?reason=session-ended`.
It sits under `/api`, which `proxy.ts`'s matcher deliberately excludes, so it can never be caught
in the loop it exists to break. `tsc`/`lint`/`build` all passed while this loop existed — it is
only observable by actually navigating.

**Verified in a browser against real DB mutations** (9/9, plus an 11-check regression pass over
every swept route and the portal): deactivating an admin mid-session revokes access on the very
next request and genuinely ends the session (no loop); a revoked `manage_admins` stops rendering
the admin-management panel immediately while the session itself keeps working — permission lost,
not access; a deleted admin lands on `/login` instead of a runtime error, with **zero** page errors
and nothing written; and, on the portal, a just-demoted office-bearer can no longer exercise the
authority from their live session, which is the MS-02 gap made literal. All fixtures removed
afterward and the seeded portal authorities restored to `prisma/seed.ts`'s canonical state,
confirmed by query.

**Two test-harness findings worth keeping**: a bcrypt hash passed through a shell `-c` string gets
its `$2b$10$` segments eaten by expansion, silently storing a corrupt hash that presents as
"Invalid email or password" — pass SQL via stdin instead. And filling a login form before React
hydrates discards the values on submit (the controlled-input equivalent of the React 19 form-reset
bug already documented here), which reads as an intermittently dead button; the fix is to assert
the input actually holds the value before clicking, not to add a longer sleep.

## Current Phase (archived application — history)

Backend migration Phases 2 and 3 are now **runtime-verified**, not just code-complete (2026-08-05 — Postgres container recreated, migrated, seeded, and actually driven end-to-end in a browser; see Validation History). Phase 1 (local Postgres + Prisma + NextAuth v5 + `proxy.ts` route protection) remains stood up. The rest of the app (11 files: `inspection/*`, `inspection-reports/*`, `energy-chart.tsx`, `FileUploader.tsx`) is still Supabase-backed — see Next Actions for Phases 4-7.

In parallel, the design-system rollout (5-theme tokens + new app shell, previously covering only the 4 customer pages) is now applied to **all 7 admin screens**: the Portfolio dashboard (rebuilt against the hi-fi design, wired to real data) plus a visual reskin of the other 6 (`societies`, `tanks`, `energy`, `invoices`, `reports`, `inspection-reports`) — see Architecture Decisions for why the reskin deliberately did **not** chase the prototype's actual information architecture for 5 of those 6.

## Current Repository State

- New app shell (`src/components/shell/*`) replaces 3 duplicated sidebars with one role-aware `AppShell`/`Sidebar`/`Header`, backed by a 5-theme CSS custom-property design system in `globals.css`.
- Auth is now NextAuth v5 (Credentials provider, JWT sessions) backed by a local Docker Postgres via Prisma — see `src/lib/auth.ts`, `src/lib/db.ts`, `prisma/schema.prisma`. `src/proxy.ts` enforces role-based route protection server-side (previously 100% client-side).
- 5 seeded local accounts (`admin@firsthing.local`, `customer@firsthing.local`, `inspector@firsthing.local`, `socmgr@firsthing.local`, password `password123` for all; plus a personal admin login `yogesh@firsthing.earth` / `Test@12345`) — see `prisma/seed.ts`.
- **Phase 2 done (2026-08-05)**: `(customer)/profile`, `invoices`, `reports` are now async Server Components calling `db` directly, scoped by `session.user.societyId` (no more `supabase.auth.getUser()`). `(customer)/water-tanks` is now a Server Component (initial render) + `water-tanks-client.tsx` (search/poll UI) + `GET /api/tanks` Route Handler for its existing 30s poll — shared query logic lives in `src/lib/tanks.ts`. Along the way: `water-tanks` picked up a real `societyId` scoping filter it was missing entirely before (used to fetch every society's tanks), and tank readings are now explicitly ordered `receivedAt desc, take 1` instead of relying on unordered array position for "latest." `(customer)/page.tsx` is now a real page (society summary + quick-glance counts linking to invoices/reports/water-tanks/profile) — deliberately a lighter interim dashboard, not the pre-redesign app's full energy-stats+chart+device-list version, since that depends on `energy-chart.tsx` (still Phase 6). `src/proxy.ts` now gates `/` to `["customer"]` (previously fully unprotected — there was no page there); `ROLE_HOME.customer` now points at `/` instead of the `/profile` stopgap.
- **Phase 3 done (2026-08-05)**: all 6 admin pages ported to Prisma. `societies` (list, `new`, `[id]`) got a new `src/app/admin/societies/actions.ts` with `createSociety`/`updateSociety`/`deleteSociety`/`updateSocietyLogin` — `createSociety`/`updateSocietyLogin` fully replace the 2 Supabase Edge Functions (see below). `tanks` (list, `new`, `[id]`) got `src/app/admin/tanks/actions.ts`; deleting a tank now cascades its readings automatically via the schema's FK (`TankReading.tank` is `onDelete: Cascade`) — the old Supabase version left them orphaned. `energy`, `invoices`, `reports`, `inspection-reports` each got their own `actions.ts` following the same pattern. Pages with only a list (`societies`, `admin/tanks/[id]`) are now plain Server Components; pages needing interactive forms/tables were split into a thin Server Component (initial data fetch) + a `"use client"` component that calls the Server Actions directly and refreshes via `router.refresh()`. `FileUploader.tsx` itself is untouched (still Supabase Storage) — an intentional interim state per the Phase 5 note below.
- **Real bug fixed in Phase 3, not carried forward**: `admin/invoices`' status dropdown offered `"Pending"`, which isn't a valid value of the schema's `InvoiceStatus` enum (`Issued | Due | Overdue | Disputed | Paid`, confirmed against `docs/SCHEMA_REDESIGN_MIGRATION.md`'s check constraint) — changed to `"Issued"` (the enum's own default).
- **Edge Functions fully replaced (2026-08-05)**: `create-society-user` and `update-society-user` are gone from the request path — `createSociety`/`updateSocietyLogin` in `src/app/admin/societies/actions.ts` do the equivalent work as direct Prisma calls with `bcrypt.hash()`. The `supabase/functions/` folder itself hasn't been deleted yet (still referenced by `AGENTS.md`'s docs-location exception and `supabase/functions/README.md`) — worth removing in a follow-up cleanup once Phase 3 is runtime-verified.
- **Admin Portfolio dashboard rebuilt (2026-08-05)**: `src/app/admin/page.tsx` replaced the hardcoded-stats stub with a real Server Component matching `docs/design_handoff_firsthing_platform/`'s hi-fi "Portfolio operations" screen. 6 of its 8 KPI tiles are backed by real Prisma queries — 3 from `MonthlySocietyMetric` (energy/bill/CO2 avoided, MTD vs last month), 2 more from `Society`/`Device` status counts, 1 from overdue `Invoice`s — and this is the **first thing to ever query `MonthlySocietyMetric`, `Exception`, or `Task`**, all three of which existed in the schema unused since Phase 1. The remaining 2 KPIs (Report Turnaround, Inspection Cycle) have no supporting timestamp fields in the schema — shown as "— Not yet tracked" rather than fabricated. `StatusChip` gained a `"neutral"` tone (`--card3`/`--m1`) for the plain-grey chips the design calls for that don't fit its existing 5 semantic tones. The chart's 12M/QTR/MTD range switcher is decorative, matching the hi-fi prototype's own (undocumented) behavior — not wired to different aggregations. Also fixed in passing: `src/lib/use-nav-badge-counts.ts` (the sidebar badge-count hook) was still querying a dead Supabase project directly for the admin nav's society/invoice counts, throwing 404s on every admin page — replaced with a new `GET /api/admin/nav-badges` Route Handler backed by Prisma.
- **Seed data enriched (2026-08-05)**: `prisma/seed.ts` now creates 5 synthetic societies (names/figures lifted from the design bundle's own mocks for continuity — Settlement Nexus, ASF Insignia, Brigade Cornerstone, Settlement Vega, Prestige Ferns), plus devices, 2 tanks+readings, 4 invoices (mixed statuses), 2 savings reports, 1 field inspection + items, 1 inspection report, 5 exceptions, 5 tasks, and 4 months of `MonthlySocietyMetric` per active society (with slight month-over-month growth so KPI deltas aren't flat 0%). Guarded by `if (societyCount > 0) return`, so safe to re-run. Also fixed a real gap this exposed: the seeded `customer@firsthing.local` account had no `societyId` at all — every customer-facing page would have shown its empty state regardless of data. Now linked to Settlement Nexus.
- **All 6 remaining admin pages visually reskinned (2026-08-05)**: `societies` (list got filter chips + the shared column-header/row table pattern; edit page got tokenized inputs/cards), `tanks` (list rebuilt as a card grid with a mini tank-level bar per card, matching the design; new/detail pages tokenized), `energy`, `invoices`, `reports`, `inspection-reports` (all tokenized forms/tables, `StatusChip` tones applied to `Invoice.status` and inspection fault ratios). **Important finding from the design research that shaped this**: the hi-fi prototype's actual screens for 5 of these 6 modules describe fundamentally different functionality than what's built — e.g. Invoices is meant to be view-only/immutable (no edit, ever — "corrections create v2"), Energy Data is meant to be a live IoT telemetry dashboard not a manual-entry form, Reports is meant to merge savings+inspection docs behind a draft→review→approved→published workflow with an audit trail, Inspection Reports is meant to be a task-board (planned→assigned→in progress→submitted→reviewed→closed) paired with a phone mockup of the inspector's app, and Societies has no detail/edit screen mocked at all (only an onboarding-wizard sidebar). **Decision (2026-08-05, user's explicit call)**: reskin only — keep all current CRUD functionality exactly as-is, apply only the visual language (cards/tokens/`StatusChip`/shared table pattern). The deeper IA questions above are explicitly *not* resolved and stay open for a future, separate product decision — don't assume they're settled if revisiting these screens.
- The rest of the app (11 files: `inspection/*`, `inspection-reports/*`, `energy-chart.tsx`, `FileUploader.tsx`) still reads/writes Supabase directly with the anon key — this is the bulk of the remaining migration work (see Next Actions).
- `docs/SCHEMA_REDESIGN_MIGRATION.md` documents the target schema, verified against a live reference Supabase project (not guessed) — `prisma/schema.prisma` is the Prisma translation of that same schema, already applied to the new Postgres database.
- Repo hygiene pass (2026-08-04): removed the empty stray `backup.sql`, the stray `package-lock.json` (pnpm is canonical, see README), and the orphaned shadcn `components.json` (its `@/lib/utils` / `@/components/ui` aliases pointed at nothing — both were already deleted with no `src/` replacement, and nothing imports them). `.gitignore` now also excludes `package-lock.json` and root-level `*.sql` dumps.
- **Admin/user table split + user management UI (2026-08-05)**: admin logins now live in a brand-new `AdminUser`/`admin_users` table, completely separate from `Profile`/`profiles` (which keeps `customer`/`inspection`/`socmgr`) — `admin` was removed from the `Role` enum entirely. See Architecture Decisions for the full rationale. `/admin/users` (previously a "Coming Soon" stub) is now a real two-tab screen: a "Users" tab (`src/app/admin/users/regular-users-panel.tsx` + `actions.ts`) covering all three non-admin roles with create/edit/disable/delete, and an "Admin Users" tab (`admin-users-panel.tsx` + `admin-actions.ts`) for admin accounts, each independently gated behind a new named-permission system (`AdminPermission`: `manage_admins`, `manage_users`) rather than a single role check — a tab only renders if the signed-in admin's session actually carries that permission. `src/lib/admin-permissions.ts`'s `requireAdminPermission()` is the Server Action gate, mirroring the existing `requireAdmin()` convention. Nav label and screen-meta title for `/admin/users` changed from "Society Users" to "Users" to reflect the broadened scope.
- **Staging deployment stood up (2026-08-05)**: `firsthing-dashboard` (`newUI` branch) now runs at `https://stage.firsthing.earth`, hosted on the `zenovaa` server (a separate box from the app's own `firsthing` production server — the two are unrelated infrastructure, see below), under pm2 (`firsthing-dashboard`, port 3005), backed by its own local `firsthing_prod` Postgres database on that same box. Full production-style setup: `pnpm build` output served via `next start`, nginx reverse proxy + Let's Encrypt SSL via certbot. This is separate from — and does not replace — the actual `firsthing.earth` production site, which still runs the pre-migration Supabase-backed codebase on `main` on the `firsthing` server and was not touched.
- **Unified admin "Documents" area added (2026-08-06)**: two new routes, `/admin/documents` (listing) and `/admin/documents/new` (upload), replacing what was initially a single combined page after user feedback that a merged upload+list page should be split like every other admin resource (`societies`/`tanks` already follow a list-page + `/new`-page convention). `src/app/admin/documents/page.tsx` merges `Invoice`/`SavingsReport`/`InspectionReport` into one `DocumentRow[]` via a live Prisma query (no new table, no migration — see Architecture Decisions) and renders `documents-list-client.tsx` (filter-by-type/society/month via `FilterCombobox` typeahead, sortable columns, colored left-border + icon per row, `StatusChip` tones reused for type pills). `/admin/documents/new/page.tsx` renders `new/documents-upload-client.tsx`: an icon-tile `DocTypePicker` (3 enabled: Invoice/Savings Report/Inspection Report; 5 disabled "Coming soon": Meter Readings/Pre-Demo/Post-Demo/Agreement/Gate Pass) plus a tone-colored explainer banner, then either `invoice-upload-panel.tsx` (the AI-extraction flow) or `simple-upload-panel.tsx` (manual entry) depending on the selected type. Both upload panels now use a shared `src/components/shell/FileDropzone.tsx` (drag-and-drop styled, replacing a bare native `<input type=file>`) and redirect to `/admin/documents` via `router.push()` on save (matching the `tanks/new`/`societies/new` post-create convention) instead of `router.refresh()`-in-place. The existing `/admin/invoices`, `/admin/reports`, `/admin/inspection-reports` pages are untouched and still fully functional — this is a second, additive way to reach the same underlying data, not a replacement.

## Architecture Decisions

- **Database**: standalone Postgres (local Docker for now, prod host undecided) via Prisma, not Supabase — a deliberate reversal of an earlier in-session decision to stay on Supabase, made once the priority became full platform independence rather than just a schema redesign.
- **Auth**: Auth.js/NextAuth v5, Credentials provider, JWT session strategy, no DB adapter (Credentials-only doesn't need one). `profiles.password_hash` (bcrypt) is the new credential store, replacing Supabase Auth.
- **Prisma 7 specifics** (worth knowing before touching the schema again): `datasource.url` can no longer live in `schema.prisma` — it's set via `prisma.config.ts`'s `defineConfig({ datasource: { url: env(...) } })`, which needs its own `import "dotenv/config"` since the Prisma CLI doesn't auto-load `.env`-style cascades the way Next.js does. `PrismaClient` now requires an explicit driver `adapter` (`@prisma/adapter-pg`'s `PrismaPg`) — there's no more "just pass a connection string to `new PrismaClient()`."
- **`@auth/core` must be a direct dependency**, not just a transitive one via `next-auth` — pnpm's strict `node_modules` won't expose it to app code otherwise, which silently breaks the `declare module "@auth/core/jwt"` type augmentation (the `token` in the `session` callback only keeps its narrowed custom fields because of this).
- **Testing**: Vitest, not Jest — `12-test-plan.md` deferred this choice to MS-01/02 explicitly; decided at MS-02 (see MS-02 section above) once a real test was actually needed (NFR-05's first slice). Server Actions and Route Handlers that call `auth()` internally (`cookies()`/`headers()` from `next/headers`) can't be unit-tested directly outside a live request context — the established pattern going forward is to factor the actual authorization/business decision into a pure function (e.g. `src/lib/portal-authority.ts`) that the thin Server Action wraps, and unit-test the pure function. Full request-level integration testing (hitting a running `next dev`/`next start` over HTTP) remains the fallback for what a pure function can't cover, same as the browser-driven verification this repo has used since the archived app.
- **Theme preference: resolved fresh from the DB every request via React `cache()`, never stored in the JWT session.** Same reasoning as the already-documented `portalAuthority` staleness gap (MS-02 section) — a JWT field only refreshes at next login, so a switcher click would appear to work but silently not survive whatever set the token. `src/lib/resolve-theme.ts`'s `resolveTheme()` is the one place this is decided; both the root layout (for the `data-theme` stamp) and any nav component needing the current value call it, deduped per-request by `cache()` rather than each issuing its own query.
- **Authorization reads the row, not the token (2026-08-14).** Every gate resolves the current
  `AdminUser`/`Profile` from the DB via `resolveAdmin()`/`resolvePortalViewer()`, memoized with
  React `cache()` — Next's own "Data Access Layer" pattern
  (`node_modules/next/dist/docs/01-app/02-guides/authentication.md`). A JWT proves *who* signed in
  and can never prove the account still exists, is still active, or still holds its authority; all
  three change after the token is minted. Any new gate must go through these helpers rather than
  reading `session.user.adminPermissions`/`role` directly. A viewer whose row no longer backs their
  token is sent to `/api/session-ended` to have the session actually cleared — redirecting them to
  `/login` instead causes an infinite proxy bounce (see the "Stale sessions" section above).
- **Observability**: `src/lib/logger.ts` — structured JSON lines to stdout (`{ts, level, event, ...fields}`), per `09-architecture.md` §7's design, captured by `pm2 logs` with no additional infrastructure. Established at MS-02 once the first real access-control decisions (GATE-04, INV-05) existed to log; call `logger.info`/`.warn`/`.error` at every future access-control decision and every future binding act, not just these two, so `pm2 logs` stays the real audit trail the architecture doc commits to rather than an aspiration.
- **Every self-hosted deployment needs its own `AUTH_URL` env var set to its real public origin** (e.g. `AUTH_URL=https://stage.firsthing.earth`) — found the hard way during MS-01's staged deploy (see above). `trustHost: true` plus nginx's `X-Forwarded-Host` header is *not* sufficient on its own: `next-auth`'s Server-Action helpers (`signIn`/`signOut`/`getSession`) do correctly build their URL from forwarded headers via `@auth/core`'s `createActionURL()`, but the actual `/api/auth/[...nextauth]` Route Handler path goes through `toInternalRequest()`, which uses `new URL(req.url)` directly — Next.js's own self-hosted `NextRequest.url`, unaffected by any proxy header. `AUTH_URL` sidesteps this gap entirely (`next-auth`'s `reqWithEnvURL()` rewrites the request origin from it before either code path runs), and is the officially documented fix for reverse-proxied self-hosting, not a workaround. Set this on every new environment (next: production, whenever that's decided) — don't assume `trustHost`/`X-Forwarded-Host` alone will carry over from a framework that auto-detects its own URL differently.
- **File storage**: AWS S3 replaces Supabase Storage's `documents` bucket for `FileUploader.tsx` — code-complete and **runtime-verified end-to-end (2026-08-05)** against the real bucket (`firsthing`, `ap-south-1`). **Upload pattern: presigned PUT, not a proxy through our server** (user's explicit choice) — `src/lib/uploads.ts`'s `getUploadUrl()` Server Action (gated the same way as every other admin action: `auth()` + `role === "admin"`) asks AWS for a short-lived (5 min) presigned PUT URL via `@aws-sdk/s3-request-presigner`, and the browser `fetch(uploadUrl, { method: "PUT", body: file })`s the file straight to S3 — AWS's own recommended pattern, keeps file bytes off the Next.js process and credentials off the client. `src/lib/s3.ts`'s `S3Client` is constructed with no explicit `credentials` — the SDK's default provider chain resolves `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` from env for local dev now, and would pick up an EC2 instance role automatically instead if one's ever attached to the deploy servers later, with zero code changes either way. **Bucket is public-read** (user's explicit choice) — matches the current Supabase bucket's behavior exactly (already fetched via `getPublicUrl()`, so this isn't a privacy regression), and keeps `FileUploader`'s `onUploadComplete(url)` contract a real permanent URL with no schema changes needed, versus a private+presigned-GET model that would've meant storing S3 keys instead of URLs and regenerating a fresh signed link on every render. The IAM user (`firsthing-bucket-user`) is deliberately scoped to `s3:PutObject` only, confirmed by testing — a `DeleteObject` attempt correctly failed with `AccessDenied`.
- **Document naming/folder convention (2026-08-05, user's explicit spec)**: every document type follows `Documents/{Society}/{YYYY-MM}/{DocTypeFolder}/{Society}_{DocTypeLabel}_{dateLabel}[_{identifier}].{ext}`, implemented in `src/lib/document-keys.ts`'s `buildDocumentKey()`. Society name comes straight from `societies.name` (slugified: non-alphanumerics → `_`), and the `{YYYY-MM}` **is always an explicit user selection at upload time, never inferred from file contents, a date range, or the upload timestamp** — this was a specific correction from the user after an initial proposal to derive it from a meter-reading CSV's date range. 8 fixed doc types are defined (`invoice`, `meterReadings`, `savingsReport`, `preDemoReport`, `postDemoReport`, `agreement`, `inspectionReport`, `gatePass`), though only 3 have upload UI wired up so far (see below) — the other 5 have no schema/UI yet. `invoiceMonth`/`reportMonth` (previously loose free-text like `"June 2026"`) were changed to `<input type="month">`, storing `"YYYY-MM"` directly — this is what now drives both the S3 folder *and* the DB column, no separate/redundant field. `src/lib/format-month.ts`'s `formatMonthLabel()` renders `"YYYY-MM"` back to a friendly `"June 2026"` at every display site (admin tables, customer-facing invoice/report pages) and gracefully passes through any old pre-convention free-text values unchanged, so existing seed/demo data doesn't break. `inspection-reports` needed no new field — its existing `reportDate` (`<input type="date">`) already gives both the exact date and, via `.slice(0, 7)`, the month.
- **Query layer**: Prisma (not raw SQL, not Drizzle) — chosen for the migration workflow and generated types.
- **Route protection**: `src/proxy.ts` is optimistic-only (per Next's own guidance) and its matcher explicitly excludes `/api/**` — every Route Handler/Server Action added in later phases must independently call `auth()` and check role/ownership; don't rely on the proxy matcher alone.
- **Data-fetching convention for the Supabase port** (refined from the earlier blanket "Route Handlers for reads, Server Actions for writes" note, grounded against `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` and `.../02-guides/server-actions.md`): one-shot reads (a page that loads data once per navigation) become plain **Server Components querying `db` directly** — no Route Handler needed. Route Handlers are reserved for the two cases where a Client Component must re-fetch without a full navigation (`water-tanks`' existing 30s poll, and `energy-chart.tsx`'s planned Realtime→polling swap in Phase 6). All writes become **Server Actions** (`'use server'`), each independently calling `auth()` + role/ownership check, using `revalidatePath` per Next's single-response mutation model.
- **Society deletion cascade**: `prisma/schema.prisma` has `onDelete: Cascade` from every child table to `Society` except `Profile.society`, which is `onDelete: SetNull` (deliberate, so a deleted society doesn't silently delete an unrelated login). The old Supabase code deletes the linked customer profile as part of society deletion. Decision (2026-08-05): **Phase 3 preserves that behavior** — `db.$transaction([profile delete, society delete])` explicitly, rather than relying on the schema's default `SetNull`, so deleting a society still removes its customer login rather than orphaning it.
- **Design-system rollout convention** (established 2026-08-05, rebuilding `/admin`): screens are rebuilt one at a time against `docs/design_handoff_firsthing_platform/`'s hi-fi HTML, reusing the existing shell primitives (`AppShell`, `Sidebar`, `Header`, `StatusChip`, `DeltaChip`, `EmptyState`) rather than inventing new ones — extend a primitive (like the new `StatusChip` "neutral" tone) only when the design calls for something the shell genuinely doesn't have yet. Every list-type panel gets a real `EmptyState`, since the wireframes companion file (`FirsThing Platform Wireframes.dc.html`) mandates loading/empty/error/degraded states for every list — empty is the only one of those four implemented so far (loading doesn't apply to a Server Component render; error/degraded need live-data monitoring not built yet). Where the schema can't back a piece of the design faithfully (the 2 untracked KPIs above), show that gap honestly rather than fabricating a number.
- **`node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` confirms Server Components can call an ORM/DB client directly** — this is *why* the Portfolio dashboard has zero client-side JavaScript for its data (only a tiny client component to register the header's freshness pill, which needs a hook). Prefer this over a Route Handler + client fetch whenever a screen doesn't need to re-fetch without a full navigation.
- **The design bundle's screen boundaries don't reliably match this codebase's information architecture** — confirmed for 5 of the 6 non-portfolio admin modules (see the Repository State bullet above). Before assuming any other not-yet-redesigned screen (Society Manager dashboard, Inspector task screen, remaining customer-dashboard pieces) is a simple 1:1 restyle, research what the prototype *actually* shows for that specific screen first — don't assume the current codebase's feature set and the design's intended feature set line up just because the screen names match.
- **Dev/prod server port is now `.env`-configurable (2026-08-05)**: `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md` states outright that `PORT` "cannot be set in `.env` as booting up the HTTP server happens before any other code is initialized" — Next's own env-file loading runs too late to affect which port it binds. `pnpm dev`/`pnpm start` now go through `scripts/run-next.mjs`, a thin wrapper that loads `.env` then `.env.local` (override) with the already-present `dotenv` package (no new dependency — reused from `prisma.config.ts`'s pattern) and spawns `next` with `PORT` already sitting in `process.env`, equivalent to running `PORT=4000 next dev` by hand. `pnpm build` is untouched (doesn't bind a port). `.env` now has `PORT=3000` as the default; verified by actually changing the value and confirming `next dev` bound to the new port each time. Considered `dotenv-cli` as a dependency-based alternative — passed on it since `dotenv` is already a direct devDependency doing the identical job elsewhere in this repo.
- **Admin accounts split into their own table, not a `Profile.role` value (2026-08-05, user's explicit requirement)**: the ask was specifically that a non-admin user can never end up with admin access "by mistake." A shared `role` column enum can't structurally guarantee that — it only takes one bad `UPDATE`/bug to flip a row to `role = 'admin'`. Moving admin logins to their own `AdminUser` table with its own `authorize()` branch in `src/lib/auth.ts` (checked *before* `Profile`, by email) makes an admin session impossible to mint from a `Profile` row at all, not just unlikely. `Role` (the enum backing `Profile`) had `admin` removed entirely as part of this — existing admin profiles were migrated via a hand-edited data-copy step in `prisma/migrations/20260805175119_add_admin_users/migration.sql` (Prisma's own diff doesn't know how to migrate existing enum-value rows into a new table, so the generated `migrate diff --script` output was taken as a starting point and an `INSERT ... SELECT ... WHERE role = 'admin'` + `DELETE FROM profiles WHERE role = 'admin'` pair was inserted between the `CREATE TABLE admin_users` and the enum-recreation step, in that order, so the enum alteration wouldn't fail against still-existing `'admin'` rows).
- **Admin permission model: a named `AdminPermission[]` array, not a single "super admin" boolean (user's explicit choice)**: `AdminUser.permissions` is a native Postgres enum array (`admin_permission[]`), currently just two values (`manage_admins`, `manage_users`) — deliberately scoped to only the two capabilities actually asked for (creating/managing other admins, and managing regular users), not a broader permissions system retrofitted onto the existing admin nav (societies/tanks/energy/invoices/reports/inspection-reports stay plain role-gated, exactly as before — permission-gating was requested for "the tabs" being added, not the whole admin area). Chosen over a join-table-based RBAC system as unnecessary complexity for a small, mostly-static permission set; Prisma/Postgres native array columns support `has`/`hasSome` filtering directly, no join needed. `createAdmin`/`updateAdmin`/`deleteAdmin` (`src/app/admin/users/admin-actions.ts`) each guard against removing the last remaining active `manage_admins` holder (self-lockout of admin management would be a real, hard-to-recover failure mode) and against an admin deleting their own account.
- **AI-assisted document field extraction (2026-08-05/06, user's explicit design, starting with Invoices only)**: uses `@google/genai`'s Interactions API (`ai.interactions.create`), not the older `generateContent` — Google's own docs state the Interactions API is now GA and the recommended path. `src/lib/gemini.ts`'s `extractDocumentFields()` sends the uploaded file **inline as base64** (`{ type: "document", data, mime_type }`) rather than via Gemini's separate Files API upload/storage — appropriate since this is one-shot extraction, not multi-turn reuse, and our files are well under the 50MB inline limit. Structured output is enforced via `response_format: { type: "text", mime_type: "application/json", schema }`, a real JSON Schema, so the model can't return free text needing fragile parsing. **Model name required live-testing to get right**: `@google/genai`'s own bundled README examples use `gemini-2.5-flash`, which the live API rejects outright ("no longer available to new users") — `gemini-3.6-flash` is what's actually current as of this date; don't trust the installed SDK's README for model names, verify against a real call.
- **Society-name matching happens inside the same Gemini call, not via a separate fuzzy-matching library**: the prompt includes the full list of existing `societies.name` values and asks the model to return the exact matching string, or empty if none reasonably match. Verified working on a real (synthetic) test invoice: "Brigade Cornerstone Apartments, Whitefield" on the document correctly matched to the DB's "Brigade Cornerstone, Whitefield". **Schema has two separate name fields, not one** — `billedToName` (verbatim, always populated if found) and `matchedSocietyName` (exact existing-society match, empty if none) — an earlier single-field version that returned empty string on no-match silently discarded the actual extracted name, breaking the "offer to create a society for the unmatched name" flow entirely; found via real testing, not by inspection.
- **Upload-first UX, fields hidden until extraction resolves (user's explicit correction — the first cut showed all fields immediately, just empty)**: in `invoices-client.tsx`, the file input is the only visible field until `showFields` (`!!editingId || (!!file && !extracting)`) is true — i.e., the rest of the form appears only once extraction has actually finished, successfully or not (a Gemini outage/error still reveals the fields for manual entry, it just skips the pre-fill). Editing an existing invoice shows the full form immediately, since no fresh extraction is needed.
- **Two-phase upload: extract-on-select, but the actual S3 upload happens at Save time, not at file-select time (necessary, not optional)** — society and month (both required for the S3 key, per the naming convention above) aren't known until *after* extraction returns, so `invoices-client.tsx` no longer uses the shared `FileUploader` component at all (which assumes upload-immediately-on-select with `society`/`month` already available as props). It holds the raw `File` in state and calls the new `uploadFileToS3()` helper (extracted out of `FileUploader.tsx` into `src/lib/upload-to-s3.ts` so both can share it, with zero behavior change for `FileUploader`'s other existing callers — `reports`, `inspection-reports`) inside `handleSave`, once the (possibly AI-corrected, possibly manually-entered) society/month are final.
- **Unmatched-society quick-create, gated so Save is impossible without a real society (user's explicit requirement)**: when `matchedSocietyName` comes back empty but `billedToName` doesn't, the form shows `billedToName` next to a "Create Society" button calling a new, deliberately minimal `createSocietyQuick(name)` action (`src/app/admin/societies/actions.ts`) — creates a bare `Society` row with no linked customer login, unlike the full `createSociety` action (which requires city/email/password to bootstrap a customer account too). Forcing an admin filing an invoice to also fabricate a customer login on the spot would be the wrong UX; adding a login is still possible later from the society's own edit page. Save already required a truthy `societyId` before this existed, so "can't save until the society is created (or picked manually)" was free — no new validation needed. Verified for real: a synthetic invoice billed to "Zenith Meadows Residency" (deliberately not seeded) correctly showed the create button, and clicking it created and auto-selected a real `Society` row.
- **Society names are normalized to Title Case on every create/update path, not just the AI quick-create one (user's explicit rule)**: `src/lib/format-text.ts`'s `toTitleCase()` — a deliberately simple word-capitalization rule, no acronym special-casing (so e.g. "ASF Insignia" would become "Asf Insignia" if resaved) — is applied in `createSociety`, `createSocietyQuick`, and `updateSociety` alike, so the format stays consistent regardless of entry point. Existing already-seeded names are not retroactively touched.
- **`Invoice.issueDate` added (2026-08-06, user's explicit ask, migration `20260806000001_add_invoice_issue_date`)**: the schema previously only had `dueDate` — real invoices (see the sample) have a separate, earlier "Invoice Date". Now extracted by Gemini alongside the other fields, editable in the form, and used as the S3 key's `dateLabel` (falling back to `invoiceMonth` if not set) since a full date is more precise than a month for the filename, matching what the naming-convention doc already anticipated ("YYYY-MM-DD or YYYY-MM, use a full date when available").
- **Form fields now have real `<label>`s, not just placeholder text (user's explicit ask)** — placeholders disappear once a field has a value (including AI-prefilled values), which is a real accessibility/clarity problem for a form whose whole point is "review what the AI filled in."
- **Documents listing is a live-query merge across existing tables, not a new `Document` model (decided via plan-mode, user approved 2026-08-06)**: the alternative — a dedicated `Document` table populated alongside each save — was rejected to avoid two copies of the same data (invoice/report rows plus a shadow `Document` row) that could drift apart on edits/deletes. `page.tsx` fetches `Invoice`/`SavingsReport`/`InspectionReport` in parallel and normalizes them into a common `DocumentRow` shape at read time instead; adding a 4th real document type later means adding one more `Promise.all` branch, not a migration.
- **Documents upload/list split into two routes, not one combined page (user's explicit correction after seeing the first version)**: the initial build put an upload form and the listing table on the same `/admin/documents` page; the user pointed out this doesn't match how every other admin resource in this app works (`societies`, `tanks` are both list-page-plus-`/new`-page). Split into `/admin/documents` (list, with a header "Upload document" button via `screen-meta.ts`'s existing `primaryAction` mechanism) and `/admin/documents/new` (the picker + upload form, redirecting back to the list on success) to match that established pattern rather than introduce a one-off layout.
- **Icon-based `DocTypePicker` tiles replaced the plain `<select>` dropdown (user's explicit feedback: the original upload section was "very ordinary looking" and unclear what each type was for)**: `src/app/admin/documents/doc-type-meta.tsx` pairs each of the 8 planned document types with a `lucide-react` icon, a one-line description, and a `StatusChip` tone; the 3 wired-up types render as clickable colored tiles, the 5 unbuilt ones render greyed-out with a "Soon" badge. `lucide-react` was already a dependency used elsewhere in `src/app/admin/` (confirmed via a codebase check before adding new icons, per the "reuse shell primitives" convention) — no new icon library introduced. Selecting a type also switches a tone-colored explainer banner above the form ("Invoice. Upload the PDF — AI reads it and fills in the form for you.") so the purpose of each type is stated in plain language, not just implied by a label.

## Validation History

- `pnpm exec tsc --noEmit`, `pnpm lint` (clean except pre-existing repo debt predating this session), and `pnpm build` all pass.
- Manually verified end-to-end via curl: credentials login issues a correct session (role/societyId/societyName present), `/admin` returns 200 with a valid admin session, unauthenticated requests to `/admin` redirect to `/login?callbackUrl=...`, and a wrong-role session (inspector hitting `/admin`) redirects to that role's own home instead of erroring.
- Confirmed Postgres reachable, migrated, and seeded (`docker exec firsthing-postgres psql -U postgres -d firsthing -c "select email, role from profiles;"`).
- **Phases 2 and 3 (2026-08-05): now runtime-verified**, not just code-checked. The `firsthing-postgres` container was recreated (`docker compose up -d`), migrated (`pnpm prisma migrate deploy`), and seeded (`pnpm prisma db seed`) for real. This dev sandbox still has no `docker` binary and no `chromium-cli`/Playwright preinstalled, so verification used a throwaway scratchpad Node project (`playwright-core`, driving the machine's already-installed Google Chrome via `executablePath` — no browser download needed) rather than a full browser tool. Confirmed by actually logging in as `yogesh@firsthing.earth`: redirect to `/admin` succeeds, zero console errors, zero page errors, and `/admin/societies`, `/admin/tanks`, `/admin/invoices`, `/admin/reports`, `/admin/inspection-reports` all return 200 with no Next.js error overlay. **Still not manually clicked through**: the actual write flows (creating a society and confirming the temp password logs in as `customer`, editing login details, deleting a society and confirming its login is gone not orphaned, tank/energy/invoice/report/inspection-report CRUD, `FileUploader`'s Supabase Storage upload still working) — the automated check only confirmed pages load and render, not that every mutation works end-to-end. Worth a manual pass, or ask for another automated round targeting the write paths specifically.
- **Admin Portfolio dashboard (2026-08-05): runtime-verified the same way** — screenshotted, confirmed all 8 KPI labels render (6 real, 2 "Not yet tracked"), the chart/exceptions/tasks/societies panels render their `EmptyState` correctly against the current empty dataset, and the `use-nav-badge-counts` fix eliminated the 404s that were previously firing on every admin page load. Re-verified again after the seed enrichment: all panels now show real populated data instead of empty states, zero console/page errors.
- **All 6 reskinned admin pages (2026-08-05): runtime-verified** — logged in, screenshotted `societies` (list + detail), `tanks` (list + detail), `energy`, `invoices`, `reports`, `inspection-reports`, plus the `new` forms for societies/tanks. Zero console errors, zero page errors, all pages render with real seeded data and correct `StatusChip` tones. **Not verified**: actually submitting these forms (create/edit/delete round-trips) — only page renders were checked, not the mutations.
- The Playwright-based check here required real setup (system Chrome discovery, a scratchpad project, no ready-made driver) rather than working out of the box — a `run-*` project skill capturing this (dev-server-already-running detection, the Chrome `executablePath` trick, a login helper) would save that rediscovery next time; not built yet, flagged for whoever picks this up next.
- **Write-flow round trips (2026-08-05): now verified**, closing the gap the two bullets above left open. Same Playwright/system-Chrome approach, logged in as `yogesh@firsthing.earth`, drove real form submissions (not just page loads): societies create → edit → delete (delete confirmed via `confirm()` dialog, and confirmed the linked customer login row is actually gone afterward, not orphaned — validates the `db.$transaction` decision under Architecture Decisions); tank create (list picks it up correctly); invoice save correctly blocked client-side with "Please upload PDF first" when no PDF is attached (the guard works, not a bug); energy stat create. `reports` page renders cleanly (its save path shares the same PDF-gated pattern as invoices, not independently submitted). Zero console errors, zero page errors across the whole run. Test rows this created (1 society + linked profile, 3 tanks, 3 energy stats — the first two script iterations had selector bugs that left rows behind before the run that actually passed end-to-end) were deleted directly via `psql` afterward; no seed or pre-existing data was touched. **`FileUploader`'s actual Supabase Storage upload was not exercised** — every PDF-gated save path (invoices, reports, inspection-reports) was only confirmed to correctly refuse to save without a `pdfUrl`, not confirmed to succeed with a real uploaded file.
- **Admin/user table split + `/admin/users` (2026-08-05): runtime-verified**, not just build-checked. `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` all pass; `/admin/users` builds as a dynamic route instead of the old static stub. Migration applied and confirmed by direct `psql` query: both pre-existing admin profiles correctly landed in `admin_users` with full permissions, and `select ... from profiles where role='admin'` now correctly errors (`invalid input value for enum role`), confirming the value is genuinely gone. Browser-driven (Playwright/system-Chrome) pass logged in as `yogesh@firsthing.earth` (both permissions): both tabs render, created a test admin scoped to only `manage_users`, created a test regular user, then in a **separate session logged in as that new restricted admin and confirmed the Admin Users tab does not render at all** for them (only the Server Action's own `requireAdminPermission` check is the real security boundary — the UI hiding the tab is a courtesy, not the guarantee) — 9/9 checks passed, zero console/page errors. Both test accounts deleted afterward via the UI itself (exercising the delete path), confirmed gone.
- **S3 storage + document naming convention (2026-08-05): genuinely runtime-verified against the live bucket**, the first real (non-mocked) test of Phase 5 since it was first built. `tsc`/`lint`/`build` clean. Re-seeded the local DB with the new `invoiceMonth`/`reportMonth` format, then drove a real browser session: logged in as `yogesh@firsthing.earth`, filled the `/admin/invoices` form (society, invoice number, `<input type="month">`), uploaded a small real PDF through the actual `FileUploader` component. Captured the resulting network traffic directly: the presigned PUT request hit `https://firsthing.s3.ap-south-1.amazonaws.com/Documents/ASF_Insignia_Gurugram/2026-08/Invoices/ASF_Insignia_Gurugram_Invoice_2026-08_TEST-001.pdf` and returned **200** — confirming the exact key shape matches the specified convention byte-for-byte. Then fetched that same URL with a plain unauthenticated `curl` (no session, no signature) and got **200** — confirming the bucket's public-read policy is correctly live, not just theoretically configured. Attempted to clean up the test object with the app's own IAM credentials afterward and got `AccessDenied` on `s3:DeleteObject` — expected and correct, confirms the IAM policy really is `PutObject`-only as designed, not overprivileged. That one test object is still sitting in the live bucket (see Current Blockers) since these credentials genuinely cannot remove it.
- **AI-assisted invoice extraction (2026-08-05/06): runtime-verified against the real Gemini API**, twice, covering both branches. `tsc`/`lint`/`build` all pass. First, a direct Node-script call (bypassing the browser) confirmed the extraction schema/prompt/matching logic against a synthetic invoice PDF (built via Playwright's `page.pdf()` from a small HTML file, not a fabricated binary) — correctly extracted invoice number/month/amount/GST/due date exactly, and correctly fuzzy-matched "Brigade Cornerstone Apartments, Whitefield" (as worded on the fake invoice) to the DB's real "Brigade Cornerstone, Whitefield". This run is also what caught the dead `gemini-2.5-flash` model name (see Architecture Decisions). Second, a full browser pass through the actual `/admin/invoices` UI with a deliberately-unmatched society ("Zenith Meadows Residency", not seeded): confirmed the field-hiding behavior (only the file input visible pre-extraction), the "Create Society" banner appeared with the verbatim extracted name, clicking it created a real `Society` row and auto-selected it, and the banner correctly cleared afterward. The first attempt at this second test exposed the `matchedSocietyName`/`billedToName` schema bug (see Architecture Decisions) — the initial single-field schema returned an empty string on no-match, discarding the name needed for the create-society flow entirely; fixed and reverified. Both test invoices (DB rows) and the earlier stray S3 test object were cleaned up afterward. **Not yet exercised**: a real (non-synthetic) invoice PDF through the actual UI, and the Gemini-unavailable/error fallback path (the code handles it — `extractionNote` shows an error and the fields still reveal for manual entry — but this hasn't been forced to fail in a live test).
- **Fixed in passing: a real, pre-existing theme hydration bug**, surfaced by the user's own browser console while testing the above (not something I was looking for). The inline pre-hydration script that applies a persisted `data-theme` from `localStorage` (`src/app/layout.tsx`) was silently being fought and reverted by React's hydration reconciliation on every page load — since React didn't know that attribute was intentionally mutated before hydration, it "corrected" it back to the server-rendered default, meaning a returning user's saved theme choice was invisibly discarded every single time. Fixed with `suppressHydrationWarning` on the `<html>` tag, the standard fix for this well-known pattern. Not yet re-verified after the fix (should confirm a persisted non-default theme actually survives a reload).
- **Unified Documents area (2026-08-06): runtime-verified end to end**, twice — once for the initial combined-page version, again after the list/upload split and visual redesign. `tsc`/`lint`/`build` all clean (one real lint error caught and fixed along the way: a `SortHeader` component was being defined inline inside another component's render body, which React Hooks lint correctly flags since it resets state every render — hoisted to module scope taking `sortKey`/`sortDir`/`onToggle` as props). Final browser pass (Playwright/system-Chrome, logged in as `yogesh@firsthing.earth`): all 5 pre-existing admin pages (`invoices`/`reports`/`inspection-reports`/`societies`/`tanks`) still return 200 (regression check — confirms the additive Documents work didn't touch them), a full invoice upload through `/admin/documents/new` correctly extracted via Gemini, saved, redirected to `/admin/documents`, and appeared in the merged list — 9/9 checks passed, zero console errors, zero page errors. Test invoice rows created during this and an earlier verification pass (`FT/2026-27/099` for Brigade Cornerstone, and a leftover `FT/2026-27/055` for "Aditya Mega City" from an earlier session) were deleted via `psql` afterward; the dev server on port 3005 was stopped once verification finished.
- **Deployed to `stage.firsthing.earth` (2026-08-06)** — the box (`zenovaa`) had fallen behind: git working tree was already at the latest `newUI` commit (`2b96831`, unclear how — possibly auto-synced), but the running pm2 process was 21h stale and its Postgres (`firsthing_prod`) was missing the two most recent migrations (`20260805175119_add_admin_users`, `20260806000001_add_invoice_issue_date`). Took a `pg_dump` backup first, then `pnpm install --frozen-lockfile` → `prisma migrate deploy` → `prisma generate` → `pnpm build` → `pm2 restart`. The admin-table-split migration's data-copy step ran for real against live staging data this time (not seed data): both existing admin logins (`admin@firsthing.local`, `yogesh@firsthing.earth`) correctly moved from `profiles` into `admin_users` with full permissions, confirmed via direct `psql` query, and `profiles.role = 'admin'` now correctly errors there too. The process crash-looped twice immediately after restart (`pm2` `restart_time` went to 2) — logs showed stale "Server Reference ID did not match" errors and one `ENOENT` on `.next/server/pages/500.html`, consistent with the old pm2-managed process still serving requests against a `.next/` directory that `pnpm build` was overwriting mid-request, not a code defect; it self-stabilized within ~15s and stayed stable. Verified for real afterward: logged into `https://stage.firsthing.earth` as `yogesh@firsthing.earth`, confirmed `/admin/documents` renders with live data, and all 7 admin routes (`documents`, `documents/new`, `users`, `societies`, `tanks`, `invoices`, `reports`, `inspection-reports`) return 200 with zero console/page errors.

## Current Blockers

- The remaining Supabase-backed files (`inspection/*`, `inspection-reports/*`, `energy-chart.tsx`, `FileUploader.tsx`) still depend on the Supabase project referenced by `NEXT_PUBLIC_SUPABASE_URL` — that project's RLS is off (confirmed live: its anon key reads `profiles`/`invoices`/etc. with no session at all), a real, separate security issue worth flagging to whoever owns that project.
- No decision yet on the *production* Postgres/hosting target for `firsthing.earth` itself (currently local Docker for dev only). A separate staging Postgres (`firsthing_prod` on `zenovaa`) now exists for `stage.firsthing.earth` — see Current Repository State — but that's explicitly a staging box, not a production hosting decision.
- Resolved (2026-08-05): S3 is fully live — bucket `firsthing` (`ap-south-1`, `Documents/` root prefix), public-read policy + CORS + scoped IAM user all provisioned by the user and confirmed working via a real upload+public-fetch test.
- One leftover test object in the live bucket needs manual cleanup (the app's own IAM credentials can't delete it, by design): `Documents/ASF_Insignia_Gurugram/2026-08/Invoices/ASF_Insignia_Gurugram_Invoice_2026-08_TEST-001.pdf`.
- 5 of the 8 planned document types (meter readings, pre/post-demo reports, legal agreements, gate passes) have a naming convention defined but **no upload UI or schema yet** — only invoices, savings reports, and inspection reports are actually wired up.
- The CSV meter-reading upload/validation pipeline the user described (period selection, ±5% benchmark variance flagging, review/ignore workflow, auto-generating the monthly savings report image) is **fully unbuilt** — explicitly deferred as a separate, substantial feature, not attempted alongside the naming-convention work.
- Resolved (2026-08-05): the Postgres container naming/recreation blocker is done — `firsthing-postgres` is up under the correct name, migrated, and seeded.

## Last Completed Work

Built and shipped a unified admin "Documents" area: `/admin/documents` (a filterable/sortable list merging invoices, savings reports, and inspection reports via a live query — no new schema) and `/admin/documents/new` (an icon-tile document-type picker plus an upload form, AI-assisted for invoices, manual for the other two, with 5 more planned types shown as disabled "Coming soon"). Went through two rounds of user feedback in the same session: first split from one combined page into the list+`/new` two-route pattern used elsewhere in this app, then visually redesigned (icon tiles, a drag-and-drop `FileDropzone`, tone-colored explainer banners, colored row accents in the listing) after the first version was flagged as "very ordinary looking." Runtime-verified end to end including a real AI-extracted invoice save, with zero regressions on the 5 pre-existing admin pages it sits alongside.

Before that: Phase 5 (S3 file storage) went **runtime-verified against the real bucket** — the user provisioned the bucket/CORS/policy/IAM user themselves, provided credentials, and a real invoice upload was driven through the actual admin UI: presigned PUT to S3 (200), then a genuinely public unauthenticated GET of the resulting object (200), confirming the whole chain (auth-gated presign → direct browser upload → public read) works end to end. Alongside this, the user specified a full document-naming/folder convention (society → month → doc type, `Documents/{Society}/{YYYY-MM}/{DocType}/...`, month always an explicit user selection never inferred) which is now implemented (`src/lib/document-keys.ts`) and wired into all 3 existing upload flows (invoices, savings reports, inspection reports) — `invoiceMonth`/`reportMonth` moved from loose free text to `<input type="month">` as part of this, with a formatting helper (`src/lib/format-month.ts`) keeping existing display sites showing a friendly label. Also added AI-assisted invoice field extraction via Gemini (`src/lib/gemini.ts`), society fuzzy-matching with a quick-create flow, and pre-upload duplicate detection. Before that: split admin logins into their own `AdminUser` table with a named-permission system and built out `/admin/users` into a real two-tab, permission-gated screen (runtime-verified); stood up a staging deployment at `https://stage.firsthing.earth` on `zenovaa`.

## Next Actions

Manually delete the leftover test object in the live bucket (see Current Blockers) — the app's own IAM user can't do this itself (`PutObject`-only, by design).

5 of the 8 planned document types described by the user (meter readings, pre/post-demo reports, legal agreements, gate passes) have **no upload UI or DB schema yet** — only the naming convention is defined for them. Building any of these means designing the schema + a Server Action + a form from scratch, following the pattern in `src/app/admin/invoices/` (or `reports/`) as a template, and passing `society`/`month`/`docType`/`dateLabel` into the existing `FileUploader` exactly as those three do.

The CSV meter-reading upload/processing pipeline the user described — upload a CSV, pick a period + which month it's for, aggregate per-day readings, validate against a per-circuit benchmark (lights × wattage × hours, weighted against prior averages), flag days varying more than ±5%, let the user review/ignore flagged readings, then auto-generate the monthly savings report image — is a **substantial separate feature, fully unbuilt**, explicitly deferred by the user pending the storage convention being settled first. Needs its own design pass (a new schema for raw meter-reading rows, the benchmark/variance calculation logic, a multi-step review UI, and whatever renders the savings-report image) before implementation.

**Open decision, not yet made**: which design_handoff screen to redesign next — the Society Manager dashboard (currently a bare placeholder, no design applied at all), the Inspector's "My tasks" screen (still Supabase-backed, Phase 4 not started, so would mean doing the Prisma port and the redesign together), or further fleshing out the customer dashboard. Needs the user's prioritization call — not picked unilaterally. Whichever is picked, research that specific screen's actual prototype content first (per the IA-mismatch finding above) before assuming it's a simple restyle.

Full Supabase cutover plan (2026-08-05), phases 4-6 in this order, Phase 7 deliberately last:

- **Phase 4 — inspection module** (`inspection/page.tsx`, `inspection/new`, `inspection/history`, plus the shared `inspection-reports/page.tsx` + `[id]/page.tsx` viewer). Fixes along the way: `inspection/new`'s two unguarded sequential inserts become one `db.$transaction`; `inspection/page.tsx`'s 4 round-trip queries collapse to one aggregate query; `inspection-reports/[id]/page.tsx`'s unauthorized-viewer `alert()` gets an actual `return` after it (currently falls through and renders anyway — a real access-control bug, not to be carried forward).
- **Phase 5 — S3 storage: code-complete, blocked on AWS provisioning** — see the immediate action above.
- **Phase 6 — `energy-chart.tsx`'s Supabase Realtime → polling**, same pattern as `water-tanks`' existing `setInterval` poll; also fixes its `society_name`-string scoping (inconsistent with every other page's `societyId`).
- **Phase 7 — one-time data copy from the legacy Supabase project**, table by table, explicit confirmation before each run. Decision (2026-08-05): stays last, after Phases 2-6 are built and verified against seed data — lower blast radius against real customer data. Consider enriching `prisma/seed.ts` with a few extra synthetic societies/tanks/invoices along the way so list/empty-state UI paths get exercised before real data lands. **Blocked on the user supplying the legacy Supabase project's direct Postgres connection credentials** (`.env.local` today only has the anon key, which can't do a bulk table copy).
