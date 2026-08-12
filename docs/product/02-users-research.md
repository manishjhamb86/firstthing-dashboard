# Users & Research
**Product:** FirsThing Platform · **Phase:** 2 — Users & Research · **Status:** Approved
**Last updated:** 2026-08-12 (PER-08 Accountant + JTBD-09 added at the Phase 3 gate; §4 and §9 swept) · **Mode:** Ecosystem

---

## 1. Persona summary

| ID | Persona | Role in decision | Primary surface | Frequency of use | Priority |
|----|---------|-----------------|-----------------|------------------|----------|
| PER-01 | FirsThing Ops/Admin | user, primary internal operator | SUR-01 (web, admin) | daily | **primary** |
| PER-02 | FirsThing Customer Support | user | SUR-01 (web, admin, scoped permissions) | daily | secondary |
| PER-03 | Field Inspector | user | SUR-02 (mobile web) | tied to visit cadence (~monthly per society) | secondary |
| PER-04 | Installer / Commissioning | user | SUR-02 (mobile web) | per new install/onboarding event | secondary |
| PER-05 | Society Committee | buyer, blocker | SUR-01 (web, customer) | monthly (billing) + ad hoc (disputes) | secondary |
| PER-06 | Society Manager | user | SUR-01 (web, socmgr) | weekly | secondary |
| PER-07 | Sales / BD | user, primary internal operator (pipeline stages) | SUR-01 (web, admin, scoped) | per new lead/deal | secondary |
| PER-08 | Accountant | approver (blocking gate on all outbound billing) | SUR-01 (web, admin, scoped) | monthly, at billing close | secondary |

Facility/security staff at a society are a **blocker** on physical site access for install/
inspection visits but are not a product user — no persona profile, but Phase 4 flows involving a
site visit must account for site-access dependency.

## 2. Persona profiles

### PER-01 — FirsThing Ops/Admin
- **Context:** Desk-based, back office, reliable connectivity, standard business software
  environment (currently: `/admin/*`).
- **Technical level:** High — comfortable with structured business software, spreadsheets,
  reconciliation work.
- **Goals:** Get every society's monthly bill and savings report out correctly with minimum
  manual effort; catch problems (missing readings, off-band months) before they become disputes.
- **Frustrations today:** The entire monthly cycle — reading upload, extrapolation math, benchmark
  comparison, invoice generation, savings-report generation — is manual. This is **the stated main
  pain point** (Q5, this phase).
- **Success for them:** Hours spent reconciling drop to near-zero; a defensible, traceable number
  if a society ever disputes a bill is a bonus, not the primary win (Q6, this phase — explicit
  ranking: minimize-hours over unarguable-bill).
- **Abandonment triggers:** The app doesn't work, a feature doesn't match their actual process,
  or it isn't user-friendly (Q8, this phase — general software-quality bar, not a narrow
  complaint).
- **Evidence:** direct operator experience — Yugesh plus a couple of senior FirsThing staff run
  this process personally today (Q11). Not formally interviewed as a third party; counted as
  first-hand evidence, not inference.

### PER-02 — FirsThing Customer Support
- **Context:** Handles society-facing communication — calls and WhatsApp (individual and group
  chats) — daily or as needed. Confirmed (this phase) to need direct app access: dispute status,
  communication logs, ticket state.
- **Technical level:** `[ASSUMPTION: ASSUM-15]` — moderate; comfortable with phone-based tools and
  structured records, not confirmed against admin-grade software specifically.
- **Goals:** Resolve society questions/disputes quickly with the actual record in front of them,
  rather than relying on ops to relay status.
- **Frustrations today:** Not yet asked directly — support staff were described by Yugesh (their
  manager), not interviewed themselves. Flagged as a research gap (§8).
- **Success for them:** `[ASSUMPTION: ASSUM-15]` — can see a society's dispute/communication
  history without asking ops.
- **Abandonment triggers:** `[ASSUMPTION: ASSUM-15]` — not established.
- **Evidence:** inferred from Yugesh's description of the support function (Q12, this phase), not
  from the support staff directly.

