# SUR-01 back office — sales & deal loop
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft — 12 priority-1 specified
**Last updated:** 2026-08-12

Flows 01–08, run once per society per service line. Where the monthly loop is judged on throughput,
this loop is judged on **not letting a bad deal through** — every mistake here is inherited by the
contract and paid for monthly for its whole term.

Global rules: [`00-global-patterns.md`](00-global-patterns.md). Visual system:
[`../05a-theme-system.md`](../05a-theme-system.md).

**Screens (12, all priority 1):** SCR-001, 002, 003, 014, 025, 030, 040, 050, 052, 053, 060, 063.

---

## SCR-001 — Lead form

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-07, PER-01
**Features:** FEAT-001 · **Flows:** FLOW-01 (steps 1–3)

**Purpose:** create a pipeline record for a society and a service line, with the two checks that
stop a deal that should never start.
**Primary action:** log the lead.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-003 pipeline board | "New lead" | Service line pre-set if filtered |
| SCR-250 society record | "Add service line" on an existing society | Society pre-filled and locked |
| Sidebar → New lead | direct | — |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Body | Society name | CMP-05 with quick-create | title case | Existing society → the record links rather than duplicating |
| Body | Location, flat count, contact | input | | Flat count drives the NG-06 check |
| Body | Service line | select | | Pipeline is keyed `(societyId, serviceLine)` — CON-24 |
| Body | Owner | user select | | Defaults to the signed-in user; PER-01 logging for PER-07 sets `pending-approval` |
| Body | Duplicate warning | live check | `warn` banner | Fires as soon as society + service line resolve |
| Body | Size warning | live check | `bad` banner | Fires as soon as flat count is entered |

### The two gates

**Duplicate pipeline (CON-24).** A society with an open pipeline for the same service line must not
get a second one. The form detects it live and shows the existing deal — its stage, owner and age —
with "Open that deal" as the primary action. Creating anyway is possible only for a **closed-lost**
prior pipeline, which is a re-engagement (FEAT-095), and is labelled as such.

**Minimum size (NG-06).** Below 1,000 flats the unit economics do not work. The lead can be saved
but **cannot advance past `lead`** without a recorded management override carrying a reason and a
named approver. The block is on advancement, not on capture — losing the record of a small society
that might merge or expand later would be worse than holding it.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Save lead | button | sales, ops | Creates `Pipeline` at `lead` | none | → SCR-003, new row highlighted | Duplicate → blocked with the existing deal shown |
| Save on behalf | button, when owner ≠ self | ops | Creates in `pending-approval`; notifies the owner (FLOW-X2) | modal naming who must confirm | Row shown as unconfirmed | Owner never confirms → surfaces on the follow-up counter |
| Request size override | on the NG-06 block | sales | Raises an override request | reason required | Management notified | — |
| Open existing deal | on the duplicate warning | sales, ops | → SCR-003 filtered, or the deal | — | — | — |

### Inputs & validation

| Field | Type | Required | Default | Constraints | Error message | Editable later |
|---|---|---|---|---|---|---|
| Society | CMP-05 | yes | — | new or existing | "Pick a society or add a new one." | no — a lead belongs to one society |
| Flat count | number | yes | — | ≥ 1; integer | "How many flats? This decides whether the deal is viable." | yes, until contract |
| Service line | select | yes | lighting | must not duplicate an open pipeline | "Settlement Nexus already has an open lighting deal at Offer stage." | no |
| Contact name / phone / email | text | at least one channel | — | valid email or 10-digit phone | "Add a phone or an email — the proposal has to reach someone." | yes |
| Owner | select | yes | signed-in user | active sales or ops user | — | yes |

**Validation:** on blur for format, live for the two gates, on submit for the rest.
**Half-completed:** draft held locally; a refresh restores it.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton form | — |
| Empty — first use | always empty | The form, with the two gates dormant | Fill |
| Empty — filtered | n/a | — | — |
| Partial / stale | society list stale | Silent refresh on focus | — |
| Error — network | save fails | Inline; the form keeps everything | Retry |
| Error — permission | read-only role | SCR-221 | — |
| Success | saved | → SCR-003 with the row highlighted and a toast | — |

**Exits:** SCR-003, SCR-002, SCR-250.
**Live update:** none. **Responsive:** single column, works to 360px. **Offline:** blocked.
**Copy:** size block — "1,000 flats is the minimum for the economics to work. This one has 640. You
can save the lead, but it needs a management override to go further."

---

## SCR-002 — Proposal editor

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-07
**Features:** FEAT-002 · **Flows:** FLOW-01 (steps 4–5)

