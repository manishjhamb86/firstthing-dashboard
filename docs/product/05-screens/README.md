# Screens: Spec & Design — index
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Approved — all 51 priority-1 screens specified, all 6 mockup decks built, navigation map and screen↔feature matrix drawn
**Last updated:** 2026-08-13 · **Mode:** Ecosystem

> **This is the index.** The method splits above ~25 screens, and there are 109, so the
> specifications live in one file per surface alongside this one. Start here for the inventory,
> the coverage ledger and the cross-cutting matrices; go to a surface file for the screens.
>
> | File | Covers |
> |---|---|
> | [`00-global-patterns.md`](00-global-patterns.md) | Rules every screen inherits, and the shared components specified once |
> | [`01-back-office-monthly.md`](01-back-office-monthly.md) | SUR-01 monthly loop — the revenue spine |
> | [`02-back-office-deal.md`](02-back-office-deal.md) | SUR-01 sales & deal loop |
> | [`03-society-portal.md`](03-society-portal.md) | SUR-01 society portal |
> | [`04-back-office-ops.md`](04-back-office-ops.md) | SUR-01 service loop, portfolio, registry |
> | [`05-field.md`](05-field.md) | SUR-02 field, mobile web, offline-tolerant |
> | [`06-cross-cutting.md`](06-cross-cutting.md) | Auth, errors, account, administration |
>
> HL-01..05 (headless units — no interface) are specified in §1.9 of this index, not in a
> separate file — there's no UI surface to warrant splitting them out.

> **Numbering:** this is *this blueprint's* Phase 5. It follows the skill's
> `references/phase-07-screens.md` (screens) and `references/phase-06-branding.md` (theme), which
> are offset from the phase map's numbering. SKILL.md's phase map is canonical for phase
> *numbers*; its Reference column points at filenames that don't match the reference directory.
> See `00-intake.md` §11.

---

## 0. Gate: the theme is approved

The method is explicit that the visual system must be signed off **before the first screen** —
designing on an unapproved system means reworking every screen when it changes. `00-intake.md` §11
already committed to exploring fresh visual directions (the existing 5-theme token system among
them) before settling one, and accepted that this may invalidate parts of the existing reskin.

**That exploration is done — see `05a-theme-system.md` (Approved, 2026-08-12).** Brand direction
settled (warm professional; credible, warm, unfussy), three directions rendered against SCR-090,
**DIR-02 Console** chosen, then built out in full: semantic tokens in light and dark, type/space/
elevation/motion scales, every shared component in every state, a `.roomy` density modifier for the
society portal and the SUR-02 field surface, proved on SCR-082 and accessibility-verified with
measured contrast ratios.

The gate is therefore **open**: the per-screen loop below can run all five steps, not just
specification.

---

## 1. Screen inventory

Two sources, per the method: every screen the Phase 4 flows touch, **plus** the screens flows
never reach but products always need — the second list is where most missing screens are found,
and it accounts for 50 of the 111 below.

**Coverage ledger: 51 of 111 specified · 51 mockups approved · 0 blueprinted** (plus 5 headless units, §1.9).
The 51 are the whole priority-1 set (§3); the remaining 60 are priority 2 and 3, deliberately not
run — see §3's note on deferring them until after prioritization.

Legend — **Src:** `F` derived from a Phase 4 flow · `M` method's standard-screens checklist ·
`X` feature with no flow and no flow-assigned screen (found while building this inventory).
**Pri:** 1 = primary flow (deal + monthly loops), 2 = secondary, 3 = supporting.

### 1.1 SUR-01 back office — sales & deal loop

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-001 | Lead form | F | 01 | FEAT-001 | 1 | ✅ | ✅ |
| SCR-002 | Proposal editor | F | 01 | FEAT-002 | 1 | ✅ | ✅ |
| SCR-003 | Pipeline board (incl. lead-health signal) | F | 01, 06 | FEAT-004, 031, 095 | 1 | ✅ | ✅ |
| SCR-004 | Backend-entered lead approval queue | X | 01 | FEAT-003 | 2 | — | — |
| SCR-005 | Closed / lost deals view | X | 01 | FEAT-095 | 2 | — | — |
| SCR-014 | Survey review & circuit confirmation | F | 02 | FEAT-010 | 1 | ✅ | ✅ |
| SCR-025 | Deal commissioning status (per-circuit fan-out) | F | 03 | FEAT-011–014 | 1 | ✅ | ✅ |
| SCR-030 | Demo report editor | F | 04 | FEAT-020, 021, 022 | 1 | ✅ | ✅ |
| SCR-040 | KYC checklist & verification | F | 05 | FEAT-024, 026 | 1 | ✅ | ✅ |
| SCR-050 | Offer builder (per-circuit benchmark table) | F | 06 | FEAT-027, 028 | 1 | ✅ | ✅ |
| SCR-052 | Agreement tracker & physical handoff log | F | 06 | FEAT-029, 030 | 1 | ✅ | ✅ |
| SCR-053 | Contract record | F | 06 | FEAT-062 | 1 | ✅ | ✅ |
| SCR-060 | Installation plan | F | 07 | FEAT-033 | 1 | ✅ | ✅ |
| SCR-063 | Installation blockers & scope changes | F | 07 | FEAT-036 | 1 | ✅ | ✅ |
| SCR-070 | Demo-skip exception approval | F | 08 | FEAT-032 | 3 | — | — |

