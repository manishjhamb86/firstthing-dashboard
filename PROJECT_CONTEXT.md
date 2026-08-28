# FirsThing Dashboard Project Context

## Last Updated

2026-08-28

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

## MS-05 done (2026-08-14) — demo report, KYC, offer, agreement, contract: the deal becomes something a society signs

**All 7 features built** (`docs/backlog.yaml` MS-05 → `done`): FEAT-020 (demo savings report),
FEAT-024 (KYC checklist & follow-ups), FEAT-026 (document entry & verification), FEAT-027 (offer
generation), FEAT-028 (accept/counter/reject), FEAT-029 (agreement preparation through execution),
FEAT-062 (contract record & versioned terms). All three exit criteria met and verified live. This
is the milestone where the deal stops being internal: the society sees its own demo report, accepts
its own offer, and a `Contract` exists for MS-06+ to bill against.

**Three decisions were put to the user rather than taken unilaterally**, because each changed the
work materially:
1. **Document storage** — the archived S3 presigned-PUT pipeline was portable (creds and SDK still
   present), but that bucket is **public-read**, and KYC documents (GST certificates, electricity
   bills) plus executed agreements are materially more sensitive than the invoices that policy was
   set for; the key convention also makes URLs fairly guessable, and SPIKE-02 (India DPDP review)
   is still open. Offered private-objects-plus-presigned-GET as the recommendation. **User chose
   public-read, same as the archived app** — recorded here as their explicit call with the residual
   risk stated, not as drift. Mitigation actually taken: the DB stores the **S3 key**, never a URL
   (which is also what `09-architecture.md` §5.2's own `Document` sketch specifies), so flipping the
   bucket to private later is a change to `publicS3Url()` and a read path — not a data migration.
2. **MS-05's first exit criterion contradicted its own feature set** — it requires the society to
   see the demo report in its portal, but FEAT-020-AC-4 defers portal visibility to FEAT-022, which
   is **R1**. As scoped, the milestone could not meet its own exit criterion. User chose to add the
   minimum to R0: a new **FEAT-020-AC-6**, a `draft → shared` state flip, recorded in
   `docs/backlog.yaml` (with a `scope_note`) and `docs/product/03-features.md` per AGENTS.md's
   "scope changes go through the blueprint documents" rule. FEAT-022 is untouched and still owns
   R1's delivery tracking.
3. **The printable agreement** (FEAT-029-AC-1) is a **print-styled HTML route**, not a generated
   PDF — user's choice. It renders straight from the accepted offer, so the paper and the record
   cannot disagree, which matters more here than the file format. `globals.css` gained an
   `@media print` block forcing white/black and dropping the shell chrome, since paper has no theme.

**Schema** (migration `20260814152505_add_ms05_demo_kyc_offer_agreement_contract`, 46 statements,
**purely additive** — no destructive enum edit this time, unlike MS-04's `CircuitState` expansion).
Shapes follow `09-architecture.md` §5.2's own `Offer`/`Contract`/`Document` sketches, extended only
where an AC needed a field the sketch didn't carry. **One deliberate departure, and why**: the
sketch's single `Document` row per type cannot express FEAT-026-AC-5 (the same document arriving
twice by different routes, one verified, the other *retained* rather than discarded), so it is split
into `KycRequirement` (the checklist item, one per pipeline+type) and `KycDocumentFile` (the things
actually received, many per item), with `KycFollowUp` as a row-per-chase rather than an integer
counter — CON-23's lead-health signal is unauditable if it's a bare number. `PipelineStage` grew
`demo_reported`/`offered`/`agreed`, names taken from `04-flows-system-map.md`'s own Pipeline state
table, and only the stages a built feature actually sets — same milestone-by-milestone growth rule
as `CircuitState`.

**Versioned-not-mutated, applied three more times** (ADR-005, the same rule as `BenchmarkRescaleEvent`):
a regenerated demo report is a **new version** and the shared one still stands as what the society
was shown (FEAT-020-AC-5); a counter-offer is a **new version** with the issued one retrievable
exactly as issued (FEAT-028-AC-5); and `ContractTermVersion` carries effective-dated terms so an
amendment applies forward only and a prior month stays computed against the version in force at the
time (FEAT-062-AC-5). Nothing in this milestone edits an issued commercial document in place.

**The revenue-share split is party-named everywhere it appears** — `projectedMonthlyFee()`'s
parameter is `societyRevenueSharePct`, and the UI, the printed agreement and the contract record all
read "58% society / 42% FirsThing" rather than a bare percentage. This project has now shipped that
exact inversion **twice** (nine places in a mockup deck; the Phase 9 `TC-048-1` unit test), and both
times the number alone looked right. The unit test asserts the party too:
`expect(fee).toBe(10_080); expect(fee).not.toBe(13_920);`.

**32 new Vitest cases** (`tests/demo-report.test.ts`, `tests/offer.test.ts`; suite now **56 across 4
files**) covering CON-11's per-circuit extrapolation (70 kWh × 200/50 = 280, each circuit by its own
factor and never a society-wide average), a no-rounding assertion to 10 places, every named
generation blocker (FEAT-020-AC-3), CON-20's 60–80% bound on a negotiated benchmark, and all of
GATE-04's refusal branches.

**Verified end to end in a browser** (Playwright/system Chrome — 41 checks across 3 scripts, zero
console errors, zero page errors), walking one deal from a confirmed benchmark to an active
contract: report generated at exactly 70.00% with the CON-11 extrapolation and both windows' daily
readings; **the society could not see the draft**, then saw it the moment it was shared; a KYC
document uploaded through a **real presigned PUT to the live bucket**, recorded with its WhatsApp
channel and verified; the electricity bill marked not-applicable with a reason; an offer generated,
priced at **₹28,224/month** (280 kWh × 30 × ₹8 × 42%), issued, and accepted **by the society's own
office-bearer in its own portal**; the agreement prepared, printed/notarized/signed as three
separately-stamped steps, the executed scan uploaded, and the contract activated with a v1 term set
carrying the per-circuit benchmark table. Both S3 objects were then fetched with an **unauthenticated
`curl` — 200** — confirming the presign → PUT → public-read chain works exactly as the archived app's.

**GATE-04 was verified genuinely server-side, not by the control being absent.** MS-05's exit
criterion says acceptance is *refused server-side* for a non-office-bearer, and the obvious test —
"the committee member isn't offered the button" — proves nothing about the server, exactly the trap
FEAT-041's AC-3 fell into earlier this session. Tested instead through a path the client cannot
pre-block: signed in as the office-bearer so the control genuinely rendered, revoked the authority
in Postgres **with the page still open**, then clicked. The server refused with GATE-04's own
message, wrote nothing, and emitted `gate04.binding_act_refused` with `actorRole: "committee"` —
the log line being the proof the action actually ran. This doubles as a live demonstration of the
DB-resolved-authority fix made earlier today.

**Three harness bugs, no app bugs, worth recording since two are recurring shapes**: a page
assertion read before the RSC revalidation landed (the row *was* written — confirmed by the next
check passing and by direct `psql`); `psql -t -A` prints booleans as `t`/`f`, not `true`/`false`,
which broke the same assertion twice; and `integer||integer` is not string concatenation in Postgres
(use `concat()`). None of these were app defects, and each was confirmed against the database rather
than assumed.

**Two test objects now sit in the live S3 bucket** and **cannot be deleted by this app's own
credentials** — the IAM user is deliberately `PutObject`-only, which is correct and was confirmed
by testing back in 2026-08-05. They need manual cleanup (see Current Blockers):
`Documents/Palmwood_Enclave/2026-08/KYC/Palmwood_Enclave_GSTCertificate_2026-08.pdf` and
`Documents/Palmwood_Enclave/2026-08/Agreements/Palmwood_Enclave_Agreement_2026-08.pdf`. All database
fixtures (both societies and everything cascading from them) were removed afterward, confirmed by
count query; nothing pre-existing was touched.

`tsc`/`lint`/`build`/`vitest` all clean; 5 new routes. Backlog validator: **16 errors / 263
warnings**, unchanged documented baseline.

**Deployed to `stage.firsthing.earth` (2026-08-14, commit `f0c54ad`)** — same rsync convention as
every prior deploy. Migration `20260814152505_add_ms05_demo_kyc_offer_agreement_contract` applied
via `prisma migrate deploy`, backed up first to
`/tmp/firsthing_blueprint_pre_ms05_20260814_161816.sql` on the box (41,534 bytes with a real dump
header — the size was checked, per the 0-byte lesson from the FEAT-041 deploy; note also that
`pg_dump` rejects Prisma's `?schema=public` query string, so the URL needs it stripped). Both pm2
processes restarted with `--update-env`, the worker included because it shares the generated Prisma
client. Verified over the public HTTPS path logged in as a real account: all 5 pre-existing admin
routes plus all 4 new MS-05 routes return 200 with **zero console errors and zero page errors** —
and each of those 200s is itself the meaningful check, since every one of them queries a table this
migration created. All 8 new tables confirmed present by direct `psql`. ADR-006's self-rescheduling
chain survived the restart unbroken: the worker correctly did not re-seed (one was already pending)
and the 5-minute cadence runs straight through 16:08 → 16:13 → 16:18 → 16:23. `unstable restarts: 0`
on both processes, dashboard error log empty.

**One real gap found by the deploy, not yet closed — S3 uploads cannot work on stage.** The box has
no `AWS_REGION`/`AWS_S3_BUCKET`/`AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` at all, in either `.env`
or `.env.local`; the archived checkout still sitting alongside it (`firsthing-dashboard-newui-
archived-20260814`) doesn't have them either, so the archived app's S3 work was only ever configured
on the local dev machine and this is a pre-existing hole MS-05 is simply the first thing to actually
depend on. Consequence is bounded and not a crash: every page renders and every non-upload action
works, but `getUploadUrl` will throw when it tries to presign with an undefined region, so the two
upload surfaces (a KYC document file, the executed agreement scan) fail on stage. **Deliberately not
fixed unilaterally** — the fix is copying a live IAM credential onto a server, which is the user's
call to make, not a mechanical deploy step. Everything else in MS-05 is exercisable on stage today,
including the out-of-band KYC entry path that exists precisely so a document can be recorded without
a file.

## MS-06 done (2026-08-14) — full installation execution: the crew, the gate, and the day billing starts

**All 5 features built** (`docs/backlog.yaml` MS-06 flipped `proposed` → `done`): FEAT-033
(project setup & batch plan), FEAT-034 (daily batch logging), FEAT-035 (the society's daily review
gate), FEAT-036 (blockers & requirement changes), FEAT-037 (completion certificate & billing
start). All three exit criteria met and verified against real rows, not asserted.

**The two rules that carry money here are pure functions with their own tests**, same convention as
`benchmark-rescale.ts` and `offer.ts`:
- `src/lib/installation-gate.ts` — CON-21's 3-hour rule, counted back from the crew's *stored*
  planned start time rather than an assumed 09:00 day, plus FEAT-037's completion gate.
- `src/lib/billing-start.ts` — CON-22's two off-by-ones, which point in opposite directions and
  each cost real money: billing starts the day *after* signing, and the first month covers the
  *actual remaining days* of that calendar month. All arithmetic is UTC, because every calendar day
  in this schema is stored at UTC midnight and a local `getDate()` would shift a month-boundary
  signature into the wrong month for everyone this product serves.
- `src/lib/onlooker.ts` — who may approve a batch (below).

**41 new Vitest cases** (`tests/installation-gate.test.ts`, `billing-start.test.ts`,
`onlooker.test.ts`; suite now **97 across 7 files**), including SCR-064's own worked example
asserted to the day (sign 20 Aug → billing starts 21 Aug → 11 of 31 days), a signature on the last
day of a month producing a *full* first month rather than a special case, February in a leap year,
and a deliberate no-rounding assertion on the prorated figure.

**Three design decisions worth keeping:**

1. **Batch approval is the named onlooker's act, not GATE-04's.** A binding act (accepting an
   offer, transferring the office-bearer designation) requires office-bearer authority; approving a
   day requires *being named the onlooker*, whichever of the three portal roles that person holds.
   `05-screens/03-society-portal.md` SCR-062 lists the permission as "office-bearer, committee, or
   manager" and FEAT-035-AC-4 says only the named onlooker satisfies the gate — these look
   contradictory and are not, and the reconciliation is now recorded in `03-features.md` and
   `backlog.yaml` rather than left as a silent implementation choice. Getting it wrong in either
   direction has a real cost: requiring office-bearer authority hands a hard daily deadline to the
   person least likely to be on site, and accepting any society account means the gate is satisfied
   by someone who never agreed to watch the work.

2. **A late approval clears the block but never reports as "clear."** CON-21's wording alone does
   not settle what happens when approval lands after the deadline. SCR-062's own "missed" state
   offers "approve now" as the recovery, so a late approval unblocks the day — but
   `evaluateDayGate` returns `late_approved`, not `clear`. If a missed gate silently read as met,
   the once-per-project skip allowance would be the only surviving trace that anything went wrong.
   A dispute, by contrast, blocks regardless of timing: starting the next day on top of contested
   work is exactly what FLOW-07 step 3 exists to prevent.

3. **CON-44/ADR-007's area-claim model is built now, on the easy case, on purpose.** Starting a day
   creates a `FieldVisit` with a participant roster and an advisory `FieldVisitAreaClaim` — verified
   live, not just modelled. Installation is CON-44's *uncontested* case by construction (batches are
   area-scoped at creation, per CON-44's own note on SCR-061), so nothing here can collide. The
   contested path and the submission block are written anyway, because the survey case — which
   genuinely negotiates its partition on site — is the harder client of the same tables and should
   not have to introduce them later. `@@unique([fieldVisitId, areaKey, claimedById])` is per
   *claimant* deliberately: two claims on one area coexist and the area goes contested, which is the
   whole point of an advisory claim that a lock could not express offline.

**A real gap in the blueprint, found by walking the flow rather than by reading it, and closed
through the docs per `AGENTS.md`**: FEAT-035 lets the society dispute a day, and FEAT-037-AC-3
refuses completion while any batch is disputed — but nothing in either feature returned a disputed
batch to a workable state. One dispute made a project **permanently uncompletable**, which is not
what "tomorrow blocked pending resolution" means. Closed with **FEAT-035-AC-6** (new, recorded in
`03-features.md` and `backlog.yaml` with its reasoning): the field team reopens the batch for
rework and the redone work goes back to the society. Deliberately *not* an ops override that marks
the day approved — the society's approval is the only thing CON-21's gate accepts, and an override
would quietly make the gate advisory.

**A count discrepancy has no write path to a billable figure, by construction.**
`InstallationBlocker.discoveredLightCount` records what was found on site and nothing anywhere
applies it: `resolveBlocker` refuses that type outright, `waiveBlocker` refuses it too, and the
screen states the consequence in lights against the contracted count before offering anything.
FLOW-07 step 4's two legitimate paths (a contract amendment, or the contract's own rescale clause —
FEAT-041/INV-07) each write their own audit row. This is the same shape as the FEAT-040 hole closed
at MS-04: the guard belongs on the path nobody is looking at.

**Scope honestly stated**: batch capture and blocker-raising are built on SUR-01 (admin), gated to
`manage_survey`, not on SUR-02 (the field client) — that surface, with ADR-002's IndexedDB offline
outbox, is not built on this branch at all. Same framing as MS-04's commissioning readings. The
`FieldVisit`/claim rows the gate depends on are real either way, so SUR-02 becomes a second client
of the same tables rather than a rewrite.

**Verified end to end in a browser (Playwright/system Chrome), 51/51 checks, zero console errors,
zero page errors** — one project walked start to finish: a plan refused for not reconciling to the
contracted scope (95 vs 100, nothing written), refused again for having no named onlooker, then
published; day 1 started, refused for missing photos, submitted with a real S3 upload, approved by
the society, unblocking day 2; day 2 submitted and then **disputed with photo + location evidence**,
blocking day 3; the once-per-project skip spent on day 3 and a second attempt refused; a count
discrepancy raised, shown with its consequence, and refused closure; day 2 reopened, redone,
approved; and the certificate signed for 20 Aug producing `billing_start_date 2026-08-21`,
`prorated_days 11`, `days_in_month 31` — confirmed by direct `psql`, with the pipeline reaching
`active_billing`.

**Four gates were checked through paths the client genuinely does not pre-block**, following the
rule this repo wrote down at MS-04 (*a client-side `disabled` bypass is not a server-side test*):
the missing-onlooker refusal (the `required` attribute removed so the submit actually reaches the
action); the missing-photo refusal (the client-side pre-check was **deleted** for this reason — the
rule now lives in exactly one place, the server, so it can never be verified only against the
browser); the non-onlooker approval (the authority reassigned in Postgres with the page still open,
so the click reached the action — it refused, wrote nothing, and logged
`installation.batch_review_refused`); and the second gate-skip (the allowance spent behind the open
form, so the submit hit a server that had already used it).

**Three test-harness findings, all costing real debugging time, none of them product bugs:**
- **A fixed sleep after an upload is not a wait.** The first full run failed the batch-submit check
  because the S3 PUT to `ap-south-1` outlasted a 6-second guess; the upload had in fact succeeded.
  Replaced every post-action sleep with a poll on the database's own state, and the upload step with
  a retry — the assertion is still the row, never the click.
- **`.lbl` uppercases and `innerText` returns rendered text** — the same casing trap already recorded
  once in this file caught an assertion again. Match case-insensitively.
- **A `fill()` that lands before hydration is silently discarded** — the certificate date fell back
  to today's default and the proration assertion failed against arithmetic that was actually
  correct. The fix is the same one already used for login: assert the input holds the value before
  acting on it.

**One real accessibility gap fixed rather than worked around**: `Field` has always accepted
`htmlFor`, but almost no caller passed it, so the labels were not programmatically associated with
their controls. That is what made the test selectors fragile in the first place. Every MS-06 form
control now carries a real `id`/`htmlFor` pair.

**Two leftover S3 objects prefixes** from this verification, under
`Documents/Northwood_Grove/2026-08/Installation/` — the app's own IAM user is `PutObject`-only by
design and cannot remove them (see Current Blockers). All database fixtures (`ms06-*` society and
everything cascading from it, plus the two `@ms06.test` profiles and the field visits) were removed
afterward, confirmed by count query: only the 4 pre-existing societies and 4 pre-existing profiles
remain.

`tsc`/`lint`/`build`/`vitest` all clean; 25 routes. Migration
`20260814163021_add_ms06_installation_execution` is additive apart from two new `PipelineStage`
values (`installation`, `active_billing`).

**Deployed to `stage.firsthing.earth` (2026-08-14, commit `67dd14d`)** — backup taken first to
`/tmp/firsthing_blueprint_pre_ms06_20260814_173218.sql` (65,210 bytes, size checked not just the
exit code), migration applied via `prisma migrate deploy`, both pm2 processes restarted with
`--update-env`. Verified over the public HTTPS path logged in as a real account: all 5 pre-existing
admin routes plus all 6 pipeline sub-routes return 200 — including `/installation`, whose 200 is
the meaningful check since it queries nine tables this migration created — with zero console errors
and zero page errors. All 9 tables confirmed present by direct `psql`. ADR-006's self-rescheduling
job chain ran straight through the restart at its usual 5-minute cadence (17:29 → 17:34 → 17:39),
`unstable restarts: 0` on both processes, pm2 error log clean. **Uploads still cannot work on
stage** — the AWS credential gap recorded in Current Blockers now covers batch photos and dispute
evidence too, which is the more visible half of it: an onlooker on stage can approve a day but not
dispute one, since a dispute requires a photo by design.

## Stage credentials: S3 + Gemini copied to `zenovaa`, uploads verified live (2026-08-14)