**Purpose:** draft and share the pre-demo proposal — the first thing a committee reads.
**Primary action:** share the proposal with the society.

**The honest framing problem.** FLOW-01 step 4 names it: at this point no live demo exists, so any
savings figure is **a claim, not evidence**. The screen must let sales be persuasive without letting
them fabricate. It does that by making comparables the *only* source of an indicative figure.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-001 | after saving a lead | Pipeline |
| SCR-003 | row action "Draft proposal" | Pipeline |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, service line, stage | | CMP-02 | |
| Body | Indicative savings range | **picked from comparables**, not typed | `62–70%` | See below |
| Body | Comparable societies | live query on similar flat count and city | CMP-01 compact | Anonymised unless the society consented to be named as a reference |
| Body | Narrative sections | rich text | | The persuasive part, freely editable |
| Body | Commercial outline | revenue share, zero upfront cost, term | | Indicative; the binding version is SCR-050 |
| Body | Attachments | CMP-07 | | |
| Footer | Share panel | recipients from the contact directory (FEAT-092) | | |

**Indicative savings cannot be free text.** It is selected from the range that real commissioned
societies of similar size have actually achieved, and the proposal states that basis in a line the
committee sees: *"Based on measured results at four comparable societies."* If no comparables exist
— which is true early — the field offers only the contracted 60–80% range (CON-20) and says so.
This keeps a claim traceable to something rather than to optimism.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Save draft | auto + button | sales | Versions the proposal | none | Autosaved indicator | — |
| Share | button | sales | Records the share event; dispatches by email (CON-39) | modal listing recipients | Stage → `proposal-shared`; logged on SCR-180 | Contact bounces → flagged; society is unreachable (FEAT-092 AC-2/3) |
| Download PDF | button | sales | For WhatsApp or in-person, which stay manual at launch | none | Download | — |
| Mark accepted | button | sales | Stage → `demo-requested`; hands to FLOW-02 | modal | → SCR-003 | — |
| Mark declined | button | sales | → `closed-lost` with a reason (FEAT-095) | reason required | → SCR-005 | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | new proposal | Template with the sections outlined and comparables loaded | Fill |
| Empty — no comparables | early portfolio | "No comparable societies yet. The proposal will quote the contracted 60–80% range instead." | Continue |
| Partial / stale | shared, then edited | `warn`: "Shared on 4 Aug. Edits since then have not been sent." | Re-share |
| Error — network | save fails | Inline; draft kept locally | Retry |
| Error — permission | not the owner | Read-only with a note naming the owner | Request access |
| Success | shared | Toast + timeline entry | — |

**Exits:** SCR-003, SCR-180, SCR-237.
**Live update:** none. **Responsive:** desk-first; editor stacks below 900px. **Offline:** blocked.

---

## SCR-003 — Pipeline board

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-07, PER-01
**Features:** FEAT-004, FEAT-031, FEAT-095 · **Flows:** FLOW-01 (steps 6–7), FLOW-06

**Purpose:** see every open deal, what stage it is at, and which ones are quietly dying.
**Primary action:** advance a deal, or log a follow-up.

**FEAT-031 was cited by no screen until a coverage check caught it.** Lead health is the reason this
board is more than a list.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-240 ops home | "Stalled deals" card | Filtered to degraded health |
| Sidebar → Pipeline | direct | Default: open deals, all stages |
| SCR-001 | after save | New row highlighted |
| Email digest | weekly pipeline summary | — |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Open deals, weighted value, count needing attention | CMP-03 | | |
| View switch | Board (by stage) / Table | | | Board for scanning, table for sorting — same data |
| Filters | Stage, owner, service line, health, age | CMP-04 | | |
| Card / row | Society, stage, owner, days in stage, follow-ups, health | | | |
| Health | Derived from follow-up count and days in stage (CON-23) | CMP-02 | | See below |
| Row accent | By health | 3px left border | | Same device as SCR-082 |