### 1.2 SUR-01 back office — monthly loop

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-080 | Reading upload (single + batch) | F | 09 | FEAT-043, 044, 099, 107 | 1 | ✅ | ✅ |
| SCR-081 | Anomaly & coverage review | F | 09 | FEAT-045, 046 | 1 | ✅ | ✅ |
| SCR-082 | Month-close readiness board | F | 09 | FEAT-047, 100 | 1 | ✅ | ✅ |
| SCR-083 | Quarantined / unmatched files | X | 09 | FEAT-099 | 2 | — | — |
| SCR-084 | **Ingest health & meter status** | X | 09 | FEAT-104, 105, 106 | 1 | ✅ | ✅ |
| SCR-090 | Per-circuit compliance view | F | 10 | FEAT-049 | 1 | ✅ | ✅ |
| SCR-091 | Savings report (ops view / editor) | F | 10 | FEAT-059 | 1 | ✅ | ✅ |
| SCR-092 | Accountant release queue | F | 10 | FEAT-054 | 1 | ✅ | ✅ |
| SCR-093 | Invoice upload & reconciliation | F | 10 | FEAT-053, 101 | 1 | ✅ | ✅ |
| SCR-110 | Deviation chart & initial findings | F | 11 | FEAT-055 | 1 | ✅ | ✅ |
| SCR-112 | Root-cause & decision record | F | 11 | FEAT-057, 050 | 1 | ✅ | ✅ |
| SCR-113 | Management escalation & benchmark adjustment | F | 11 | FEAT-058 | 1 | ✅ | ✅ |
| SCR-120 | Arrears board (with dispute flags) | F | 12 | FEAT-087, 102 | 1 | ✅ | ✅ |
| SCR-122 | Payment recording | X | 12 | FEAT-087 | 2 | — | — |

### 1.3 SUR-01 back office — service loop & operations

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-131 | Ticket triage queue | F | 13 | FEAT-070, 071 | 2 | — | — |
| SCR-133 | Escalation queue (shared: tickets, visits, threads) | F | 13, 15, X1 | FEAT-018, 074, 083, XC-03 | 2 | — | — |
| SCR-135 | Ticket detail (ops) | X | 13 | FEAT-072, 073 | 2 | — | — |
| SCR-143 | Inspection reports list & detail | X | 14 | FEAT-080 | 2 | — | — |
| SCR-150 | Support thread | F | 15 | FEAT-081, 084 | 2 | — | — |
| SCR-151 | Society 360 (bill, disputes, comms, notifications) | F | 15 | FEAT-082, 093 | 2 | — | — |
| SCR-160 | Contract amendment | F | 17 | FEAT-064 | 2 | — | — |
| SCR-161 | Light-count change & benchmark rescale | F | 17 | FEAT-041 | 2 | — | — |
| SCR-162 | Renewals & AMC | F | 17 | FEAT-063 | 3 | — | — |
| SCR-163 | Termination | F | 17 | FEAT-051 | 3 | — | — |
| SCR-164 | Term-end hardware ownership transfer | F | 17 | FEAT-103 | 3 | — | — |
| SCR-170 | Field visit scheduler | F | X1 | FEAT-016 | 1 | ✅ | ✅ |
| SCR-172 | Visit board (all visits, all staff) | X | X1 | FEAT-018, 019 | 2 | — | — |
| SCR-270 | Spare inventory rollup (ops) | X | 14 | FEAT-077 | 2 | — | — |
| SCR-271 | Returns pool & warranty claims | X | 14 | FEAT-076, CON-36 | 3 | — | — |

### 1.4 SUR-01 back office — portfolio, registry & analytics

Entirely absent from the flows by design — Phase 4 classified CAP-08 as a *view*, not a journey.
It is still six real screens, and the ops home is arguably the most-used screen in the product.

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-240 | Ops home — priority task queue | X | — | FEAT-066, 067 | 1 | ✅ | ✅ |
| SCR-241 | Portfolio society list & status chips | X | — | FEAT-067 | 1 | ✅ | ✅ |
| SCR-242 | Society → circuit drill-down (consumption vs benchmark) | X | — | FEAT-068 | 1 | ✅ | ✅ |
| SCR-243 | Business analytics / stats view | X | — | FEAT-069 | 2 | — | — |
| SCR-250 | Society list & record (admin) | X | — | FEAT-085, 108 | 1 | ✅ | ✅ |
| SCR-251 | Circuit registry & configuration | X | — | FEAT-040 | 1 | ✅ | ✅ |
| SCR-252 | Service-line registry & enrollment | X | — | FEAT-039 | 2 | — | — |
| SCR-253 | Pump asset register (monitor-only) | X | — | FEAT-042 | 2 | — | — |
| SCR-254 | Cross-sell savings projection | X | — | FEAT-061 (deferred) | 3 | — | — |

### 1.5 SUR-01 society portal

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-031 | Demo report view (prospect) | F | 04 | FEAT-023 | 1 | ✅ | ✅ |
| SCR-041 | Document upload (KYC) | F | 05 | FEAT-025 | 1 | ✅ | ✅ |
| SCR-051 | Offer view & response | F | 06 | FEAT-028 | 1 | ✅ | ✅ |
| SCR-062 | Daily installation batch review | F | 07 | FEAT-035 | 1 | ✅ | ✅ |
| SCR-100 | Portal home (maximal visibility) | F | 16 | FEAT-088 | 1 | ✅ | ✅ |
| SCR-101 | Contract view (read-only) | F | 16 | FEAT-065 | 2 | — | — |
| SCR-121 | Extension request | F | 12 | FEAT-087 | 2 | — | — |
| SCR-123 | Raise a billing dispute | X | 12 | FEAT-102 | 2 | — | — |
| SCR-130 | Raise a ticket | F | 13 | FEAT-089 | 2 | — | — |
| SCR-134 | My tickets & resolution timeliness | F | 13 | FEAT-089 | 2 | — | — |
| SCR-260 | Invoice list & detail | X | 16 | FEAT-060 | 1 | ✅ | ✅ |
| SCR-261 | Savings report list & detail (customer) | X | 16 | FEAT-060 | 1 | ✅ | ✅ |
| SCR-262 | Society profile & contacts (self-service) | X | — | FEAT-092, 096 | 3 | — | — |
| SCR-263 | **Portal account list & authority (society self-service)** | X | — | FEAT-108, CON-45 | 2 | — | — |

