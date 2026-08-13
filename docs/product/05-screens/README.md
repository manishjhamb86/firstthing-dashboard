# Screens: Spec & Design — index
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft — per-screen loop running on priority 1 (29 of 51)
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
> | [`03-back-office-ops.md`](03-back-office-ops.md) | SUR-01 service loop, portfolio, registry |
> | [`04-society-portal.md`](04-society-portal.md) | SUR-01 society portal |
> | [`05-field.md`](05-field.md) | SUR-02 field, mobile web, offline-tolerant |
> | [`06-cross-cutting.md`](06-cross-cutting.md) | Auth, errors, account, administration |
> | [`07-headless.md`](07-headless.md) | HL-01..04 — no interface, still specified |

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
and it accounts for 49 of the 110 below.

**Coverage ledger: 29 of 110 specified · 0 mockups approved · 0 blueprinted** (plus 5 headless units, §1.9).

Legend — **Src:** `F` derived from a Phase 4 flow · `M` method's standard-screens checklist ·
`X` feature with no flow and no flow-assigned screen (found while building this inventory).
**Pri:** 1 = primary flow (deal + monthly loops), 2 = secondary, 3 = supporting.

### 1.1 SUR-01 back office — sales & deal loop

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-001 | Lead form | F | 01 | FEAT-001 | 1 | ✅ | — |
| SCR-002 | Proposal editor | F | 01 | FEAT-002 | 1 | ✅ | — |
| SCR-003 | Pipeline board (incl. lead-health signal) | F | 01, 06 | FEAT-004, 031, 095 | 1 | ✅ | — |
| SCR-004 | Backend-entered lead approval queue | X | 01 | FEAT-003 | 2 | — | — |
| SCR-005 | Closed / lost deals view | X | 01 | FEAT-095 | 2 | — | — |
| SCR-014 | Survey review & circuit confirmation | F | 02 | FEAT-010 | 1 | ✅ | — |
| SCR-025 | Deal commissioning status (per-circuit fan-out) | F | 03 | FEAT-011–014 | 1 | ✅ | — |
| SCR-030 | Demo report editor | F | 04 | FEAT-020, 021, 022 | 1 | ✅ | — |
| SCR-040 | KYC checklist & verification | F | 05 | FEAT-024, 026 | 1 | ✅ | — |
| SCR-050 | Offer builder (per-circuit benchmark table) | F | 06 | FEAT-027, 028 | 1 | ✅ | — |
| SCR-052 | Agreement tracker & physical handoff log | F | 06 | FEAT-029, 030 | 1 | ✅ | — |
| SCR-053 | Contract record | F | 06 | FEAT-062 | 1 | ✅ | — |
| SCR-060 | Installation plan | F | 07 | FEAT-033 | 1 | ✅ | — |
| SCR-063 | Installation blockers & scope changes | F | 07 | FEAT-036 | 1 | ✅ | — |
| SCR-070 | Demo-skip exception approval | F | 08 | FEAT-032 | 3 | — | — |

### 1.2 SUR-01 back office — monthly loop

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-080 | Reading upload (single + batch) | F | 09 | FEAT-043, 044, 099 | 1 | ✅ | — |
| SCR-081 | Anomaly & coverage review | F | 09 | FEAT-045, 046 | 1 | ✅ | — |
| SCR-082 | Month-close readiness board | F | 09 | FEAT-047, 100 | 1 | ✅ | — |
| SCR-083 | Quarantined / unmatched files | X | 09 | FEAT-099 | 2 | — | — |
| SCR-084 | **Ingest health & meter status** | X | 09 | FEAT-104, 105, 106 | 1 | ✅ | — |
| SCR-090 | Per-circuit compliance view | F | 10 | FEAT-049 | 1 | ✅ | — |
| SCR-091 | Savings report (ops view / editor) | F | 10 | FEAT-059 | 1 | ✅ | — |
| SCR-092 | Accountant release queue | F | 10 | FEAT-054 | 1 | ✅ | — |
| SCR-093 | Invoice upload & reconciliation | F | 10 | FEAT-053, 101 | 1 | ✅ | — |
| SCR-110 | Deviation chart & initial findings | F | 11 | FEAT-055 | 1 | ✅ | — |
| SCR-112 | Root-cause & decision record | F | 11 | FEAT-057, 050 | 1 | ✅ | — |
| SCR-113 | Management escalation & benchmark adjustment | F | 11 | FEAT-058 | 1 | ✅ | — |
| SCR-120 | Arrears board (with dispute flags) | F | 12 | FEAT-087, 102 | 1 | ✅ | — |
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
| SCR-170 | Field visit scheduler | F | X1 | FEAT-016 | 1 | — | — |
| SCR-172 | Visit board (all visits, all staff) | X | X1 | FEAT-018, 019 | 2 | — | — |
| SCR-270 | Spare inventory rollup (ops) | X | 14 | FEAT-077 | 2 | — | — |
| SCR-271 | Returns pool & warranty claims | X | 14 | FEAT-076, CON-36 | 3 | — | — |