**Lead health (FEAT-031, CON-23).** Health is computed, not set: `healthy` while a deal is moving,
`slowing` at 3+ follow-ups in one stage with no advancement, `stalled` at 5+ or past twice the
median time for that stage. **The follow-up counter is the input**, which means it only works if
follow-ups get logged — so logging one is a single click from the card, not a form.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Log follow-up | card button | owner, ops | Increments the counter; optional note | none | Card updates; health recomputes | — |
| Advance stage | drag or menu | owner, ops | Moves stage; runs that stage's gate | modal where a gate applies | Card moves | Gate unmet → blocked, naming what is missing (e.g. "KYC has 2 outstanding items") |
| Reassign | card menu | ops | Changes owner | none | New owner notified | — |
| Close as lost | card menu | owner, ops | → `closed-lost` with a required reason (FEAT-095) | reason required | Moves to SCR-005 | — |
| Re-engage | on a closed-lost deal | sales | Creates a new pipeline linked to the old one | modal | New deal at `lead` | — |
| Approve on-behalf lead | on a `pending-approval` card | the named owner | Confirms ownership | none | Card becomes normal | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton board | — |
| Empty — first use | no deals ever | "No deals yet. Log your first lead to start the pipeline." | New lead |
| Empty — filtered | filter excludes all | Names the filter, offers clear | Clear |
| Partial / stale | n/a — single source | — | — |
| Error — network | load fails | Inline retry, keeps last data | Retry |
| Error — permission | society-scoped user | SCR-221 | — |
| Success | stage advanced | Card moves; toast | — |

**Exits:** SCR-001, SCR-002, SCR-005, SCR-014, SCR-030, SCR-040, SCR-050, SCR-250.
**Live update:** none. **Responsive:** board → table below 900px. **Offline:** blocked.
**Copy:** stalled — "5 follow-ups, 41 days at Proposal. Nothing has moved since 2 Jul."

---

## SCR-014 — Survey review & circuit confirmation

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-010 · **Flows:** FLOW-02 (steps 7–8)

**Purpose:** check the field survey before it becomes the foundation everything else is built on,
and confirm the circuit chosen for each light type.
**Primary action:** confirm the survey and lock the circuit set.

**This is the highest-leverage review in the product.** FLOW-02 step 4 says it plainly: a lighting
miscount *"propagates into `representedLightCount` and biases billing for the term — no downstream
check catches it."* Nothing later in the system will catch an error confirmed here.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-003 | deal at `survey-submitted` | Pipeline + survey |
| SCR-240 | "Surveys awaiting review" card | The survey |
| Email | field submission notification | Deep link |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, **surveyors**, date, completeness | | CMP-02 | Partial saves are flagged, not hidden. A team survey names everyone who captured, not one surveyor (CON-44) |
| Banner | **Contested and uncovered areas** | §0.1b reconciliation | `warn` | Present only on a team survey. Contested areas were resolved in the field before submission; this states *how* each was resolved and by whom, because that judgement is now part of the count this screen is signing off |
| Section | Society profile | CON-28a: coordinates, committee with posts, RWA members, next election | | Election date matters — a committee changing mid-negotiation is a real risk |
| Section | Lighting inventory by area | CON-28b per-area counts | CMP-01 | **The number that decides billing for the term** |
| Section | Per-area capture provenance | who counted each area, and when | inline on each row | On a team survey. An area counted by one person and an area reconciled from two disagreeing counts are not equally trustworthy, and the reviewer should be able to tell them apart |
| Section | Circuit selection, one per light type | CMP-09 | | With CON-16 eligibility per circuit |
| Section | Pump audit | CON-28c per-unit assets with photos | CMP-15 | |
| Section | Photos | CMP-15 | | Every count should have one |
| Footer | CMP-12 approval bar | | | |

### CON-16 eligibility, shown per circuit

Each selected circuit is checked and the result displayed rather than assumed: ≥50 lights, no shared
appliances, WiFi/LAN within 20–40m, fixtures ≤15ft, not on a driveway or ramp. A failing criterion
is named, not summarised.

Two outcomes the screen must handle explicitly, because FLOW-02 step 5 says neither may be silent:
a light type with **no eligible circuit** is either excluded from the deal or granted an explicit
`<50-light` admin exception, and both are recorded with a reason.

**The typicality question (CON-16, added at the audit)** — *is this circuit typical of the lights it
will represent?* — cannot be validated by the system. It is a required checkbox with a note field
per circuit, because forcing the reviewer to answer it in writing is the only available control.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Confirm survey | CMP-12 | ops | Locks the circuit set; releases FLOW-03 | modal restating the light counts, since they set billing for the term | Deal → `commissioning`; → SCR-025 | Any circuit unresolved → blocked, naming it |
| Query a count | per row | ops | Sends back to the surveyor with a note | note required | Survey → `queried`; field notified | — |
| Request re-visit | button | ops | Creates a visit (FLOW-X1) | modal | → SCR-170 | — |
| Exclude a light type | per type | ops lead | Records the exclusion and its reason | reason required | Type excluded from the deal | — |
| Grant <50-light exception | per circuit | ops lead | Records the exception | reason required | Circuit eligible | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | not reachable without a survey | — | — |
| Empty — partial survey | field saved incomplete | Sections present, gaps named per section ("Committee list not captured") | Query / re-visit |
| Partial / stale | field still syncing | `info`: "The surveyor has unsynced changes." | Wait |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | confirmed | Circuit set locked; → SCR-025 | — |