### 1.6 SUR-02 field (mobile web, offline-tolerant)

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-171 | My visits (field home) | F | X1 | FEAT-017, 096 | 1 | ✅ | ✅ |
| SCR-010 | Survey: society profile & access | F | 02 | FEAT-005, 096 | 1 | ✅ | ✅ |
| SCR-011 | Survey: lighting inventory by area | F | 02 | FEAT-006 | 1 | ✅ | ✅ |
| SCR-012 | Survey: circuit selection per light type | F | 02 | FEAT-007 | 1 | ✅ | ✅ |
| SCR-013 | Survey: pump audit & logbook capture | F | 02 | FEAT-008, 009 | 1 | ✅ | ✅ |
| SCR-020 | Meter install & load validation | F | 03, 08 | FEAT-011, 094 | 1 | ✅ | ✅ |
| SCR-021 | Gate pass (incl. provisional release) | F | 03, 07 | XC-01, FEAT-097 | 1 | ✅ | ✅ |
| SCR-022 | Commissioning monitor (window progress) | F | 03 | FEAT-012, 014 | 1 | ✅ | ✅ |
| SCR-023 | Demo installation / light replacement | F | 03 | FEAT-013 | 1 | ✅ | ✅ |
| SCR-024 | Benchmark result & out-of-range review | F | 03 | FEAT-014, 015 | 1 | ✅ | ✅ |
| SCR-061 | Daily batch capture | F | 07 | FEAT-034 | 1 | ✅ | ✅ |
| SCR-064 | Completion certificate | F | 07 | FEAT-037 | 1 | ✅ | ✅ |
| SCR-065 | Installation dashboard (per-role, shared state) | X | 07 | FEAT-038 | 2 | — | — |
| SCR-111 | Deviation field investigation | F | 11 | FEAT-056 | 2 | — | — |
| SCR-132 | Ticket work (field) | F | 13 | FEAT-072, 073 | 2 | — | — |
| SCR-140 | Routine inspection checklist | F | 14 | FEAT-078, 079 | 2 | — | — |
| SCR-141 | Spare reconciliation & collection | F | 14 | FEAT-075, 076 | 2 | — | — |
| SCR-142 | Inspection report submission | F | 14 | FEAT-080 | 2 | — | — |

### 1.7 Cross-cutting: authentication, onboarding, errors

Standard-screen checklist. **Note there is no sign-up** — every account is provisioned (FEAT-086,
FEAT-098, CON-34), which is itself a decision worth stating rather than an omission.

| SCR | Screen | Src | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|
| SCR-200 | Sign in | M | FEAT-086 | 1 | ✅ | ✅ |
| SCR-201 | Password reset request → reset | M | FEAT-086 | 2 | — | — |
| SCR-202 | Session expiry / re-authenticate | M | — | 2 | — | — |
| SCR-203 | Account locked / disabled | M | FEAT-086 | 3 | — | — |
| SCR-210 | Society first-login welcome (prospect vs customer) | M | FEAT-098, CON-34 | 2 | — | — |
| SCR-211 | Field staff first-run & offline primer | M | XC-02 | 2 | — | — |
| SCR-220 | 404 not found | M | — | 3 | — | — |
| SCR-221 | 403 forbidden (wrong role / wrong society) | M | INV-05 | 2 | — | — |
| SCR-222 | 500 / unexpected error | M | — | 3 | — | — |
| SCR-223 | **Offline & sync-pending (SUR-02)** | M | XC-02 | 1 | ✅ | ✅ |
| SCR-224 | Maintenance / degraded | M | INV-06 | 3 | — | — |

### 1.8 Cross-cutting: account, administration, data lifecycle, help

| SCR | Screen | Src | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|
| SCR-230 | My profile & password | M | FEAT-086 | 2 | — | — |
| SCR-231 | Notification preferences | M | FEAT-090, CON-39 | 3 | — | — |
| SCR-232 | User management (non-admin roles) | M | FEAT-086 | 2 | — | — |
| SCR-233 | Admin users & named permissions | M | FEAT-086, INV-01 | 2 | — | — |
| SCR-234 | **Audit log** | M | INV-03, INV-07, XC-04 | 2 | — | — |
| SCR-235 | SLA configuration | M | CON-35 | 3 | — | — |
| SCR-236 | Notification event catalogue & templates | M | FEAT-090 | 3 | — | — |
| SCR-180 | Notification delivery log & resend | F | FEAT-091, 093 | 2 | — | — |
| SCR-237 | Society access details & contact directory | M | FEAT-092, 096 | 2 | — | — |
| SCR-280 | Documents area (list + upload) | M | XC-07 | 2 | — | — |
| SCR-281 | Data export | M | — | 3 | — | — |
| SCR-282 | Delete / destructive-action confirmation | M | — | 2 | — | — |
| SCR-283 | Global search & zero-results | M | — | 3 | — | — |
| SCR-290 | Help & support contact | M | — | 3 | — | — |
| SCR-291 | Legal, consent & changelog | M | — | 3 | — | — |

### 1.9 Headless units (no screen, still specified)

The method's scope note is explicit that headless surfaces get specified here too — a system-run
job has states, failures and permissions exactly as a page does, and specifying it now is what
makes Phase 7's contracts concrete rather than aspirational. Five units run with no interface of
their own; their *output* appears on the screens named, but their behaviour needs its own spec.

| Unit | Feature | Runs when | Output visible on |
|---|---|---|---|
| HL-01 | FEAT-048 — monthly savings calculation run | Automatically once a month's readings validate (CON-33) | SCR-082, SCR-090, SCR-091 |
| HL-02 | FEAT-052 — agreed-benchmark billing, first-month reference | Automatically monthly on `negotiated-fixed` contracts | SCR-090, SCR-091 |
| HL-03 | FEAT-091 — notification send & delivery logging | On any registered event | SCR-180 |
| HL-04 | XC-03 — SLA timers & escalation triggers | Continuously, across tickets, visits and threads | SCR-133 |
| HL-05 | FEAT-104 — scheduled vendor API reading fetch | On a schedule (daily default, sub-daily supported) — CON-43 | SCR-084, SCR-080, SCR-082 |

