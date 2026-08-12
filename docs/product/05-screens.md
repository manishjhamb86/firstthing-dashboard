# Screens: Spec & Design
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft — inventory proposed, awaiting confirmation
**Last updated:** 2026-08-12 · **Mode:** Ecosystem

> **Numbering:** this is *this blueprint's* Phase 5. It follows the skill's
> `references/phase-07-screens.md` (screens) and `references/phase-06-branding.md` (theme), which
> are offset from the phase map's numbering. SKILL.md's phase map is canonical for phase
> *numbers*; its Reference column points at filenames that don't match the reference directory.
> See `00-intake.md` §11.

---

## 0. Gate: the theme is not yet approved

The method is explicit that the visual system must be signed off **before the first screen** —
designing on an unapproved system means reworking every screen when it changes. `00-intake.md` §11
already committed to exploring fresh visual directions (the existing 5-theme token system among
them) before settling one, and accepted that this may invalidate parts of the existing reskin.

**That exploration has not happened yet.** No screen below can move past specification until it
does. Specification (step 2 of the per-screen loop) does not depend on the theme and can proceed;
research, mockup, verification, and blueprint all do.

---

## 1. Screen inventory

Two sources, per the method: every screen the Phase 4 flows touch, **plus** the screens flows
never reach but products always need — the second list is where most missing screens are found,
and it accounts for 49 of the 109 below.

**Coverage ledger: 0 of 109 specified · 0 mockups approved · 0 blueprinted** (plus 4 headless units, §1.9).

Legend — **Src:** `F` derived from a Phase 4 flow · `M` method's standard-screens checklist ·
`X` feature with no flow and no flow-assigned screen (found while building this inventory).
**Pri:** 1 = primary flow (deal + monthly loops), 2 = secondary, 3 = supporting.

### 1.1 SUR-01 back office — sales & deal loop

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-001 | Lead form | F | 01 | FEAT-001 | 1 | — | — |
| SCR-002 | Proposal editor | F | 01 | FEAT-002 | 1 | — | — |
| SCR-003 | Pipeline board (incl. lead-health signal) | F | 01, 06 | FEAT-004, 031, 095 | 1 | — | — |
| SCR-004 | Backend-entered lead approval queue | X | 01 | FEAT-003 | 2 | — | — |
| SCR-005 | Closed / lost deals view | X | 01 | FEAT-095 | 2 | — | — |
| SCR-014 | Survey review & circuit confirmation | F | 02 | FEAT-010 | 1 | — | — |
| SCR-025 | Deal commissioning status (per-circuit fan-out) | F | 03 | FEAT-011–014 | 1 | — | — |
| SCR-030 | Demo report editor | F | 04 | FEAT-020, 021, 022 | 1 | — | — |
| SCR-040 | KYC checklist & verification | F | 05 | FEAT-024, 026 | 1 | — | — |
| SCR-050 | Offer builder (per-circuit benchmark table) | F | 06 | FEAT-027, 028 | 1 | — | — |
| SCR-052 | Agreement tracker & physical handoff log | F | 06 | FEAT-029, 030 | 1 | — | — |
| SCR-053 | Contract record | F | 06 | FEAT-062 | 1 | — | — |
| SCR-060 | Installation plan | F | 07 | FEAT-033 | 1 | — | — |
| SCR-063 | Installation blockers & scope changes | F | 07 | FEAT-036 | 1 | — | — |
| SCR-070 | Demo-skip exception approval | F | 08 | FEAT-032 | 3 | — | — |

### 1.2 SUR-01 back office — monthly loop

| SCR | Screen | Src | Flow | Features | Pri | Spec | Design |
|---|---|---|---|---|---|---|---|
| SCR-080 | Reading upload (single + batch) | F | 09 | FEAT-043, 044, 099 | 1 | — | — |
| SCR-081 | Anomaly & coverage review | F | 09 | FEAT-045, 046 | 1 | — | — |
| SCR-082 | Month-close readiness board | F | 09 | FEAT-047, 100 | 1 | — | — |
| SCR-083 | Quarantined / unmatched files | X | 09 | FEAT-099 | 2 | — | — |
| SCR-090 | Per-circuit compliance view | F | 10 | FEAT-049 | 1 | — | — |
| SCR-091 | Savings report (ops view / editor) | F | 10 | FEAT-059 | 1 | — | — |
| SCR-092 | Accountant release queue | F | 10 | FEAT-054 | 1 | — | — |
| SCR-093 | Invoice upload & reconciliation | F | 10 | FEAT-053, 101 | 1 | — | — |
| SCR-110 | Deviation chart & initial findings | F | 11 | FEAT-055 | 1 | — | — |
| SCR-112 | Root-cause & decision record | F | 11 | FEAT-057, 050 | 1 | — | — |
| SCR-113 | Management escalation & benchmark adjustment | F | 11 | FEAT-058 | 1 | — | — |
| SCR-120 | Arrears board (with dispute flags) | F | 12 | FEAT-087, 102 | 1 | — | — |
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
| SCR-171 | My visits (field home) | F | X1 | FEAT-017 | 1 | — | — |
| SCR-010 | Survey: society profile | F | 02 | FEAT-005 | 1 | — | — |
| SCR-011 | Survey: lighting inventory by area | F | 02 | FEAT-006 | 1 | — | — |
| SCR-012 | Survey: circuit selection per light type | F | 02 | FEAT-007 | 1 | — | — |
| SCR-013 | Survey: pump audit & logbook capture | F | 02 | FEAT-008, 009 | 1 | — | — |
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

## 3. Screen specifications

*Not started — gated on inventory confirmation, and mockups additionally gated on §0's theme
approval.*

## 4. Theme & design system

*Not started — see §0. `00-intake.md` §11 commits to exploring fresh visual directions, the
existing 5-theme token system among them, before one is settled.*

## 5. Annotated blueprints

*Not started.*