**Exits:** SCR-025, SCR-170, SCR-003, SCR-251.
**Live update:** polls every 60s while the surveyor has unsynced work.
**Responsive:** desk-first; photo grid reflows. **Offline:** blocked.
**Copy:** confirm modal — "Locking 1,200 lights across 4 types. These counts set the billing basis
for the whole term and are not routinely revisited."

---

## SCR-025 — Deal commissioning status (per-circuit fan-out)

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-011, 012, 013, 014 · **Flows:** FLOW-03 (all steps)

**Purpose:** track every circuit's independent progress toward a measured benchmark, and show which
one is holding the deal up.
**Primary action:** unblock whichever circuit is stalled.

**The fan-out is the screen.** Since CON-11's correction, FLOW-03 runs independently per circuit,
each with its own 5-day baseline and its own anomaly-restart clock (CON-19). Circuits finish at
different times. **The deal cannot price until all of them have a benchmark, but one stalling must
not read as the whole deal stalling** — the screen has to show both facts at once.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-014 | survey confirmed | Deal |
| SCR-003 | deal at `commissioning` | Deal |
| SCR-240 | "Commissioning restarted" card | The affected circuit |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, circuits, deal-level progress | | `3 of 4 benchmarked` | Deal-level readiness stated once |
| Header | Blocking circuit | computed | CMP-02 | Names the one holding pricing, if any |
| Per circuit | Stage tracker | meter → load check → gate pass → 5-day baseline → swap → 5-day post → benchmark | horizontal steps | One row per circuit |
| Per circuit | Baseline day count | | `Day 3 of 5` | **With restart history** — see below |
| Per circuit | Load validation | theoretical vs measured, ±10% (CON-17) | | Pass/fail with both figures |
| Per circuit | Benchmark result | measured % | CMP-02 | Out of CON-20's 60–80% → flagged, never averaged away |
| Per circuit | Gate passes | XC-01 | CMP-10 | Both the install and the swap pass |

**The restart clock must show its history.** CON-19 restarts the 5-day count from the midnight after
a fix, and a circuit that has restarted three times is a different situation from one on day 3 of
its first attempt. The tracker shows `Day 3 of 5 · restarted twice` with the dates and reasons on
hover, because that pattern is the signal that the circuit itself is the problem.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Override load check | on a ±10% failure | ops | Records a PER-01 override (CON-17) | reason required, names the approver | Circuit proceeds | — |
| Investigate anomaly | per circuit | ops | Opens the anomaly; assigning a visit uses FLOW-X1 | none | → SCR-170 | — |
| Exclude circuit | per circuit | ops lead | Drops the light type from the deal | modal restating the effect on the projection | Deal re-scoped | — |
| Approve out-of-range benchmark | on a <60% or >80% result | ops lead | Accepts it into the deal explicitly (FEAT-015) | reason required | Circuit benchmarked | — |
| Proceed to demo report | header | ops | Only once every circuit has a benchmark | modal | → SCR-030 | Blocked with the outstanding circuits named |

**Out-of-range benchmarks never enter the aggregate silently** (FLOW-04 step 1). They must be
explicitly accepted here, or the circuit excluded — the demo report refuses to average the problem
away.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton trackers | — |
| Empty — first use | just confirmed | All circuits at step 1, awaiting the install visit | Schedule visit |
| Empty — filtered | n/a | — | — |
| Partial / stale | readings arriving | CMP-17 freshness pill per circuit | — |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | all benchmarked | Banner: "All 4 circuits benchmarked. Ready for the demo report." | → SCR-030 |

**Exits:** SCR-030, SCR-170, SCR-014, SCR-251, SCR-021.
**Live update:** polls every 5 minutes during an active baseline window.
**Responsive:** desk-first; trackers stack. **Offline:** blocked.
**Copy:** restart — "Baseline restarted 8 Aug after a connectivity gap. Day 3 of 5."

---

## SCR-030 — Demo report editor

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-020, 021, 022 · **Flows:** FLOW-04 (steps 1–3)

**Purpose:** turn measured per-circuit benchmarks into a whole-society projection a committee will
believe.
**Primary action:** review and share the demo report.