### 1.4 SUR-01 back office — portfolio, registry & analytics

Entirely absent from the flows by design — Phase 4 classified CAP-08 as a *view*, not a journey.
It is still six real screens, and the ops home is arguably the most-used screen in the product.

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-240 | Ops home — priority task queue | X | — | FEAT-066, 067 | 1 | — | — |
| SCR-241 | Portfolio society list & status chips | X | — | FEAT-067 | 1 | — | — |
| SCR-242 | Society → circuit drill-down (consumption vs benchmark) | X | — | FEAT-068 | 1 | — | — |
| SCR-243 | Business analytics / stats view | X | — | FEAT-069 | 2 | — | — |
| SCR-250 | Society list & record (admin) | X | — | FEAT-085 | 1 | — | — |
| SCR-251 | Circuit registry & configuration | X | — | FEAT-040 | 1 | — | — |
| SCR-252 | Service-line registry & enrollment | X | — | FEAT-039 | 2 | — | — |
| SCR-253 | Pump asset register (monitor-only) | X | — | FEAT-042 | 2 | — | — |
| SCR-254 | Cross-sell savings projection | X | — | FEAT-061 (deferred) | 3 | — | — |

### 1.5 SUR-01 society portal

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-031 | Demo report view (prospect) | F | 04 | FEAT-023 | 1 | — | — |
| SCR-041 | Document upload (KYC) | F | 05 | FEAT-025 | 1 | — | — |
| SCR-051 | Offer view & response | F | 06 | FEAT-028 | 1 | — | — |
| SCR-062 | Daily installation batch review | F | 07 | FEAT-035 | 1 | — | — |
| SCR-100 | Portal home (maximal visibility) | F | 16 | FEAT-088 | 1 | — | — |
| SCR-101 | Contract view (read-only) | F | 16 | FEAT-065 | 2 | — | — |
| SCR-121 | Extension request | F | 12 | FEAT-087 | 2 | — | — |
| SCR-123 | Raise a billing dispute | X | 12 | FEAT-102 | 2 | — | — |
| SCR-130 | Raise a ticket | F | 13 | FEAT-089 | 2 | — | — |
| SCR-134 | My tickets & resolution timeliness | F | 13 | FEAT-089 | 2 | — | — |
| SCR-260 | Invoice list & detail | X | 16 | FEAT-060 | 1 | — | — |
| SCR-261 | Savings report list & detail (customer) | X | 16 | FEAT-060 | 1 | — | — |
| SCR-262 | Society profile & contacts (self-service) | X | — | FEAT-092, 096 | 3 | — | — |