**The AWS-credential gap the MS-05 deploy found is closed** — the user supplied the keys and chose
to have them copied. `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
and `GEMINI_API_KEY` (the last not needed until MS-07's CSV ingest, copied now to save a second
trip) were appended to `/zenovaa/code/firsthing-dashboard/.env.local` by **piping the matching lines
straight from the local `.env.local` into `ssh … 'cat >> …'`** — the values never passed through a
printed command, a transcript, or a tracked file. The previous file was backed up first
(`.env.local.bak-20260814_180954`). Both pm2 processes were restarted with `--update-env`, the
worker included because it shares the generated Prisma client.

**Two things worth carrying forward:**
- **A `grep -oE '^[A-Z_]+='` audit of an env file silently misses `AWS_S3_BUCKET`** — the character
  class has no digits. This is what made an earlier pass conclude the bucket name was absent locally
  when it was sitting in the same file. Use `[A-Z0-9_]+`.
- **A signed request that is *denied* still proves the credentials are real.** The IAM user is
  `PutObject`-only by design, so a `ListObjectsV2` from the box returning `AccessDenied` (rather
  than `InvalidAccessKeyId`/`SignatureDoesNotMatch`) authenticates the identity without writing
  anything to the bucket. Useful whenever credentials need checking on a box and every write leaves
  an object this app cannot delete.

**Verified through the running app, not just from the box.** The write-free probe plus a direct
presign → PUT → public GET confirmed the chain works from `zenovaa`, but that only proves the
*machine* has the credentials — Next.js loads `.env.local` into `process.env` at runtime, so the
only real test is a presign through the app itself. Driven over the public HTTPS path
(Playwright/system Chrome, 6/6, zero console errors, zero page errors): logged in as a real account,
uploaded a KYC document on the live stage pipeline, and the file row landed — the assertion being
the rendered row and then the S3 key read straight out of `firsthing_blueprint`, not the click.
The resulting object fetched **200 with an unauthenticated `curl`**, confirming the public-read
policy end to end from stage. The `KycRequirement`/`KycDocumentFile` rows were deleted afterward
(all three KYC tables back to 0); the two S3 objects can't be, and are listed in Current Blockers.
ADR-006's job chain ran unbroken through the restart at its 5-minute cadence
(17:59 → 18:04 → 18:09 → 18:14 → 18:19), with no duplicate seed and `unstable restarts: 0`.

**Not done, and deliberately not done unilaterally**: rotating `AUTH_SECRET`, which the same
investigation found is shared with the archived app and has been exposed — see Current Blockers.
Rotating it signs every stage session out, so it is the user's call to make, not a mechanical step.

## MS-07 done (2026-08-14/15) — reading ingest: a vendor's export becomes evidence a bill can rest on

**All 5 features built** (`docs/backlog.yaml` MS-07 → `done`): FEAT-043 (meter CSV upload &
AI-assisted normalisation), FEAT-044 (clarify-and-confirm the mapping), FEAT-045 (upload-time
anomaly detection), FEAT-046 (aggregation & missing-day handling), FEAT-047 (raw-file retention &
provenance). Both exit criteria met and verified against real rows, real Gemini calls and real S3
objects. This is the milestone where CON-30's pipeline — the thing the archived app's "Next
Actions" listed as *"fully unbuilt… needs its own design pass"* since 2026-08-05 — actually exists.

**Two decisions were put to the user rather than taken unilaterally:**
1. **Raw vendor files are stored private, under their own `Ingest/` prefix** — user chose "scope the
   policy, store raw files private" over reusing the public-read `Documents/` tree. A meter export
   is a month of a society's consumption at hourly resolution, which is a different sensitivity
   class from the invoices that policy was set for, and FEAT-047-AC-4 says outright that raw files
   are not exposed to a non-internal actor. Reads go through a short-lived presigned GET minted by
   a gated Server Action. **This needs one AWS change the user still has to make** — see Current
   Blockers; until the bucket policy is narrowed the prefix is private by convention only.
2. **The anomaly threshold is ±5%** — typed by the user directly, tighter than any of the three
   options offered, and matching the spec they originally gave for this pipeline. Recorded in
   `03-features.md` FEAT-045 and `backlog.yaml`, per AGENTS.md's "scope changes go through the
   blueprint documents" rule, **with the distinction that makes it safe**: this is a platform
   constant and deliberately *not* CON-01a's per-contract tolerance band. The two answer different
   questions — is this *day's reading* believable, versus does this *month* comply with the
   contracted benchmark — and wiring them together would make a ±10% contract stop flagging
   implausible days while turning every future tuning of a data-quality rule into a commercial
   renegotiation. FEAT-045's own risk line ("threshold tuning is the whole game here") left the
   number open; it now lives in one named constant, `ANOMALY_TOLERANCE_PCT`.

**Where the AI boundary sits, and why it sits there.** `src/lib/gemini.ts` (ported fresh into this
`src/`, not lifted from `archive/`) exposes one function: `inferStructure()` proposes a *mapping* —
delimiter, header row, which column is the date/time/value, the unit, whether the value column is
interval consumption or a cumulative register. It never sees a number that reaches the database.
All the arithmetic is in `src/lib/reading-normalize.ts`, pure and deterministic, so normalisation
replays from the raw file plus the stored mapping alone. Two reasons, both load-bearing: volume (a
circuit-month is ~720 hourly rows, and R0's own scale assumption is 800+ circuits — asking a model
to transcribe that is neither affordable nor checkable), and INV-02, which needs a figure to trace
to something reproducible rather than to a one-off model response. The model is sent a head+tail
sample, not the file. `mappingOverridden` records whether the operator accepted the proposal or
changed it, so a systematically bad inference is visible in the data rather than inferred from
complaints.

**The prompt refuses to guess.** It is told not to choose between DD/MM and MM/DD without evidence
in the sample (a file whose days never exceed 12 is genuinely ambiguous, and it asks), and it is
told explicitly that a cumulative register read as interval consumption is the costliest available
mistake — it produces a monthly total roughly a thousand times too large, and it looks like a
plausible number in a column of plausible numbers. `timeColumn` uses `-1` rather than null for
"none", because a nullable integer is the field most likely to come back as the string `"null"`.

**Three pure modules, 48 new Vitest cases** (suite now **145 across 10 files**, was 97/7):
`reading-normalize.ts` (mapping application, hourly→daily, unit conversion, cumulative
differencing, a ≥95% parse-rate floor before a mapping is accepted), `reading-anomaly.ts` (the four
detectors), `reading-coverage.ts` (CON-12's floor and the monthly figure). Assertions that matter:
1234.5 Wh is 1.2345 kWh to ten places (rounding here lands in a rupee figure — INV-02); a blank
cell is unreadable, never a zero, because zeros are a separately-detected anomaly and manufacturing
one would fabricate evidence of a meter fault; `2026-02-31` is rejected rather than rolled into
March, which `Date.UTC` would do silently; a backwards register step is dropped rather than becoming
negative consumption; and a month at 25 of 31 days averages 40 kWh, not 32 — dividing by the
calendar rather than by the days that reported understates the daily figure by exactly the shape of
the gap.

**Design decisions worth keeping:**
- **The period is the operator's selection, and rows outside it are counted and dropped** (INV-04 /
  CON-25). A vendor export spanning a month boundary is normal; importing the overhang would put
  readings into a month nobody chose, possibly a closed one.
- **The anomaly reference is the median of non-zero days.** A dead meter's run of zeros would
  otherwise drag the reference down until the *working* days started looking like the anomalies.
- **`missing_days` is informational, not blocking.** CON-12's coverage floor is the real gate; a
  second blocking flag over the same fact would just train the operator to dismiss flags.
- **The bytes reach S3 before anything interprets them** (CON-30's dual storage). If normalisation,
  Gemini or the commit falls over, the evidence is already safe.
- **Supersession, not overwrite** (ADR-005): a replaced day keeps `supersededValue`, when, and by
  whom; the replaced *file* stays in the history with a link to what replaced it.

**Two real bugs found by the end-to-end pass, neither by inspection, both fixed:**
1. **A non-ISO date cell carrying its time inline** (`01/07/2026 00:00`, a real second-vendor shape)
   made *every* row of the file unparseable — only the ISO branch extracted a time. Caught because
   the second fixture used a different vendor's shape on purpose. Fixed in `parseTimestamp` with a
   unit test.
2. **A replaced month silently under-reported by exactly the days that had been excluded.** An
   operator excludes a dead-meter day, uploads a corrected file, and the corrected day is still
   suppressed — coverage read 30/31 and the month came out 900 kWh instead of 930. The exclusion
   was a judgment about a number that no longer existed. Now a superseded value clears the
   exclusion and the stale anomaly flag, while the `ReadingAnomaly` row that recorded the decision
   stays, pointing at the superseded file — the decision is auditable, it just no longer suppresses
   a number it was never made about. **The general shape**: a resolution recorded against a value
   has to be re-examined when that value is replaced, and the place that forgets is the write path
   nobody is looking at while building the new one — the same class as the FEAT-040 hole closed at
   MS-04.

**A third defect, in how a refusal reported rather than in the refusal itself**: `getReadingUploadUrl`
*threw* on a failed permission check while every sibling action returns a typed error. The gate was
right and nothing was written, but the browser got a bare 500 — and in a production build Next
replaces a thrown Server Action's message with an opaque digest, so the operator on stage would
have been told nothing at all. Found by revoking the permission mid-session and watching the
refusal arrive as a 500 in the console. Now returns `{ error }` like the rest.

**Also fixed while verifying FEAT-047-AC-3**: presigning is a local signature computation that
contacts S3 for nothing, so signing an object that no longer exists "succeeds" and the operator
gets a link that opens an XML error page. The degraded case was unreachable in practice. A
`HeadObject` now runs before the URL is minted, so an untraceable file is *stated* — the readings
still display and the page says the chain is broken here.

**A prior conclusion corrected**: an earlier probe in this session concluded the app's IAM user
lacks `s3:GetObject`, because a GET of a nonexistent key returned `AccessDenied` rather than
`NoSuchKey`. That is wrong, and it is a documented S3 behaviour worth remembering — S3 returns
`AccessDenied` for a missing key when the caller lacks **`s3:ListBucket`**, which is a different
grant. Verified directly: `HeadObject` on a real raw file succeeds (16,394 bytes), on a missing one
returns 403. So **no second AWS change is needed** — presigned reads work today, and the only
outstanding request is narrowing the bucket policy.

**Verified end to end in a browser (Playwright/system Chrome) across two passes — 42/42 and 27/28,
zero console errors, zero page errors.** The single failing check is `FEAT-047-AC-4`: an
unauthenticated `curl` of a raw file still returns **200**, because the bucket policy is still
bucket-wide public-read. That is the pending AWS change, not a code defect, and the check is
deliberately left asserting the correct end state so it flips to passing the moment the policy is
narrowed. Two genuinely different vendor shapes were driven through the real Gemini API: the
hourly `date,time,consumption/kWh` sample (inferred correctly), and a semicolon-delimited
`Timestamp;Meter;Energy (Wh)` export with a trailing `TOTAL` row — where the model independently
got the delimiter, `DD/MM/YYYY` **from evidence in the sample**, `Wh` rather than kWh, and
`footerRowsToIgnore: 1`. Then: 696 hourly rows → 29 daily rows with 1.25 × 24 = 30.000 exactly;
all four detectors firing; accept / exclude / send-back / bulk-resolve each resolving the *right*
finding; a sent-back flag still counting as unresolved because it owes a corrected file; 937.5 Wh ×
24 = 22.5 kWh converted without rounding; and CON-12's floor refusing a 15-day month until an
explicit acceptance — recorded with an owner, a reason and the coverage it was accepting at —
after which the figure computes as 337.5 kWh from the days that exist.

**Four gates were checked through paths the client genuinely does not pre-block**, following this
repo's own rule that *a client-side `disabled` bypass is not a server-side test*:
- **The duplicate month** (FEAT-043-AC-5): committing a second file for the same circuit+period
  stops and requires a choice — neither replace nor discard is a default — and nothing is written
  while the choice is open. Both branches were then walked: discard keeps the existing 29 days and
  the discarded upload stays in the history; replace fills the month to 31, supersedes 45.60 → 30.00
  with the actor recorded, marks the prior file `superseded` with the link, clears the previous
  file's *open* flags while leaving its *resolved* decisions intact, and the history renders
  "Replaced by ms07-c.csv".
- **The PER-01 gate** (FEAT-043-AC-4): the permission was revoked in Postgres with the upload form
  open, then the button clicked — so the request genuinely reached the action. It refused by name
  ("Reading ingest is an operations lead action…"), wrote nothing, and the raw-file count was
  unchanged.
- **Abandon** (FEAT-044-AC-3): an unreadable file is abandoned with a reason and leaves no partial
  readings behind.
- **FEAT-045-AC-5's shared detector**: three steady commissioning days recorded as valid, then a
  +40% day auto-flagged as an anomaly by the *same* `detectAnomalies` the CSV path uses — with the
  detector's own words in the note — and CON-19's window correctly held until it is fixed. This is
  the AC's "the same detection feeds both paths rather than being duplicated", made literal.

Separately asserted: no page in the readings area ever renders an S3 URL into its HTML (checked by
regex over the served markup on all three routes), so a signed link is never a five-minute window
handed to anyone who can view source.

**R1 scope was reconciled, not silently absorbed**: SCR-080/081/082 describe bulk upload
(FEAT-099), a readiness board (FEAT-100) and vendor-API reconciliation (FEAT-107). All three are
R1 and stay out — same near-term-only discipline this blueprint has applied since Phase 5.

`next.config.ts` gained `serverActions.bodySizeLimit: "25mb"` — a circuit-month of hourly rows is
~15 KB but a year, or a coarser vendor's export, is not, and the alternative (parsing in the
browser and posting the result) would put the arithmetic INV-02 depends on outside the server.
**Worth remembering**: after changing `next.config.ts`, the Turbopack `.next` cache does not
invalidate — `/login` began 404ing until `rm -rf .next` and a dev-server restart. `tsc`/`lint`/
`build`/`vitest` all clean; 28 routes. Migration `20260814190428_add_ms07_reading_ingest` is purely
additive. Backlog validator: **16 errors / 263 warnings**, the same documented baseline
(AC count is now 555 with coverage 212/555, reflecting the ACs MS-05 and MS-06 added).

All `ms07-*` fixtures were removed afterward via `psql` — the Cypress Court society and everything
cascading from it — confirmed by count query: back to the 4 pre-existing societies, 4 profiles and
1 circuit, with `manage_survey` restored on the account the permission test revoked it from. The S3
objects under `Ingest/Cypress_Court/` cannot be deleted by this app's `PutObject`-only credentials
and are listed in Current Blockers.

## The job queue was forking its own recurring chain (2026-08-15) — found by the MS-07 deploy check

**Found by the routine post-deploy `jobs` query, not by anything looking for it**: stage had **three
concurrent `gatepass_sweep` chains**, each internally consistent at ADR-006's 5-minute cadence
(19:49:36 → 19:54:36 → 19:59:36, alongside 19:52:06 → 19:57:06 → 20:02:07, alongside
19:54:21 → 19:59:21). Every prior deploy in this file checked "did the chain survive the restart"
and correctly answered yes — the question nobody had asked was *how many chains there are*.

**Root cause: `findMany` then `update` is not a claim.** `tick()` read the due jobs and then flipped
each to `running` in a separate statement, so two processes reading the same pending row both
proceeded to run it — and because `runGatepassSweep()` creates its successor unconditionally, each
run spawned a link. Two runs of one job means two chains, permanently. The window is not
hypothetical: `pm2 restart` genuinely overlaps the outgoing and incoming worker for a moment, which
is precisely when both are polling. That matches the observed forks landing on restart boundaries.

**Fixed with the standard compare-and-set**: `claimJob()` issues a single
`updateMany({ where: { id, status: "pending" }, data: { status: "running" } })` and only proceeds on
`count === 1` — the loser matches zero rows and skips the job. `scheduleGatepassSweep()` is the
second line: it refuses to create a successor while one is already pending, and logs
`job.gatepass_sweep_duplicate_suppressed` rather than doing it silently.

**A second, opposite defect fixed in the same pass, found by reasoning about the first**: a job left
`running` by a process killed mid-run sat there forever. It never reached `done`, so it never
scheduled a successor — and it still looked scheduled to `ensureGatepassSweepScheduled`, so the
worker would never re-seed either. **A single unlucky kill would silently kill the sweep entirely**,
and nothing would report it. `reclaimStaleJobs()` now releases anything claimed more than 10 minutes
ago, on startup and on every tick, logging `job.reclaimed_stale`.

**Verified against the real database, three ways**, not by reading the diff:
- **Two workers, one due job, run concurrently** — exactly one successor exists afterward. Under the
  previous code this is the case that produced two.
- **The claim admits one winner** — the identical compare-and-set issued twice against one row
  returns `UPDATE 1` then `UPDATE 0`.
- **A job stranded in `running` with a 20-minute-old `updatedAt`** was reclaimed and processed
  (`job.reclaimed_stale` in the log, status `done`), and its reschedule correctly did *not* fork the
  chain — `job.gatepass_sweep_duplicate_suppressed` fired and the queue still held exactly one
  pending job.

**Why this mattered enough to fix now rather than note**: ADR-003's queue carries every time-driven
guarantee in the product, and `09-architecture.md`'s own risk register (RISK-04) already names it as
the closest thing this design has to a new single point of failure. `gatepass_sweep` is idempotent,
so the forks were harmless in themselves — but MS-08 reuses this queue for the CON-13 suspension
countdown, where a doubled run is a society suspended on a clock that ran twice as fast. The bug was
in the queue's recurring-job primitive, not in the sweep, so every future job type inherited it.

## A rescale entry can be corrected or voided (2026-08-15) — user-caught, and an INV-07 gap the append-only design had left open

**Found by the user looking at a real circuit's rescale history on stage**: it held obviously-wrong
test entries (`1500 → 50`, then `50 → 1500` producing a baseline of 731.40) and there was no way to
remove or fix any of them. The ask was "for admins there should be edit soft delete option."

**Why this was a real defect and not a convenience gap.** `BenchmarkRescaleEvent` was built at MS-04
as a strictly append-only log, deliberately, because `effectiveBaselineAt()` *replays* those rows to
decide the baseline a society is billed against. That design is right — but with no correction path
at all, one mistyped light count silently corrupts every figure dated after it, forever, and MS-08's
monthly calculation reads exactly that replay. An append-only log with no way to strike an entry is
not stricter, it just accumulates errors. The local dev database had the same problem independently
(`600 → 10000`, then `60 → 600` — a chain whose second entry doesn't even follow from the first).

**What was deliberately NOT built, and why** — the one part of the request that was answered
differently rather than silently narrowed, stated to the user at the time:
- **No edit-in-place.** Rewriting a stored entry restates a figure someone was already billed on,
  which is precisely what INV-02 and ADR-005's versioned-not-mutated rule exist to prevent.
- **No hard delete.** Removing the row erases the fact that a wrong baseline was ever in force —
  the thing a society would dispute.

**What was built instead**: `voidedAt`/`voidedById`/`voidReason`/`correctedByEventId` on the event,
and two actions. **Void** is the soft delete: the row stays, struck through, with its owner and
reason, and stops counting toward the replay. **Correct** is the edit the operator actually wants,
built the only way it can be safely — void the wrong entry and write the corrected one in a single
transaction, linked by `correctedByEventId`. The visible outcome is an edited entry; the record
underneath keeps both. Two details that matter: the corrected entry scales from the **same
"previous" state as the entry it replaces**, not from the wrong figure that entry produced, so a
mistake is undone rather than compounded; and the baseline is always recomputed by `rescaleBaseline`
— a correction is never an opportunity to type a baseline in by hand. `Circuit.meteredLightCount` is
re-derived from whichever entries survive, so voiding the newest one can't leave the count sitting
at a value no live event supports. `preInstallBaseline` is untouched throughout, as ever.

The filtering lives in one place — `liveEventsUpTo()` in `src/lib/benchmark-rescale.ts` — so both
`effectiveBaselineAt` and `effectiveLightCountAt` exclude voided entries by construction rather than
by each remembering to. A missing `voidedAt` reads as live, so nothing already stored changes
meaning.

**A second defect fixed in the same file, not part of the ask**: `recordLightCountChange`'s
permission gate used `requireAdminPermission`, which **throws** — so a PER-04 user hitting it got a
bare 500, and in a production build Next replaces a thrown Server Action's message with an opaque
digest, meaning they'd be told nothing at all. Same defect class already found and fixed in MS-07's
presign action. Now returns a typed error like every other refusal here.

**Verified in a browser against the real corrupt rows** (Playwright/system Chrome, 10/10, zero
console errors, zero page errors), then confirmed by direct query rather than by the screen:
`600 → 10000` corrected to `600 → 64` and `60 → 600` voided; **three rows still in the table
afterwards** (nothing hard-deleted), the correction linked to the entry it replaced;
`pre_install_baseline` still 120.2, untouched; the effective baseline replaying to 12.82
(= 120.2 ÷ 600 × 64) and the effective count to 64.

**The refusal was checked through a path the client genuinely does not pre-block**, per this repo's
own standing rule that a client-side `disabled` bypass is not a server-side test. The reason field
carries no `required` attribute, so a correction submitted with a blank reason really does reach the
action: it refused, wrote nothing (row count unchanged), and emitted
`circuit.rescale_correction_refused`. **That log line had to be added first** — the branch returned
its error without logging, so the original passing check ("the message appeared") could not
distinguish a server refusal from a client that never submitted. Worth remembering as the general
shape: a refusal with no log line is a refusal you cannot verify.

**9 new unit cases** in `tests/benchmark-rescale.test.ts` (26 in that file), including the ordering
trap — a voided entry that is still the most recent live-*dated* one must not decide the baseline
merely by being last, so the void filter has to be applied before "latest wins."

Migration `20260815021500_add_rescale_void_and_payment_confirmation` is purely additive (4 columns,
1 index, 3 FKs; it also carries MS-08's `BillingInvoice.paymentStatusConfirmedAt` — see below).
`tsc`/`lint`/`build` clean; suite at **215 across 12 files**.

## Circuits can be soft-deleted, with authority rising through the lifecycle (2026-08-15) — user-asked

**The ask, verbatim**: "if i have accidently added duplicate or incorrect or unwanted Demo-circuit
candidates. i should be able to soft delete it. if a progress is not done yet. if there is progress
on it. then only admin should be able to soft delete it. otherwise who created it can also delete
it." Built as specified, plus one tier the request didn't name (below).

**Never a hard delete.** A circuit is CON-11's billing grain, so the row always survives —
`voidedAt`/`voidedById`/`voidReason`, and the whole decision in `src/lib/circuit-void.ts` as a pure
function with the action as a thin shell, the same split as `portal-authority.ts` and
`benchmark-rescale.ts`.

**Three tiers, ordered by the cost of being wrong:**
- **Nothing recorded yet** → the creator, or ops. A candidate added twice during a survey is the
  field team's own housekeeping; making them wait on the ops lead to fix a typo is friction with no
  safety value. `Circuit.createdById` is new — null on every pre-existing row, which
  `decideVoidCircuit` reads as "creator unknown" and falls through to ops-only, the safe direction.
- **Any progress** (meter installed, baseline, benchmark, gate pass, commissioning or meter
  readings, rescale event, fee line) → ops only. `hasProgress` is deliberately generous: being
  wrong this way costs a request to the ops lead, being wrong the other way discards someone else's
  evidence.
- **Billed on a RELEASED calculation** → **nobody, ops included**. This tier was added rather than
  asked for: GATE-02 makes released billing documents append-only, so voiding such a circuit would
  silently unmake a line on an invoice a society already holds. The refusal names the paths that do
  leave a record (contract amendment, or a deviation review). It is checked *before* the
  reason-required check, so the UI never implies that better wording would get it through.
  Deliberately keyed on `releasedAt`, not on the mere existence of a fee line — a line on a draft
  month is work in progress, and blocking on it would strand every circuit the moment ops ran a
  trial calculation.

**Restore is stricter than removal — ops only, whoever did the removing.** The asymmetry is the
point: removing an untouched candidate is housekeeping, but restoring one puts it back in front of
the billing query.

**The part that actually carried the risk was the read side, not the write.** A soft delete is only
as good as the queries that honour it, so `voidedAt: null` was added to all ten circuit reads —
the registry, the survey candidate list, the monitoring board's three windows, the readings page,
two portfolio KPIs, the demo report's CON-11 extrapolation, and above all `runCalculation`'s circuit
query, which is the one that turns circuits into money. A removed circuit that still billed would
have been a far worse bug than no delete button at all.

**Verified in a browser across three scripts — 16/16, zero console errors, zero page errors** — and
**both hard gates were driven through paths the client genuinely cannot pre-block**, per this repo's
standing rule that a missing button proves nothing about the server. Each used the same technique:
let the control render legitimately, then change the underlying row *behind the open form*, so the
click reaches an action that must now refuse.
- A PER-04 account opened Remove on a circuit it had created; a meter was installed behind the
  form; the click was refused with the operations-lead message, wrote nothing (`voidedAt` still
  null), and logged `circuit.void_refused` with `isCreator: true, hasProgress: true`.
- Ops opened Remove on an unbilled circuit; a released fee line landed behind the form; refused,
  nothing written, logged with `isOps: true, releasedFeeLineCount: 1` — GATE-02 binding the
  strongest actor in the system.
Also verified: a blank reason is refused; a removed circuit disappears from the registry and
appears in a collapsed "removed" disclosure naming who removed it and why; ops can remove a
circuit with commissioning work; restore returns it. 15 new unit cases (`tests/circuit-void.test.ts`).

**A soft delete that hides the row completely is indistinguishable from a hard one**, so removed
circuits stay visible in a disclosure on the registry, and a removed circuit reached by direct link
renders a banner rather than silently looking like a live circuit missing from every list.

**One process note worth keeping** (it cost time again): the registry page 500'd on first run with
`PrismaClientValidationError: Unknown argument voidedAt`. The migration and `prisma generate` had
both run — but the long-lived `next dev` process still held the old client in memory. This is
already recorded in this file from MS-04's monitoring work and caught me a second time: **after any
migration, restart the dev server; regenerating is not enough.**

Migration `20260815024500_add_circuit_soft_delete` is purely additive (4 columns, 2 FKs).
`tsc`/`lint`/`build` clean; suite at **232 across 13 files**.

## MS-08 in progress (2026-08-15) — the calculation engine, the arrears clock, and their schema

Not complete and not claimed as such: `docs/backlog.yaml` MS-08 stays `proposed`. What exists is the
backend spine, unit-tested and migrated; **no billing UI is built yet**, so nothing in the running
app routes to any of it — it deploys dormant.

- **`src/lib/monthly-calculation.ts`** — CON-11's per-circuit extrapolation, CON-01's fixed-fee
  default, CON-01c's two-consecutive-month breach streak, CON-01d's "approaching" band, and CON-22's
  proration. 34 cases including TC-048-1's exact fixture asserted **with the party named**
  (`expect(fee).toBe(1142.40); expect(fee).not.toBeCloseTo(1577.6)`) — this project has shipped that
  58/42 inversion twice, and both times the number alone looked right.
- **`src/lib/arrears.ts`** — CON-13's clock and, most consequentially, its safety rule: a suspension
  may only fire against **same-day-confirmed** payment status. `paymentStatusConfirmedAt` is
  deliberately a separate column from the payments themselves, because a society that has never paid
  has no `Payment` row to date-stamp, yet "no record of payment" can still mean "nobody has checked
  since Tuesday" — what must be fresh is the *confirmation*. Stale data stops the clock rather than
  suspending real field servicing on data nobody looked at. It is a safety rule, **not** an approval
  gate: with fresh data the automatic path still needs nobody's permission, which is CON-13's whole
  design (every human touchpoint is a brake, never a trigger). Also holds SCR-092's release-queue
  triage, where a needs-review month is never bulk-releasable. 31 cases.
- **`src/app/admin/billing/access.ts`** — `requireAccountant()` checks `release_billing` **only**.
  Holding every ops permission deliberately does not confer it: an account that can run the month
  must not be able to release its own output (CON-33, FEAT-054-AC-4). This is the one place in this
  codebase where the standing PER-01 ops proxy buys nothing, and it is intentional.
- Schema: `MonthlyCalculation` (versioned, with an `inputVersionSnapshot` for INV-02),
  `CircuitFeeLine` (ADR-004's per-circuit grain), `DeviationReview`, `SavingsReport`,
  `BillingInvoice`, `Payment`, `InvoiceExtension`, plus a new `release_billing` admin permission.
  Migration `20260814202511_add_ms08_calculation_release_billing`, 254 statements, zero destructive.

## The post-install anomaly rule was asking the wrong question (2026-08-15) — user-caught, and it made FEAT-015 reachable

**Three things the user reported after testing stage, all real, all one thread.**

**1. The anomaly rule.** "We are comparing anomaly by comparing previous days average reading and if
varying more than 5%. but here anomaly logic is that if it is out of range and not between 60-80% of
previous average reading before light install." Correct, and the reason it matters is not a
preference: ±5% is a *self-consistency* check — the only question available pre-install, where the
whole point is that no baseline exists yet. Post-install there **is** a baseline, and CON-20 already
says what a plausible day looks like against it. Running ±5% there flagged ordinary jitter between
four perfectly good days (7.5 / 7.5 / 7.4 / 8.0 kWh), and because an anomaly resets CON-19's count,
**a healthy circuit could never finish its window**. The rule now splits by window type in
`src/lib/commissioning-anomaly.ts`: pre-install keeps MS-07's shared ±5% detector (still satisfying
FEAT-045-AC-5's "the same detection feeds both paths"), post-install judges each day against the
in-force baseline replayed through any rescale events (INV-07). The band **subsumes** every
data-quality case the old rule caught, which is why nothing is lost: a dead meter reads as 100%
savings, a 10× transcription error as negative savings — both outside 60-80% by a wide margin.
FEAT-045's ±5% on the billing-ingest path is untouched; it answers a different question about a
different artefact. Recorded as a scope change in `03-features.md` FEAT-014-AC-3 and
`docs/backlog.yaml` with a `scope_note`, per AGENTS.md.

**2. "Record and fix button is not working."** Real, and the diagnosis is worth keeping because
nothing about the button was wrong. `restartWindow` set the new window start to *tomorrow*
(`2026-08-15`), but the anomaly being cleared was dated `2026-08-24` — a day recorded ahead of
today, which the date field allows and which is ordinary when catching up on a sheet. `2026-08-24 >=
2026-08-15`, so the anomaly stayed inside the restarted window, `pendingAnomaly` stayed true, and the
page re-rendered identically. The action ran, wrote a row, logged its line, and looked completely
inert. Fixed with `restartFromDate(now, latestReadingDate)` — the later of tomorrow and the midnight
after the last recorded day. **The shape**: a "restart from now" that ignores data already recorded
past now is not a restart, and it fails silently rather than loudly.

**3. FEAT-015 built** — the user's third item was, verbatim, to implement the dead-end banner's own
text. `/admin/monitoring` gains the investigation queue (AC-2's empty state, AC-3's 24h overdue
flag, AC-5 ranking a repeat failure above an overdue first attempt — a repeat outranks a stopwatch,
because the second time a circuit measures out of band, measuring again is unlikely to be the
answer), and the circuit page gains the resolution form with the three closed-set outcomes. Scored
R1; **built in R0** because the state it resolves is reachable the moment a post-install window runs
— same call as FEAT-035-AC-6 at MS-06, recorded as a `release_note` rather than by silently
rewriting the release.

**A structural consequence of (1) that had to be designed for, not discovered later.** Savings % is
linear in consumption, so the average of five in-band days is *necessarily* in band — which means
FEAT-014-AC-5's out-of-band **completion** path, the only thing that raised a review, became
unreachable the moment the day-level band check landed. A circuit that simply under-performs flags
every single day and never completes at all. So FEAT-015's queue would have shipped correct,
tested, and permanently empty. Closed with a new **FEAT-014-AC-6 / FEAT-015-AC-6**: PER-04 escalates
the recorded out-of-band days directly, carrying the readings and the baseline they were judged
against. "Record fix & restart" is deliberately *not* the answer there — nothing was fixed, and
restarting just re-flags the same day tomorrow. **Worth remembering as a class**: tightening a
detection rule can silently orphan the workflow that consumed its output, and the orphaned path
still passes every test written against it.

**Two real defects found while building this, neither reported:**
- **An auto-flagged day was discarding the reading it flagged**, directly contradicting the comment
  sitting above the line claiming it kept it. `recordDailyReading` derived status from *absence* of
  a value (`isAnomaly = consumptionKwh == null`), so flagging necessarily meant dropping the number.
  That leaves a flag nobody can check — and it left FEAT-015's escalation with no evidence to rest
  on. Status is now explicit; every aggregate already filters on it, so a stored anomaly value can
  never reach a baseline or a benchmark.
- **Completion computed savings against the raw commissioned baseline while the day check used the
  in-force one.** A rescale during a post-install window (possible — FEAT-041 needs a commissioned
  baseline, which exists by then) would make the two disagree, so five days each judged in-band
  could complete out of band. Both read `effectiveBaselineAt` now.

Also converted `fixCommissioningAnomaly` and the new escalate action off `requireAdminPermission`
(which throws — an opaque digest in production) onto `resolveAdmin` + a typed return, the same fix
already made for `getReadingUploadUrl` at MS-07.

**Verified end to end in a browser (Playwright/system Chrome), 35/35, zero console errors, zero page
errors.** The four-day jitter case records as valid throughout; an 18 kWh day against a 30 kWh/day
baseline (40% savings) flags, *keeps its reading*, and names CON-20 rather than a generic variance;
the restart works for a past-dated anomaly (→ 2026-08-15) **and for the reported future-dated one
(→ 2026-08-25, not 2026-08-15)**, with the anomaly card actually gone; escalation raises a review
storing 40.00% / 30 / 18 exactly; the queue shows it, then ranks the second one as "Repeat failure —
attempt 2"; resolving as a corrected defect clears the measured average, returns the circuit to
`post_install_monitoring` and restarts after the last recorded day. **Two gates checked through
paths the client cannot pre-block**: a resolution with no stated basis (submitted with the note
empty — refused, nothing written, the refusal actually shown) and FEAT-015-AC-4 (the ops permission
revoked behind the open form, so the click genuinely reached the action — refused by name, review
still `open`). 30 new Vitest cases across `commissioning-anomaly` and `demo-result-review`; suite now
**262 across 15 files**. `tsc`/`lint`/`build` clean. Migration
`20260815031500_add_demo_result_review` is purely additive. Backlog validator: **16 errors / 263
warnings**, the same documented baseline, AC count 555 → 557.

## An empty state that named a step the user had no route to (2026-08-15) — user-caught on stage

**Reported**: created a society, enrolled it in lighting, saw "Active" — then the circuit registry was
blank, telling them to "select a demo-circuit candidate on a pipeline's site survey."

**The blank registry is correct and stays correct.** Circuits come from FEAT-007's survey-time
selection with CON-16's eligibility checklist attached; FEAT-040-AC-2 is explicit that they are never
created ad hoc from the registry, and Phase 6's own dependency finding (FEAT-040 structurally
depends on FEAT-007 — "there is no backend-only shortcut to create a billable circuit") is exactly
this. Nothing about that was changed.

**What was actually broken is that the instruction pointed at something the society did not have.**
Confirmed against the row rather than inferred: `LandCraft` had an active `lighting` **Engagement**
and **zero Pipelines**. An engagement records that a society is engaged on a service line
(FEAT-039); the deal that produces a survey — and therefore circuits — is the Pipeline, one per
`(society, serviceLine)` under CON-24. A society created through `/admin/societies/new` and enrolled
manually gets the first and not the second, so the screen was naming a survey that could not exist
and offering no way to start one. **Same defect class as the FEAT-015 dead-end banner fixed earlier
the same day**: a screen that states a next step the reader cannot reach from where they are.

**Fixed as guidance, not by changing the data model** — making "Enroll service line" also mint a
Pipeline would be wrong: a pipeline needs a sales owner, a contact and a meeting date, and CON-24
makes it the deal record, not a flag. The registry's empty state now resolves which link of the
chain is missing *for that society* and links to it: no pipeline → "Log a lead" (verified the lead
form does list existing societies, so the link is a real route, not a suggestion); pipeline but no
survey → open the pipeline, with the note that a survey opens once the demo proposal is accepted;
survey ready → straight to it. The society-detail service-lines panel got the same treatment — an
enrolled line now either links to its deal or says plainly that there isn't one, since "Active" with
no route onward is what made enrolling look like the whole step.

**Verified in a browser across all three states (14/14, zero console errors, zero page errors)**,
reproducing the reported case locally first (society + engagement, no pipeline), then creating a
pipeline and then a survey behind it and re-checking the screen each time. The survey deep link was
followed to a real 200 rather than merely asserted to be present.

**On stage, verified against the reported society itself (8/8)** — with one thing worth recording
about the verification rather than the fix: `LandCraft` had moved on between the report and the
deploy. It now has a lighting pipeline at `survey_pending` and a registered circuit, so the empty
state correctly does not render there at all, and the first run's failures were assertions checking
a branch the society had left — not a stale deploy, which is what they looked like. Confirmed by
dumping the served page rather than re-guessing: the detail panel renders "Open the deal →" against
the real pipeline id, which only the new build emits. **The general shape**: when a check fails
against live data the user is actively using, confirm the state before concluding the deploy is bad.

## Deal-flow sequencing: one module decides "you are here, do this next" (2026-08-15) — user-caught

**The report, verbatim in parts**: "the flow is not clear enough for anyone to understand… the
survey page is like everything at one screen at once… it was like a lost thing i couldnt find from
where to add the circuite or what to do next… it feels like you have just copied everything from
the design on a single page without any logic to what belongs to what step." All correct — every
screen since MS-03 rendered each stage's workspace conditionally by state, but nothing anywhere
stated the *ordering*: the pipeline page offered six equal stage buttons, the survey page showed
inventory and candidate forms side by side, and the hand-off from "candidate is eligible" to "now
open the circuit page" existed only in the operator's head.

**The fix is one pure module, not per-screen copy** — `src/lib/deal-progress.ts`, the same
convention as `portal-authority.ts`/`benchmark-rescale.ts`. `dealProgress(facts)` returns the
blueprint's own deal-to-bill spine (08-prioritization.md §3.1: lead → survey → commissioning →
report → offer → agreement → installation → billing, with KYC as the one genuinely parallel track,
CON-23/GATE-01) as ordered steps with exactly one `current` and THE one next action, carrying the
href of the screen where that action actually lives — including the reported hole: an eligible
candidate's next action links **to the circuit page**, by name. `circuitSteps(facts)` is the same
idea one level down (eligibility → meter → install gate → baseline window → completion gate →
replacement → benchmark). 25 unit cases (suite now **287 across 16 files**), including GATE-01
routing (offer accepted + KYC incomplete → "Complete KYC first", not the agreement), closed-lost
freezing the spine, and the demo-skip path.

**Screens rebuilt on it**: the pipeline detail page replaces the six flat buttons with a
`NextStepCallout` (the one next action, linked) plus a `DealStepper` map where **locked steps are
not links** — they say what unlocks them instead, which is the whole sequencing signal. The survey
page becomes Step 1 (inventory) → Step 2 (candidate, gated on an area existing) with a hand-off
callout to the circuit once a candidate advances.

**A real coherence bug surfaced by the user's screenshot of stage, fixed with the map**: "Basement
Tower 115" (benchmark_review) showed step 3 "Install gate pass" as *current* while steps 4–6 read
done — the done-inference was artifact-only (`hasInstallGatePass`), and that circuit's stage rows
predate some artifacts. The rule is now **rank-OR-artifact**: a state the machine can only have
reached *through* a step marks that step done even when its artifact row is missing, because the
map marking an early step current while later ones read done is exactly the incoherence a map
exists to prevent. Unit-tested against that literal shape. Where a step reads done this way with no
artifact behind it, the header says so honestly — "No stored record — the lifecycle advanced past
this step" — rather than claiming "Submitted" about a row that does not exist.

**Follow-on the same day — the polling, live figure and offline alerting, built against a stand-in.**
The user asked for a per-meter "Sync readings" click, an hourly automatic fetch, and continuous
online/offline checking so a named person can be chased. All of it is built and verified; only the
vendor read itself is stubbed, because CoolKit publishes **no sandbox and issues no demo
credentials** (checked: the free personal-developer tier is real and free, but still gated on their
1–2 working-day audit). ADR-010's provider interface earns its keep immediately — `MeterProvider`
has an eWeLink implementation and an env-gated `fakeProvider` (`EWELINK_FAKE_METERS=1`, which logs
`meter.fake_provider_active` on every pass so a stand-in can never be mistaken for the account).

**A sample is telemetry, and deliberately not a MeterReading.** `MeterSample` is its own table: the
hourly poll writes live power/energy there, which is what the screen publishes. It never becomes
the store a bill is computed from — that path still requires a reviewed `RawReadingFile` (CON-45),
because INV-02 and INV-09 exist precisely to stop an unreviewed figure reaching a billed total.
Conflating the two would have been the easy reading of "save the readings against that circuit".

**`connected` is not `reporting`, again.** `evaluateMeterHealth` returns three states, and the
middle one is the water-tank lesson made reusable: a meter can hold an open connection and have
said nothing for hours. eWeLink's status read carries **no device timestamp**, so the provider
returns `reportedAt: null` meaning *unknown* rather than *now*, and the screen says "read at"
rather than claiming the device reported then.

**The alert fires on the transition, and it is addressed.** `offlineSince` is stamped once and kept
across a run of bad polls — "down since 09:00" is the fact somebody acts on, and restamping it
hourly would erase it. A meter carries an `ownerId` who must hold field access, since they are the
one who goes and fixes it; the banner names the meter, the circuit, the society and the outage
length, and says outright when nobody has been named. Real delivery (email/SMS) is still R1 —
ADR-008 is Proposed — so this is in-app plus a `meter.went_offline` log line, stated rather than
stubbed.

Verified in a browser, 16/16, zero console errors: the click files a sample and the row publishes
the figure; an unreachable meter stamps its outage, raises by name, and a second failed poll does
**not** restamp it; an unassigned meter is neither watched nor polled. **The owner gate was driven
through a path the client cannot pre-block** — an account without field access smuggled into the
picker and submitted: refused by name, stored owner untouched. The worker's hourly chain was run
for real against Postgres: seeded, ran, and left exactly **one** pending link, no fork. 528 unit
tests, `tsc`/`lint`/`build` clean; two additive migrations plus one enum value.

## A historical society becomes a billable one: documents in, circuit out (2026-08-26) — user-driven, in one long pass

**The problem this arc solves.** Eighteen societies were imported as records, and every screen that
mattered then dead-ended: the reading upload asked for a circuit, no society had one, and circuits
only come from a survey (FEAT-007, and Phase 6's own finding that there is no backend shortcut to a
billable circuit). These societies were commissioned years before this system existed. What they
have instead of a survey is **paper** — demo reports, savings reports, agreements — so the paper had
to become the way in.

**Duplicates are refused, not flagged** (the user's call). FEAT-085-AC-3 let an operator confirm past
a duplicate, and that override is how two "Mahagun Puram / Noida" rows reached real data. Both create
paths refuse outright now, and the guarantee is a unique index on a normalised `name|location` key —
an application check cannot win a race with itself, since two operators submitting at once both find
nothing and both insert. Name AND location, because the same name in another city is a different
society. Societies became **editable** (operations only) in the same change, and `flatCount` became
**nullable**: the first import's researched counts were demonstrably wrong, and this repo states a
gap rather than writing a figure nobody trusts.

**The real documents rewrote the extraction design.** Reading actual samples before building — Gaur
Saundaryam's savings report, Himalaya Pride's and The Princely States' analysis reports, two
agreements — taught it what to ask about rather than guess:
- reading tables print day and month only, with the year in a heading above;
- figures are **adjusted in prose**, so the same day appears as 20.37 and 18.21;
- documents **contradict themselves** (that May table averages 8.0071 under a sentence saying 8.58 —
  which is the largest single value in the table, so somebody copied the wrong cell);
- a service share is a share OF SOMEONE (Hyde Park: "35% of the energy savings", FirsThing's share,
  where this system's own default is 58/42 the other way).

So `extractDocument` returns figures **and clarifications** — each a plain question, why it matters,
the candidate answers, and the surrounding text — and every figure carries the verbatim words it was
read from. Against the real report it raised four, two of which nobody here had spotted by reading
it. This deliberately does what `inferStructure` refuses to do (let a model return values); the
difference is the artefact, not a change of mind — a savings report is one document with a few dozen
printed figures a person can check, which is the shape the archived invoice extraction was judged
safe for. A meter CSV is still mapping-only.

**`savings-math.ts` turned the user's four rules into arithmetic**, asserted against that report so
"we agree with the document" is proved rather than claimed — which is also what lets the same code
say where it does not. An offline day is skipped, never counted as zero: a dead meter read as 0 kWh
drags the average toward "we saved everything", the most dangerous direction for a billed figure.

**CON-16 lost a criterion that is wrong in practice.** "No non-installation appliances share this
circuit" would disqualify Gaur Saundaryam's own demo circuit, which is live and billing with five
unreplaced surface lights on it. A shared fixture is now marked **excluded on its own device line**
and its theoretical load comes off **both** sides of the savings calculation. Two figures, not one,
because they answer different questions: the whole-circuit theoretical is what a READING is validated
against (the meter sees everything), and only SAVINGS deducts. On that circuit it is 66.89% against
59.79% naive — seven points of the number a fee is a share of. Recorded as an amendment in
`00-intake.md` rather than silently softened.

**A surveyor can add a fixture the catalog lacks**, and it arrives PROPOSED: its wattage feeds the
theoretical load and from there a benchmark a society is billed on, so a number only its typist has
seen must not travel that far. The gate is load validation — the first place the figure matters —
and a rejected device blocks too, because it has to be replaced on the inventory rather than merely
disapproved elsewhere. Approving and **listing** are separate decisions, or the catalog fills with
near-duplicates nobody can choose between.

**The way in: society → report → circuit.** The Documents tab asks which society first and narrows
everything to it; a society with no circuits says so and offers the demo report instead of an empty
dropdown. `/admin/documents/[id]` reads that report, asks its questions, and builds the circuit from
the confirmed fixture lines — 42 tube at 20W retrofitted and 5 surface at 18W excluded, reproducing
the report's own 22.32 kWh/day and 2.16 kWh/day from the created rows. **What it does not invent**:
no baseline, no benchmark, no meter dates. Those come from readings through CON-45's review, because
a figure printed in a report is evidence of what happened, not evidence this system can recompute.
Every device line is marked `historical` for the same reason.

**Four defects the user found by using it, all real:**
1. **The reading arrived after the form mounted.** "Read this document" calls `router.refresh()`, and
   React keeps the same instance, so a `useState` initialiser never re-ran — the fixtures the model
   found sat in the props while the form showed none, and submitting failed with "record at least one
   fixture line". Fixed by adjusting state during render against a tracked previous value, keyed on
   the extraction's timestamp — the same pattern the monitoring window's date default already uses.
2. **A filename in the location field.** Location now comes from the area the document names.
3. **Light type was free text**, and got the document's phrasing ("33 Tube lights circuit"). CON-11
   scopes extrapolation to a light TYPE, and a freeform string cannot be grouped — it is the fixed
   list now.
4. **A report naming one society was filed against another**, silently. Himalaya Pride's report went
   against RG Residency and would have built RG Residency's circuit from Himalaya Pride's fixtures.
   The review says so before the button — not a block, since paper names differ, but never silent.

Also: a used report will not build a second circuit (a duplicate circuit bills twice), and the tank
"not reporting" warning was **withdrawn** — those controllers report four discrete levels, so a tank
that has not moved a quarter has nothing to send, and calling that a fault trained the reader to
distrust a correct figure. That warning was written when the level itself looked wrong, and the cause
of THAT turned out to be the `levelMax` scale bug, which is fixed.

**Still not built, and not claimed**: the extracted daily readings are not yet fed into the reading
store (they would go through CON-45's review like any other), the commercial terms in an agreement are
not yet backfilled into Pipeline → Offer → Agreement → Contract, and `savings-math` is not yet wired
to a screen.

## Two reports of one circuit, and the map that disagreed with itself (2026-08-26) — user-caught on stage

**Reported**: "Demo commissioning is complete but the demo report was not generated. So stuck in
between", with the report page naming a second circuit, and separately "even though a light circuit
is created it still shows lighting service not enrolled".

**All three real, and the first is the one that cost the most.** Ace City had TWO circuits: one
built from its post-installation report (benchmark 66.40%), and one built from the
**pre-installation report of the same 96 lights, filed under the same month**, which never got a
benchmark. FEAT-020-AC-3 holds the demo report until every circuit has one, so the report could
never generate — and CON-11 makes a circuit the billing grain, so the same lights would have been
billed twice.

- **The duplicate is refused now** (`src/lib/circuit-duplicate.ts`): same society, same light type,
  same metered count. A refusal rather than a warning, matching the call already made for duplicate
  societies — an override is precisely how those duplicate rows got created. The message names the
  circuit, where it is, that both documents are dated the same month, why it matters, and links to
  it, so the refusal is a route rather than a dead end. The backfill records its document's period
  in `eligibilityChecklist` so a later report can make that comparison.
- **The deal map asked a different question from the thing it gates.** `benchmarkDone` read the
  MOST advanced candidate while the report reads all of them, so the map said "Demo commissioning ·
  Completed · Benchmark confirmed" over an unfinished demo. It now requires every live candidate,
  and when one is holding the demo open it names **that** one — the least advanced — and links to
  it. **The general shape**: a map whose step disagrees with the screen behind it is worse than no
  map, and this is the third time in this codebase that two rules for one question have produced a
  dead end.
- **Neither backfill path enrolled the service line.** The lead path has created the `Engagement`
  alongside the deal since the same gap was found there (FEAT-039-AC-1); the circuit-from-report
  and contract-from-agreement paths created the Pipeline and not the Engagement, so a society with
  two commissioned circuits still read "Lighting · Not enrolled". Both upsert it now.

**Verified in a browser, 12/12 and 5/5, zero console errors**, against a reproduction of Ace City's
exact shape — including that the refusal reached the server (nothing written, and the refused
location absent from the table) rather than being a form that never submitted. Then **deployed and
re-verified on stage against the reported deal itself**: step 4 now reads "In progress · Circuit
with 96 lights: Install the meter and validate the load", with step 5 locked and waiting on it.

**Two things the fix deliberately does not do**, both stated to the user rather than done silently:
the duplicate circuit already on stage is not removed (the Remove control on the circuit registry
does that, with a reason, soft and restorable), and Ace City's engagement row is not backfilled —
the enrolment fires at creation, so an existing society enrols with the "Enroll" button on its own
page.

## A pre-system society, walked end to end on its own documents (2026-08-26) — user-asked

**The ask, verbatim**: "I share with you all the documents required. the agreement, the demo report,
the metering data. what i want you to do is test the full flow yourself on local. if you can
complete everything then let me know. else fix till its complete. start fresh." Ace City's real
scanned agreement, its post-demo report, and its 750 KB meter workbook.

**Five things stood between those three files and a commissioned circuit. None was visible from the
code; each turned up by driving it.**

**1. The circuit page showed a backfilled circuit the full commissioning walk.** A panel reading
"it is not walked through meter install, gate passes and a baseline window" sat directly above a
step asking to install the meter and validate its load. Worse than contradictory: the readings
upload lives behind the install gate pass, so a circuit built from a report could not go anywhere
at all. A backfilled circuit now has its own three-step spine — eligibility not assessed, the two
dates, the readings — and the dates panel is that step's own form rather than a card above the map.

**2. The meter data is a workbook, and the pipeline read CSV only.** `src/lib/xlsx.ts` is a minimal
reader (ZIP central directory + inflate + the four XML parts), written rather than depended on: the
whole need is cell values as strings, and a library that parses untrusted uploads is a supply-chain
decision. `xlsx-readings.ts` converts a chosen sheet to the delimited text the pipeline already
reads, and stops there deliberately — everything downstream is proven, and a second pipeline for
workbooks would be a second place for the arithmetic to differ. The sheet is asked, never guessed
(`RawReadingFile.sheetName` records it): Ace City's workbook holds Basement and LiftLobby, and the
next block along is another circuit's consumption.

**3. The blocks overlap, and stacking them doubled 143 days.** This is the one that would have been
expensive. The three column blocks are not consecutive chunks — they are separate exports of the
same meter taken on different days. Two share **128 dates and repeat the hourly readings value for
value on 126 of them**; a third shares 15 more. Summed, each of those days comes out about double,
which does not look wrong in a column of plausible numbers and lands in a baseline a society is
billed against. A date now belongs to ONE block, the one holding the most readings for it. With no
time column there is no telling a day split across blocks from a day repeated in both, and the two
mistakes are not equal: fullest-wins can only under-report a day (visible — it surfaces as partial
and drops out of the averages), while summing both silently inflates the saving and the fee that is
a share of it. **Found only by computing the expected figures independently, in another language,
from the raw file — the system's own 291-day answer looked perfectly healthy.**

**4. A backfill's baseline was treated as settled before it existed.** "The lights are not in yet"
was the test for whether the pre-install baseline was still open, and for a circuit commissioned
through the live flow that is the same question — the baseline always settles before the
replacement is recorded. A pre-system society reverses the order: both dates come off its demo
report before a single reading exists. So every upload classed post-install and the days that would
have produced the baseline could never be uploaded. `baselineUnsettled()` is now one named
predicate shared by the phase and the recompute so they cannot drift, and a pre-install window
stops at the replacement day when that day is already known — otherwise it sweeps in the new
fittings and averages them into the old fittings' baseline. **The general shape**: a condition that
is equivalent to the right one under the ordering you have always seen is not the right one.

**5. The agreement page called a date it could not parse no date at all.** It accepted ISO only, so
"23 Oct 2025" left the signature field empty under a list of five perfectly legible dates.
`src/lib/loose-date.ts` reads what documents actually print, and — the part that matters — returns
**both readings** of an ambiguous numeric date rather than choosing: 10/11 is a month away from
11/10, and that month is when billing starts. Two smaller ones alongside it: recording an agreement
with the term start skipped left the document "Needs review" forever with nothing left to review
(the confirm sat after the early return), and revisiting one afterwards reported its own success as
a conflict — "amend that one rather than creating a second", about the contract it had just made.
A computed revenue share also rendered at fourteen decimal places; it is two now, because
64.00013280653408 reads as a figure nobody could check.

**6. Save did nothing at all for a workbook, silently.** The client holds no file text for one —
the server reads it back from S3 — and `save()` guarded on that text being truthy. The button
rendered, enabled, with the right count on it, and clicking it returned immediately: no request, no
error, no loading state. The third time this codebase has produced that exact shape.

**7. The commit's transaction was sized for a monthly upload, not a history.** 275 days at one
`create` per row over the tunnel ran past Prisma's default 5-second interactive transaction, rolled
the whole thing back, and surfaced as a raw `P2028` in the browser rather than a typed refusal. The
plain inserts are one `createMany` now, and the transaction is given a deadline a history upload can
actually meet.

**What the walk proves, against the real files**: the society is created; the scanned agreement is
read (share computed from ₹54,214 of ₹1,50,595 = 36.0% FirsThing / 64.0% society, matching the
document's own "~36%"), recorded with the term start skipped, and the contract created when that
date is supplied; the demo report is read, **raises its own two questions** (the report contradicts
itself on the light count, 96 vs 20, and prints October dates with no year), and builds a
96-light 20W 24h circuit with no baseline invented from its prose; the two dates are recorded; and
the workbook produces days that reproduce the report's own printed table — 48.84, 48.79, 48.35
before, ~16 after. The circuit finishes at **baseline 44.9647 kWh/day from 15 pre-install days and
benchmark 63.44% from 275 post-install days**, inside CON-20's band, state `benchmark_confirmed`,
zero console errors.

**One figure worth keeping, because the system was right and the check was not**: a naive average of
the file gives 63.5568%. The system says 63.4420% because two days are part-days in the export (10
of 24 intervals, and 15 of 24) — stored, listed with their reason, and kept out of the average. A
part-day total reads as an unusually low day, which would flatter the saving.

**Still open, and not claimed**: the report's own extracted daily readings do not feed the reading
store; `savings-math` is not wired to a screen. None of this is deployed to stage yet.

## One place to file any document, and it checks what the file really is (2026-08-26) — user-asked

**The ask**: a back-office tab where every kind of document can be uploaded, the type chosen from a
dropdown, each type performing its own operation — and the system validating the file itself,
rejecting one that does not match the format or file type the chosen type expects.

**The validation is byte-level, because a name is a claim.** `src/lib/file-signature.ts` sniffs
magic bytes (PDF, PNG, JPEG, GIF, WebP, and the ZIP container that XLSX/DOCX really are) and falls
back to a text/binary judgement for CSVs, which have no signature. An extension is written by
whoever named the file and the browser's MIME guess is usually derived from that same extension, so
neither catches the ordinary mistake this exists for: a spreadsheet saved as `.pdf`, a photo renamed
`.csv`. The refusal names **both halves** — "it is named .pdf but its contents are a text or CSV
file" — because "rejected" alone sends the operator back to the same file to try again.

**One registry decides everything about a type** (`src/lib/document-catalog.ts`): its label, what
happens to the file, what it attaches to, whether it needs a period, the accepted kinds and
extensions, the size cap and the permission. The tab, the permission check and the validator all
read the same entry, so a document cannot be accepted here under rules its own screen would not
apply. **The permission is derived from the type server-side** — a client choosing a type it has no
permission for is refused rather than trusted.

**Only the first 4 KB crosses the wire.** That is all the evidence needed to know what a file is, so
the bytes still go straight to S3 by presigned PUT (the pattern since 2026-08-05) rather than
through this process. The client runs the identical check for an instant message; the server's copy
is the one that decides, and the e2e drives a rejected file through the button to prove it.

**Three routing outcomes, deliberately.** A meter export becomes a `RawReadingFile` and opens
CON-45's row-by-row review — nothing is stored until the operator accepts it. A KYC file goes
through `recordKycDocument`, the same action its own screen calls, because two paths writing the
same rows drift. The historical documents the user listed — pre/post-installation demo reports,
previous savings reports, gate passes, inspection reports — had nowhere to live, so `StoredDocument`
is a new generic attachment: society + type + period + provenance. It is **not** a shadow copy of
documents that have a workflow (a KYC file stays a `KycDocumentFile`), for the same reason the
archived app's unified listing was a live query rather than its own table.

**The executed agreement IS filed from here — corrected by the user the same day.** The first cut
refused it, on the reasoning that attaching the executed copy belongs to the execution sequence
(printed → notarised → signed → scan). That reasoning applies to a deal this system walks; it does
not apply to the 18 societies just imported, which were signed years before the system existed.
There is no sequence to invent for them — the deal happened, and what is being filed is the copy we
hold. So it attaches to the SOCIETY as the executed copy on record, and no `Agreement` row is
minted. FEAT-029's Agreement step still owns the live path unchanged.

**Why an `Agreement` row is not created for a backfill, and why "just default the steps" does not
reach it**: `printedAt`/`notarizedAt`/`signedAt` are already nullable, so they were never the
obstacle. `Agreement` requires a `pipelineId` AND an `offerId`, both unique — and an `Offer` carries
`tolerancePct`, `revenueSharePct`, `unitElectricityRate`, `termMonths` and `projectedMonthlyFee`,
which `Contract` reads. Defaulting those would put invented money into the record a bill is computed
against, which is precisely what INV-02 forbids. The real path to an `Agreement` for these societies
is to backfill Pipeline → Offer → Agreement → Contract from their ACTUAL commercial terms, which the
price list already carries (per-light cost, monthly payable, GST) — not from defaults.

**Versioning, the user's stated first priority (2026-08-26).** A re-upload into the same slot —
same society, same type, same period — is a **new version**; the previous one stays exactly as
filed. ADR-005's rule, applied to documents. Three details carry it:
- **"Different from what is already there" is a fact, not a guess.** Each version stores the
  SHA-256 of what actually landed in S3, hashed server-side from the stored object. An identical
  re-upload is refused and names the version it matches, rather than becoming a second copy.
  The browser hashes too, so the refusal happens *before* the bytes reach the bucket — this app's
  credentials cannot delete an S3 object, so a file accepted and then discarded would sit there
  forever with nothing pointing at it.
- **Every version gets its own object key** (`…_v2.pdf`). Reusing one key would overwrite the
  previous version's bytes, which is the single thing versioning exists to prevent: the rows would
  say v1 and v2 while the bucket held only v2.
- **Withdrawing is soft, and a number is never reused.** `voidedAt`/`voidedById`/`voidReason`,
  with the reason required — a withdrawal with no stated reason is indistinguishable from a
  mistake later. `@@unique([societyId, docType, period, version])` is the structural guarantee
  that two concurrent uploads cannot both become v3, and the next version counts past withdrawn
  ones so the history reads as what happened rather than as though it had been rewritten.

Verified 13/13 in a browser, including that a withdrawn v2 still shows as withdrawn rather than
vanishing, and that the next upload becomes v3.

**Historical documents feed nothing.** They are retrievable, not inputs: a scanned report is not
evidence a figure can be recomputed from, which is what INV-02 asks of anything that reaches a
billed total. The screen says so where the operator can read it.

Verified in a browser, **21/21, zero console errors**: all eight types offered; a CSV named `.pdf`
refused with both halves named; a PDF named `.csv` refused as a meter export; the agreement type
pointing at its own screen and offering no file input at all; a real PDF accepted, filed against the
society with **the period the operator chose rather than one read from the file** (INV-04), and
appearing in Recently filed. **The rejection was driven through the server**, not just the browser —
clicked past the client-side check and asserted on `document.rejected`, the action's own log line,
per this repo's rule that a refusal you cannot distinguish from "the form never submitted" is not a
verified refusal. 22 new unit cases across `file-signature` and `document-catalog`.
`tsc`/`lint`/`build` clean. Migration `20260826140000_add_stored_documents` is purely additive.

## eWeLink (SONOFF) meter mirror: the account, the assignment, and what the docs will not tell us (2026-08-26) — user-asked

**The ask**: pull every smart meter and its reading history out of the company's eWeLink account,
the same way the Tuya water tanks are mirrored, and let the back office bind a meter to a society
**and to the circuit** selected during the demo for monitoring and the savings benchmark.

**Researched first, per the Research Gate, against CoolKit's own published docs**
(`CoolKit-Technologies/eWeLink-API`) rather than community write-ups —
`docs/engineering/14-meter-ingest-ewelink.md` records it. Three findings shaped the build, and
none of them is "Tuya again":

1. **It is OAuth2, not a key pair.** Calls carry `X-CK-Appid` plus a *user* access token obtained
   by sending an operator to `c2ccdn.coolkit.cc/oauth/index.html` — signed
   `Base64(HMAC-SHA256("{clientId}_{seq}", clientSecret))` — who signs in to the eWeLink account
   **there**, so this app never sees that password. The redirect URL must be **registered against
   the application**, so every environment registers its own.
2. **Tokens expire**: access 30 days, refresh 60, the code 30 seconds. The server refreshes ahead
   of expiry and persists the rotated pair *before* using it — losing a rotated refresh token costs
   a human re-authorisation. An idle integration past the refresh window is a real state a person
   must clear, so the settings screen names it rather than letting a silent expiry read as an
   outage.
3. **The energy history is not in the public API.** `APICenterV2.md` documents the device list and a
   status read and **no** consumption-statistics endpoint. The only published mechanism is the
   per-device protocol, and it covers **UIID 5/32 only** (`{"hundredDaysKwh":"get"}` → 100 *daily*
   values, hex, 600 characters, current day first). CoolKit states the complete protocol is *"only
   available to paid APPID users"*, and the POWCT / POW Elite family is absent from the public
   document entirely. Since the CSV this repo already parses is **hourly**
   (`data,time,consumption/kwh`), these meters are almost certainly one of those undocumented
   models — so **what history the API will yield cannot be settled from the documentation, only
   from the account**. Discovery is therefore a first-class part of the screen: each device's UIID
   and the params it actually returned are stored and shown.

**INV-08 by construction.** eWeLink's control endpoint is `POST /v2/device/thing/status`, and these
meters are switching relays — a POST could de-energise a society's common-area lighting.
`src/lib/ewelink.ts` knows the token, refresh, device-list and status-**read** endpoints and nothing
else. The guarantee is the absence of the call, exactly as in `tuya.ts`.

**Signing is pinned to CoolKit's own worked examples** (`src/lib/ewelink-sign.ts`, 14 unit cases):
the POST-body vector and the authorize-link vector both reproduce byte-for-byte, so the signature
was known-good before the account was ever touched — the API answers any mistake with a bare "sign
invalid". GET parameters are **sorted**, the same trap already found and fixed in the Tuya client.

**The hundred-day decoder refuses rather than guesses.** The document gives the blob's length,
units and ordering but **not** how each day's three bytes split. A plausible-but-wrong reading here
lands a wrong number in a figure a society is billed on — precisely the class of the water-tank
`levelMax` bug (a raw 45 that meant 75%). So `decodeHundredDaysKwh` refuses a fractional byte above
99, and `todayAgrees()` checks day 0 against the device's *separately reported* `oneKwhData`:
the device states today twice, and if the two disagree the blob is not decoded correctly and none
of it is usable. Nothing reaches the reading store until that check passes.

**Assignment is to the CIRCUIT** (`MeterDevice.circuitId`, unique), with the society carried
alongside for scoping and settable on its own while the circuit is undecided — CON-11 makes the
circuit the billing grain, and two meters on one circuit would be two sources for one billed figure
that INV-02 cannot resolve. Non-metering devices stay listed and unassignable, the same call made
for the Tuya energy meters on the tank list: a device simply missing from the screen reads as an
account problem rather than as the wrong kind of device.

**Deliberately not built, and stated rather than stubbed**: the history fetch itself. It needs the
account — the App ID/secret, the registered redirect, and each meter's real UIID and params. When
it lands, D-3 of the design doc governs it: a fetch writes its payload to the private `Ingest/`
prefix, creates a `RawReadingFile` (`vendor: "ewelink"`, `source: api` — the enum value reserved
for exactly this since MS-07) and goes through CON-45's row-by-row review. Auto-committing would
put a billed figure into the store with nobody having looked at it, which is what INV-02 and INV-09
exist to prevent.

**Verified in a browser, 21/21, zero console errors** — the unconfigured state and where it points,
the application saving without that counting as "authorised", the secret never rendered back, every
device listed with its UIID, a non-metering device unassignable and saying why, the meter binding to
the circuit with the society following and the actor recorded. **Two refusals were driven through
paths the client cannot pre-block**: the second meter on one circuit (the option's `disabled`
stripped so the action really ran — refused by name, nothing written) and the operations gate on the
configuration (the actor's team moved off operations behind the open form — refused, stored app id
untouched). The OAuth callback's own refusals are checked too: a `state` that does not match the
cookie we set is ignored with no token stored, and a cancelled authorisation is not an error.
519 unit tests, `tsc`/`lint`/`build` clean. Migration `20260826090000_add_ewelink_meter_mirror` is
purely additive (2 tables, 3 indexes, 4 FKs).

**One process note worth keeping**: `prisma migrate diff --to-schema-datamodel` is gone in this
Prisma — it is `--to-schema` now — and `prisma db execute` silently printed its help text and did
nothing while `migrate resolve --applied` happily marked the migration applied. The tables did not
exist. **Check the tables, not the exit code**, the same lesson as the 0-byte `pg_dump`.

## A form that opened below 45 rows, and a Modal this codebase already had (2026-08-28) — user-caught

**"It feels like the button is not working"** — clicking Reassign on the meters list rendered the
assign form at the BOTTOM of the card, below all 45 rows, so nothing visibly happened. It is a
modal now, which cannot be off-screen: verified by clicking Assign on the third-from-last row and
asserting the dialog's box sits inside the viewport and centred.

**The finding worth keeping is what that exposed**: `src/components/modal.tsx` ALREADY existed — a
proper controlled native `<dialog>` with Esc/backdrop handling and, crucially, the `m-auto`
centring — and the earlier "Record readings" dialog had hand-rolled its own instead, which is why
it had to rediscover the top-left-corner bug the shared component had solved months earlier. Both
now use the one component (which gained an optional `size="wide"` rather than being forked again).
**Before writing a dialog, an overlay, or any other common shell here, look for the existing one.**

**One regression caught by the suites, not by eye**: the shared Modal put its buttons in a
`footer`, and the recording flow passes none — so it briefly had no visible way out at all, Esc
only. The Modal now carries a close control in its own header, for every consumer.

## Three buttons that were three different things, and a figure that moved when its neighbour was missing (2026-08-28) — user-caught

**"None of them have any synchronisation between them"** — correct, and the cause was a category
error of mine, not taste. The page has ONE action (Record readings — it writes) and TWO navigations
(setup & history, monthly report — they just go somewhere), and I had dressed all three as solid
blue buttons at three sizes in three corners: three competing primaries. Designed three options on
a canvas; the user picked **Option 3's structure with Option 1's palette**, which is what shipped:
each navigation is a full-bleed band forming the card's last row — tinted `--accent-subtle` on
`--accent-line` with accent ink and a chevron — pinned flush to the card's bottom edge, with the
one solid button left alone in the header. **The rule: one solid button per page; navigation is a
quieter, consistent family.**

**`mt-auto` needed a flex column to push against.** The bands first floated mid-card at two
different heights because `.card` is not a flex container — `flex flex-col` on both cards pins them
flush, verified by measuring each band's bottom against its card's (within 1px, and equal to each
other).

**A figure moved because its neighbour was missing** (user-caught on the meters list): one row's
wattage sat right, its neighbours' sat left. The power cell was `justify-end` with the sparkline
INSIDE the flow, so when a meter had too few reads to trend, the number slid right by the
sparkline's width. Now both slots are always drawn at fixed width — and the empty one renders a
DASHED baseline (never solid: a flat solid line reads as a real reading of zero) titled with how
many reads it has of the three it needs. Proven by giving one row 5 samples and its neighbour 1:
both wattages landed on 776px. **The general shape**: a cell whose left half is positioned by its
right half will move whenever the right half is conditional.

**Why a sparkline was missing at all** — nothing wrong: it needs 3 hourly samples and that meter
had 2. Stage's newly-assigned meters hold 1–7 samples each; the hourly poll fills them in.

**The readings listing opens on VALID readings only** (the user's earlier instruction, missed once
and now honoured): excluded and flagged days are what the averages already ignore, so a listing
that opens with them mixed in reads as the record when it is not. The footer states what the
default hides — "183 excluded or flagged hidden" — as a button that widens to the full record, so
a default filter can never quietly shrink what an operator believes they are looking at.

## The links became buttons, and "commissioning record" got a name its reader understands (2026-08-28)

**Round three of a recorded lesson**: the first cut used `.btn-outline`, and the user's "they
doesnt look like buttons" is the same taste the design history already logged twice (2026-08-18,
both rounds): to this product's owner a button is a SOLID fill with lift — an outline pill reads
as a tag. `.btn-secondary` (the deep solid of the same blue, with its shadow) is what they are now.
When adding any secondary action in this codebase, reach for solid-with-lift, not outline.


Follow-up to the rehoming below: the two in-card links are `btn-outline` buttons now, and the
commissioning one is retitled **"Circuit setup & history"** — "commissioning record" is this
blueprint's own vocabulary, and it meant nothing to the person the button is for. The rule worth
keeping: a control is named for what the reader GETS, not for the internal phase that produced it.

## Two floating links found their homes (2026-08-28) — user-questioned

"What are these two links doing here? are they required?" — the underlined pair sitting between
the header cards and the filters. The DESTINATIONS are required (they are this screen's only routes
to the circuit's commissioning record and to the monthly savings report); the PLACEMENT was not —
two orphaned links between sections read as leftovers. Each moved into the card whose story it
completes: **Commissioning record →** into "The demo behind it" (which IS that record's summary,
and was the sparsest card), **Monthly savings report →** into the Savings card footer beside the
day counts, rendered only when there are days to report. Verified that both live inside their
cards and still resolve to real pages.

## The dialog parked itself top-left, and a "removed" button that was never removed (2026-08-28)

**The popup was not centered** (user-caught): a modal `<dialog>` centers through the UA's own
`margin: auto`, and the CSS reset zeroes every margin — so `showModal()` parked it in the top-left
corner. One class (`m-auto`) restores the load-bearing margin; verified by measuring the open
dialog's box against the viewport centre, not by eye. **Worth remembering**: any future native
dialog in this codebase needs its `m-auto` back, for the same reason.

**"There was a different button here before this — why was it removed?"** It was not: the button
remembered is demo mode's **"Fill readings form"**, which lives inside the recording panel and
renders only while the app-shell toggle is set to demo. The toggle read NORMAL in the screenshot,
so the section was hidden — flip it and the button is back, now inside the popup. The user also
confirmed the hours-with-data marking design as shipped ("this works better"), so it stands
unchanged.

## A 24-row day can still be mostly silence — the listing now says so (2026-08-28) — user-specified

**The user's domain fact, and the gap it exposed**: the vendor's export writes **0 for an hour the
meter was offline or switched off**, so a day can hold all 24 rows and read as complete while the
meter was silent for most of it. The row count (`intervalCount`) — the only completeness signal the
listing had — cannot see this.

**The marking**: the readings listing (the live-monitoring explorer, **back office only** — the
portal never renders this listing and gains nothing) derives per-day *hours with data* from the
bound meter's own hourly store and marks any day short of its row count: "24 · 18h with data" in
warn, "no hours with data" for a fully-silent day, with the vendor's 0-means-offline behaviour
explained in the title text.

**Two honesty rules carried the implementation**: a day the hourly store never covered shows NO
marking — a reading from the upload era has no hour-level truth behind it, and "0h with data" there
would be a claim about silence where there is simply no evidence; and the marking never changes
exclusion or flag semantics — it is information, the operator's exclusion mechanism is the act.

**Verified 27/27**, including a manufactured partial-silence day: six hours of a real complete day
zeroed in the meter store behind the running page → the row read "24 · 18h with data" → the six
hours restored from the CSV's own values, confirmed by sum.

## Live monitoring's circuit page: readings first, grouped context, and a freeze that gripped the wrong days (2026-08-28) — user-specified

**The layout ask**: the always-open upload card pushed the stored readings below the fold, and the
readings are what the visit is for. The recording flow now lives behind a **Record readings**
button in the page header, opening a native `<dialog>` (the repo's established modal pattern);
the readings open at the top as a working table — **latest first, sortable by clicking any header,
filterable** (one date, a range, status, in/out of savings band), **paginated at 10/20/30 per page**
so the list is never longer than a month. Per-row **exclusion survived the redesign** — nearly
shipped as a silent loss, since the old panel carried it and the new table's spec didn't mention
it; it is the operator's main correction tool on this screen, so it is a column now, with the
reason required inline.

**The header cards ask**: grouped stories, not one tile per figure. Three cards — **The agreement**
(benchmark fixed for the term · contract in force since · billing started, each "not recorded"
stated rather than blanked), **The demo behind it** (the demo baseline, titled "· in force" when no
rescale has moved it, else both figures; the demo-measured benchmark via `deriveBenchmark` over the
live demos, with a note when the agreed figure differs from what was measured), and **Savings**
(this month · last month · this year · overall, each band-chipped over its own days, against the
baseline in force; days recorded/excluded/flagged in the footer).

**A real freeze bug found by the e2e, not by the report**: excluding a monitoring day on Ace City
was refused with "Frozen — the benchmark is confirmed and fixed for the term." That rule protects
the post-install days a benchmark was COMPUTED from — but `classifyDay` cannot tell a post-install
commissioning day from a monitoring day, and Ace City's benchmark came from its DEMOS: these
monthly rows never fed it, so the freeze was gripping days that were never part of the computation.
Fixed in the phase derivation, not by weakening the rule: benchmark confirmed AND resting on demos
or an explicit override → the day is a monitoring day; a circuit whose benchmark was computed from
its own post-install days keeps the freeze exactly as before.

**Verified 25/25** (dialog open/close; latest-first; both sort directions on date and kWh; all four
filters partitioning correctly against the flagged dead-meter days; single-date; 10/20/30 with the
30 cap; paging; exclusion round-tripped against the row and re-included). **Two harness lessons in
one suite**: assertions must derive expectations from the data on screen, not hardcode the other
environment's file — and a suite that leaves the table sorted by kWh ascending hands the next
section a first page of zero-kWh days.

## The billing rows are a projection of the meter store now — the review gate is gone from this path (2026-08-28) — user's decision, reaffirmed

**The review-gated hand-off shipped earlier today lasted a few hours.** The user looked at stage —
meter section full of readings, live monitoring still "awaiting readings" — and reaffirmed the
instruction the hand-off had answered only halfway: "i told you to centralise them they both should
use the same table same readings." The reaffirmation is the decision (the case for the review gate
was made and overruled), so the gate went, recorded as **CON-45 amendment (k)** in `00-intake.md`.

**The design now**: `MeterHourlyReading` is the single source of readings; `MeterReading` (the
billing grain) is its **automatic daily projection**, maintained by `projectMeterStoreToCircuit`
(`src/lib/meter-billing-handoff.ts`, rewritten) whenever a bound meter's import commits. One upload
on the meter page → figures on the meter dashboard, live monitoring, the circuit page and billing
at once. Correction is post-hoc via the existing exclusion/supersession mechanisms, not a gate in
front of the numbers.

**The invariants hold without the human gate, and the e2e drives each one:**
- **INV-02**: `MeterReading.rawFileId` is required, so every projected row traces to a
  `RawReadingFile` whose bytes are in S3 under `Ingest/`. An import made before this pipeline
  (stage's) has no stored bytes — its file is **reconstructed from its own hourly rows** and named
  "(reconstructed from meter store)" rather than passed off as the original.
- **INV-09**: each day is checked as it lands — partials stored but auto-excluded; a day above
  CON-20's >80% suspect bound or negative is stored and flagged. On stage this immediately caught
  **15 days of exactly 0 kWh in April** — a dead meter reading as "100% savings".
- **INV-03**: a row a released calculation consumed is never restated — driven in the e2e by
  locking a row behind the open form and re-importing: left byte-identical, conflict counted.
- **ADR-005**: a changed value supersedes (old value kept), never overwrites; an auto-partial
  exclusion clears when the day fills out to 24 hours (the MS-07 "resolution against a replaced
  value" lesson), while a human exclusion is never touched.
- **Idempotent**: re-importing the same file changes nothing, asserted on counts and superseded sums.

**The row-wise pre-save review is NOT dead**: it remains the flow for uploads made on the circuit
page itself — files with no bound meter behind them — and the S3-resume fix from the earlier stitch
(a pending CSV readable back from storage) stays, since it also un-strands reviews interrupted by a
reload.

**Stage was backfilled live**: the projection ran from the local checkout against the stage DB
(schema was already current — the user had deployed), reconstructing the raw file for the existing
import and creating 190 daily rows. Verified over the public HTTPS path on the DEPLOYED UI: Ace
City reads **On target · benchmark 66.4% · measured 64.8% · 190 days · last reading 2026-08-28** —
from the single upload the user had already made. Dev verified 11/11 (both stores provably equal:
every daily figure asserted equal to the sum of its own hours in SQL).

## One upload, one pipeline: the meter store and the billing store are stitched (2026-08-28) — user-caught gap

**The report**: readings uploaded on the meter page showed on the meter dashboard, while live
monitoring still said "awaiting readings" — "they are acting as two different tools." The user
offered a full merge as an alternative, with the condition that whichever answer wins had to be
argued, not asserted.

**The answer: two stores, one pipeline — and that split is the industry's own shape, not this
codebase's quirk.** Utility metering architecture runs a validation step (VEE — validate, estimate,
edit) between raw interval telemetry and "revenue-grade" data, and billing consumes only the
validated side. That maps exactly onto what was already here: `MeterHourlyReading` is raw hourly
telemetry, CON-45's row-by-row review is the VEE step, and `MeterReading` is the revenue-grade
daily store that benchmarks, live monitoring and bills read. Merging the stores would either let
unreviewed numbers reach a billed figure (what INV-02/INV-09 exist to prevent) or block the
monitoring view behind a review it does not need. **What was genuinely broken was the seam: one
file had to be uploaded twice, once per store.** Now the meter import files the same bytes into the
circuit's review queue by itself, and the operator's review is the only step left between one
upload and every surface.

**The pieces, each load-bearing:**
- `handOffToBillingReview` (`src/lib/meter-billing-handoff.ts`): after the hourly commit, the same
  text goes to S3 under the private `Ingest/` prefix (CON-30 — bytes before interpretation) and a
  `RawReadingFile` is created for the bound circuit. Deduped by filename+size against files already
  awaiting review, so a re-import cannot queue the same review twice. A meter with no circuit, or a
  circuit with no install date, is stated on screen rather than silently skipped.
- **A pending CSV is now resumable from S3.** `textForUpload` read a CSV's text only from the
  client, so any pending file not opened in the same session — a hand-off, or simply a reload
  mid-review — was stranded in the queue forever with no way to open it. It falls back to reading
  the stored object now; this also fixed the pre-existing reload case nobody had hit yet.
- **The circuit page and the live-monitoring page both announce a waiting file** ("filed by the
  meter page's import — Review it") instead of leaving it invisible: the panel only knew about
  files chosen in its own session.
- **The review link goes where the review is visible.** A commissioning-phase file links to the
  circuit page's current step; a monitoring-phase file links to `/admin/live-monitoring/[circuitId]`
  — on a finished circuit the readings step is a collapsed done-section, and a link into a
  collapsed section is a dead end (the e2e caught exactly this: the callout present but hidden).
- `MeterCsvImport.rawReadingFileId` links the import to its review, so the meter page's imports
  list shows "Billing review pending →" / "Billing review done" — the file's whole journey from
  one row.

**Verified end to end with the real 190-day export, 14/14, zero console errors**: one upload on the
meter page → 4,536 hours in the meter store AND a review filed (bytes confirmed under `Ingest/`) →
the live-monitoring page announces it → Review it renders 190 rows read back from S3 with no client
text → Save 190 readings → 190 `MeterReading` rows (`source: csv`) → live monitoring flips Ace City
from "awaiting readings" to a measured figure with day count and last-reading date. Two harness
traps, both this repo's documented classes: a wait on `/average/i` matched the review screen itself
and raced the commit (the DB probe then honestly read 0), and the "no 'none yet' anywhere" assertion
was wrong because fourteen OTHER circuits honestly say "none yet".

## Sortable columns, an assigned-by-default filter, and a rename eWeLink will not allow (2026-08-28)

**Renaming a meter cannot be done, and the finding is worth keeping so nobody rebuilds it.** The
ask was to rename in the vendor system rather than locally, which is the right instinct — a
local-only name would drift from the eWeLink app and make it unclear which meter somebody is
standing in front of. CoolKit does document the endpoint (`POST /v2/device/update-info`, taking
`deviceid` and `name`), and it is metadata rather than actuation, so INV-08 would not have stood in
the way. **The live account refuses it: `error 407 — the path of request is not allowed with
appid`.** This application's API role is not granted that path, which is CoolKit's to change, not
something this end can work around. The user's call was "if it cant be done then leave it", so the
action, the vendor write and the field were all removed rather than shipping a control that always
errors — the eWeLink client is read-only again, and its lack of any device write is once again the
guarantee INV-08 rests on. The route that works today needs no code: rename in the eWeLink app,
then Sync account. Only the 407 → `EwelinkPathNotAllowed` mapping was kept, because any endpoint
can return it and a named error beats a bare number.

**A local `displayName` column was built, applied to dev, and then withdrawn in the same session** —
correctly. It was the answer to the wrong question: with the rename living in the vendor, a second
local name is exactly the drift to avoid. Withdrawn rather than dropped by a follow-up migration,
since it was uncommitted and dev-only.

**The list defaults to ASSIGNED meters.** On this account 30 of 45 devices are unbound, and an
unassigned device is mirrored but not watched — it raises no alerts and is not yet the product's
problem, so by default it buried the fifteen that are. Chips are Assigned · Needs attention · Not
assigned · All devices, each carrying its own count.

**Columns sort on click**, with two rules that are the whole design: text starts ascending while
figures and state start at the end that answers why anyone sorted (biggest power, worst state
first); and **a meter with nothing in the sorted column always sinks, in both directions** — thirty
dashes floating to the top is not an ordering anybody asked for, and "sort by power" means "show me
the ones that have one". Asserted in both directions.

**Two card actions were wrapping below their heading and reading as stray controls** (user-caught,
screenshot). The heading column sized to its own unwrapped paragraph, which is wider than the row,
so the button had nowhere to go but the next line — `min-w-0 flex-1` on the text and `shrink-0` on
the action, the shape `PageHeader` already used. The layout audit gained the rule: a card's action
must sit on the heading's line, within 40px of the card's right edge.

## The user's stage screenshots caught three defects in the new meter screens (2026-08-28)

**The worst was a false claim, proved by arithmetic before touching anything**: the daily chart
showed 08-14 as "3.8 kWh · partial" while the stage database held a complete 24-hour day totalling
18.58. `meterHourly` took the newest `days x 24` ROWS — and with today only 18 hours old, the
window reached just 6 hours into the oldest day (336 − 18 − 13×24 = 6; 6 × ~0.64 ≈ 3.8, exactly
the figure on screen). A truncated query dressed as a partial day is a false statement about a
complete one, and partiality is precisely what this chart promises to report honestly. It windows
by DAY now, from the latest stored day back.

**"Touching the edges and spilling out of corners" — the user was right, and the audit now measures
it.** `.card` deliberately carries no padding of its own; every older caller adds `p-*`, and the
new meter cards mostly did not — so the fleet bar, the readout, the charts and the tables sat flush
against the rounded corners. All padded, and the verification now asserts in PIXELS that no card
child sits within 8px of its card's edge on either page, rather than trusting a screenshot glance.

**The Imports card could not contain its content** (user-caught, same round): a four-column table
in a half-page card, holding vendor filenames that are themselves wider than half a page, can only
overflow into a horizontal scroll — so the match method and the uploader were off-screen until the
reader scrolled. Rebuilt as a stacked list, matching the Events card beside it: filename on its own
line, then range · hours · match · uploader as a wrapping metadata row. The audit gained the
general rule rather than a fix for this one card — **no `.card` may need a horizontal scroll at
desktop width** (`scrollWidth > clientWidth` on the card or any descendant), which is the class of
defect a screenshot catches and a render-only check never does.

**The hero wrapped at ordinary laptop widths**: at 1024–1280px the 5/12 gauge column is narrower
than the gauge plus its labels, so V/A/PF fell underneath and dragged the panel tall, leaving the
counters panel with a hollow middle. Two changes: the label column takes `flex-1` (zero flex-basis
— it can never overflow the line and trigger a wrap on a wide screen), and the two-panel split
starts at `xl` rather than `lg`, so below it the panels stack full-width.

**Also learned from the same screenshots**: the user had already deployed to stage themselves and
put the module to real use — 15 meters assigned, and the CURRENT Ace City export (Feb 20 → Aug 28,
4,536 hours, ~18 kWh/day steady) imported cleanly, "chosen by hand" because a first import has
nothing to match against. Which also settles something about the older sample file: its Dec–Jun
data (92% zeros, then ~6/day) cannot be the same meter — it remains in dev as test data only, and
stage never saw it.

## The meter screens rebuilt to the researched design (2026-08-28) — user-directed, canvas first

**The sequence the user chose**: a fresh design on a canvas first ("do fresh design", then "do it
for all three theme types"), researched against how energy-monitoring products present meter fleets
and detail pages, and only then "implement the design to current pages". The canvas
(claude.ai/code/artifact/45e24661…) holds the two screens in all three product themes plus a light
"ledger" alternate sketch; the implementation maps the design onto the EXISTING token system rather
than the mockup's literal hex, which is why all three themes worked on the first screenshot with
zero per-theme code.

**What the research contributed, and where it landed**: a fleet screen answers "is everything
reporting?" before showing the inventory — so the four stat tiles became one **Fleet health band**
(a segmented proportion bar + counts + history total); a list row pairs a value with its trajectory
— so the Power column gained a **24h sparkline** from the poll samples (rendered only at 3+ points:
two samples draw a trend no data supports) and Today became a **ceiling-track bar**; a detail page
ladders hour → day → month and leads with power against capacity — so the readout is now a
**gauge** of watts against the circuit's CONNECTED LOAD (Σ count × wattage — the instantaneous twin
of the daily kWh ceiling, `connectedLoadW` on the view model), beside an **energy-counters panel**
whose today figure runs on the same ceiling track. A **Daily consumption** bar card (14 days) now
sits above the 7-day heatmap — the trend is where a retrofit reads as a cliff, the heatmap answers
when within each day — and an **Events** card assembles the meter's recent life (alert
opened/closed with reasons, imports with their match method) from rows of record rather than a new
table. Partial days are amber, never a short blue bar: a short bar reads as a quiet day, which a
partial day is not evidence of.

**The lime rule carried through**: `--signal` (the brand's "lime marks a verified value") is the
gauge arc, the sparkline stroke and the ceiling fills; `--chart-mark` blue is stored history —
live vs stored is a colour distinction now, in every theme, without a single new token.

**Verified**: 21/21 import suite, 16/16 portal suite (the shared `MeterReadout` gives the portal
the same gauge for free; a meter with no inventory falls back to the plain figure), 694 unit
tests, `tsc`/`lint`/`build` clean, zero console errors, screenshots in all three themes. Harness
assertions updated where the copy deliberately changed ("this month so far" → "kWh this month";
the stat tiles → the fleet band) — and one self-inflicted lesson: running a suite twice in one
command makes the second run fail against the first run's own import.

## The meter module: a hundred-fold scale error, and the hours the API will not give (2026-08-28) — user-specified

**The ask, settled over several rounds**: the vendor API is used ONLY for the realtime picture of a
meter when somebody opens it; only the last read value is stored; the hourly series comes from CSVs
downloaded off each meter; an hourly cron checks two things — offline after **two consecutive**
failed fetches, and whether the day's consumption is beyond what the circuit can draw; and because
a CSV carries no meter identity, the system matches it against stored hours and **always asks the
operator to confirm**.

**The defect underneath all of it, found before building on top of it: every stored power figure
was a hundred times too large.** UIID 190 meters (POWR316/316D/320D — all 45 on the account) report
each electrical datapoint in HUNDREDTHS, and both the poll and the device sync stored the raw
integer. A 1,153 W lighting circuit sat in the database as **115,335 W**. The scale is not inferred
from the model name — it is proved by physics the device reports alongside the figure: `voltage:
22945` is 229.45 V and `24224` is 242.24 V, Indian mains, and only the hundredths reading puts them
there; V x I then reconciles with the reported power at a power factor of 0.88–0.90 on every device
checked. Same class as the water tank's `levelMax` (a raw 45 that meant 75%): **a plausible wrong
number survives every freshness check ever written, because nothing about it looks stale.**
`src/lib/ewelink-scale.ts` owns it, `mainsPlausible` keeps the same check available at runtime, and
a device type whose scale has never been established returns **nulls, never raw figures** — a number
shown at an unknown scale reads as fact. The poll was also asking for `oneKwhData`, which these
devices do not report at all; it asks for `dayKwh`/`monthKwh` now.

**The sync no longer stamps `lastReportedAt`.** It was taking the account listing's cached `online`
flag — already observed stale — and claiming the device reported at that moment. Mirroring what
devices exist is the sync's job; deciding health is the poll's, against a live read.

**Alerting is on the transition, and the database enforces it.** One OPEN alert per meter per kind,
guaranteed by a partial unique index (`meter_alerts_open_unique`), not by an application check an
hourly job can race itself past. The outage start is stamped once and kept across a run of bad polls
— "down since 09:00" is the fact somebody acts on, and restamping it hourly would erase it. An
alert is never deleted; it closes with a stated reason.

**The out-of-range check is a physical ceiling, not a statistical band.** A circuit cannot draw more
than everything on it running flat out all day, so the ceiling is `theoreticalDailyKwh` of the
ORIGINAL fixtures (what the wiring ever carried, so a partly-completed retrofit cannot make it
fire), with 10% headroom for metering tolerance. A band around recent days would fire on a festival
or a season, and this alert has to mean *go and look at this meter*. A circuit with no load
inventory yields **`unknown`**, which neither opens nor closes an alert — not knowing whether a
reading is possible is not evidence that it is.

**The hourly series cannot come from the API, and that is settled rather than assumed.** The devices
do hold their own hourly buffer — `getHoursKwh` reports a descriptor spanning 744 slots, a month of
hours — but no public REST endpoint returns its contents. So the series comes from the CSV, parsed
by the pipeline CON-45 already built: the user's real export was recognised as `sonoff` with **zero
unreadable rows**, 4,536 hourly values over 190 days, no new parser needed.

**The finding that shaped the matching, and it came from measuring the file rather than reasoning
about it: 92% of those 4,536 values are exactly zero, and the first non-zero reading is 174 days
in.** A run of zeros identifies nothing — every idle meter agrees with every other idle meter,
perfectly, for as long as you like. So a match is counted in DISTINCTIVE hours (both sides non-zero
and equal, minimum 8), and a comparison with too few of those reports **no evidence** rather than a
confident wrong answer. A meter that disagrees on more than 2% of the overlap is ruled out however
much else lines up — and the proposal is the qualifying candidate, deliberately **not** the top of
the sort, because a meter can lead on matches and still be the one the evidence excludes.

**Filing a file against the wrong meter is the mistake this is built around**: it puts one society's
consumption into another's monitoring and looks entirely normal afterwards. So analyse and commit
are two acts, nothing is written by the first, the screen names the meter the evidence points at
when it is not the one being viewed, and the button then reads "Import here anyway" with the
override recorded on the import row. The commit re-derives everything from the file text — the
browser's parsed rows are never trusted.

**Two performance traps avoided by reasoning about the real file, not the test one**: an `OR` of
4,536 clauses is a query Postgres plans badly or refuses, so the delete is grouped by day (complete
days in one statement, only a genuine partial day gets its own) — and deleting the whole day range
instead would be wrong, dropping hours a denser earlier import held that this file does not cover.
The insert is one `createMany`, the lesson the 275-day Ace City import already paid for.

**A figure is never shown without its age** (`meter-live.ts`), on either surface. A meter unreachable
for three hours still has a last known reading worth seeing; presenting it as the current one is the
water-tank lesson. The portal is held to a longer read floor than the back office, so a page left
open cannot spend the account's vendor allowance.

**Screens**: the back office list opens with what needs attention rather than the inventory (forty-
five healthy meters bury the two that stopped answering last night), then summary tiles, then a
table carrying state, power now, today against the circuit's ceiling, history held, and who is
chased. `/admin/meters/[id]` adds the live readout, what the meter measures, the hourly chart and
the import history. The portal gets its own Meters tab, list and detail, built from the SAME view
model (`meter-view.ts`) so the two surfaces cannot disagree about what is true — they differ only in
what they let you do. INV-05 is enforced in the query, which takes the viewer's own societyId as its
only scope.

**Verified against real devices and real rows** — 42 browser checks across three scripts and 18
against the database, zero console errors, zero page errors. A live poll of two real meters stored
934.13 W / 244.88 V / 4.33 A and 615.12 W / 252.07 V / 2.71 A, confirmed by `psql`; the alert
lifecycle was driven through first-failure, second-failure, staying-down, recovery, the capacity
ceiling and an unreachable poll leaving a capacity alert standing, with the index itself refusing a
duplicate; the user's real 190-day export was imported through the browser (4,536 hours stored),
re-uploading it then matched its own meter **on the 354 hours that carry a reading**, a re-import
changed nothing, and uploading it on another meter was flagged by name. **The refusal was driven
through a path the client cannot pre-block** — the permission revoked behind the open form — and
refused by name, writing neither readings nor an import record. 691 unit tests (was 651);
`tsc`/`lint`/`build` clean.

**The hourly chart was rebuilt after the user rejected the first version, and the rejection was
right.** It began as 24 bars per row, and a bar 65px wide by 20px tall cannot encode a value: the
real series holds a 60% regime change — 1-5 June at ~15.9 kWh/day, 7-13 June at ~6.0 — and it
rendered as fourteen identical rows of blue. It is a day x hour HEATMAP now, with each day's total
as its own bar alongside: the cell says what happened in that hour, the bar says what the day came
to, and neither is legible from the other. Three states stay distinct — consumption, a reported
zero, and an hour the export never carried — because a missing hour and a quiet hour are different
facts. **The colour scale is linear, deliberately**: a square-root curve was tried first and made a
0.29 kWh hour read at two thirds of full accent when it is a third of the peak, and on a product
whose figures are billed, a scale that flatters the low end is one that misleads. Verified by
measuring the painted pixels rather than by eye — the two regimes now sit at 0.80 and 0.61 oklab
lightness where before they were identical — and screenshotted in all three themes.

**A screenshot of the detail page then caught the meter module's worst copy defect: it said two
opposite things at once.** "Last known, read 16 min ago. These are not current figures." sat
directly above "Answering and sending fresh readings." The cause was a staleness threshold picked
by feel — 15 minutes — against a poll that runs HOURLY, so every healthy meter would have carried
that warning for 45 minutes out of every 60. A warning that fires on the normal case is one people
learn to ignore, and the real one goes with it. The threshold is tied to the poll cadence now (90
minutes means a scheduled read was actually missed), and the two sentences are one: `readingCaption`
covers age and reachability together, because two independent sentences about one fact will
eventually disagree.

**Three smaller defects from the same screenshots**: `Basement · basement` (several backfilled
circuits sit in the Basement and carry the light type "basement", so the label read as a rendering
fault — `circuitLabelOf` collapses it, and the four places that built that string by hand now share
it); `4536` without a thousands separator next to a tile that had one; and a `<select>` for the
meter's owner rendered in all 45 table rows, which made the list read as a form and gave the one
column nobody scans the most visual weight. The owner moved into the assign panel that already
opens per meter, and both are saved together.

**15 of the 45 device names in the account carry surrounding whitespace** ("AIPL S70 A Gurgaon "),
which is invisible on screen and silently breaks every exact match against them — it is what made
one verification fixture appear not to apply at all. `syncMeterDevices` trims on the way in.

**Two test-harness notes, both already recorded once here and both caught again**: `.lbl` uppercases
and `innerText` returns RENDERED text, so "Power now" is "POWER NOW" — match case-insensitively.
And a wait target has to be unique: `Covers` is the preview's label *and* the imports table's
column header, so the wait resolved instantly against the wrong element and the assertions read the
wrong part of the page.

**Not built, and not claimed**: an S3 copy of the uploaded CSV (`MeterCsvImport.s3Key` exists and is
unused — the readings trace to the import row, not yet to the bytes); real delivery of an alert by
email or SMS (ADR-008 is still Proposed, so an alert is in-app plus a log line); and none of this is
deployed to stage.

## The tank is a lit vessel, and the chart says when each reading arrived (2026-08-25) — user-corrected twice

**Two corrections, both mine to make, and the second reversed the first.** Asked to make the water
visible, the first attempt lightened the WATER — wrong twice over: it lost the brand blue and left a
tint sitting on a tint. The user's own words settled it: *"keep the water color as it was. just
lighten the color of tank"*, then, once the vessel went light, *"the tank is not visible with the
white background. broad the box shadow. make the border more visible"*. So the water is `--accent`
again and only the **vessel** changed: `--surface`, a real `2px solid var(--field-border)` edge — the
token that already guarantees a ≥3:1 control boundary, used here for the same reason inputs use it —
and a broad three-part lift, because the vessel sits on a card of the identical colour and dissolved
into it without one.

**The level figure takes its ink from whatever is actually behind it** (`--tank-ink-dry` on the dry
vessel, `--tank-ink-wet` on the water), because one fixed colour necessarily fails against one of the
two. `--tank-ink-wet` is `var(--text-on-accent)` and deliberately **not** a hardcoded white: dark
theme's accent is a *light* periwinkle, where white-on-water measures 2.2:1 while reading fine in
light theme. Submerged tick labels flip the same way.

**A real bug the lighter palette exposed, present since the feature shipped.** The wave elements are
deliberately far larger than the tank and sit above their own top edge to make the surface undulate —
unclipped, they painted the whole **empty** half of the vessel, so a 30%-full tank rendered as a full
one. Invisible while the water was a saturated accent on a tinted ground; obvious the moment the
vessel went light. `.tank-water { overflow: hidden }` clips them, and the check asserts a 30% tank is
drawn 30 ± 1.5% full rather than trusting the eye. **Worth remembering as a class**: a decorative
overflow is only invisible while the two surfaces it spans are the same colour.

**The chart now answers "when".** Every reading is a dot; hovering one reports its level, its moment
in IST and its age, with a crosshair marking it — because a flat line of identical values is either a
calm tank or a silent sensor, and only the timestamps distinguish them. Each point also carries a
`<title>`, so touch and screen readers get the same fact without a pointer.

Verified in a browser with contrast computed from the pixels actually painted rather than from the
tokens intended (11 checks + 9 freshness), water tanks 28/28, portal 24/24, smoke 23/23; 505 unit
tests, `tsc`/`lint`/`build` clean. No migration.

**A dev-only false alarm, run to ground rather than dismissed** — reported as *"when I open the tank
the first time it comes fine, but on refresh the older colors come back"*, and the app was never
wrong. Turbopack serves `globals.css` at a **fixed URL** whose name does not change when the file's
contents change — proved by editing the file and re-reading the served `<link>`:
`chunks/[root-of-the-server]__1cibrky._.css` before and after. So a browser can hand back a pre-edit
stylesheet on a reload while the still-open tab keeps whatever HMR pushed into it, which is exactly
"fine until I refresh". A production build content-hashes the filename, which is why stage never
showed it. A clean browser at HEAD rendered correctly on four consecutive loads, sampling
`elementFromPoint` at three heights over three seconds each so a wave-animation phase could not hide
the symptom. **The general shape**: before believing a style regression, check whether the stylesheet
the browser is holding is the one on disk — in dev they can differ at the same URL.

## A raw level is not a percentage (2026-08-25) — user's question found it

**"How is it showing 45%, where it can only detect 25-50-75 and 100%?"** — the question that found a
real bug. The Smart Life app was right and we were wrong, for a reason no amount of staring at the
staleness would have revealed.

`liquid_level_percent` is named like a percentage and carries a `%` unit, and **is not one**. Its
range comes from the device's own thing model, and these IT56WLCW controllers declare it **0–60**:

```
"liquid_level_percent": {"type":"value","min":0,"max":60,"step":1,"unit":"%"}
```

So raw `45` is 45/60 = **75% full** — exactly what the app draws, its fill sitting just above the
75% marker. We clamped the raw to 0–100 and showed 45%, **understating every tank on the account by
a third**. On a product that bills against measured figures, that is the class of error INV-02
exists for.

**The fix**: `WaterTank.levelMax` stores each device's declared maximum, learned from
`/v2.0/cloud/thing/{id}/model` at sync time and **cached per product** (every device of one product
shares a model, so a 200-tank account costs a handful of calls, not 200). `normaliseLevel()` does
the arithmetic in one place and every read goes through it with that tank's own max. A device whose
model declares nothing falls back to "already a percentage" — never assumed. **The guard that
matters**: a zero, negative or NaN max would produce `Infinity`/`NaN` and land in a figure a society
reads as its own water supply, so it falls back rather than divides.

**This also corrects the previous entry's conclusion.** The cloud was never lying and our reads were
never stale — the shadow said 45 because 45 is what the device reports; we were misreading it. The
staleness work stands on its own (that controller really had not reported for two hours, and the
energy-meter control proved the API fine), but it was **not** the cause of 45 vs 75. **Worth
remembering as a class**: when an external value disagrees with a trusted display, check the units
and the declared range before concluding the source is stale — a plausible wrong number survives
every freshness check.

**A second thing the raw response settled**: the four float probes are named `25% / 50% / 75% /
100%`, and the app's screen draws exactly those markers. They have reported nothing since 18 June
and all read *dry* while dp101 reports a live level — so the discrete probes and the analogue
channel disagree, which is a question for whoever installed the controller, not for this codebase.

**Deploy note**: migration adds one column defaulting to 100, so existing rows keep today's
behaviour until the next sync learns their real range. Stage's already-stored readings hold the raw
value and need a **one-time, non-idempotent** re-expression (`raw ÷ level_max × 100`) after the sync
populates `level_max` — run once, verify counts before and after.

## Connected is not reporting, and a device instant is read in IST (2026-08-25) — user-caught

**Three reports in one investigation**: "the Smart Life app shows 75% but our app shows 45%", "there
have been no reading logs since we deployed", and "time is also showing incorrect."

**The 45 vs 75: our number was never wrong.** Read three ways — the shadow, the associated-users
listing and the v2 device record — the **Tuya cloud itself holds 45**, timestamped `11:40:48Z`, and
the device's own `update_time` matches. It is `online: true` and has pushed nothing since. So the
Smart Life app is showing something the cloud API does not serve (it reads the device directly, over
LAN or a push channel the shadow lags). **The defect was the screen implying that figure was live.**
A sensor connected but silent for over an hour now reads **Not reporting**, keeps showing its last
level, and the tank page says outright that the Smart Life app may show a fresher one read from the
device. Worth remembering: `online` means *connected*, not *reporting* — treating them as the same
thing is how a stale number gets presented as a live one.

**The time was mine.** `formatDateTime` reads UTC parts — right for a **wall-clock appointment**
somebody typed (a 10:30 survey visit must echo back 10:30), wrong for a **machine instant**, which
happened at a moment and must be read where the reader lives. An 11:40Z reading rendered as "11:40"
told an Indian reader it was 5½ hours older than it was. `formatInstant()` renders **Asia/Kolkata
explicitly** — the server runs in UTC, so "local" on a Server Component would be exactly the wrong
answer — and `timeAgo()` puts the age in words beside it. Both formatters keep their own tests so
the distinction cannot quietly collapse; the rule is now: *typed by a person → UTC read; stamped by
a machine → IST*.

**A latent signing bug, found while probing**: Tuya verifies the signature over the path with query
parameters **sorted by key**. Single-parameter calls sort by accident; the paginated device listing
emitted `page_size` before `last_row_key`, so page 2 would have failed with a bare "sign invalid"
the moment the account exceeded 20 devices. `signedPath()` sorts.

**The readings were never missing** — 4 per tank on stage, filed every 30 minutes exactly as
designed, all reading 45 because the source has not changed. "No new logs" and "no logs" look
identical when the value is flat.

**Verified in a browser (9 checks, zero console errors)** against fixtures built to the reported
shape: a 2-minute-old sensor reads Online, a 2-hour-old one reads Not reporting with the
explanation, and the rendered timestamp matches an **independently computed** IST string rather than
a hardcoded one. 500 unit tests.

## The portal is a workspace at any width (2026-08-25) — user-caught, twice

**Two reports, both fair**: "why there is so much of empty space. it gives a feeling of a mobile page
on desktop… current view is fine for mobile", and then "you havent applied the changes on society
portal? it is not like how you shared in artifacts."

**The width.** Every portal page capped itself at `max-w-3xl` — 768px — so on a wide monitor it read
as a phone page down the middle of the screen. `src/app/portal/portal-shell.tsx` now owns the chrome
*and* the container (fluid on a phone, up to **1200px** on a desktop), replacing the same header
copied into three pages. 1200 rather than the whole screen because prose still has to be readable.
Each page lays its own cards into columns at `lg`: dashboard 7/5, committee 7/5, tanks 2→3→4 across.

**A real overflow, found by measuring rather than looking**: at 390px the tab row pushed its fourth
tab **60px off-screen** — two tabs fitted a phone, four never could, and the row had no `flex-wrap`.
Same class as the admin nav's wrap fix from 2026-08-14, caught this time because the check asserts
`scrollWidth <= innerWidth` on every tab at both widths instead of eyeballing a screenshot.

**The designed tabs are now built**, as the visible placeholders the user asked for ("for now they
will be like a place holder. visible but dummy"): **Dashboard** (the real "needs you" work first,
then pending tiles and an empty consumption chart), **Water tanks**, **Lighting** (the audit trail —
before, after, saving — real when a benchmark exists, honestly empty when not), **Committee**.
`StatPending` and `ChartPending` in `ui.tsx` are the shared primitives so every surface states an
absent figure identically: a dashed tile reading `—` with the condition that will fill it, and a real
axis frame naming what goes in it. **Nothing invents a number** — the suite asserts no currency
figure appears anywhere on the portal.

**Also removed**: the dashboard's own Portal accounts card, which was the committee list a second
time once the Committee tab owned it.

**One thing surfaced for the user rather than fixed**: their stage screenshot showed **two accounts
both holding office-bearer**, which contradicts the copy on that very screen ("exactly one holds the
office-bearer designation"). The portal path cannot produce it — `checkAccountCreate` refuses the
authority outright — but `createPortalAccount` on the **admin** side accepts any authority with no
"at most one" guard, and `03-features.md`'s own rule 2 only says *at least* one. Whether a society
may hold several (the authority table lists "President, secretary, treasurer") or exactly one (which
is what transfer semantics and every screen's copy imply) is a product decision, not a bug to pick
unilaterally — raised, not silently resolved.

## A society manages its own committee (2026-08-25) — user-asked, and already in the blueprint

**The ask**: "the society admin can add delete users under their own society… or if needed we can
leave the user update or add option from society portal if thats too much of a change", with a
follow-up reminder: "the society doesnt have any admin access. They only have society level access."

**It was a small change, and the rules were already written down.** `03-features.md`'s own authority
table for FEAT-108 has always said the office-bearer may "manage the society's own portal accounts",
and its rule 6 says "PER-01 creates the first office-bearer; that person creates the rest" — there
was simply never an acceptance criterion for it and nothing built. **FEAT-108-AC-10** is that
missing statement (AC-9 was taken), recorded in `03-features.md` and `backlog.yaml` per AGENTS.md's
scope rule. `/portal/committee` is the screen; the pure rules are `checkAccountCreate` /
`checkAccountDeactivate` in `portal-authority.ts`, the same split as the transfer act.

**Society-level only, three ways, none of them a UI courtesy:**
- the society is read from the signed-in `Profile` row and **`createSocietyAccount` takes no
  `societyId` argument at all** — there is nothing for a request to lie about (INV-05);
- **the office-bearer designation is not issuable here.** It moves by transfer, so there is always
  exactly one; an "add another office-bearer" path would quietly produce two. Smuggling
  `office_bearer` into the `<select>` is refused server-side and told to use the transfer instead;
- a portal account is a `Profile`, which can never mint an admin session (INV-01, separate table).
  An email belonging to an `AdminUser` is refused with the **same message** as any other collision —
  whether an address is internal is not a society's business to learn.

**Remove is deactivate, never delete**: a portal account has *acted* — it approves installation days
and FEAT-108-AC-3 records the authority it held at that moment — so the row must survive or those
records point at nothing. Self-removal is refused, and the office-bearer cannot be removed until the
designation is passed on.

**The password is the one genuinely unresolved part, and it is stated rather than hidden**: the
office-bearer sets a temporary password and it is shown once, on screen, to hand over — because
there is no email provider in this build (ADR-008 still Proposed, delivery is R1). An invite link is
the better answer and should replace this the moment email exists; the code says so at the point it
matters.

**Verified in a browser (17 checks, zero console errors)**: the account lands against the viewer's
own society as committee; only committee and manager are offered and the smuggled authority is
refused with nothing written; removing deactivates; the office-bearer's own row offers no Remove; a
committee member gets the list with no Add and no Remove; and a portal account still cannot reach
`/admin/societies` or `/admin/users`. 7 new unit cases; 494 total. No migration.

**Designed first**: the society page was redesigned as a tabbed workspace (admin: Dashboard · Users ·
Water tanks · Lighting; portal: Dashboard · Water tanks · Lighting · Committee) on a canvas, with
every unbuilt metric drawn as a dashed "—" tile naming the condition that produces it and every
unbuilt chart as a real axis frame — the user's explicit choice over sample figures, and this repo's
own convention since the Portfolio's untracked KPIs.

## Water tank monitoring: the Smart Life mirror (2026-08-25) — user-specified, designed then built

**The ask**: water-level sensors on societies' domestic tanks live in the company's Smart Life
(Tuya) account; mirror them into the product, assign each to the society it serves (bulk and
singly), show residents their own tanks with a proper water animation, add an API configuration
page, and — added mid-design — **record every level on the half hour** so stats and history exist.
Designed first on a canvas (all five screens, matching the app's own tokens), then built end to end.

**The client cannot send commands, structurally.** `src/lib/tuya.ts` knows the token endpoint, the
device list and a shadow read — nothing else. INV-08 (monitor-only for pump hardware) is enforced by
what the module is able to say. The signing scheme (string-to-sign construction, token splice,
uppercase HMAC) is pinned by unit tests in `tests/tuya-sign.test.ts`, because Tuya answers any
mistake with a bare "sign invalid". **Two live API shapes found the hard way**: `/v2.0/cloud/thing/
device` returns a **bare array**, not the `{devices: []}` wrapper other Tuya listings use — the
exploratory probe's fallback chain had masked this, and the lib read 0 devices until checked
directly; and its `page_size` caps low (>20 → "param size too much"), so the listing paginates by
`last_row_key`. **The general shape**: a probe whose result-extraction tries several shapes tells
you it worked, not which shape worked.

**Pages read the mirror, not Tuya.** `water_tanks` caches every device — energy meters stay listed,
dimmed and unassignable, so nothing in the account is invisible — and `tank_level_readings` holds
one sample per tank per run of the half-hourly job (ADR-003's queue, third job type; same
single-link chain discipline as the gate-pass sweep, rescheduled in `finally` so a Tuya outage
skips a sample without killing the chain, and "not configured" is a normal state it ticks through).
The status page and the portal refresh live best-effort and fall back to the mirror.

**Assignment is INV-05's scoping key**: bulk from the list or singly from the tank page, gated to
`manage_users`, recorded with who and when. The portal (`/portal/tanks`, a new tabs row on the
portal) is scoped server-side to the viewer's society — verified both directions. The society
detail page lists its own tanks. **Credentials** are a singleton `TankApiConfig`, operations-only,
save-and-test in one act; the secret is write-only (never returned, never logged; blank keeps it),
with `TUYA_*` env fallback. Note: the access secret was pasted into chat by the user — worth
rotating in the Tuya console at some point, same class as the AUTH_SECRET note in Current Blockers.

**Verified against the real account** (28 browser checks, zero console errors; worker run live:
seeded → 2 real readings filed → rescheduled 30 min out, one link). One UI bug found by the e2e:
a checkbox inside a `ClickableRow` toggled twice — its own `onChange` plus the td's click handler —
netting to unchecked; the td handler now skips clicks whose target is the input. 487 unit tests.
Migration `20260825120000_add_water_tank_monitoring` purely additive. **Stage needs**: migrate,
restart both pm2 processes (the worker carries the sampler), then enter the credentials on
`/admin/water-tanks/settings` as an operations account.

## The light replacement is somebody's job before it is a record (2026-08-25) — user-asked

**Reported against the circuit page**: "before light replacement record there should be an option to
first schedule the replacement and assign the replacement task to inspector/installation engineer
team, who will do the job and update this record. which can also be done by the assignee if needed
but with a relevant warning message."

**The form appeared the moment the baseline window closed, with nobody's name on it.** A new step —
**Schedule & assign the replacement** — sits in front of it in `circuitSteps()`, and the record is
genuinely locked until the work is handed to a named engineer or inspector ("Unlocks once the
replacement is assigned"), not merely discouraged.

**The day is a `ScheduledEvent` (`installation_day`), not a column on `Circuit`** — the schedule
module's third kind, and the reason it was built. The crew's replacement day lands on their own
calendar beside their surveys; reassigning moves it; un-assigning cancels it rather than leaving a
day booked for nobody. `Circuit` gained only `replacementOwnerId`/`replacementAssignedAt`/
`replacementAssignedById` — the assignment's provenance, which is genuinely a circuit fact — and
`ScheduledEvent` gained an optional `circuitId` so commissioning work can point at the circuit
rather than only at the deal.

**Authority, mirroring the survey**: operations *or* whoever holds this deal's field work may hand
it on; the assignee or operations may book the day; the picker offers only engineering/inspection
accounts holding `manage_survey`, and the action re-checks the team and the permission. Recording
the work is unchanged for the assignee; anyone else recording it sees the warning ("You can record
it for them, but only if the work has actually been done") — the same rule, same wording, as the
survey.

**`SurveyVisitDetails` became `VisitDetails`** (`src/components/visit-details.tsx`): the survey visit
and the replacement day answer the same four questions — who is going, when it was handed over, when
they are due, who to ask for — and a second copy would have drifted within a week.

**Verified in a browser (17 checks, zero console errors)**: the step precedes the record and the
record's form is absent from the DOM until assigned; sales is not offered; the assignment stores who
did it and when; the day lands on the schedule module and on the assignee's own calendar with the
site contact; ops is warned but not blocked; a field account who is *not* the assignee is not
offered the arrangement; and a phone number with nobody's name against it is refused. Schedule
16/16, survey visit 24/24, assigned-turn 18/18, smoke 23/23; 480 unit tests.

**And a third report on the same feature: "I assigned it to the installation team but can't find the
task in the installation team account."** Two separate causes, both real, neither in the assignment
itself:
- **Field work listed only surveys.** It queried pipelines by `surveyOwnerId`, and a light
  replacement is assigned on the **circuit** — so the crew holding one saw "Nothing assigned to you"
  under a heading promising "the surveys and installations assigned to you". It builds one list of
  work rows from both sources now (survey, replacement, installation), each saying what the job is,
  when they are due and who to ask for, and drops off when the work is recorded.
- **The calendar hid anything older than a fortnight.** A 14-day lookback filtered out a visit
  booked for an earlier date — ordinary on demo data, and the case that most needs chasing — so the
  assignee's own schedule said "nothing booked for you" while the work sat assigned. Every event
  still marked `scheduled` now shows, however old; being still-scheduled *is* being not closed out.
  **The general shape**: a list scoped by one foreign key, under a heading that promises every kind
  of assignment, is a lie the moment a second kind exists.

**Then a correction to the same step, from the user, the same day**: "this should not be accessible
before the light installation is scheduled." The step counted as done the moment a crew was named,
so the record opened with no day agreed. It needs **both** now — and the reason is not tidiness: the
date recorded there is CON-19's excluded pivot and the day the post-install window starts from, so
work recorded against a visit nobody arranged is a date nobody agreed to. Until the day is booked
the step stays current and names the missing half; the record reads "Unlocks once the replacement is
scheduled with a named crew". **The refusal is server-side** — a locked step is not a gate —
verified by cancelling the booked day in Postgres behind the open form and submitting.

**A second defect the same report exposed, one level up**: the deal page still said "Submit the
completion gate pass, then record the light replacement". `circuitNextLabel()` was a second,
hand-written copy of the circuit ordering and had drifted **twice** — it kept the pre-2026-08-24
order (the departure gate before the work it itemizes) and knew nothing about the new assignment
step, so a deal told an operator to record work nobody had been asked to do. It now takes the same
facts the spine does, and two unit tests assert the two agree either side of the assignment. The
circuit *state* cannot distinguish them — `awaiting_installation` covers both — so `CandidateFacts`
carries `replacementAssigned`, read from the row on both screens that render the label. **Worth
remembering as a class**: a label that restates an ordering defined elsewhere will drift, and the
drift shows up as a screen confidently naming the wrong next step.

**A harness note, not an app defect**: `billing-run-check` and `gatepass-order-check` both fail on
the fresh `firsthing_dev` database because they expect fixtures (`bill-soc`, an active contract) that
the new database has never had — the same "dev DB holds only the seed" gap already recorded. The
billing board itself renders correctly with its empty state, checked directly.

## One schedule for every appointment (2026-08-25) — user-specified, mid-build redirect

**Started as "show who the survey is assigned to, when, and who to call at the society", and the
user redirected it while it was being built**: "keep a schedule/meetings module for this sole
purpose… whenever a task is assigned to someone that needs to be on a specific schedule or is a
meeting, schedule it as meeting in backend so everyone can see as a calendar their coming
schedules", and "that common module be used everywhere." The first cut had put `surveyScheduledAt`
and the contact fields on `Pipeline`; those columns were dropped again in the same session
(migration `20260825061500_add_schedule_module` drops what `20260825060000` had just added) in
favour of a `ScheduledEvent` table.

**The rule the module establishes: an owning record never stores its own time.** A demo meeting, a
survey visit and (next) an installation day are all `ScheduledEvent` rows pointing back at what they
are about, so rescheduling, cancelling, who-is-expected and what the calendar shows are written once
rather than per feature. A new kind is an enum value plus a caller. `src/lib/schedule.ts` holds only
pure logic (labels, day grouping, `dayRelation`) so it unit-tests without a request context.

**Two callers today, which is what makes it a module rather than a table**: logging a lead books the
demo meeting (assignee = the sales owner), and arranging a survey visit books that (assignee = the
field person holding it). `/admin/schedule` is the read side — your own by default, the whole team's
for operations, grouped by day, with a past day whose appointment is still open flagged rather than
hidden. It is deliberately **not** permission-gated: everyone has appointments.

**Design decisions worth keeping:**
- **A meeting may now be dated in the future** (scope note on FEAT-001). It could not be, which is
  right for a lead recorded after the fact and makes a calendar of *coming* appointments impossible.
- **A meeting already held is stored as `done`, and recording the proposal outcome closes it out.**
  Otherwise every logged lead would sit on the calendar forever as an appointment nobody attended —
  the "not closed out" flag would mean nothing within a week.
- **"Overdue" is a property of the DAY, not the hour.** A visit booked for 10:30 is not overdue at
  10:31; it is in progress.
- **A date-only appointment reads "All day"**, never 00:00 — that would claim a precision nobody
  entered.
- **Un-assigning cancels the visit** rather than leaving it booked for someone who is not coming;
  re-assigning moves it to the new person.

**The visit card, which is what prompted all this.** The deal and survey screens both carry one:
who is going, their team, when the hand-over happened and by whom, the visit slot, and who to ask
for on arrival — falling back to the deal's own contact rather than showing a blank, because
arriving with someone to call beats arriving with nobody. The field list shows the time and the
contact, soonest first. **The assignee arranges it from the SURVEY page, not the deal** — a field
account is redirected away from the deal, so the first version's link pointed at the one screen the
intended user cannot open. The card also offers reassignment, since naming who is going with no way
to change it is the dead end reported repeatedly this week.

**The user's own question — "I didn't assign it yet, have I?" — was answerable only from the logs**,
which is the gap this closes: `pipeline.survey_assigned` showed it was assigned 2026-08-24 20:49 UTC
by their own account. `surveyAssignedAt`/`surveyAssignedById` now record it on the row.

**Verified in a browser**: schedule module 16 checks, survey visit 24, both zero console errors,
every figure asserted against rows rather than the screen; the non-assignee refusal was driven
through a path the client cannot pre-block. Seven neighbouring suites unchanged; 475 unit tests,
`tsc`/`lint`/`build` clean.

**Three deploy lessons, all real, one of them mine:**
- **`prisma migrate deploy` does not regenerate the client.** The stage build failed type-checking
  on `scheduledEvents` until `prisma generate` ran on the box.
- **Two builds against one `.next` corrupt each other.** The user's own deploy script failed with
  `ENOENT … _clientMiddlewareManifest.js` because a build of mine was still running on the box when
  theirs started. Deploys are theirs to run (`scripts/deploy-stage.sh`, git-based); do not build on
  the server alongside it.
- **A new route needs a clean `.next` on the server** — a stale cache reported `ENOENT` on
  `src/app/admin/schedule/page.tsx` while the file was plainly there.

## Assigned work belongs to the person holding it, not to their team (2026-08-25) — user-caught

**Reported**, looking at a deal whose step 2 already read "Assigned to Inspector": the next step
should be the assignment, the assignee should see it in their own dashboard, "instead it is showing
the form directly… after the assignment it can also be surveyed from here but with a warning that
its assigned to this person."

**The assignment was decoration for everyone except the assignee.** `whoseTurn` matched on **team**,
and `STEP_TEAMS.field` includes `operations` — so an ops account looking at a survey already handed
to an inspector still got the ordinary blue "Run the site survey · Continue", with nothing naming
who held it. The rule is now: **a named assignee outranks the team.** The step is theirs; everyone
else gets the amber waiting callout. Operations is still never blocked (the callout carries "Open it
anyway"), and neither is another field account who could genuinely cover the visit — but both are
told whose work they are stepping into. Sales is told and given no way in, as before. Unassigned
work still falls back to the team that does it, so picking up unclaimed work is unchanged.

**The warning follows through to the screen where the recording happens**: the survey page names the
assignee for anyone who is not them. Warning on the deal page and then handing over a form that
looks like anybody's is where the original complaint came from.

**Verified in a browser (18 checks, zero console errors)** and on stage against the reported deal:
ops is told whose step it is and can still open it; the assignee sees no warning about themselves
and finds the survey in their own Field work list, which opens straight onto it; another engineer is
told whose it is and does *not* see it in their list; sales is told, and the callout carries no
link; with nobody holding it the deal asks for the assignment first. **One harness note**: the field
list's rows are `ClickableRow`, not anchors, so "is there a link to it" proves nothing — click the
row and assert where it lands.

## Saving closes the form, and correcting a record is operations' own act (2026-08-25) — user-caught

**Reported**: "on edit and save the form should close instead it reloads and feels like nothing
happened on click just a flicker." Then: "Here also give option to update date. But make sure all
these edit options are for admin only."

**The save worked every time.** The form submitted on the same URL, so a successful save re-rendered
the identical open form over a card nobody could see — a flicker with nothing to show for it. Both
lead-details and proposal forms now close on success and stay open on a refusal, which is the one
case with something left to do there. **The proposal form had the same bug latent for one outcome**:
"agreed" and "declined" move the deal on so the form stops rendering anyway, but "undecided" leaves
it at the lead stage — the identical flicker, waiting for someone to pick that option. Both moved
from `useActionState` to `useTransition` (the pattern `admin-users-client.tsx` already uses),
because the action's own result is what decides whether to close.

**The logged date is correctable now**, from the deal or from the society's own leads card where it
is shown — and reads as a date there rather than as ISO.

**Editing is OPERATIONS ONLY, deliberately stricter than `mayAct`.** `mayAct` governs acting *on* a
deal — the assignee, the creator, or ops. Correcting what the record *says* (the date it happened,
whose it is) is a different act: the owner and creator fields exist precisely so that the people
they name cannot quietly rewrite them.

**A second circular date rule, the twin of the meeting one fixed the same day**: the lead's logged
date was ordered against the society record — but on the lead path the society row is created *by*
the lead, so the rule refused every correction that moved the date back, which is the only direction
anyone moves it. The create path carried it too, with the same effect on any backdated lead for a
new society; it now applies that ordering only when the society already existed. A lead still cannot
be logged in the future, nor after the decision that came out of its meeting. **Worth remembering as
a class**: ordering a record against a row that the same act creates is always circular, and it
fails in the direction nobody tests.

**Verified in a browser (25 + 10 checks, zero console errors)**, then on stage: saving closes both
forms and the card shows the new values immediately; a refused save keeps the form open, says why,
and stays on the editing URL; an undecided proposal closes its step and its outcome appears on the
page. **The operations gate was driven through a path the client cannot pre-block** — the form
opened legitimately as operations, the actor's own team moved off operations in Postgres behind the
open form, then saved: refused by name, wrote nothing, team restored afterwards. Sales sees no Edit
and gets no form from a direct link either. Six neighbouring suites unchanged; 455 unit tests,
`tsc`/`lint`/`build` clean.

## A lead can be corrected, and a team's permission says which one it is (2026-08-24/25) — user-asked

**Two reports, one goal — hand a lead to marketing with the right date.** "Change the date to
02-01-2026 and also the person to whom assigned should be from marketing team", then, mid-build,
"Permission type not available for marketing team."

**Nothing about a lead could be changed after logging it.** Contact, phone, meeting date and owner
were all fixed at creation, so a lead that landed on the wrong account had no route to the right
one — CON-24 refuses a second lead for the same (society, service line), so the record was stuck
with whoever it was first given to. The stage lead that prompted this was owned by an account
called "Inspector". `updateLeadDetails` + an Edit on the Lead details card fix that, opening on
`?edit=lead` and closing by dropping the parameter — the same "a step you open" shape as the demo
proposal, for the same reason: a Cancel is only meaningful when getting there was a state change.
The owner picker offers admin and sales only; the action re-checks the team **and** that the account
holds `manage_pipeline`, since an "owner" without it could not open the deal they own. Handing a
lead on **while it is still a lead** returns it to the new owner to confirm (FEAT-001-AC-2); on a
deal that has already advanced it deliberately does not, because freezing a live deal behind an
approval nobody is waiting on is not what that AC is for.

**"Permission type not available for marketing team" — it was available, and that is the point.**
The account form listed five grants as bare nouns (`Manage pipeline`, `Manage survey`, …) with
nothing tying any of them to the team just chosen, so a Sales / Marketing account looked like it had
no permission of its own. `TEAM_PERMISSIONS` (`src/lib/admin-teams.ts`) names what each team's work
actually needs; the form preselects it, marks it NEEDED, gives every grant a line saying what it
buys, and states the consequence when one is missing — "it will not appear when assigning a lead",
which is the real symptom, since the owner picker filters on `manage_pipeline`. Changing the team
swaps the team-derived grants and leaves anything granted by hand alone. It is guidance, not a gate:
operations holds everything by design.

**Dates now read DD-MM-YYYY** (`src/lib/format-date.ts`), across the deal screens. The parts are
read in **UTC deliberately** — every date in this schema is stored at UTC midnight, and a local
`getDate()` on one shifts the day backwards for any viewer west of Greenwich, the same off-by-one
CON-22's billing arithmetic already avoids the same way. Form controls keep ISO, which is the only
thing `<input type="date">` parses. Sites outside the deal screens (circuits, readings, portal)
still render ISO and are a follow-up sweep, not silently done.

**A real rule found wrong while building this, and fixed on both paths**: the meeting date was
ordered against the **society record**, so a meeting held last week for a society being entered
today was refused — and a quick-created society is always stamped `now()`, so that was *every*
backdated lead. Meeting the committee is what causes the record to exist; the ordering was
backwards. Removed from `createLead` and never added to the edit path. The lead's own logged-at date
still carries it, because that one genuinely is about our records. The meeting still cannot be
dated in the future, nor after the proposal decision that came out of it.

**Verified in a browser (18 checks, zero console errors)**, then again on stage over the public
HTTPS path: the date reads `02-08-2026` and the ISO form is gone; the owner's team is named on the
card (which is how "Inspector · Field inspection" became visible as the anomaly it is); only
lead-owning teams are offered; reassigning warns before it saves; the date and the owner both
change, asserted against the row, not the screen; handing it on returns it to be confirmed. **The
engineering refusal was driven through a path the client cannot pre-block** — the option smuggled
into the `<select>` with `page.evaluate` and submitted — and refused by name, writing nothing.
Regressions unchanged: proposal cancel 19/19, survey assignment 21/21, lead ownership 18/18, field
access 16/16, smoke 23/23; 455 unit tests, `tsc`/`lint`/`build` clean.

**Two harness notes**: `page.locator("form")` matches the sidebar's **Sign out** form first — the
trap already recorded here once for `button[type=submit]`, now caught again; target the native
`<dialog>`. And stage accounts all use `password123` while in development (the user's own note),
which is what made the stage verification possible at all.

## The demo proposal is a step you open, not furniture (2026-08-24) — user-caught

**Reported**: "Why does this box come back even when I cancelled it. I cancelled and when I came
back it was still there." — then, on what closing should leave behind: "close as its still pending
as it was in the previous step before this box opened."

**Cause: Cancel had nothing to cancel.** `ProposalForm` rendered unconditionally on the deal page
whenever `stage === "lead" && authoritative`, so the Cancel added the same day could only navigate
away — and the box was back the moment the reader returned. The state that decided the box was the
deal's own stage, which a Cancel must not touch (nothing was decided).

**Fixed by making the open step addressable**: `?step=proposal`. The next-step callout links to it,
the step map's own step-1 link and the "waiting on step 1" pointer use the same href, and Cancel
drops the parameter (`router.replace(pathname)`) rather than walking history. Closing therefore
leaves the deal exactly as the user described it should — step 1 still In progress, step 2 still
locked, nothing written — and a later visit lands on the callout, not a half-filled form.

**It also removed a duplicate the page had been carrying since the sequencing work**: a blue
"Record the demo proposal decision · Continue" card sat directly above the very form it pointed at,
and its href was the page the reader was already on — the dead-Continue defect already reported
twice. One step is one box now: the form REPLACES the callout while open and carries the callout's
own line as its subtitle. **Worth remembering as the general shape**: a Cancel is only meaningful
when entering the thing was itself a state change. Adding one to a permanently-rendered panel
produces a control that appears to do nothing, which is how this was reported.

**A second defect, found by dumping the page rather than by the report**: the step map interpolated
a missing assignee straight into its summary, so a deal that had plainly been surveyed but held no
stored owner rendered the literal **"Assigned to null"**. It now says the record is missing,
matching how the map already reports a rank-inferred step with no artifact behind it.

**Verified in a browser (19 checks, zero console errors)**: closed on arrival; the callout opens it;
a clean cancel asks nothing and a dirty one confirms; refusing keeps what was typed; leaving and
returning does not reopen it; nothing is written by any of it — asserted against the row, not the
screen; and the step still saves from where it now opens, on a disposable deal so the seed lead
stays a fresh lead. Neighbouring suites unchanged (survey assignment 21/21, field access 16/16,
lead ownership 18/18, smoke 23/23); 444 unit tests, `tsc`/`lint`/`build` clean.

**One deploy note worth keeping**: `pnpm build 2>&1 | tail -3 && pm2 restart` does NOT stop on a
failed build — a pipeline exits with `tail`'s status, so the restart fired against a `.next` a
concurrent build was still rewriting, and stage served "Could not find a production build" until a
clean build and restart. Check the build's own exit status, not the chain's.

## The circuit page is an accordion: the active step is the only open form (2026-08-15) — user-specified

**The user's second round on the same screens, with screenshots**: "Not happy with this ui
arrangment. Everything is displayed one by one. instead it should be like. whichever state is
active to be taken action on should only be the open form. rest should be closed with only
header/title mentioning the step and either marked done and a button to edit if option available.
or disabled with header/title section so we know we dont need to act on it its a future task."
Implemented literally as `src/components/step-section.tsx` (hook-free, Server-Component renderable,
native `<details>` for the toggles — same rule as `ui.tsx`): the current step renders as the one
open, accent-bordered form; done steps are closed ✓ headers whose record sits behind a "View"
toggle — **including still-live controls**, so a submitted gate pass's approval buttons live behind
that toggle rather than as a permanently open card; locked steps are disabled headers stating what
unlocks them, no link, no toggle. The circuit page maps `circuitSteps()` onto these sections and
embeds the existing workspaces as step bodies (`MonitoringWindowPanel`/`DemoReviewPanel` gained an
`embedded` prop that drops their own headers — the step header already names the window and carries
the Day-X-of-5 / urgency chip). The always-open `RescaleForm` — the specific thing the user's first
screenshot showed — is likewise behind its own "Record a verified light-count change" toggle, since
it is occasional maintenance, not a step. The FEAT-015 review and the escalated-state notice fold
into the benchmark step's body; the standalone benchmark-confirmed banner is gone because the
step's own summary carries the figure.

**Verified end to end in a browser (Playwright/system Chrome), 41/41, zero console errors, zero
page errors**, walking one deal lead → survey → eligible candidate → meter_installed →
pre-window-with-gate-pass → benchmark_confirmed → closed-lost, asserting at each stage that the
*right single form* is the open one and the others are genuinely absent from the DOM (not hidden):
at `eligible` the load-validation field renders and the gate-pass textarea does not exist anywhere;
at `meter_installed` they swap; at pre-window the reading form is open, the done gate pass is
closed with its status chip, and **the approval control is provably behind the View toggle**
(invisible before the click, visible after); fully done, no step form exists on the page at all and
the rescale form only appears once toggled. Plus the spine checks (locked stages carry no links,
GATE-01 KYC routing, closed-lost freezes the map) and zero horizontal overflow at 390px on both
pages. All fixtures ("Flow Sequencing Test" society and everything cascading) removed afterward,
confirmed by count query. `tsc`/`lint`/`build`/`vitest` all clean; no schema change in this batch.

**One harness note**: Playwright's screenshot caret-hiding injects `caret-color: transparent` as an
inline style, which React 19 reports as a hydration mismatch — a console error that looks like an
app bug and is not. Screenshots now pass `caret: "initial"`.

## A reading window restart left a silent black hole for writes (2026-08-15) — user-caught

**Reported**: "Saved a reading using the form. got 200 response. but the readings not appearing
anywhere," with a network capture (200 OK, `x-action-revalidated: 1`) and two screenshots — the
post-install step at "Day 0 of 5" with the date field showing `08/21/2026`, and the monitoring
dashboard's row for the same circuit reading "0/5 — Awaiting first reading."

**Confirmed against the row, not guessed**: the circuit's `postInstallWindowStartAt` was
`2026-08-25` — correctly moved there by the already-shipped restart logic (`restartFromDate`,
"the later of tomorrow and the midnight after the last recorded day") after an automatic ±5%
anomaly on a reading dated `2026-08-24`, itself part of a catch-up batch of dates run ahead of the
real calendar. The five readings the user had already recorded (`08-20` through `08-24`) were all
now *before* the restarted window start, so `getWindowProgress`'s `date: { gte: windowStartAt }`
filter — used everywhere a window is read: the readings table, the day count, the monitoring
board — correctly excludes every one of them. That part is working as designed.

**The actual defect: the write side had no matching check.** `recordDailyReading` upserts on
`(circuitId, windowType, date)` unconditionally — nothing compared the submitted date against the
circuit's own `windowStartAt` before writing. So a reading dated `2026-08-21` (what the form's date
field still held, since `date` isn't reset after a submit — only `consumptionKwh`/`anomalyNote`
are) landed a real, silent 200: the upsert succeeded, `x-action-revalidated: 1` fired, and the row
either updated in place or was created — and then was permanently invisible everywhere, forever,
since every read filters on the same `>= windowStartAt` clause the write never checked. Same shape
as this session's own standing rule ("the guard belongs on the write path nobody is looking at
while building the new one," first named at MS-04's FEAT-040 hole) — the restart logic was built
and tested from the read side; nobody asked what happens to a write that lands behind it.

**Fixed in `applyCommissioningReading`** (`monitoring-actions.ts`, the shared row-level function
both the single-day form and the CSV upload go through, so both entry points are covered by one
change): a submitted date earlier than the circuit's current `windowStartAt` is now refused outright
— `"{date}: the window restarted on {windowStartAt} — record a reading on or after that date
instead,"` logged as `commissioning.reading_before_window_start` — rather than silently upserted.
Per this repo's own rule ("a refusal with no log line is a refusal you cannot verify," MS-08), the
log line was written first specifically so the fix's own verification could tell a real refusal
apart from a client that never submitted.