**Where the extrapolation becomes a promise.** Each circuit's measured benchmark is extrapolated
across the lights of *its own type* (CON-11) and summed. This is the first document that states a
number the society will later hold FirsThing to, so the screen has to make the method visible.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-025 | all circuits benchmarked | Deal |
| SCR-003 | deal at `demo-report` | Deal |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, deal, status | | CMP-02 | `draft` / `shared` |
| Body | Per-circuit measured results | CMP-09 | | Benchmark %, days measured, restarts |
| Body | **Extrapolation table** | per type: measured % × that type's light count | | The method, shown |
| Body | Projected annual saving | ₹ + kWh | display type | The headline |
| Body | Society's share | revenue split applied | ₹ | What they gain |
| Body | Assumptions | tariff, burn hours, light counts | | Every input named, with its source |
| Body | Narrative | rich text | | Editable |
| Footer | Society-facing preview | `.roomy` | | What SCR-031 shows |

**Edits are presentational only.** FLOW-04 step 2: *edits that contradict the measured data would
undermine INV-02.* Narrative, emphasis and ordering are editable; measured figures and the
extrapolation are not. A material change means re-running commissioning, not retyping a number.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Edit narrative | inline | ops | Versions the report | none | Autosaved | — |
| Share | button | ops | Emails it (CON-39); publishes to the prospect account (CON-34) | modal listing recipients | Status → `shared`; logged on SCR-180 | Contact bounces → flagged |
| Download PDF | button | ops | For WhatsApp / in-person | none | Download | — |
| Regenerate | button | ops | Re-runs from current benchmarks | modal | Background + toast | — |
| Mark accepted | button | ops | Advances to KYC | modal | → SCR-040 | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | not generated | "Generated automatically once every circuit is benchmarked." + what's outstanding | → SCR-025 |
| Empty — a circuit out of range | unapproved out-of-range benchmark | **Refuses to generate.** "Lift lobby measured 84%, outside the 60–80% range. Accept it or exclude the circuit before generating." | → SCR-025 |
| Partial / stale | benchmarks changed after generation | `warn`: "A benchmark changed on 9 Aug. Regenerate before sharing." | Regenerate |
| Error — network | save fails | Inline retry | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | shared | Timeline entry; society can see it | View as society |

**Exits:** SCR-031, SCR-040, SCR-025, SCR-003.
**Live update:** none. **Responsive:** desk-first, society preview to 360px. **Offline:** blocked.
**Open questions:** the PDF is print, not screen (`../05a-theme-system.md` §3.11).

---

## SCR-040 — KYC checklist & verification

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-024, FEAT-026 · **Flows:** FLOW-05 (steps 1–4)

**Purpose:** collect and verify the documents that gate agreement execution.
**Primary action:** verify a received document, or chase an outstanding one.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-030 | demo report accepted | Deal |
| SCR-003 | deal at `kyc` | Deal |
| SCR-041 | society uploaded something | The item |
| Email | upload notification | Deep link |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, deal, progress | | `2 of 3 verified` | |
| Body | Checklist | one row per required item | CMP-01 | GST document, recent electricity bill |
| Row | State | `outstanding` / `received` / `verified` / `rejected` | CMP-02 | |
| Row | Receipt channel | portal / email / WhatsApp / in person | | Recorded per FLOW-05 step 2b |
| Row | Document | CMP-08 | | Preview inline |
| Row | Rejection reason | required on reject | | Must reach the society, or they resend the same file |

**Both intake paths are first-class.** FLOW-05 step 2b: *"This path is mandatory to keep regardless
of CON-34's prospect accounts — many societies will never use the portal."* Backend entry is a
primary action on this screen, not a fallback tucked in a menu.

**A known gap, specified as such.** FLOW-05 step 1: *"the checklist is currently fixed; a deal
needing something unusual has no path to add an item."* The screen includes "Add a custom item"
with a name and reason, because the alternative is ops tracking it in a spreadsheet.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Upload on behalf | per row | ops | Marks received with the channel recorded | none | Row → `received` | — |
| Verify | per row | ops | Row → `verified` | none | Progress advances | Last item → KYC gate releases |
| Reject | per row | ops | Row → `outstanding` with a reason; society notified | reason required | Society told what was wrong | Notification bounce → flagged |
| Add custom item | header | ops | Adds a checklist row | reason required | Row added | — |
| Chase | per row | ops | Sends a reminder | none | Logged on SCR-180 | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton checklist | — |
| Empty — first use | checklist just raised | All items outstanding, with what each is and why | Chase / upload |
| Empty — filtered | n/a | — | — |
| Partial / stale | society uploading now | `info`: "New upload received 2 minutes ago." | Refresh |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | all verified | "KYC complete. The offer can now be executed." | → SCR-050 |