### PER-03 — Field Inspector
- **Context:** On-site at a society, phone-based, variable connectivity, outdoor/mechanical-room
  conditions. Visits recur roughly monthly per society (Q10, this phase).
- **Technical level:** `[ASSUMPTION: ASSUM-12 context]` — moderate smartphone literacy assumed;
  not desktop-software-fluent, per the design bundle's own phone-app framing for this role
  (00-intake.md §6).
- **Goals:** Complete an inspection, log faults, reconcile spare-light stock, close assigned
  tickets — all from the field, without a separate desktop reporting step afterward.
- **Frustrations today:** Not yet asked directly — carried over from PROJECT_CONTEXT.md's existing
  finding that inspection is still Supabase-backed, desktop-shaped screens despite being a field
  role.
- **Success for them:** Work assigned to them (from ticketing, OQ-07) is visible and actionable
  from their own surface, matching Phase 0's cross-surface contract requirement.
- **Ongoing spare-light swaps:** also varies by society/deal today (CON-14) — sometimes the
  society's own electrician swaps a failed light (FirsThing supplies the unit and guidance),
  sometimes the inspector does it directly. FirsThing's stated future direction is to do this
  exclusively with its own trained staff. OQ-06's "inspector is system of record" holds either
  way — as hands-on swap logging when the inspector does it, or as an audit/count when the
  society's own staff does.
- **Abandonment triggers:** `[ASSUMPTION: ASSUM-16]` — not established; likely connectivity/
  usability-related given field conditions, not yet confirmed.
- **Evidence:** inferred from existing PROJECT_CONTEXT.md findings and this phase's persona
  questions; no direct inspector interview yet (research gap, §8).

### PER-04 — Installer / Commissioning
- **Context:** On-site at a society during initial hardware rollout, phone-based like the
  inspector, doing a distinct job: benchmark metering (pre/post windows), guidance, and a
  post-installation audit — always FirsThing's own role. The *physical* mounting/wiring labor
  itself varies by society/deal (CON-14, confirmed with real contract evidence — the signed Ace
  Aspire agreement has the society's own electricians do it under FirsThing's guidance; other
  deals may use FirsThing's own crew). Stated direction: FirsThing intends to move to its own
  trained staff exclusively for this labor in future, but that's not the case yet.
- **Technical level:** `[ASSUMPTION: ASSUM-17]` — assumed comparable to the inspector; not
  separately confirmed.
- **Goals:** Get a new circuit's benchmark correctly and completely recorded on the first pass —
  this number is fixed for the contract term (CON-02) except on a verified light-count change, so
  errors here are expensive to fix later.
- **Frustrations today:** Not yet asked — this role wasn't previously named as distinct until this
  phase surfaced it. Research gap (§8).
- **Success for them:** A guided, hard-to-get-wrong benchmark-entry flow (pre-install reading →
  post-install reading → computed savings % → confirm) rather than a free-form data entry screen.
- **Abandonment triggers:** `[ASSUMPTION: ASSUM-17]` — not established.
- **Evidence:** inferred from this phase's questions, and directly confirmed against a real signed
  contract (Ace Aspire agreement, 2026-08-10) for the labor-split nuance — this persona did not
  exist in any prior document before this conversation.

### PER-05 — Society Committee
- **Context:** Volunteer residents, not professional facilities staff, checking in via web/mobile
  browser — monthly around billing, and ad hoc whenever something looks wrong (Q10, this phase).
- **Technical level:** `[ASSUMPTION: ASSUM-11 context]` — non-technical, time-poor; this is a
  side responsibility for them, not a job.
- **Goals:** Confirm the monthly bill and savings figure are correct and see the contract terms
  (OQ-08 — a read-only contract view was confirmed in scope) without having to chase anyone.
- **Frustrations today:** Not yet asked directly.
- **Success for them:** A number they can trust without calling support — directly serves GOAL-01/
  02/06.
- **Abandonment triggers:** Committees are also a named **blocker** (this phase) — a bad
  experience here risks contract approval/renewal, not just individual satisfaction.
- **Evidence:** inferred from Yugesh's operating experience and this phase's answers; not
  interviewed directly (research gap, §8).

### PER-06 — Society Manager
- **Context:** Day-to-day on-site operational role at the society, checking in roughly weekly
  (Q10, this phase). Currently a placeholder screen in the app (`socmgr`, per README.md) — no
  design applied at all yet.
- **Technical level:** `[ASSUMPTION: ASSUM-11 context]` — assumed more operationally engaged than
  the committee, per ASSUM-11's split (committee = billing/contracts/approvals, manager =
  day-to-day ops/tickets/inventory).