**A second, related gap closed in the same pass, since it's what set the trap**: `MonitoringWindowPanel`'s
date field defaulted to `todayISO()` unconditionally — which, on this catch-up-dated demo data, is
*also* before the restarted window start, so even a fresh attempt with the field untouched would hit
the same refusal by surprise. The panel now takes `windowStartAt` as a prop and defaults to
`max(today, windowStartAt)`; a restart that happens while the panel is already mounted (revalidation
updates the prop without remounting the component) is picked up the same way, adjusted **during
render** rather than in a `useEffect` — the project's `react-hooks/set-state-in-effect` lint rule
correctly flagged the effect-based first draft, and React's own documented "adjusting state when a
prop changes" pattern (comparing against a tracked-previous-value state, no effect) is what's used.

**Verified against the real circuit itself, carefully** — a refusal is a no-op by construction, so
it's safe to reproduce the exact reported request (same stale date, same circuit) against live data
without touching it, but a *successful* write is real data and was verified against a disposable
fixture instead, never the user's own: 7/7 checks, zero console/page errors. Against Mahagun
Puram's real circuit — the date field now defaults to `2026-08-25` (the live window start) instead
of today; resubmitting the exact stale date from the report's network capture is refused by name,
naming the actual restart date; the pre-existing `08-21` row is confirmed untouched by direct query
(still `7.92`, not the deliberately-wrong `999` the refused submission carried). Against a disposable
fixture built to the same restarted-window shape: the date field default tracks a *future* window
start too; a reading dated exactly at the window start is accepted, written, and rendered; a date one
day earlier is still refused. Fixture removed afterward, confirmed by count query — 4 societies,
unchanged. `tsc`/`lint`/`vitest` (287 cases, unaffected)/`build` all clean; no schema change.