**Exits:** SCR-050, SCR-041, SCR-003, SCR-280.
**Live update:** polls every 60s while any item is outstanding.
**Responsive:** desk-first. **Offline:** blocked.
**Copy:** rejection — "The electricity bill is from Feb 2025. We need one from the last three
months." Never "invalid document".

---

## SCR-050 — Offer builder (per-circuit benchmark table)

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-07
**Features:** FEAT-027, FEAT-028 · **Flows:** FLOW-06 (steps 1–3)

**Purpose:** build the commercial offer, carrying the **per-circuit benchmark table** that the
monthly compliance check will later run against.
**Primary action:** send the offer, or version it after a counter.

**The structural requirement.** FLOW-06 step 1: *"An offer carrying one blended benchmark instead of
the per-circuit table would be unenforceable against the per-circuit compliance check the system
actually runs (FEAT-049)."* The offer's benchmark table and SCR-090's compliance table must be the
same shape, or the contract cannot be enforced by the thing enforcing it.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-040 | KYC complete | Deal |
| SCR-003 | deal at `offer` | Deal |
| SCR-051 | society countered | Deal + their counter |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, deal, offer version | | `v3` | Prior versions retained — which was signed matters later |
| Body | **Per-circuit benchmark table** | CMP-09, editable | | Circuit, light type, represented count, measured %, offered % |
| Body | Per-circuit tolerance band | editable per circuit | `±10%` | CON-01c applies per circuit |
| Body | Revenue-share split | editable | `58 / 42` | |
| Body | Term, AMC terms | editable | | |
| Body | CON-01b exclusions | standard list, editable | | What is not FirsThing's fault |
| Body | Projected value | computed both ways | ₹/month, ₹/term | Society's share and FirsThing's |
| Body | Version diff | vs the previous version | | What changed in this round |

**Offered % may differ from measured %,** and the screen shows both side by side with the delta.
Offering below measured is a commercial concession and is allowed; offering *above* measured is
flagged, because it commits FirsThing to a saving it has not demonstrated.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Send offer | button | sales | Creates a version; publishes to the society | modal showing the per-circuit table and the split | → SCR-051; stage advances | KYC incomplete → blocked, naming the items |
| Record counter | button | sales | Logs the society's counter against this version | none | New draft version seeded | — |
| Accept | button | sales | Locks the version; → agreement | modal | → SCR-052 | — |
| Compare versions | header | sales | Side-by-side diff | — | — | — |
| Withdraw | menu | sales lead | Withdraws the outstanding offer | reason required | Society notified | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | no offer yet | Table pre-filled from measured benchmarks, terms at defaults | Build |
| Empty — filtered | n/a | — | — |
| Partial / stale | a benchmark changed after drafting | `warn`: "Lift lobby's benchmark changed after this draft. Review before sending." | Review |
| Error — network | save fails | Inline; draft kept | Retry |
| Error — permission | not sales | Read-only | — |
| Success | accepted | → SCR-052 | — |

**Exits:** SCR-051, SCR-052, SCR-040, SCR-003.
**Live update:** none. **Responsive:** desk-first; the table scrolls horizontally in its own
container. **Offline:** blocked.
**Copy:** above-measured warning — "You're offering 72% on Lift lobby but it measured 68%. That
becomes the benchmark FirsThing is held to every month."

---

## SCR-052 — Agreement tracker & physical handoff log

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-07
**Features:** FEAT-029, FEAT-030 · **Flows:** FLOW-06 (steps 4–6)

**Purpose:** track a paper document through the physical world, because the signed paper is the
legal instrument and the system only holds a scan.
**Primary action:** log the next handoff, or record the executed agreement.