---

## 2. What building this inventory exposed

Per the method's step 6, discoveries go back to the owning phase rather than living only here.
None of these are new *features* — they are features that existed with **no screen anywhere in the
flows**, which is a Phase 4 coverage gap rather than a Phase 3 one:

| Finding | Detail |
|---|---|
| **CAP-08 has 4 screens and 0 flows** | Phase 4 classified portfolio monitoring as "a view, not a journey" and excluded it. That was right about flows and wrong about consequence — SCR-240 (ops home) is plausibly the single most-used screen in the product, and it had no home in any document until now |
| **9 features had no screen** | FEAT-003, 038, 039, 040, 042, 061, 077, 080, 095 — reachable only through screens the flows never named. Now SCR-004, 065, 252, 251, 253, 254, 270, 143, 005 |
| **The society portal is thinner in the flows than in CAP-14** | CAP-14 promises "maximal visibility… cumulative savings, bill/payment status, active tickets, contract summary together". FLOW-16 walks the home and the report, but invoice and savings-report *lists* (SCR-260/261) were never named |
| **No audit-log screen existed** | INV-03, INV-07 and XC-04 all mandate auditable, append-only records. Nothing in Phases 3 or 4 gave that a surface (SCR-234) |
| **The offline state is a screen, not a behaviour** | XC-02 treats offline as a property of SUR-02 features. It also needs its own surface (SCR-223): what a field worker sees when queued work hasn't synced. INV-06 requires a degraded state on every list; this is where it becomes concrete |
| **3 features were on no screen at all** | FEAT-031 (lead-health signal), FEAT-083 (thread escalation on non-response) and FEAT-018 (visit escalation) were cited by no screen until a coverage check caught them — now on SCR-003 and SCR-133 |
| **4 units are headless** | FEAT-048, 052, 091 and XC-03 have no interface of their own. Rather than letting them fall out of the phase, they are specified as headless units (§1.9) |

---

## 3. Coverage ledger

Priority 1 first, per the user's call on 2026-08-12: run the full loop on the priority-1 set, then
reassess before touching 2s and 3s. Phase 6 prioritization may cut some of the remainder, and
designing screens that get cut is the one real cost of interleaving (method §4).

**51 priority-1 screens** (48 in §1.1–1.6, SCR-200 and SCR-223 in §1.7, and SCR-084 added 2026-08-12).

| Surface group | Pri-1 screens | Specified | Mockup | Blueprint |
|---|---|---|---|---|
| Monthly loop | 12 | **12** | **12** | 0 |
| Deal loop | 12 | **12** | **12** | 0 |
| Portfolio & ops | 6 | **6** | **6** | 0 |
| Society portal | 7 | **7** | **7** | 0 |
| Field (SUR-02) | 12 | **12** | **12** | 0 |
| Cross-cutting | 2 | **2** | **2** | 0 |
| **Total** | **51** | **51** | **51** | **0** |

**The priority-1 run is complete** — every screen specified against the seven-state requirement,
with entry points, actions carrying permissions and failure behaviour, inputs with real error copy,
exits, responsive, offline and accessibility; and every screen drawn. Verified by script: 0
table-column defects, 0 missing required sections, 0 unresolved SCR/CMP cross-references.

### 3.1 Rendered prototypes

Six decks, one per surface group, each screen with its full state set. All three themes work in
every deck and the choice persists per account (see `../05a-theme-system.md` §3.2b).

| Deck | Screens | Artifact |
|---|---|---|
| Monthly loop | 12 | https://claude.ai/code/artifact/cec984c8-6007-4411-996f-3dcd3280e604 |
| Deal loop | 12 | https://claude.ai/code/artifact/fc9984e2-3b78-4959-87ba-ac326f3862c6 |
| Field surface | 12 | https://claude.ai/code/artifact/74300664-e56c-4ae3-80ee-8a7e85c4edb5 |
| Society portal | 7 | https://claude.ai/code/artifact/881a2e1e-e4c9-4ec0-96a9-a55916074e8e |
| Portfolio & dispatch | 6 | https://claude.ai/code/artifact/c6a8aadb-4df9-407e-872a-e5c624bfb133 |
| Sign in & offline | 2 | https://claude.ai/code/artifact/a356917a-9d95-4ecb-baeb-85905a13a5d3 |

Sources in [`../mockups/`](../mockups/) — `python3 build_<name>.py` regenerates a deck. That folder's
README records the rules the drawing exposed, which are worth reading before the rebuild starts.

**What drawing them caught that specifying them did not.** The value of this step was not
presentational. Four defects were substantive: the deal deck labelled the revenue share **58%
FirsThing / 42% society**, exactly inverted against CON-11, with the rupee figures correct and the
parties swapped — the kind of error that survives every review that does not check the arithmetic
against the constraint. The ops deck's suspension screen named a different society than its own data
thread. `--text-subtle` failed WCAG AA on two tinted surfaces at 4.47:1 and 4.46:1, close enough to
pass inspection. And three separate decks clipped a table inside a two-up grid, each time cutting
the column a reader most needs — a fee, a reason, an approver.

**Mockups were deferred and then un-deferred.** The 2026-08-12 call was specs-first so nothing got
drawn that Phase 6 then cut. That held until the priority-1 set was complete, at which point the
argument reversed: the set is fixed, and the inverted revenue share had been sitting in a spec
nobody could see.

## 4. Navigation map

Three of the six decks each invented their own back-office sidebar, and the three disagree — one
opens with "Portfolio / Societies", one with "Ops home / Pipeline", one with "Ops home / Portfolio /
Month / Dispatch". That is the map's real job: there is **one** back-office console, and this is it.

### 4.1 SUR-01 back office — one sidebar, filtered by role

Twenty-four destinations under four group headings, plus the home. Long, but this is a console
someone lives in for eight hours; the alternative — hiding the month behind a menu — costs more than
the length does. **The filter is per-permission, not per-group**: an accountant sees Release queue
and Invoices and nothing else in Month.