- **Goals:** Handle tickets and day-to-day issues without needing the committee involved for
  routine operational matters.
- **Frustrations today:** Not yet asked directly — this screen doesn't exist yet to have generated
  feedback.
- **Success for them:** `[ASSUMPTION: ASSUM-18]` — a working ticket/operations view, not yet
  confirmed against a real manager's actual day.
- **Abandonment triggers:** `[ASSUMPTION: ASSUM-18]` — not established.
- **Evidence:** inferred from ASSUM-11's role split; no direct manager interview yet (research
  gap, §8).

### PER-07 — Sales / BD
- **Context:** Runs the first meeting, product pitch, and demo proposal for a new society (CAP-15).
  Currently one person (Yugesh's business partner) covering this alone; a dedicated sales team is
  a stated future direction, not built yet.
- **Technical level:** `[ASSUMPTION: ASSUM-20]` — not separately confirmed; presumed comparable to
  PER-01 given the close working relationship implied by "my partner."
- **Goals:** Log leads/meetings/proposals themselves, ideally — ownership and accuracy of the
  pipeline record matters to them.
- **Frustrations today:** Not yet asked directly.
- **Success for them:** Confirmed this phase (2026-08-10): ideally self-logs entries directly;
  today, backend/ops can log on their behalf, but PER-07 reviews and approves anything backend
  entered — i.e. backend-entered records are a draft state, not authoritative until PER-07
  confirms them.
- **Abandonment triggers:** `[ASSUMPTION: ASSUM-20]` — not established.
- **Evidence:** direct answer from Yugesh, 2026-08-10 — first-hand (Yugesh knows this role's
  current setup directly, unlike PER-02/03/04/06 which were secondhand).

### PER-08 — Accountant
- **Context:** Added 2026-08-12 (Phase 3 gate, Yugesh's explicit call — a distinct role with its
  own login, not a permission bolted onto an admin account). Reviews and approves every invoice
  and savings report before it reaches a society (CON-33). Works in monthly bursts at billing
  close rather than continuously.
- **Technical level:** `[ASSUMPTION: ASSUM-21]` — not established; presumed comfortable with
  accounting software (they already work in Zoho) but not with operational/field tooling.
- **Goals:** Confirm that each month's computed amount, the Zoho invoice, and the savings report
  agree with each other before anything is sent — and that anything unusual (an adjusted
  `pricingBasis`, a low-coverage month, an amount mismatch) is visible rather than buried.
- **Frustrations today:** Not yet asked — this role wasn't named as distinct until this phase's
  gate review. Research gap (§8, RG-08).
- **Success for them:** Releasing a clean month should take seconds, not minutes — at 200
  societies the release gate becomes its own month-end bottleneck if it's one-at-a-time
  (FEAT-054's stated risk). Only flagged months should need real attention.
- **Abandonment triggers:** `[ASSUMPTION: ASSUM-21]` — not established.
- **Evidence:** direct decision from Yugesh at the Phase 3 gate, 2026-08-12; the *existence* of an
  accountant review step is evidenced by CON-33, but this persona's own working preferences have
  not been researched.

---

## 3. Jobs to be done

| ID | Job (When… I want to… so I can…) | Persona | Current solution | Pain severity | Frequency | Evidence |
|----|----------------------------------|---------|-----------------|---------------|-----------|----------|
| JTBD-01 | When the month closes, I want the bill and savings report generated from metered data automatically, so I can stop manually reconciling readings, benchmarks, and invoices by hand | PER-01 | Fully manual: upload readings, hand-calculate extrapolation/benchmark/savings, hand-build invoice + savings report | high | monthly, per society | evidence (direct operator experience) |
| JTBD-02 | When a metered circuit's monthly figure lands outside its contracted tolerance band (CON-01a), I want to review and record whether it's fixable, so the billing adjustment is correct and auditable | PER-01 | Manual review, undocumented decision | high | as needed, per off-band society | evidence |
| JTBD-03 | When a society calls or messages with a question or dispute, I want to see their record (bill, dispute history, communication log) directly, so I don't have to relay through ops | PER-02 | Currently relies on ops/Yugesh directly (per Q12) | med | daily | inferred |
| JTBD-04 | When I arrive for a scheduled visit, I want to see what's assigned to me (inspection, tickets, spare-swap needs) and log the outcome from my phone, so I don't need a separate desktop reporting step | PER-03 | Desktop-shaped Supabase screens, not field-optimized (per PROJECT_CONTEXT.md) | med-high | ~monthly per society | inferred |
| JTBD-05 | When I install a new circuit, I want a guided flow to record the pre/post metering windows and get the computed benchmark savings %, so the number that governs billing for the whole contract term is captured correctly the first time | PER-04 | Not established — this role/flow doesn't exist in any form yet | high (cost of error is a whole contract term) | per new install | inferred |
| JTBD-06 | When my monthly bill arrives, I want to see it matches a benchmark I can see and trust, so I don't have to just take FirsThing's word for it | PER-05 | Fully manual/relationship-based today | med | monthly + ad hoc | inferred |
| JTBD-07 | When something needs fixing day-to-day (a fault, a supply issue), I want to log it and track it to resolution, so I don't have to escalate every small thing to the committee | PER-06 | Not established — `socmgr` is an unbuilt placeholder | med | weekly | inferred |
| JTBD-08 | When I meet a prospective society, I want to log the meeting/proposal and track it through to a demo request, so the pipeline is visible without me having to report status separately | PER-07 | Entirely informal today — this role and its record-keeping don't exist in the app in any form | med | per new lead | evidence |
| JTBD-09 | When the month's billing is calculated, I want to review every society's figures in one queue and release them in a batch, so nothing reaches a society before I've checked it and month-end doesn't become a one-at-a-time bottleneck | PER-08 | Manual review outside the app; the calculation itself is a spreadsheet, so the "review" is really a re-derivation | med-high | monthly, at billing close | evidence (CON-33 establishes the gate exists); working style inferred — ASSUM-21, RG-08 |

---

## 4. Current-state workflow

Primary persona (PER-01), the monthly billing cycle — the stated main pain point (Q5):

| Step | What they do | Tool | Time | Pain | Opportunity |
|------|-------------|------|------|------|-------------|
| 1. Collect readings | Gather each society's metered-circuit readings for the month | CSV exported from the meter vendor's own app, one file per circuit, hourly rows aggregated to daily (CON-30). **Not** an API fetch — live telemetry is an explicitly deferred future phase (ASSUM-13, NG-07) | Unclear, likely hours across 22 societies | Readings arrive un-validated; missing days aren't flagged until calculation | INV-09 (upload-time anomaly detection) |
| 2. Upload | Enter/upload the month's readings into the system for each society | Manual CSV upload (current); system today has no purpose-built pipeline for this | Per-society manual effort | No structured validation | Phase 3 CSV upload + validation capability |
| 3. Compare to benchmark | Compare monthly accumulated readings to the circuit's benchmark | Manual calculation | Significant — this is the core reconciliation work | Error-prone; extrapolation math (CON-11) done by hand | Phase 3 automated calculation engine |
| 4. Extrapolate | Scale each metered circuit's reading across the lights of its own type, then sum (CON-11 as corrected 2026-08-12 — one metered circuit per light type, not one per society) | Manual (spreadsheet formula, per the CON-11 example) | Part of step 3 | Same as above, multiplied by the number of typed circuits per society | Same engine |
| 5. Compute savings ₹ | Apply benchmark savings %, unit rate, and revenue-share % to get FirsThing's fee | Manual | Part of step 3 | Same as above | Same engine |
| 6. Decide off-band cases | For any circuit outside its contracted band (CON-01a), determine fixable vs. not-fixable (JTBD-02) | Manual, undocumented | Ad hoc | No audit trail (INV-03 gap) | Phase 3 review/decision capability |
| 7. Generate invoice | Produce the monthly invoice | Manual (existing `/admin/invoices` form exists but isn't tied to the calculation above) | Per society | Disconnected from the actual calculation | Phase 3 ties invoice generation to the calculation engine |
| 8. Generate savings report | Produce the savings report: this month, cumulative to date, future projection, optional cross-sell projection for un-adopted service lines | Manual | Per society | Same disconnect; no cross-sell projection exists today at all | New Phase 3 capability (GOAL-08-adjacent) |
| 9. Handle disputes | If a society disputes, resolve manually via calls/WhatsApp (PER-02) | Phone/WhatsApp, outside the app entirely | Ad hoc | No system record of dispute or resolution | Phase 3: dispute/communication record, visible to PER-01 and PER-02 |

---

## 5. Environment & operating conditions

- **PER-01/02 (ops/support):** office environment, reliable connectivity, desktop-first.
- **PER-03/04 (inspector/installer):** field conditions — on-site at societies, phone-based,
  variable connectivity (not yet characterized as offline-tolerant or not — research gap, §8),
  possible outdoor/mechanical-room/bright-light conditions typical of rooftop and pump-room work.
- **PER-05/06 (committee/manager):** ordinary residential/home-office conditions, browser or
  mobile, non-technical audience.
- **Regulatory/organizational:** no regulatory regime beyond ordinary GST invoicing (00-intake.md
  ASSUM-10); organizationally, committee approval gates contract-level decisions (billing
  disputes, revenue-share/benchmark changes) which are currently fully manual (this phase, Q7).
- **Access control as an operating condition:** a non-paying society can be fully suspended
  including servicing (CON-13) — an operating condition Phase 3/4 flows must account for (e.g.
  what an inspector sees if arriving at a suspended society).

## 6. Competitive & landscape scan

| Alternative | Who uses it | Strengths | Weaknesses | What we learn |
|-------------|------------|-----------|-----------|---------------|
| Do nothing | Most societies today | No cost, no commitment | No visibility, no efficiency gain, no path forward without capex | Confirms JTBD-06's premise: societies have no current tool to compare against, so trust is built entirely on FirsThing's own numbers being legible |
| Traditional ESCO (performance contracting) | Commercial/industrial energy clients, occasionally societies for a one-time retrofit | Established model, guaranteed-savings framing | One-time audit, no continuous re-verification | Reinforces that continuous per-circuit verification (the technical wedge, Phase 1 §5) is genuinely differentiated, not assumed |
| Common-area solar vendor | Societies installing rooftop solar | Direct bill reduction, well-understood ROI story | Generation-only; doesn't touch lighting/pump efficiency or offer a shared-savings billing mechanism | Confirms solar (SVC-03) is correctly modeled as a separate, separately-billed service line (OQ-05), not folded into the savings-share number |

## 7. Evidence log

| Source | Type | Date | What it tells us | Confidence |
|--------|------|------|-----------------|------------|
| Yugesh, direct operator experience | first-hand operational experience | 2026-08-10 | The entire billing cycle (§4), the benchmark/extrapolation mechanism (CON-10/11), persona roles and frequencies | high |
| PROJECT_CONTEXT.md | prior engineering decision log | ongoing through 2026-08-06 | Existing app state, what's built vs. placeholder per role (`socmgr` placeholder, inspection still Supabase-backed) | high |
| Support staff (calls/WhatsApp) | secondhand, via Yugesh | 2026-08-10 | Support staff exist and handle disputes daily/as-needed, but not interviewed directly | medium |
| Sample invoice (FT/2026-27/055, Aditya Mega City) | real document | 2026-08-10 | Invoice document format/fields (GST treatment, bill-to/ship-to, invoice-for-month, bank details); confirms billing moved to a standardized 30-day cycle from May 2026 | high |
| Sample signed agreement + Annexure A (Ace Aspire, 18 Mar 2026) | real document, notarized | 2026-08-10 | The actual commercial structure: fixed monthly fee model (CON-01), per-contract tolerance band (CON-01a), guarantee exclusion list (CON-01b), ownership transfer at term-end, AMC option, contracted spare count, motion-sensor fixture behavior, install labor terms (CON-14/15) | high — this is a real, currently-in-force contract, not a mockup |
| Sample benchmark demonstration report + "Live Metering Report" (Ace Aspire) | real document | 2026-08-10 | Validates the extrapolation formula (CON-11) against real numbers; shows an existing (manually-prepared) per-circuit monitoring report format with AI-generated insight narrative — useful reference for Phase 5, explicitly *not* the final target format (per this phase's resolution) | high for the numbers/mechanism; medium for the exact screen format (user flagged it as one example, not final) |

## 8. Research gaps

| ID | Gap | Affects | Cheapest way to validate | Priority |
|----|-----|---------|-------------------------|----------|
| RG-01 | ~~Sample invoice and savings report not yet supplied~~ **RESOLVED 2026-08-10** — real invoice, signed agreement, and benchmark/metering report supplied and reviewed | Phase 5 screen specs for Invoice, Savings Report, and Contract views | Closed — see Evidence Log | resolved |
| RG-07 | ~~Exact billing treatment for excluded-cause and FirsThing-attributable deviations~~ **RESOLVED 2026-08-10** — see OQ-09/OQ-10 in `00-intake.md` | Phase 3 billing-decision capability | Closed | resolved |
| RG-02 | Field inspector and installer not directly interviewed — all inferred | PER-03/04 profiles, JTBD-04/05, Phase 5 mobile-web screens for both roles | A short structured conversation with one active inspector, even informal | med |
| RG-03 | Customer support staff not directly interviewed | PER-02 profile, JTBD-03, Phase 5 support-facing screens | A short conversation with one support staff member about their actual daily friction points | med |
| RG-04 | Society committee and manager not directly interviewed — all inferred from the business owner's view of them | PER-05/06 profiles, JTBD-06/07 | A call with one or two current society committee members/managers | med — lower urgency since ASSUM-11's role split is a reasonably confident structural guess |
| RG-05 | Connectivity/offline conditions for field roles (PER-03/04) not characterized | Phase 5 offline/error states for the mobile-web surface (INV-06 requires them) | Ask directly, or observe one field visit | med |
| RG-06 | ~~Non-payment suspension trigger threshold and approval-gating undecided~~ **RESOLVED 2026-08-10** — see CON-13 in `00-intake.md` | Phase 3 capability spec for account suspension | Closed | resolved |
| RG-08 | Accountant (PER-08) not interviewed — the role's existence is evidenced (CON-33) but its working preferences, volume tolerance, and what it needs to see per month are all inferred | PER-08 profile, FEAT-054's release-gate UI, Phase 5 screens for the billing release queue | A short conversation with whoever performs this today, before Phase 5 specs the release screen | med — matters most at 200-society scale, where a slow gate becomes the month-end bottleneck |

---

## 9. Assumptions raised in this phase

All assumptions raised in this document are now in the central register in `00-intake.md` §9 —
the register's own rule is that every inline `[ASSUMPTION: ...]` marker resolves to a row there,
and as of the 2026-08-12 sweep every one of them does.

| Assumption | Raised for | Register status |
|---|---|---|
| ASSUM-14 | Non-payment suspension trigger and approval mechanics | **validated** — resolved directly into CON-13 (2026-08-10), including the 2026-08-12 suspension-semantics addition |
| ASSUM-15 | PER-02 (support) technical level, success criteria, abandonment triggers | open — RG-03 |
| ASSUM-16 | PER-03 (inspector) abandonment triggers | open — RG-02 |
| ASSUM-17 | PER-04 (installer) technical level and abandonment triggers | open — RG-02 |
| ASSUM-18 | PER-06 (society manager) success criteria and abandonment triggers | open — RG-04 |
| ASSUM-20 | PER-07 (sales/BD) technical level and abandonment triggers | open — RG-07 |
| ASSUM-21 | PER-08 (accountant) as a distinct role with its own login; working preferences inferred | open — RG-08 |

None of these block Phase 3 — it works from the confirmed constraints, not from persona-detail
gaps. They matter at Phase 5, where each one shapes a real screen. ASSUM-19 and ASSUM-22 were
raised in Phase 3 rather than here and are recorded in the central register only.

---