**Deliberately a log, not a workflow.** FLOW-06 step 4: *"The signed paper is the legal instrument;
the system holds a scan, not the original."* Trying to model notarisation as a state machine would
misrepresent what is happening; what ops actually needs is to know where the document physically is
and who last had it.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-050 | offer accepted | Deal + accepted version |
| SCR-003 | deal at `agreement` | Deal |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, deal, agreement stage | | CMP-02 | `printing` / `with-society` / `notarising` / `executed` |
| Header | Days since the offer was accepted | | | The stall signal for this stage |
| Body | **Handoff log** | CMP-10, append-only | | Who handed over, who received, contact, timestamp, location |
| Body | Location | free text with common values | `"maintenance office"`, `"main gate"` | Real places, from FLOW-06 step 5 |
| Body | Documents | CMP-07 / CMP-08 | | Unsigned draft, signed scan, notarised scan |
| Body | Execution details | date, notary, witnesses | | |
| Footer | "Record execution" | | | Creates the `Contract` |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Log handoff | button | sales, ops | Appends to the log | none | Entry added | — |
| Upload scan | CMP-07 | sales, ops | Attaches signed or notarised scan | none | Attached | — |
| Record execution | footer | sales lead | Creates the active `Contract` from the accepted offer version | modal restating the terms being made binding | → SCR-053; FLOW-07 releases | Missing notarised scan → blocked |
| Flag lost document | menu | sales | Records loss; a reprint restarts the log | reason required | Stage → `reprinting` | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | just accepted | "The offer is accepted. Print it, then log each handoff so nobody loses track of the paper." | Log handoff |
| Empty — filtered | n/a | — | — |
| Partial / stale | no movement in 14 days | `warn`: "No handoff logged since 28 Jul. Where is the document?" | Log / chase |
| Error — network | save fails | Inline retry | Retry |
| Error — permission | not sales | Read-only | — |
| Success | executed | Contract created; deal → installation | → SCR-053 |

**Exits:** SCR-053, SCR-060, SCR-003.
**Live update:** none. **Responsive:** works to 360px — this gets updated from a phone in a car
park. **Offline:** blocked, but flagged as a candidate for offline capture given where it is used.

---

## SCR-053 — Contract record

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01, PER-07, management
**Features:** FEAT-062 · **Flows:** FLOW-06 (step 6), referenced throughout

**Purpose:** the authoritative statement of what was agreed — the record every monthly calculation,
compliance check and dispute resolves against.
**Primary action:** read it. Changes happen through amendment (SCR-160), never here.

**Read-only by design.** A contract that can be edited in place cannot be the thing a billing
dispute is settled against. Every change is an amendment with its own record, and the screen shows
the contract *as of* a chosen date.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-052 | execution recorded | Contract |
| SCR-090 | "See contract terms" | Contract, scrolled to benchmarks |
| SCR-113 | benchmark decision context | Contract |
| SCR-151, SCR-250 | society record | Contract |
| SCR-101 | society's own read-only view | Contract |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, contract ref, status, term dates | | CMP-02 | `active` / `suspended` / `terminated` / `expired` |
| Header | **As-of date selector** | | | Defaults to today; shows historical states |
| Body | **Per-circuit benchmark table** | CMP-09 read-only | | Benchmark %, band, represented light count per circuit |
| Body | Commercial terms | | | Revenue share, unit rate, payment terms, term, AMC |
| Body | CON-01b exclusions | | | |
| Body | Hardware inventory | what FirsThing owns on site | | Matters at term end (FEAT-103) |
| Body | Amendment history | CMP-10 | | Every change, with its signed instrument |
| Body | Documents | CMP-08 | | Notarised agreement, amendments |
| Body | Linked records | | | Invoices, savings reports, deviations |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Raise amendment | button | ops lead, management | Starts an amendment | none | → SCR-160 | — |
| View as of date | selector | all with access | Re-renders the historical state | — | — | — |
| Download | button | all with access | Notarised agreement + amendments | none | Download | — |
| Terminate | menu | management | Starts termination (FEAT-051) | modal | → SCR-163 | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | not reachable without a contract | — | — |
| Empty — filtered | as-of date before execution | "This contract didn't exist on 1 Jan 2026." | Reset date |
| Partial / stale | amendment in flight | `info`: "An amendment is awaiting signature. Terms below are the current binding ones." | → SCR-160 |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | wrong society | SCR-221 | — |
| Success | n/a — read-only | — | — |

**Exits:** SCR-160, SCR-163, SCR-090, SCR-151, SCR-234.
**Live update:** none. **Responsive:** to 360px. **Offline:** blocked.

---

## SCR-060 — Installation plan

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-033 · **Flows:** FLOW-07 (step 1)

**Purpose:** schedule the full installation across days and areas.
**Primary action:** publish the plan so field work can start.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-052 | contract executed | Contract |
| SCR-003 | deal at `installation` | Deal |
| SCR-063 | blocker forces a replan | Plan |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, contract, total lights, days planned | | | |
| Body | Day-by-day batches | CMP-01 | | Date, areas, expected count, assigned installer |
| Body | Area coverage check | plan total vs surveyed count | | Must reconcile — see below |
| Body | Stock requirement | per batch | | Fittings by type |
| Body | Onlooker assignment | society contact per day (PER-06) | | CON-21 needs a named reviewer |
| Body | Calendar view | | | Alongside other societies' visits |