| Group | Item | Screen | Badge | Visible to |
|---|---|---|---|---|
| — | **Ops home** | SCR-240 | band-1 count | PER-01, PER-02, management |
| **Pipeline** | Pipeline | SCR-003 | open deals | PER-07, PER-01 |
| | Surveys | SCR-014 | awaiting review | PER-01 |
| | Commissioning | SCR-025 | in window | PER-01 |
| | Demo reports | SCR-030 | — | PER-01, PER-07 |
| | KYC | SCR-040 | outstanding | PER-01 |
| | Offers | SCR-050 | awaiting response | PER-07, PER-01 |
| | Agreements | SCR-052 | in transit | PER-01 |
| | Installation | SCR-060 | active projects | PER-01 |
| **Month** | Readings | SCR-080 | — | PER-01 |
| | Ingest health | SCR-084 | alerting meters | PER-01 |
| | Anomalies | SCR-081 | unresolved | PER-01 |
| | Close board | SCR-082 | blocked societies | PER-01, PER-08 |
| | Compliance | SCR-090 | — | PER-01 |
| | Deviations | SCR-110 | open | PER-01, management |
| | Savings reports | SCR-091 | unreleased | PER-01 |
| | Release queue | SCR-092 | awaiting release | **PER-08**, PER-01 |
| | Invoices | SCR-093 | unreconciled | PER-08, PER-01 |
| | Arrears | SCR-120 | overdue | PER-01 |
| **Portfolio** | Societies | SCR-241 | — | all internal |
| | Circuit registry | SCR-251 | — | PER-01 |
| **Dispatch** | Visit scheduler | SCR-170 | unaccepted | PER-01 |

**Deliberately not in the sidebar.** Ten priority-1 screens are reachable only by drilling, because
each is always *about* something and a nav entry would land on a chooser:

| Screen | Reached from |
|---|---|
| SCR-001 lead form | "New lead" on SCR-003; "Add service line" on SCR-250 |
| SCR-002 proposal editor | a lead on SCR-001/SCR-003 |
| SCR-053 contract record | SCR-052, SCR-090, SCR-113, SCR-250 |
| SCR-063 installation blockers | SCR-060, SCR-061, SCR-240 |
| SCR-112 root-cause & decision | SCR-110, SCR-111, SCR-113, SCR-240 |
| SCR-113 escalation & adjustment | SCR-110, SCR-112 |
| SCR-242 circuit drill-down | a society on SCR-241, SCR-250 |
| SCR-250 society record | a row on SCR-241 |
| SCR-091 savings report (ops) | SCR-090, SCR-092, SCR-082, SCR-261 |
| SCR-093 invoice reconciliation | SCR-092, SCR-082, SCR-280 |

SCR-091 and SCR-093 appear in both lists on purpose — each has a monthly queue worth reaching
directly *and* a single-society form reached from the month.

### 4.2 SUR-01 society portal — four nav sets, one per lifecycle stage

The portal's nav is not filtered, it is **replaced**. A prospect has no home to go to; showing them
a greyed-out "Savings" tab advertises a thing they cannot have.

| Stage | Nav | Screens reachable |
|---|---|---|
| **Prospect** (CON-34) | *none* — single page | SCR-031 |
| **Pre-contract** | Your offer · Documents · Contact us | SCR-051, SCR-041 |
| **Installing** | Home · Installation · Documents · Contact us | SCR-100, SCR-062, SCR-041 |
| **Live** | Home · Savings · Invoices · Documents · Your contract | SCR-100, SCR-261, SCR-260, SCR-101 |

Transitions are automatic on contract state (FEAT-098). "Raise a ticket" (SCR-130, priority 2) sits
on every stage's page furniture rather than in the nav — see §4.5.

### 4.3 SUR-02 field — no nav at all

The field surface has **one root and no chrome**: SCR-171 (My visits). Everything else is entered
from a visit and returns to it, which is §0.5's visit-scoped navigation rule made concrete. A
technician on a ladder with one hand free does not browse.

```
SCR-171  My visits  ── the only root; app launch always lands here
  └─ a visit card ──▶ by visit type:
       survey        → SCR-010 ▸ SCR-011 ▸ SCR-012 ▸ SCR-013   (survey shell: 4 sections, 1 container)
       meter-install → SCR-020 ──▶ SCR-021 gate pass (mandatory before leaving)
       demo-install  → SCR-023 ──▶ SCR-021
       monitor       → SCR-022 ──▶ SCR-024 benchmark result
       batch         → SCR-061 ──▶ SCR-021 · SCR-064 completion certificate
  └─ SCR-223  Offline & sync  ── reachable from anywhere; the sync pill in the header
```

The survey's four screens are **one container with a section index**, not four destinations — which
is why they have no entry-point tables of their own.

### 4.4 Cross-cutting

SCR-200 (sign in) is the root of everything and belongs to no nav. It routes by account type on
success, and honours a deep link rather than discarding it — a committee member following an email
link to their savings report lands on the report. SCR-223 is reachable from every field screen via
the header's sync pill.

### 4.5 What a priority-1-only build cannot reach

Eighteen priority-2/3 screens are linked to from priority-1 screens. Each is a dead end until built,
and the link count is a real prioritization signal — **SCR-130 is reached from six of the seven
portal screens**, which makes "raise a ticket" priority 1 in behaviour whatever the inventory says.

| Screen | Inbound links | From |
|---|---|---|
| SCR-130 raise a ticket | **6** | SCR-041, SCR-051, SCR-062, SCR-100, SCR-260, SCR-261 |
| SCR-151 society 360 | 4 | SCR-053, SCR-112, SCR-120, SCR-250 |
| SCR-160 contract amendment | 4 | SCR-053, SCR-063, SCR-113, SCR-251 |
| SCR-101 contract view | 3 | SCR-051, SCR-100, SCR-261 |
| SCR-121 extension request | 2 | SCR-120, SCR-260 |
| SCR-163 termination | 2 | SCR-053, SCR-250 |
| SCR-180 notification log | 2 | SCR-002, SCR-120 |
| SCR-234 audit log | 2 | SCR-053, SCR-112 |
| SCR-280 documents | 2 | SCR-040, SCR-093 |
| SCR-005, 111, 122, 132, 140, 172, 201, 230, 237 | 1 each | — |