## A KYC "not applicable" reason looked like it landed under the wrong card (2026-08-15) — user-caught

**Reported**: a screenshot of the not-applicable field showing "Society is not GST-registered." —
"this should be part of GST CERTIFICATE card. instead its showing up in RECENT ELECTRICITY BILL
card."

**Not a data or state bug — confirmed by reading the whole chain, not assumed.** `page.tsx`'s
`items.map()` gives each `<Card key={item.type}>` its own `KycItem` instance with `type` correctly
bound (`type={item.type}`), and `markKycNotApplicable` persists via
`db.kycRequirement.upsert({ where: { pipelineId_type: { pipelineId, type } } })` — the `type` passed
in is the one closed over by the specific card's own component instance. There is no shared state,
no index-based key, no reordering between renders (the checklist order comes from the static
`KYC_REQUIREMENTS` array in `src/lib/kyc.ts`, not DB row order). A reason typed into one card's field
and submitted from that card's own button was always going to persist against that card's own type.

**The actual defect: the copy, not the wiring.** `kyc-item.tsx`'s not-applicable field had a
hardcoded label ("Not applicable to this society"), hint, and — critically — a hardcoded GST-flavored
placeholder ("Society is not GST-registered.") on **every** card regardless of document type, since
neither field's copy was parameterized by `type`. On a fresh pipeline both requirements are
"outstanding," so both cards' identical-looking forms are visible on the page at once, and nothing in
either one names which document it belongs to beyond the card's own title, scrolled above a fairly
tall stack (upload grid, follow-up field) by the time a user reaches this control. The user's own
report is exactly what that produces: filling in and submitting the Electricity Bill card's own
(correctly-scoped, correctly-persisted) field while believing it was still the GST card's.