**The plan must reconcile to the survey.** Planned lights across all batches must equal
`representedLightCount` from SCR-014. A mismatch is either a survey error or an undocumented scope
change, and both need resolving before installation rather than being discovered on site.

**CON-21 needs a named onlooker per day.** Batch review gates the next day's start, so a day with
nobody assigned to review it is a day that cannot complete. The plan refuses to publish without one.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Add / edit batch | inline | ops | Edits the plan | none | Autosaved draft | — |
| Publish plan | button | ops | Releases to field (SUR-02) and notifies the society | modal with the schedule summary | Field sees it | Blocked if counts don't reconcile or a day has no onlooker |
| Replan | button | ops | Revises after a blocker | reason required | New version; field notified | — |
| Assign installer | per batch | ops | Creates the visit (FLOW-X1) | none | → SCR-170 | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | no plan | "Plan the installation. 1,200 lights across 4 areas." + a suggested split by area | Build |
| Empty — filtered | n/a | — | — |
| Partial / stale | survey count changed | `warn`: "The surveyed count changed. This plan covers 1,200 of 1,260 lights." | Reconcile |
| Error — network | save fails | Inline retry | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | published | Field notified; first batch scheduled | → SCR-170 |

**Exits:** SCR-061, SCR-063, SCR-170, SCR-053.
**Live update:** none. **Responsive:** desk-first. **Offline:** blocked.

---

## SCR-063 — Installation blockers & scope changes

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01, PER-04
**Features:** FEAT-036 · **Flows:** FLOW-07 (step 4)

**Purpose:** handle what goes wrong during installation, and route a genuine scope change to a
contract amendment rather than letting it become a silent edit.
**Primary action:** resolve the blocker, or raise the amendment it requires.

**The rule that matters.** FLOW-07 step 4: *"A scope change discovered mid-install (more lights than
surveyed) affects `representedLightCount` and therefore billing — must route to a contract
amendment (FLOW-17), not a silent edit."* This screen is the only place that decision gets made, and
it must not offer the silent path.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-061 | installer raises a blocker from site | The blocker |
| SCR-060 | ops reviewing the plan | Plan |
| SCR-240 | "Installation blocked" card | The blocker |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, plan status, days lost | | CMP-02 | |
| Body | Blocker list | CMP-01 | | Type, area, raised by, when, effect on the plan |
| Type | Stock shortage / access denied / site condition / **count discrepancy** / equipment fault | | CMP-02 | Count discrepancy is the one with contractual consequence |
| Detail | Evidence | CMP-15 photos, installer notes | | |
| Detail | **Scope impact** | computed for count discrepancies | | Old vs new count, effect on the benchmark basis and the monthly fee |
| Detail | Resolution | | | What was done, by whom |

**A count discrepancy always shows its money.** Discovering 60 more lights than surveyed changes
`representedLightCount`, which changes extrapolation, which changes every future bill. The screen
states that consequence in rupees per month before offering any action, so nobody treats it as a
clerical correction.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Resolve | per blocker | ops | Records the resolution; plan resumes | none | Blocker closed; field notified | — |
| Replan | per blocker | ops | → SCR-060 | reason required | New plan version | — |
| **Raise amendment** | on a count discrepancy | ops lead | Starts a contract amendment (FLOW-17) | modal restating the billing effect | → SCR-160; count unchanged until signed | — |
| Deterministic rescale | on a count discrepancy | ops lead | Where the contract already permits a rescale formula (FEAT-041, INV-07) | modal showing the computed new benchmark | Applied and audited | Only available if the contract carries the clause |
| Escalate | per blocker | ops | Management notified | reason required | — | — |

**Absent by design:** no field edits `representedLightCount` directly. The two legitimate paths are
an amendment or a contract-permitted deterministic rescale, and both write an audit row.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | no blockers | "No blockers. Installation is running to plan — day 3 of 6." | View plan |
| Empty — filtered | filter excludes all | Names the filter, offers clear | Clear |
| Partial / stale | installer has unsynced work | `info`: "An installer has unsynced updates from today." | Wait |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | resolved | Plan resumes; field notified | — |

**Exits:** SCR-060, SCR-160, SCR-061, SCR-053.
**Live update:** polls every 120s during an active installation day.
**Responsive:** desk-first; readable to 360px since ops may handle this away from a desk.
**Offline:** blocked.
**Copy:** count discrepancy — "60 more lights than surveyed in Basement B. This raises the
represented count from 1,200 to 1,260 and the monthly fee by about ₹6,700. It needs a contract
amendment before it can take effect."