### 1.6 SUR-02 field (mobile web, offline-tolerant)

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-171 | My visits (field home) | F | X1 | FEAT-017, 096 | 1 | ✅ | — |
| SCR-010 | Survey: society profile & access | F | 02 | FEAT-005, 096 | 1 | ✅ | — |
| SCR-011 | Survey: lighting inventory by area | F | 02 | FEAT-006 | 1 | ✅ | — |
| SCR-012 | Survey: circuit selection per light type | F | 02 | FEAT-007 | 1 | ✅ | — |
| SCR-013 | Survey: pump audit & logbook capture | F | 02 | FEAT-008, 009 | 1 | ✅ | — |
| SCR-020 | Meter install & load validation | F | 03, 08 | FEAT-011, 094 | 1 | — | — |
| SCR-021 | Gate pass (incl. provisional release) | F | 03, 07 | XC-01, FEAT-097 | 1 | — | — |
| SCR-022 | Commissioning monitor (window progress) | F | 03 | FEAT-012, 014 | 1 | — | — |
| SCR-023 | Demo installation / light replacement | F | 03 | FEAT-013 | 1 | — | — |
| SCR-024 | Benchmark result & out-of-range review | F | 03 | FEAT-014, 015 | 1 | — | — |
| SCR-061 | Daily batch capture | F | 07 | FEAT-034 | 1 | — | — |
| SCR-064 | Completion certificate | F | 07 | FEAT-037 | 1 | — | — |
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
| SCR-200 | Sign in | M | FEAT-086 | 1 | — | — |
| SCR-201 | Password reset request → reset | M | FEAT-086 | 2 | — | — |
| SCR-202 | Session expiry / re-authenticate | M | — | 2 | — | — |
| SCR-203 | Account locked / disabled | M | FEAT-086 | 3 | — | — |
| SCR-210 | Society first-login welcome (prospect vs customer) | M | FEAT-098, CON-34 | 2 | — | — |
| SCR-211 | Field staff first-run & offline primer | M | XC-02 | 2 | — | — |
| SCR-220 | 404 not found | M | — | 3 | — | — |
| SCR-221 | 403 forbidden (wrong role / wrong society) | M | INV-05 | 2 | — | — |
| SCR-222 | 500 / unexpected error | M | — | 3 | — | — |
| SCR-223 | **Offline & sync-pending (SUR-02)** | M | XC-02 | 1 | — | — |
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
makes Phase 7's contracts concrete rather than aspirational. Four units run with no interface of
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
| Monthly loop | 12 | **12** | 1 partial | 0 |
| Deal loop | 12 | **12** | 0 | 0 |
| Service & ops | 6 | 0 | 0 | 0 |
| Society portal | 7 | 0 | 0 | 0 |
| Field (SUR-02) | 12 | **5** | 0 | 0 |
| Cross-cutting | 2 | 0 | 0 | 0 |
| **Total** | **51** | **29** | **1 partial** | **0** |

**Monthly loop and deal loop complete** — 24 specified against the seven-state requirement, with entry
points, actions with permissions and failure behaviour, inputs with real error copy, exits,
responsive, offline and accessibility. Verified by script: 0 table-column defects, 0 missing
required sections, 0 unresolved SCR/CMP cross-references.

**Field surface started (2026-08-13)** — `05-field.md` opens with §0, the surface's own operating
rules (offline write path and queue, conflict, `capturedAt` vs `receivedAt`, the photo pipeline,
visit-scoped navigation, the survey shell, suspension and access re-checks, device/session), written
once because twelve screens cannot each invent their own answer to "what happens when the upload
fails." Then SCR-171 (field home) and SCR-010–013, which complete **FLOW-02's field side** — the
survey now runs end to end from the visit card to SCR-014's review.

**Mockups deliberately deferred** (user's call, 2026-08-12): specs first, mockups revisited after
Phase 6 prioritization so nothing is drawn that then gets cut. The cost accepted is that specs go
unverified visually until then — the step that normally catches misunderstandings early. SCR-082's
partial mockup inside the theme reference is the only one that exists.

**Order.** Monthly loop first, then deal loop, then field, portal, ops, cross-cutting. The method
says order by flow criticality; the monthly loop is the revenue spine — it runs every month for
every society for the life of every contract, where the deal loop runs once per society — and it
is where the product's genuinely novel problem lives (per-circuit bands, extrapolation, the
17-day window). Two of its screens are already drawn as part of the theme work.

**Next screen:** SCR-020 — Meter install & load validation (start of FLOW-03's commissioning run on
the field surface).

## 4. Navigation map

*Written once the priority-1 set is specified — a map drawn before the screens is a guess.*

## 5. Screen ↔ feature matrix

*Written at the end of the priority-1 run, per the method's exit criterion that it proves no
orphans in either direction.*

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
| **Assumption** | **ASSUM-25** | **One survey, one person, one device** — the field offline model is specified single-owner, create-only, with no merge across two queues. If two field staff routinely split a large society, §0.1 has to be revisited before the remaining seven field screens are specified. **The one blocking question of this turn** | `../00-intake.md` ASSUM-25 |
| Assumption | ASSUM-26 | Field photo processing: 1,600px long edge, JPEG ~0.75, ≈250–400 KB, EXIF location stripped. Legibility of a pump-room model label at that setting is untested | `../00-intake.md` ASSUM-26 |
| Assumption | ASSUM-27 | Personal Android phones, not company devices — which is why the device cache purges 7 days after a visit closes and sign-out is refused while work is unsynced | `../00-intake.md` ASSUM-27 |