**Fixed by parameterizing the copy, not the data model** — `KYC_TYPE_LABEL` (already existed in
`src/lib/kyc.ts` for status displays) is now also used to build the field's label
(`"Not applicable — GST certificate"` / `"Not applicable — Recent electricity bill"`) and the
button's own text (`Mark "GST certificate" not applicable`), so the control names its own document
even out of context of the card's title. A new `KYC_NA_EXAMPLE` map gives each type its own
plausible placeholder (the electricity card's is "Common-area electricity is billed to the builder,
not the society." rather than a GST-flavored example that made no sense there) — extends the same
way `KYC_REQUIREMENTS` already does for any future document type, rather than a special case for
just these two.

**Verified in a browser (6/6, zero console/page errors)**: both cards render distinct, self-naming
labels and buttons; the GST-flavored placeholder now appears on exactly one input, not both; the
electricity card gets its own example text. Screenshotted for the record. **One process note**: an
earlier regression re-run of `flow-sequencing.mjs` (from the prior session's fix) had its own
end-of-script cleanup skipped when I re-ran it a second time — a stray "Flow Sequencing Test" society
was found still sitting in the local dev database while confirming this fix's own fixture was
removed, caught by listing every society rather than trusting a bare count. Removed. `tsc`/`lint`/
`vitest` (287 cases, unaffected)/`build` all clean; no schema change.

## CON-45 built: SONOFF ingest → review → baseline → savings → monitoring (2026-08-17) — user-specified, end to end

**The user's spec, built in full and verified against their real meter export**: upload the SONOFF
CSV on a specific circuit's own page (their stated preference — no global picker to upload the
wrong society's sheet into), the system derives everything from the circuit's record, every
produced day is reviewed **row by row** before anything saves, and one reading store feeds the
pre-install report, the post-install savings report, and monthly monitoring. Plan first
(`docs/engineering/13-meter-ingest-sonoff.md`), then four decisions put to the user (range-not-
month, replace the day-level ±5%, partial-day handling, one store), plus three mid-build
refinements from them (colour bands everywhere a variance shows; exclusion as a persistent
mechanism usable any time before a report; hours 24/12+custom). Recorded as **CON-45** in
`00-intake.md`, with scope notes on FEAT-012/FEAT-045 in `03-features.md` and `backlog.yaml`
(validator: 15 errors/263 warnings, the documented baseline).

**The finding that shaped the design**: replaying MS-07's own ±5% blocking day-band against the
real 4,536-row export produced **32 blocking findings for a month of perfectly healthy readings**
(86% of genuine days violate it — real daily range 4.17–38.87 kWh around a 13.6 median). The band
was detecting Tuesday, not faults — the same "asking the wrong question" class the commissioning
side had already been through on 2026-08-15. The replacement: pre-install days are judged against
the **load inventory's theoretical figure** (Σ count × wattage × hours ÷ 1000; ±5% flag, ±10% red,
never blocking), post-install and monitoring days as **savings bands against the baseline**
(≥65 green · 60–65 cyan · 58–60 yellow · 55–58 orange · <55 red — the user's exact numbers — plus
a violet "check the meter" band above CON-20's 80%, since a dead meter reads as 100% savings).
One colour system, defined once in `src/lib/circuit-load.ts`, used by the review table, the stored-
readings view and all three reports; a band is never the only signal (the % and a label always
accompany it, per the blueprint's own colourblind/greyscale rule).

**What was built** (5 commits, `eafbf1f`..`2897605`): DeviceType/DeviceReplacementOption catalog
(`/admin/device-catalog`, 1–5 compatible replacements per original — the installer's dropdown reads
the mapping, never the whole catalog) · CircuitDevice load inventory on the circuit page (frozen at
light replacement, same guard shape as FEAT-040's) · SONOFF matched by exact header signature
(BOM-stripped) with no AI call, unknown formats still falling back to the AI path ·
`applyMappingAllDays` (range parsing) by refactoring the shared interval pipeline out of
`applyMapping` · the review flow (`reading-actions.ts` + `circuit-reading-panel.tsx`): phase derived
from the circuit's own dates (pre = day after `meterInstalledAt`; the install day, the replacement
day and today always excluded; monitoring = one day **before** the last stored reading, per the
user's 13-Nov→12-Nov overlap rule, that day alone superseded by the fuller value), dispositions
new/stored_match/stored_changed(warn-keep-stored)/supersede/released(INV-03)/out_of_window,
accept/reject per row, include-in-average toggles on pre days, partial days stored-but-excluded
with the interval count in the reason · per-line replacement recording on the installation step ·
three print-styled reports (excluded days struck through with reasons, never hidden; monthly is
kWh-only deliberately — the ₹ figures stay with MS-08's released calculation so two sources can
never disagree) · post-hoc exclusion via the one `excludedAt` mechanism, frozen with the figure it
feeds (baseline at replacement, benchmark at confirmation, billing at release).

**Commit is server-authoritative**: everything re-derives from the raw file plus the circuit's
record inside the transaction; the client's rows are never trusted. One recompute function owns
`preInstallBaseline` (average of non-excluded pre days) and the benchmark decision (CON-20 in-band
→ `benchmark_confirmed`; out-of-band → **no benchmark written**, FEAT-015 review raised — FEAT-014's
semantics kept). Monitoring commits still file zero days as blocking anomalies (INV-09). Legacy
window-flow circuits (Mahagun) keep their manual panels untouched — a circuit uses one flow, never
both stores under one baseline.

**Verified end to end with the real file** (Playwright + its own headless Chromium — **system
Chrome is no longer installed on this machine**, worth knowing for the next session): 25 + 29
browser checks across two scripts, zero console/page errors, every figure asserted against the
database rather than the screen. Highlights: 4,536 rows → 190 days, 0 unparseable; 158 dead-meter
days folded behind the out-of-window toggle; all three variance bands landing on the file's own
numbers (38.87 → +12.5% warn, 31.79 → −8.0% flag, 33.61 → −2.7% ok against a 34.56 theoretical);
14 rejected days genuinely absent from the store; baseline exact to 1e-6 at every reshape
(19.7400 → 34.7567 after exclusions); the pre-report's warn/investigate path filing a non-blocking
anomaly into the existing queue; 18 stored pre days verified unchanged on re-upload; the partial
day (13 of 24 intervals) auto-excluded with the reason stored; **benchmark confirmed at 64.1747%**
(computed independently in the test from the CSV, matched to 4dp); the monitoring overlap day
superseded 6.13 → 11.08 kWh with the old value retained; and **the ops gate driven through a path
the client cannot pre-block** (permission revoked behind the open review; the commit refused by
name and wrote nothing; restored, it succeeded). Fixture removed by cascade and confirmed by
ownership query, not just count — every remaining reading row belongs to Mahagun Puram's
pre-existing circuit.

**Two UX defects found by the E2E itself, both fixed**: `revalidatePath` inside the commit action
re-rendered the accordion, advanced the step, and **unmounted the review panel before its "saved"
summary could render** — the operator would see their form vanish (the exact "saved but nothing
happened" class the 2026-08-15 black-hole fix dealt with); the commit no longer revalidates, the
summary stays up, and a Done button refreshes deterministically. And the seeded local password is
`password123` (not the stage one) — plus the psql boolean trap struck in its **inverse** form this
time: `||` concatenation casts to `'false'`, while bare `-tA` prints `f`.

**Leftover S3 objects, same cause as every prior pass** (PutObject-only credentials): a handful of
uploads under `Ingest/Sonoff_Verification_Colony/` — added to Current Blockers in spirit; the DB
rows behind them are gone.

**Deployed to `stage.firsthing.earth` (2026-08-17).** Backup first (184 KB with a real dump
header — size checked, per the standing 0-byte lesson), then rsync + `pnpm install` (no new deps) +
`prisma migrate deploy` + build + both pm2 processes restarted. **The two CON-45 migrations were
already applied on stage** — the user had attempted a deploy themselves earlier which failed
partway; verified correct by querying the migration history and the three new tables directly
rather than trusting "no pending migrations". Device catalog seeded via targeted psql upserts (not
the full seed, which carries password-bearing test profiles). **Found and fixed in passing:
`firsthing-job-worker` had been stopped since ~2026-08-15 05:00** (12 restarts, ELIFECYCLE
failures) — restarted, stable after 44s, and ADR-006's chain verified intact: exactly 1 pending
`gatepass_sweep`, 327 done, no fork. Verified over the public HTTPS path (Playwright headless
Chromium): login, `/admin/device-catalog` rendering the seeded types and mapping,
`/admin`, `/admin/readings`, `/admin/monitoring` all 200, and a real circuit page rendering the
new Load inventory section with zero console/page errors — that 200 is the meaningful check, since
the page's query now includes `devices` and `meterReadings` unconditionally. The one dashboard
error-log line post-restart is the long-documented Server-Reference restart artifact;
`unstable restarts: 0`. **The user also said mid-deploy that git push/pull on the server is now
allowed** — this deploy was already mid-flight on rsync; switching the deploy flow to git is open
for next time, pending which remote (origin is still the public third-party repo).

**Deliberately not done**: manufacturers 2 and 3 (one signature-table entry each when their sample
files exist); wiring MS-08's billing UI to consume this store (MS-08 remains the one `proposed`
milestone); migrating legacy `CommissioningReading` circuits onto the unified store.

## Nineteen pre-system societies onboarded by SQL, not by upload (2026-08-26/27) — user's redirect

**The user stopped the document-upload backfill mid-build and replaced it**: "we should take a
different approach... For the whole data we need only two documents per society. 1.) agreement and
2.) post installation savings report... its a one time activity. and that too for only 19
societies." So: read the two documents per society by hand, land the facts in CSVs, and generate
one transaction per society. `docs/backfill/` holds the CSVs, the table map and every rule settled
along the way; `scripts/backfill-sql.py` is the generator. It is **re-runnable** (it deletes its own
`bf-*` rows first), matches a society **by name and refuses unless it exists exactly once**, and
emits nothing for a fact the documents did not carry.

**The working rule, the user's own, after I inferred a term-start date from a full first month**:
"you ask questions for whats not awailable or missing. i tell you to leave or not." The distinction
that survived into `docs/backfill/README.md`: **resolving a contradiction** is arithmetic's job (91
lights not the report's 93, because 43.68 kWh/day can only be 91 at 20W × 24h; 46% not 20%, because
that is what ₹23,299 divides to), while **filling a silence** is always a question.

**Four societies imported and verified on stage** (Ace City, Ace Aspire, Aditya Mega City, Aditya
Urban Casa), the remaining fifteen still to come.

**Two bugs the import found that only a real environment could**: `psql`'s `\set` takes the whole
rest of the line, so a trailing `-- comment` became part of the actor's email and every insert
joining `admin_users` silently wrote **zero rows**; and `demo_reports.shared_by_id` points at
`admin_users`, not `profiles` — FirsThing shares *with* the society — which **local never caught**,
because the test societies had no portal accounts and the LEFT JOIN quietly gave NULL. Stage's real
office-bearers made the FK refuse.

## A circuit can be demonstrated more than once (2026-08-27) — user-specified

**The ask**: "keep both demos. and in system keep that option to average two demos or reject one
demo... if we can decide to reject it and do another demo... second demo will be used to
calculations. and also we can do second demo on request of society... in this case both demos
average is used for calculations." Existing practice, not new — Aditya Urban Casa's basement was
demonstrated twice (100 lights at 48.28%, 22 at 85.19%) and its signed agreement carries 66.72%,
which is their mean. Recorded as **FEAT-014-AC-7/AC-8** in `03-features.md` and `docs/backlog.yaml`.

`CircuitDemo`/`CircuitDemoReading` are their own tables rather than `MeterReading` rows **because
two demos of one circuit share dates** — Urban Casa's ran 14–19 and 15–17 December on different
sets of lights — and one store keyed by circuit+date cannot hold both. Every write in
`demo-actions.ts` re-derives the benchmark inside the same transaction, so the stored figure and
the demos on record cannot drift; a survivor outside CON-20's band writes **no** benchmark, and an
override cannot move it back into band.

**No automatic rounding, the user's explicit correction** ("we can skip the default round of. we can
do it manually since we have the feature"): a stored benchmark is either what the demos measured or
what someone deliberately chose, and rounding would make it a third thing that is neither. Rounding
64.16% to 64% is itself an override, named and dated like any other.

## The demo reports' daily tables, so a benchmark has something behind it (2026-08-27) — user-caught

**Reported against Ace City's circuit page**: "readings are still not added." The circuits carried a
percentage with no evidence, and the readings section told the operator to upload a meter CSV for a
society commissioned years before this system existed — the **same dead end this project has now
fixed three times**: a screen naming a next step its reader cannot reach.

**91 days read out of the documents themselves, no model in the loop** (`scripts/demo-readings.py`).
The tables are a Date row over a Consumption row, and a parser means the figures trace to the
report rather than to one response nobody can replay (INV-02). Every block is checked against the
average the report prints. What that check caught, each a real shape rather than a hypothetical:
a wide table printed as two stacked halves where only the second carries the Average cell (Urban
Casa's lift lobby, 15 days as 8 then 7 — read apart the halves disagree with the report, merged
they reproduce its 1.81 exactly); a year that appears only in the letterhead, which means allowing
that a report written in January describes December's demo; and a printed 2dp average sitting up to
a hundredth below the true mean, because some of these truncate rather than round.

**Ace City's basement report is a PDF that extracts a glyph at a time**, so its days come from the
meter workbook instead — which reproduces the report's own printed 48.6987 and 16.3629 **to four
places**, every day whole at 24 intervals. The report and the meter agree completely, which is what
made the substitution safe rather than convenient.

**One report disagrees with itself, and is left saying so.** Urban Casa's first demo prints five
days averaging 24.5580 under a stated 24.53 — and 24.53 is what its own 48.28%, and the signed
agreement's 66.72%, were computed from. The recorded figure stays what was agreed, the days stay
what was measured, and the screen states the gap rather than quietly picking a side. The same
report also settles where this system's derived 66.7349% comes from: it computes
`(48.28 + 85.16)/2`, and **85.16 is the report's own slip** for `10.64/12.49 = 85.19`.

**Worth remembering as a class**: a document's printed summary and its printed table are two
sources, and where they differ the one everything downstream was computed from is the figure of
record — but erasing the other loses the only evidence that a dispute would turn on.

## The data ships with the migrations (2026-08-27) — user-specified, for go-live

**The ask**: "make it part of migration script so it happens automatically even when we deploy on
proction while goin live." So the business records are Prisma **data migrations** now
(`prisma/migrations/2026082711*`, `2026082712*`, written by `scripts/make-data-migrations.py`):
the import actor, the device catalog, the 19 societies, and the deals backfilled from each
society's agreement and demo report. `prisma migrate deploy` carries them to any database,
production included, with nobody having to remember a script.

**What is deliberately NOT in a migration, because a migration is a tracked file in git:**
- **Passwords.** `admin_users.password_hash` and `profiles.password_hash` are NOT NULL, and stage's
  36 portal accounts share **two hashes between them** — they are all `password123`. Committing
  those would ship a known password for every account in production.
- **The Tuya API id and secret.**
- **The 36 portal accounts themselves** — real people's names and email addresses, with SPIKE-02
  (the India DPDP review) still open. Production creates them the way the product already
  specifies: PER-01 creates the first office-bearer, who creates the rest (FEAT-108 rule 6).

Those come from `scripts/rebuild-sql.sh`, whose output (`restore/`) is **gitignored**.

**The imported rows belong to an import actor, not to a person.** `pipelines.logged_by_id` and
`agreements.prepared_by_id` are NOT NULL and a fresh production database has no people in it, so
something has to own them and the truthful owner is the import. `sys-data-import` is inactive, holds
no permissions, and its password hash is of random bytes nobody kept — verified that `bcrypt.compare`
returns false for every plausible guess, so the row check and bcrypt refuse it independently.

**Four real defects, each found by rehearsing rather than by reading:**
1. **A dumped row carries the id of whoever did the thing on stage.** The device catalog referenced
   a real admin three times; that row does not exist in a fresh database, so the foreign key
   refuses. Every actor column is rewritten to the import.
2. **`admin_users` points at itself** — stage's `admin@` was created by `yogesh@` — and pg_dump
   emits the child first, so the plain dump fails on its own foreign key. The load defers exactly
   the self-referencing constraints and puts them back as declared.
3. **pg_dump sets `search_path` to empty** and qualifies every table, so the trailing `ALTER`s
   could not see `admin_users` until they were qualified too.
4. **The benchmark-override `UPDATE` is not an INSERT**, so `ON CONFLICT DO NOTHING` could not
   protect it: re-running the migration on a database that already held the import **reattributed a
   real person's billing decision to the import and restamped its date** — silently rewriting who
   decided what a society is billed on, which is what INV-02 and INV-03 exist to prevent. It is
   guarded with `AND benchmark_override_pct IS NULL`: a migration may establish an override, never
   rewrite one.

**Verified in both directions, against real databases.** On an empty one, all 46 migrations apply
and every business table matches stage row for row (19 societies, 5 circuits, 6 demos, 91 demo
readings, 4 contracts, 12 device types, 3 filed documents); `offers.responded_by_id` degrades to
NULL through its LEFT JOIN because no portal accounts exist yet, and the offer is still `accepted`.
On a database that already holds the data, applying them changes **nothing** but the one inert
import-actor row. And a full environment rebuild — `migrate deploy` plus the two gitignored files —
reproduces stage exactly, every table, including the 36 profiles and the Tuya credentials.

**Stage itself was dropped and rebuilt to prove it** (2026-08-27). Backup first, checked for a real
header *and* a completion marker rather than just a size; app and worker stopped so nothing could
write during the freeze; then drop, create, migrate, restore. Every count came back identical, a
real society account signed in (so the bcrypt hashes survived), INV-05 scoping held, and all three
job chains re-seeded with exactly one pending link each — no forks.

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
- **The AI proposes a mapping; it never touches a number (2026-08-14, MS-07).** `src/lib/gemini.ts`'s
  `inferStructure()` is sent a head+tail *sample* of a vendor meter export and returns a structural
  description — delimiter, header row, which column is date/time/value, the unit, interval vs
  cumulative. Every arithmetic operation happens afterward in `src/lib/reading-normalize.ts`, which
  is pure, so normalisation replays from the raw file plus the stored mapping alone. Two reasons,
  and both apply to any future extraction this codebase adds: **volume** (one circuit-month is ~720
  hourly rows and R0 assumes 800+ circuits, so transcription by a model is neither affordable nor
  checkable) and **INV-02** (a billed figure has to trace to something reproducible, not to a
  one-off model response). Where a model must decide something, the schema is designed so that
  *not knowing* is expressible — the prompt is told to ask rather than guess between DD/MM and
  MM/DD — and `mappingOverridden` records whether the operator accepted the proposal, so a
  systematically bad inference shows up in the data. Contrast the archived invoice extraction,
  where the model does return field values: that is a one-page document with a handful of fields a
  human reviews on screen before saving, which is a different risk shape entirely.
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
- Leftover test objects in the live bucket need manual cleanup (the app's own IAM credentials can't delete them, by design — `PutObject`-only): `Documents/ASF_Insignia_Gurugram/2026-08/Invoices/ASF_Insignia_Gurugram_Invoice_2026-08_TEST-001.pdf` (2026-08-05), plus two from MS-05's verification (2026-08-14): `Documents/Palmwood_Enclave/2026-08/KYC/Palmwood_Enclave_GSTCertificate_2026-08.pdf` and `Documents/Palmwood_Enclave/2026-08/Agreements/Palmwood_Enclave_Agreement_2026-08.pdf`.
- Two more leftover objects, same cause and same manual cleanup, from the stage-credential
  verification (2026-08-14): `Documents/_stage_smoketest/2026-08/stage-s3-check.txt` (14 bytes) and
  `Documents/ASF_Insignia/2026-08/KYC/ASF_Insignia_GSTCertificate_2026-08.pdf` (a 1-line stub PDF —
  note this is the *stage* `ASF Insignia`, distinct from the 2026-08-05 `ASF_Insignia_Gurugram`
  invoice object above). The database rows behind the second one were deleted; the object cannot be.
- More leftover test objects, same cause and same manual cleanup: everything under
  `Documents/Northwood_Grove/2026-08/Installation/` (MS-06's verification, 2026-08-14) — installation
  batch photos and one dispute-evidence photo, all 1×1 PNGs — and everything under
  `Ingest/Cypress_Court/` (MS-07's verification, 2026-08-14) — a handful of small meter-export CSVs
  from two full end-to-end passes.
- **One AWS change is outstanding and only the user can make it: narrow the bucket policy's
  public-read statement from `arn:aws:s3:::firsthing/*` to `arn:aws:s3:::firsthing/Documents/*`**
  (agreed 2026-08-14 when MS-07's raw-file storage was scoped). Until then the `Ingest/` prefix is
  private by convention only — the app never renders or stores a raw-file URL and serves every read
  through a gated, short-lived presigned GET, but an unauthenticated `curl` of a known key still
  returns 200, verified. This is the one deliberately-failing check in MS-07's verification suite,
  left asserting the correct end state so it flips to passing the moment the policy changes.
  **No second change is needed** — an earlier conclusion in the same session that the IAM user
  lacks `s3:GetObject` was wrong (S3 returns `AccessDenied` for a missing key when the caller lacks
  `s3:ListBucket`, which is a different grant); `HeadObject` and presigned reads both work today.
- **KYC documents and executed agreements are stored in a public-read bucket** (user's explicit choice, 2026-08-14, made with the alternative and the reasoning in front of them — see the MS-05 section). Anyone with or guessing a URL can fetch a society's GST certificate or signed agreement without a session. Worth revisiting alongside **SPIKE-02** (India DPDP Act review), which is still unresolved. The switch is cheap by construction: the DB stores S3 keys, not URLs, so it is a change to `publicS3Url()` plus a read path, not a data migration.
- Resolved (2026-08-14): **`stage.firsthing.earth` now has AWS + Gemini credentials and uploads work there** — see "Stage credentials" below. Was open for one day after the MS-05 deploy found the gap.
- **`AUTH_SECRET` is shared between the live stage app and the archived app, and has been exposed** (2026-08-14). Compared by hash on the box: `/zenovaa/code/firsthing-dashboard/.env.local` and the archived `firsthing-dashboard-newui-archived-20260814/.env.local` carry the *same* `AUTH_SECRET`, and the archived file's contents were pasted into a chat transcript. It is the secret currently signing every JWT session on stage. **Rotation offered and not yet actioned** — it is one line plus a `pm2 restart`, and the only user-visible effect is that everyone signs in again. The same paste also exposed `SUPABASE_SECRET_KEY` and the Supabase service-role key for project `rdgdzscmhcynluvabobz`; those are inert for this build (nothing in the new `src/` imports Supabase) but may still back the old production site.
- **The legacy Supabase project's `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` is a misnamed hazard, though it appears never to have shipped.** `NEXT_PUBLIC_` makes Next.js inline a variable into the *browser* bundle, and a service-role key bypasses row-level security entirely. Verified 2026-08-14: no code anywhere reads that variable — the only service-role usage is the two archived Supabase Edge Functions (`archive/supabase/functions/create-society-user/index.ts:29`, `update-society-user/index.ts:66`), which read the **non**-prefixed `SUPABASE_SERVICE_ROLE_KEY` via `Deno.env.get()`, server-side. Next only inlines variables it actually sees referenced, so nothing was emitted. Worth renaming or deleting in whatever still owns that env file, since one accidental reference makes it public. Compounds the already-recorded finding that this project's RLS is off.
- 5 of the 8 planned document types (meter readings, pre/post-demo reports, legal agreements, gate passes) have a naming convention defined but **no upload UI or schema yet** — only invoices, savings reports, and inspection reports are actually wired up.
- Mostly resolved (2026-08-14, MS-07): the CSV meter-reading upload/validation pipeline the user
  described back on 2026-08-05 — explicit period selection, ±5% variance flagging, a review/ignore
  workflow — is **built in the new `src/`** (FEAT-043..047, see the MS-07 section). The one part of
  that original description still unbuilt is auto-generating the monthly savings-report image,
  which belongs to MS-08's delivery work, not to ingest. The archived app's own version of this
  pipeline remains, as it always was, unbuilt and now irrelevant.
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