Six run the other way — priority-2 screens that are named as *entry points into* the priority-1 set
(SCR-083 → SCR-080, SCR-101 → SCR-053, SCR-111 → SCR-112, SCR-121 → SCR-120, SCR-151 → SCR-053/120,
SCR-280 → SCR-093). Those are safe to leave: the priority-1 screen is reachable another way.

## 5. Screen ↔ feature matrix

The method's exit criterion is that the matrix proves **no orphans in either direction**. Both were
checked by script against §1's tables, and both directions had a real finding.

### 5.1 Features → screens

**108 features. 104 have a screen, 4 do not — and all four are correct:**

| Feature | Why it has no screen |
|---|---|
| FEAT-048 monthly savings calculation run | Headless. HL-01 — output on SCR-082, SCR-090, SCR-091 |
| FEAT-052 agreed-benchmark billing | Headless. HL-02 — output on SCR-090, SCR-091 |
| FEAT-091 notification send & delivery log | Headless. HL-03 — output on SCR-180 |
| FEAT-104 scheduled vendor API fetch | Headless. HL-05 — output on SCR-084, SCR-080, SCR-082 |

**Two orphans were found and fixed** rather than explained away. Both were features added *after*
the inventory table was written, and neither was picked up by the row it belonged to:

- **FEAT-107** (upload reconciliation & overwrite control, added 2026-08-13 with CON-43's revision)
  is specified on SCR-080 — the reconciliation report is called "the heart of the screen" in the
  spec — but SCR-080's inventory row still read `FEAT-043, 044, 099`. Added.
- **FEAT-108** (society portal accounts & authority, added 2026-08-13 with CON-45) is specified in
  `03-society-portal.md` §0.1 and surfaced on SCR-250's People panel, but appeared on no row at all.
  Added to SCR-250 — **and it exposed a missing screen**: the portal's own "Manage accounts → account
  list" is named as a destination that nothing owns. Now **SCR-263**, priority 2. This one matters
  more than its priority suggests: CON-45 puts the commercially binding acts behind `office-bearer`,
  and the screen where a society sees and changes who holds it did not exist.

**41 features have a screen but not a priority-1 one** — they are the priority-2/3 backlog and are
listed in §1's tables. The clusters are coherent rather than scattered, which is a good sign for
Phase 6 sequencing: the whole service loop (tickets FEAT-070–074, inspections FEAT-078–080, spares
FEAT-075–077, support threads FEAT-081–084), contract lifecycle (FEAT-063, 064, 103, 051), and
notifications (FEAT-090–093).

### 5.2 Screens → features

Fifty of the 51 priority-1 screens cite at least one feature, checked by script. **One cites none:
SCR-223** (offline & sync pending), which carries XC-02 instead — offline tolerance is a
cross-cutting requirement, not a feature, and giving it a screen was itself a Phase 5 finding (§2).
SCR-021 is the near miss: it is primarily XC-01, the gate-pass pattern, and picks up FEAT-097 for
provisional release.

**Density check.** Two screens carry four features and none carries more — SCR-025 (FEAT-011–014,
the per-circuit commissioning fan-out) and SCR-080 (FEAT-043, 044, 099, 107, the two ingest
concerns plus reconciliation). Nothing in the set looks like a feature dumping ground, which is
usually where a screen is quietly doing two jobs.

### 5.3 Flow coverage

All 19 flows have screens in the inventory. **14 have a specified one; 5 have none at all** — and
that is the sharpest thing this matrix says about what a priority-1 build is.

**The 8 flows Phase 4 marked critical all have priority-1 coverage**, but only half are complete:

| Flow | Coverage | Deferred |
|---|---|---|
| FLOW-02 survey | **complete** | — |
| FLOW-03 commissioning | **complete** | — |
| FLOW-06 offer → agreement | **complete** | — |
| FLOW-10 billing run & release | **complete** | — |
| FLOW-07 installation | one screen short | SCR-065 installation dashboard |
| FLOW-09 ingest & validation | one screen short | SCR-083 quarantined files |
| FLOW-11 deviation review | one screen short | SCR-111 field investigation |
| FLOW-X1 visit scheduling | one screen short | SCR-172 visit board |

Each of those four gaps is a single screen, and each is the *handling* path rather than the main
one — which is the right thing to defer, but worth naming, because FLOW-11 without SCR-111 means a
deviation can be opened and classified from the desk but not sent to the field, and FLOW-09 without
SCR-083 means a file that fails to match has nowhere to go.

**Five flows have no priority-1 screen whatsoever** — FLOW-13 (ticket to resolution), FLOW-14
(routine inspection), FLOW-15 (support thread), FLOW-17 (contract lifecycle) and FLOW-X2
(notification dispatch). This is the entire **service loop** plus contract lifecycle, and it is
deferred wholesale, not thinned. A build of the priority-1 set can sell, commission, meter, bill and
collect — it cannot answer a complaint, run an inspection, amend a contract or send an email. That
is a defensible first release and an indefensible steady state; Phase 6 should treat FLOW-13 and
FLOW-X2 as the first things after priority 1, since SCR-130 already has six inbound links from
screens that will exist (§4.5) and notifications are how a society learns a report was released at
all.

## 6. Discovered in this phase

Discoveries go back to the owning phase rather than living only in a screen spec (method §6).
§2 above records what building the *inventory* exposed; this table records what **specifying and
drawing** the screens exposes.

| Type | ID | Description | Added to |
|---|---|---|---|
| System gap | — | Charts had no place in the theme system. SCR-081 and SCR-110 both need the deviation plot, so the chart roles, series palette and legibility rules were added to the system rather than invented per screen | `../05a-theme-system.md` §3.10 |
| Spec rule | — | A reading file attached to the wrong circuit is FLOW-09's sharpest failure and was named but not defended. SCR-080 now specifies three defences, including a hard block when incoming readings are >3× or <⅓ of the circuit's trailing mean | `01-back-office-monthly.md` SCR-080 |
| Spec change | CON-43 | User's rule 2026-08-13: neither ingest path overwrites a stored reading by default. Replaced CON-43's original "CSV wins" with a reconciliation report + explicit per-row confirmed overwrite; new FEAT-107. Also fixed the primacy ordering — manual is primary until the API exists, then it becomes the exception path | `01-back-office-monthly.md` SCR-080; CON-43; FEAT-107 |
| Decision | — | **"Identical" is exact equality** (user, 2026-08-13) — no rounding, no tolerance. Nothing real is ever hidden; the cost of a vendor precision change is absorbed by day-grouping and a shape hint, not by auto-resolving. Residual risk = ASSUM-28 | `01-back-office-monthly.md` SCR-080; FEAT-107 rule 6c |
| Decision | — | **A closed month must be reopened before overwrite** (user, 2026-08-13). Refused in place, so PER-08 can never approve figures that changed underneath them | `01-back-office-monthly.md` SCR-080; FEAT-107 rule 6b |
| **Decision** | **CON-45** | **A society holds several named logins with differentiated authority**, not one shared credential (user, 2026-08-13). Resolves a real collision: GOAL-02 said "one login", FEAT-085 assumed an account list, and three portal acts are commercially binding. `office-bearer` holds the binding acts, `committee` and `manager` are operational. Guards: at least one active office-bearer always, and PER-01 can re-designate when an AGM replaces the committee with no handover | `../00-intake.md` CON-45; `03-features.md` FEAT-108; `03-society-portal.md` §0.1 |
| **Decision** | **CON-46** | **One authentication mechanism for everyone: email and password**, as shipped (user, 2026-08-13). A per-population split (emailed sign-in link for societies) was considered and declined. Cost accepted as ASSUM-29 and mitigated without changing the mechanism: prominent self-service reset, 90-day portal sessions on a remembered device, and emailed artefacts that carry the substance so a locked-out committee still receives its month | `../00-intake.md` CON-46, ASSUM-29; `06-cross-cutting.md` SCR-200 |
| **Risk** | **ASSUM-29** | Password friction may suppress portal usage. It does not break anything — it erodes something, and a committee that cannot get in does not file a bug, it stops checking. Metric named: sign-in rate per society per month against report releases | `../00-intake.md` ASSUM-29 |
| Hygiene | — | A reference check found 21 apparently-dangling `CON-25d` / `CON-28a–d` references. All were valid — both parents define their sub-clauses inline — but in two different formats, so neither a reader nor the checker could resolve them reliably. Normalised to `**(a)**` and the convention documented above the constraint table | `../00-intake.md` |
| Risk | ASSUM-16 | The vendor CSV shape being stable is load-bearing for the whole monthly loop, and FLOW-09 step 1 has *no system visibility* if it changes. Worth a monitoring feature | flagged on SCR-080; not yet a FEAT |
| Spec rule | — | FEAT-054's own stated risk (a one-at-a-time release gate becomes the bottleneck at 200 societies) needed a structural answer, not care. SCR-092 now defines a **routine vs needs-review triage rule** with five explicit conditions, and bulk release that structurally cannot reach a needs-review month | `01-back-office-monthly.md` SCR-092 |
| Spec rule | — | SCR-113 enforces CON-37's direction-dependence structurally: on the FirsThing-favouring branch the apply action **does not exist**, only "raise amendment". A unilateral repricing becomes impossible rather than discouraged | `01-back-office-monthly.md` SCR-113 |
| Spec rule | — | SCR-120's suspension countdown freezes on two conditions the flows named separately but no screen owned: payment data not confirmed same-day (CON-13), and a bounced warning email (FEAT-091 AC-5). Both are header-level states, not columns | `01-back-office-monthly.md` SCR-120 |
| ~~Risk~~ **Validated** | ASSUM-21 | Confirmed by the user 2026-08-12: PER-08 is a separate person with real authority to hold a month back. SCR-092 stays as specified | `02-users-research.md` §9 |
| Decision | **CON-42** | A second-consecutive-breach flip to actual-metered now requires management sign-off rather than applying automatically on ops' classification. Raised while specifying SCR-112, decided by the user. Carries a resolved failure mode: a month that closes before sign-off bills at the unchanged fixed rate and the streak carries forward | `00-intake.md` CON-42; SCR-112, SCR-113 |
| Spec rule | — | SCR-014's survey confirmation is the highest-leverage review in the product — FLOW-02 says a lighting miscount biases billing for the term with *no downstream check*. The confirm modal now restates the counts as the billing basis, and CON-16's typicality question is a required written answer per circuit, since the system cannot validate it | `02-back-office-deal.md` SCR-014 |
| Spec rule | — | SCR-002's indicative savings cannot be free text — it is selected from real comparable societies' measured results, or falls back to the contracted 60–80% range and says so. A pre-demo figure is a claim, and this keeps the claim traceable | `02-back-office-deal.md` SCR-002 |
| Spec rule | — | SCR-063 offers no path to edit `representedLightCount` directly. A mid-install count discrepancy routes to a contract amendment or a contract-permitted deterministic rescale, and states the monthly rupee effect before offering either | `02-back-office-deal.md` SCR-063 |
| **Scope** | **CON-43** | The user specified a second ingest path on 2026-08-12: a scheduled vendor-API fetch plus permission-gated on-demand refresh, alongside the existing manual CSV. Added as FEAT-104/105/106, a new constraint, a new `fetch_readings` permission, a new headless unit HL-05, and a new priority-1 screen SCR-084. FLOW-09 gained steps 0/0a | `00-intake.md` CON-43, ASSUM-24; `03-features.md` FEAT-104–106; `04-flows-system-map.md` FLOW-09 |
| **Risk** | **ASSUM-24** | The whole API path rests on the vendor exposing a usable, documented, rate-tolerant API — **entirely unverified**. FEAT-104/105 do not exist if it is false, so they should not be scheduled ahead of a technical spike | `00-intake.md` ASSUM-24 |
| Open | Thresholds | Four invented numbers awaiting the user's values: SCR-092's routine test (10% of trailing mean, 28-day coverage), SCR-080's wrong-circuit block (3× / ⅓), SCR-081's 20-day floor (from CON-12), SCR-093's rupee-exact invoice match | asked 2026-08-12, unanswered |
| Spec rule | FEAT-006 AC-6 | SCR-011's per-area rows now carry a **light type** and a **count method** (walked / from records / estimated, note required on estimated). Two axes, not one: areas are how lights are counted, types are how they are billed, and four towers are four rows and one type. The method column exists because a desk reviewer cannot re-count 1,200 lights — how the number was obtained is the only reviewable property the highest-leverage number in the product has | `../03-features.md` FEAT-006; SCR-011, SCR-014 |
| Coverage | FEAT-096 | Site-access coordination was mapped only to SCR-262/SCR-237, but its own AC-1 and AC-3 are field-side: access details on the visit card, and the `access-blocked` outcome. Now specified on **SCR-171** (card + outcome) and captured on **SCR-010** (block 4), which is where FEAT-096 says they belong — "captured once at survey… reused by every later visit" | `05-field.md` SCR-171, SCR-010; inventory §1.5/§1.6 rows updated |
| Spec rule | — | The typicality question (CON-16) is now captured **in the field on SCR-012**, in writing, with a prompt that names the risk, not just reviewed at SCR-014. The surveyor is the only person who has seen both the sample circuit and the lights it will represent; a desk reviewer answering it is answering from nothing | `05-field.md` SCR-012 |
| Spec rule | — | SCR-013 derives the pump-audit unit list from the room's structure (towers × tanks → float-switch and actuator-valve rows, pre-named) rather than presenting CON-28c's six categories as a flat form. FEAT-008's own stated risk is that the burden gets shortcut on a phone; making most of the work *confirming* rather than *typing* is the structural answer, with copy-down for identical units and a still-mandatory per-unit photo | `05-field.md` SCR-013 |
| **Decision** | **CON-44** | **Answered 2026-08-13: yes, on every visit type.** ASSUM-25 is invalidated — a visit carries a team, not an owner. Device-generated IDs already make concurrent creates safe, so the real exposure is **double-counting**, which reaches the bill through `representedLightCount` → benchmark → fee. Model: work partitions by **area**; claims are advisory and optimistic (no lock is possible offline); a doubly-claimed area is **contested**, never summed or deduplicated; submission is blocked while any area is contested or any contributor is unsynced | `../00-intake.md` CON-44; `05-field.md` §0.1b; SCR-011, SCR-014, SCR-171 amended |
| Assumption | ASSUM-26 | Field photo processing: 1,600px long edge, JPEG ~0.75, ≈250–400 KB, EXIF location stripped. Legibility of a pump-room model label at that setting is untested | `../00-intake.md` ASSUM-26 |
| **Defect** | CON-11 | The deal deck labelled the revenue share **58% FirsThing / 42% society** — exactly inverted, with the rupee figures correct and the parties swapped. Nine places. Caught by checking the drawing against the constraint, not by reading it; the monthly deck was already right, which is what confirmed the direction | `../mockups/build_deal.py`; SCR-050, SCR-053 |
| **System gap** | — | Three decks each invented their own back-office sidebar and the three disagree. Resolved into **one console nav**, 24 destinations under four groups, filtered per permission rather than per group — an accountant sees Release queue and Invoices and nothing else in Month | §4.1 |
| **Coverage** | FEAT-107 | Specified on SCR-080 (the reconciliation report is "the heart of the screen") but the inventory row still read `FEAT-043, 044, 099`. Added after the matrix caught it — the feature was created after the row was written | §1.2 SCR-080 |
| **Coverage** | FEAT-108 | On no inventory row at all. Added to SCR-250 (the People panel), **and it exposed a missing screen**: the portal's own "Manage accounts → account list" is a named destination nothing owned. Now SCR-263, priority 2 — which matters more than its priority says, since CON-45 puts the binding acts behind `office-bearer` and the screen where a society sees who holds it did not exist | §1.5 SCR-263; `03-society-portal.md` §0.1 |
| **Prioritization** | SCR-130 | Reached from **six of the seven** priority-1 portal screens. "Raise a ticket" is priority 1 in behaviour whatever the inventory says, and a priority-1-only build has six dead links to it | §4.5 |
| **Scope** | — | **Five flows have no priority-1 screen whatsoever** — FLOW-13, 14, 15, 17 and X2, which is the entire service loop plus contract lifecycle and notifications. A priority-1 build can sell, commission, meter, bill and collect; it cannot answer a complaint, run an inspection, amend a contract or send an email. Defensible as a first release, not as a steady state | §5.3 |
| **Scope** | — | Four of the eight critical flows are one screen short each, and in every case the deferred screen is the *handling* path: FLOW-09 without SCR-083 leaves an unmatched file nowhere to go; FLOW-11 without SCR-111 means a deviation can be classified from the desk but never sent to the field | §5.3 |
| System caveat | — | An SVG's `width`/`height` **presentation attributes lose to any CSS rule**, so the global `svg{width:1.05em}` icon default silently collapsed the first chart drawn after it landed. A deliberately-sized SVG must be sized in CSS | `../05a-theme-system.md` §3.9 |
| Assumption | ASSUM-27 | Personal Android phones, not company devices — which is why the device cache purges 7 days after a visit closes and sign-out is refused while work is unsynced | `../00-intake.md` ASSUM-27 |
