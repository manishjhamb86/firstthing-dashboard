# SUR-01 back office — monthly loop
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft — all 11 specified, mockups pending
**Last updated:** 2026-08-12

The revenue spine. Flows 09–12 run every month, for every society, for the life of every contract.
Global rules this file inherits: [`00-global-patterns.md`](00-global-patterns.md). Visual system:
[`../05a-theme-system.md`](../05a-theme-system.md).

**Screens in this file (11, all priority 1):** SCR-080, 081, 082, 090, 091, 092, 093, 110, 112,
113, 120.

**The constraint everything here serves:** a 17-day window between the month closing and the
invoice being due, across a portfolio that is 22 societies today and 200 at GOAL-07. Every screen
below is judged on whether it helps a small ops team close that window without either missing a
society or billing one wrongly.

---

## SCR-080 — Reading upload (single + batch)

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-043, FEAT-044, FEAT-099 · **Flows:** FLOW-09 (steps 2–5)

**Purpose:** get a month of meter readings out of a vendor CSV and into the system, attached to the
right circuit, without silently mis-mapping anything.
**Primary action:** upload files and confirm the circuit each belongs to.

**Two ingest paths, and this one is primary — for now (CON-43, amended 2026-08-13).** This screen
is **path A**, the manual upload. Path B is the scheduled vendor-API fetch (SCR-084, FEAT-104).
Until that integration exists, **this screen carries the entire monthly volume**. Once it exists,
the fetch becomes primary and this screen becomes the exception path — used when auto-fetch has
failed and readings are needed urgently. Neither the screen nor its permissions change at that
point; only which one does the routine work. The empty state and the progress metric change
register, though, and that is specified below.

**Nothing already stored is ever overwritten by default.** This is the rule the screen exists to
enforce (CON-43, FEAT-107). An upload lands on top of data that may already be there — from the API
fetch, from an earlier upload, or from a manual correction — and an incoming value that disagrees
with a stored one is **not applied**. It is reported, and applying it takes two deliberate acts.
The earlier "CSV wins" rule was replaced because automatic supersession let a routine re-upload
silently rewrite the evidence a released invoice was calculated from.

**Volume is the design problem.** FLOW-09 runs once per *circuit*, not per society: ~90 files a
month today, 800+ at GOAL-07. FEAT-043 was specified as single-file upload; FEAT-099 (found in
Phase 4 as DF-05) adds the bulk path. This screen is both, because an ops person doing 800 uploads
one at a time is the single most likely place the 17-day window breaks.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-240 ops home | "Readings due" task card | Period pre-set to the open close-period |
| SCR-082 readiness board | Clicking a "Missing readings" row | Society and circuit pre-selected |
| Sidebar → Readings | Direct navigation | Period defaults to open close-period |
| SCR-083 quarantine | "Retry this file" | The quarantined file re-attached |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Period picker | CMP-06 | `MMMM YYYY` | Defaults to open close-period; **never inferred from file contents** (CON-25) |
| Header | Progress | count of circuits with validated readings / total active | `37 / 90 circuits` | The real progress metric, not files uploaded |
| Body | Dropzone | CMP-07 | CSV, XLSX; 20MB/file; multiple | Accepts a whole folder drop |
| Body | Per-file row | filename, detected society, detected circuit, status | table | One row per dropped file |
| Body | Mapping panel | Gemini's column→field mapping | editable table | Only shown for files needing confirmation |
| Body | Preview | first 10 normalised rows | date + kWh | Shown before commit, always |
| Body | **Reconciliation report** | classification of every incoming interval against what is stored | see below | The heart of the screen (FEAT-107) |
| Body | Circuit context | benchmark + last month's daily mean | beside the incoming data | Makes an order-of-magnitude mis-mapping visible before commit |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Upload files | drop / browse | ops | **Stores the raw file first**, before any interpretation (CON-30) | none | Per-file row appears as `Reading` | Upload fails → row shows retry; raw file not lost |
| Confirm mapping | Confirm on a file | ops | Persists normalised hourly rows aggregated to daily (FEAT-044); raw retained alongside | none | Row → `Validated` | Mapping rejected by validation → inline error naming the column |
| Change circuit | circuit dropdown | ops | Re-attaches the file | required if AI-detected | Row re-validates | — |
| Commit all | header button | ops | Commits every `Ready` file in one batch | modal listing counts | Toast; redirect to SCR-081 if any anomalies | Partial failure commits the good ones and lists the rest |
| Quarantine | Skip on a file | ops | Moves it to SCR-083 with a reason | none | Row removed | — |
| Select conflicts | per-row checkbox, with select-all | ops | Marks which stored values to replace. **Default is none selected** | none | Row marked; commit button restates the count | — |
| Apply overwrites | Commit, with conflicts selected | ops | Replaces the selected stored values; the prior value, its source and the user are retained | **modal restating the count and the affected days, requiring explicit confirm** | Overwrites applied; audit rows written | Blocked per row for any interval in a released calculation (INV-03) |

### Inputs & validation

| Field | Type | Required | Default | Constraints | Error message | Editable later |
|---|---|---|---|---|---|---|
| Period | month | yes | open close-period | not in the future; not a closed month | "July 2026 is already closed. Reopen it from the readiness board to add readings." | no — re-upload instead |
| Society | CMP-05 | yes | AI-detected | must be an active society | "No society matches this file. Pick one, or check you exported the right circuit." | yes, before commit |
| Circuit | select | yes | AI-detected | must belong to the society and be active | "This circuit isn't on Settlement Nexus. Wrong file, or the circuit registry needs updating." | yes, before commit |
| Column mapping | per-column select | yes | AI-proposed | timestamp + one value column minimum | "Pick which column holds the reading. Without it there's nothing to import." | yes, before commit |
| Timestamp format | select | yes | AI-detected | must parse ≥95% of rows | "This format only reads 40% of the rows. Try DD/MM/YYYY." | yes, before commit |

**Validation timing:** on file drop (structure), then again on commit (business rules).
**Half-completed state:** mappings persist per file for 24h; a refresh restores the queue.

### Reconciliation: what an upload does to what is already there

Runs after parsing and normalisation, **before anything is committed**. Every interval in the
incoming file is classified against what is stored, and the report is what the operator acts on.

| Class | Definition | Default | How it is reported |
|---|---|---|---|
| **New** | No stored reading for that interval | Imported | A count: "1,104 new readings" |
| **Identical** | Stored value equals incoming **exactly** | Ignored | **Not reported at all** |
| **Conflicting** | Stored value differs from incoming | **Existing value kept** | Full side-by-side list |
| **Missing** | Inside the period, no reading from either source | Nothing imported | Gap list |

**Identical rows are silent, deliberately.** Re-uploading the same file is a no-op that says
nothing. The common case must not produce a warning, because an operator who dismisses a warning
ninety times a month will dismiss the ninety-first without reading it — and the ninety-first is the
one that matters.

**The conflict list is a comparison, not a notification.** Per conflicting interval: the stored
value, the incoming value, the difference, and **where the stored value came from** — API fetch,
an earlier upload, or a manual correction. Provenance is a column because "the API says 41.2, this
file says 43.8" and "someone typed 41.2 last week, this file says 43.8" call for different
decisions.

**Overwriting takes two deliberate acts.** A per-row checkbox (with select-all), then a
confirmation modal restating the count and the affected days. Nothing is pre-selected. Committing
with no conflicts selected imports the new rows and leaves every stored value untouched — which is
the expected path, not a special case.

**Superseded values are retained, never deleted.** The prior value, its source, and who replaced it
are kept, so a recalculation stays reproducible and INV-02's provenance survives the overwrite.

**"Identical" means exactly equal** (user's decision, 2026-08-13). No rounding, no tolerance band.
`12.4` against a stored `12.437` is a conflict, not a match. This is the strictest reading and it
never hides a real difference — chosen over precision-rounding for exactly that reason.

The cost is accepted and designed around rather than argued with: **a vendor changing their export
precision makes every row in the month a conflict.** The panel absorbs that volume without
resolving anything automatically —

- Conflicts group by day, collapsed, with per-day counts.
- When conflicts share a shape, the panel says so at the top: *"All 744 conflicts differ by less
  than 0.01 kWh. This usually means the vendor changed their export precision."* That is a hint
  about what the operator is looking at — **not** a filter, a default, or an auto-resolve.
- Select-all still requires the same confirmation, restating the full count.

The residual risk is recorded as **ASSUM-28**: that vendor export precision is stable enough for
exact matching to stay workable. If a vendor changes it mid-contract, one month's upload becomes a
several-thousand-row review, and this decision should be revisited rather than worked around.

**Released months cannot be overwritten at all.** An interval already inside a released calculation
is listed as blocked, with the reason, and no checkbox. INV-03 makes this absolute — confirmation
does not unlock it, because an invoice whose underlying readings changed after issue is an invoice
that no longer matches the evidence a dispute would be settled against.

**A closed month must be reopened before it can be overwritten** (user's decision, 2026-08-13). A
month ops has closed on SCR-082 but the accountant has not yet released through SCR-092 is **not**
overwritable in place. The attempt is refused and points at the readiness board, where reopening is
an explicit act that resets the accountant's review. The extra step is the point: without it, PER-08
could approve figures that changed underneath them and never be told.

**Gaps are reported, never filled.** The missing list feeds CON-12's coverage rule. The screen
states the count and the dates; it does not interpolate, average, or carry forward.

### The mis-mapping problem

FLOW-09 step 2 names the sharpest failure in this flow: **a file attached to the wrong circuit
produces readings measured against the wrong benchmark, and the error only surfaces weeks later as
an implausible deviation.** Three defences, all specified here rather than left to care:

1. AI detection proposes the circuit but **never auto-commits it** — confirmation is an explicit act.
2. The preview shows the circuit's *benchmark and last month's daily mean* beside the incoming
   data, so an order-of-magnitude mismatch is visible before commit.
3. On commit, a reading set whose daily mean is more than 3× or less than ⅓ of that circuit's
   trailing mean is **blocked**, not warned: "These readings are 6× last month's average for
   Basement parking. That usually means the wrong circuit. Check before committing."

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton dropzone + progress | — |
| Empty — first use | no files dropped | Dropzone with accepted formats, and the count of circuits still awaiting readings this period | Upload |
| Empty — filtered | n/a | — | — |
| Partial / stale | some circuits validated | Progress bar + "53 circuits still need readings for July 2026" | Continue |
| Error — network | upload fails | Per-file retry; other rows unaffected | Retry |
| Error — permission | non-ops role | SCR-221 | — |
| Error — AI unavailable | Gemini down | Banner: "Automatic column detection is unavailable. Map the columns yourself and carry on." Fields revealed for manual mapping — the flow is **not blocked** | Map manually |
| Reconciled — clean | parse finds no conflicts | "1,104 new readings, nothing already stored disagrees." Commit is a single action | Commit |
| Reconciled — conflicts | parse finds disagreements | `warn` panel with the side-by-side list, nothing pre-selected | Review, select, commit |
| Reconciled — no-op | every row identical | "These readings are already in the system. Nothing to import." Commit disabled | Pick another file |
| Blocked — released month | conflicts fall in a released calculation | Those rows listed without checkboxes and the reason stated | Commit the rest |
| Blocked — closed month | period closed, not yet released | Overwrite refused with a link to reopen on the readiness board; new rows still importable | Reopen, or commit new only |
| Reconciled — bulk conflict | every row differs | Grouped-by-day list plus the shape hint; nothing pre-selected | Review, select, commit |
| Success | commit | Toast naming what was written *and what was left alone*; anomalies route to SCR-081 | Go to review |

### Exits

| To | Trigger | State carried out |
|---|---|---|
| SCR-081 | commit produced anomalies | Period + affected circuits |
| SCR-082 | commit clean | Period |
| SCR-083 | quarantine | The file |

**Live update:** none. Progress refreshes on commit only.
**Responsive:** desk-first. Below 768px the per-file table stacks into cards; dropzone unchanged.
**Offline:** blocked. Banner states uploads need a connection.
**Performance:** a 30-day hourly CSV normalises in ≤5s; past that it becomes a background job with
a toast.
**Copy:** empty — "Drop this month's meter exports here. One file per circuit; a whole folder is
fine." Commit — "Commit 12 files?" / "12 circuits validated for July 2026." Overwrite confirm —
"Replace 14 stored readings across 6 days for Basement parking? The current values are kept on
record, but this circuit's July figures will be recalculated." Clean commit — "1,104 readings
added. 312 already matched and were left alone."
**Open questions:**
- **ASSUM-16** (vendor export shape is stable) is load-bearing here — if the vendor changes their
  CSV, FLOW-09 step 1 has *no system visibility at all*. Worth a monitoring feature.
- **Resolved 2026-08-13 — "identical" means exactly equal.** No rounding, no tolerance. Residual
  risk accepted as **ASSUM-28** (vendor export precision is stable); a precision change turns one
  month into a several-thousand-row review, mitigated by grouping and a shape hint rather than by
  auto-resolving.
- **Resolved 2026-08-13 — a closed month must be reopened before overwrite.** Refused in place,
  with a link to the readiness board.

---

## SCR-081 — Anomaly & coverage review

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-045, FEAT-046 · **Flows:** FLOW-09 (steps 6–7)

**Purpose:** decide, per circuit, whether a flagged reading is a real consumption change or a data
problem — because unresolved anomalies **block billing** (INV-09, FEAT-048 AC-3).
**Primary action:** resolve each flagged circuit — accept, exclude, or send back for re-upload.

**This is a gate, not an advisory.** That is the single most important property of this screen and
it must be visible: a person must never be able to leave here thinking they are done when a
blocking anomaly is still open.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-080 | commit produced anomalies | Period + affected circuits, filtered to unresolved |
| SCR-082 | "Blocked: anomalies" row | That society, filtered to unresolved |
| SCR-240 | task card | Period, all unresolved |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Period, unresolved count | computed | `4 unresolved` in `bad` tone | Count is the headline — it is what blocks |
| Body | Circuit list | one row per flagged circuit | CMP-01 | Grouped by society |
| Row | Anomaly type | `missing-days` / `out-of-range` / `flatline` / `spike` | CMP-02 | |
| Row | Coverage | validated days / days in month | `18 / 31` | **Below 20 days the month is unusable** (CON-12) |
| Detail | Daily plot | that circuit's daily kWh | chart | Flagged days marked; uses the system's chart roles (`../05a-theme-system.md` §3.10) |
| Detail | Context | last 3 months' daily mean, recent inspections, recent tickets, sibling circuits' coverage | | Same context set as SCR-110, deliberately |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Accept as real | per circuit | ops | Marks resolved; readings stand | reason required | Row → resolved | — |
| Exclude days | select days | ops | Excluded from the calculation; **never interpolated** (FLOW-09 step 7) | reason required | Coverage recomputes | Coverage drops below 20 → circuit flips to `unusable` and says so |
| Accept low coverage | on `<20 days` | ops lead | Explicitly accepts an unusable month (CON-12) | modal naming the coverage and the billing consequence | Circuit billable, flagged on the invoice | — |
| Send back | per circuit | ops | Reverts to awaiting-upload | none | Returns to SCR-080's queue | — |
| Resolve all clean | header | ops | Bulk-resolves only `informational` flags | modal with count | Toast | Blocking flags are never bulk-resolvable |

**Deliberately absent:** interpolation. At no coverage level does the system invent a missing day.
FLOW-09 step 7 is explicit and this screen offers no affordance for it.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton list | — |
| Empty — first use | no anomalies ever | "Nothing flagged. Every circuit's readings look consistent with its history." | Go to readiness |
| Empty — filtered | filter excludes all | Names the filter, offers clear | Clear |
| Partial / stale | ingest still running | `info` banner: "3 circuits are still importing. This list will grow." | Wait / refresh |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | last one resolved | Toast: "All anomalies resolved. July 2026 is ready to calculate." | Go to readiness |

**Exits:** SCR-080 (send back), SCR-082 (done), SCR-090 (per-circuit detail), SCR-170 (raise a visit).
**Live update:** polls every 60s **only while an ingest job is running**; otherwise static.
**Responsive:** desk-first; the chart is the reason — below 768px it drops to a coverage bar and a
"View on desktop for the daily plot" note, which is honest rather than pretending a 360px plot works.
**Offline:** blocked.
**Copy:** blocking flag — "Blocks billing until resolved." Accept — "Why are these readings correct?"
**Chart:** uses the system's semantic chart roles — measured daily line, benchmark reference,
tolerance band, hatched exclusions, `--bad-fg` markers on flagged days. Added to the theme system
on 2026-08-12 because this screen and SCR-110 reached for it (`../05a-theme-system.md` §3.10);
excluded days break the line rather than drawing zero, which is FLOW-09 step 7 made visual.

---

## SCR-082 — Month-close readiness board

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01, PER-08
**Features:** FEAT-047, FEAT-100 · **Flows:** FLOW-09 (step 8)

**Purpose:** answer one question across the whole portfolio — which societies can be billed today,
and what exactly is stopping the rest.
**Primary action:** approve the ready societies in bulk and close the month.

This is the screen the 17-day window is actually managed on, and the one the theme system was
proved against.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-240 ops home | "Month close" task card | Open close-period |
| Sidebar → Readiness | direct | Open close-period |
| SCR-081 | all anomalies resolved | Period, filtered to that society |
| Email digest | monthly close reminder | Period |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Period + day counter | `Day 11 of 17` | CMP-02 `warn` past day 12 | The window made visible |
| KPI strip | Ready / Missing readings / In review / Days left | CMP-03 | | Ready shows both count and rupee value |
| Filters | All, Blocked, In review, Ready, Disputed | CMP-04 | | Reflected in URL |
| Table | One row per society | CMP-01 with bulk-select | | 40 rows today, 200 at GOAL-07 — paginate at 50 |
| Row | Society, circuits, readings coverage, measured, benchmark, status, fee | | | `1 metered` sub-note where a circuit is on actual-metered basis |
| Row accent | 3px left border by blocking severity | | | **Established during the theme proof** — a chip alone cannot answer "what is blocking me" across 40 rows |
| Footer | Portfolio totals | | | 40 societies, 168 circuits, total fee |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Approve selected | bulk bar | ops lead | Marks each society's month calculated-and-ready; triggers HL-01 where not already run | modal with count and total value | Toast; rows → `Released to accountant` | Any failure leaves that society unapproved and named in the toast |
| Approve all ready | header | ops lead | Same, for every `Ready` row | modal | Toast | — |
| Open society | row click | ops | → SCR-090 | — | | — |
| Reopen month | row menu | ops lead | Returns a closed society to open | modal warning that the accountant queue entry is withdrawn | Row → open | Blocked if the invoice is already issued — invoices are immutable (INV-03) |
| Export | header | ops | CSV of the board | none | Download | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton KPI strip + table | — |
| Empty — first use | no active contracts | "No societies are live yet. Once a contract is commissioned it appears here each month." | Go to societies |
| Empty — filtered | filter excludes all | "No societies are blocked. Clear the filter to see all 40." | Clear |
| Partial / stale | HL-01 mid-run | CMP-17 freshness pill + `info` banner naming how many are still calculating | Wait |
| Error — network | load fails | Inline retry, keeps last data | Retry |
| Error — permission | accountant (PER-08) | Read-only: sees the board, approve actions hidden | View |
| Success | month closed | Banner: "July 2026 closed. 37 societies released to the accountant." | Go to release queue |

**Exits:** SCR-090, SCR-081, SCR-080, SCR-092, SCR-120.
**Live update:** CMP-17 pill; polls every 60s while any calculation job is running.
**Responsive:** desk-first; below 768px the table becomes stacked cards keeping status, blocker and
fee. The KPI strip goes 4→2 columns.
**Offline:** blocked.
**Performance:** ≤1.5s for 200 societies. The per-circuit rollup must be a single aggregate query,
not 200 round trips.
**Copy:** day counter — "Day 11 of 17". Blocked — "Missing readings", "Anomalies unresolved",
"In deviation review", not generic "Blocked".
**Design:** mockup exists inside the theme system reference
(https://claude.ai/code/artifact/62b6293c-592f-4a49-ac8d-e6892a7a5583, §4) — needs promoting to its
own artifact with all seven states before it counts as approved.
**Verified against spec:** the theme proof confirmed the row accent, the em-dash rule and the
footer total. Not yet verified: the seven states, the reopen path, the accountant read-only view.

---

## SCR-090 — Per-circuit compliance view

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-049 · **Flows:** FLOW-10 (step 2)

**Purpose:** show, for one society in one month, how each circuit performed against **its own**
benchmark and band, and what that means for its fee line.
**Primary action:** confirm the month's per-circuit result, or open a deviation on a circuit that
breached.

**The screen where the product's central idea becomes visible.** CON-11 and CON-01c mean a society
is not one number: it is a set of circuits, each with its own benchmark, band and basis, and a
month where three are fixed and one has flipped to actual-metered is normal, not exceptional.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-082 | row click | Society + period |
| SCR-091 | "See the calculation" | Society + period |
| SCR-241 portfolio | society → month | Society + period |
| SCR-110 | breadcrumb back | Society + period |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, period, tolerance | Contract | `tolerance ±10%` | Band is **per contract**, not global |
| Header | Coverage | validated days | `31 / 31` | |
| KPI strip | Measured (weighted), Contracted, Fee, Circuits in band | CMP-03 | | Weighted across circuits by light count |
| Body | Per-circuit table | CMP-09 | | Benchmark, measured, variance, status, fee line, basis |
| Row | Lights represented | `Circuit.lightCount` | `420 lights represented` | Makes extrapolation explicit rather than hidden |
| Row | Basis | `fixed` / `actual-metered` | CMP-02 | A mixed-basis month must be legible at a glance |
| Body | Provenance | link per figure to its inputs (INV-02) | | Every number traceable — this is a contractual requirement, not a nicety |
| Footer | Total fee | sum of fee lines | | |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Open deviation | on an out-of-band circuit | ops | Creates a deviation review for **that circuit only** | none | → SCR-110 | — |
| Send to release queue | header | ops | Releases the society's month to PER-08 | modal showing the total and any mixed basis | Toast → SCR-092 | Blocked while any circuit has an open deviation |
| Recalculate | header menu | ops lead | Re-runs HL-01 | modal warning that figures may change | Background job + toast | — |
| View provenance | per figure | ops | Drawer: inputs, versions, timestamps (INV-02) | — | — | — |

**Barred:** applying an adjustment without a completed review (FEAT-050 AC-4). The adjustment is
never a control on this screen; it is an *outcome* of SCR-112.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton KPI + table | — |
| Empty — first use | month not calculated | "July 2026 hasn't been calculated yet. It runs automatically once every circuit's readings validate." + what's outstanding | Go to readings |
| Empty — filtered | n/a | — | — |
| Partial / stale | some circuits validated | `warn` banner: "2 of 4 circuits validated. Figures below are incomplete." Fee suppressed, not estimated | — |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | wrong society scope | SCR-221 | — |
| Success | released | Banner + status chip changes | Go to queue |

**Exits:** SCR-110, SCR-091, SCR-092, SCR-081, SCR-251 (circuit registry).
**Live update:** none — a month's figures are settled or they are not.
**Responsive:** desk-first; below 768px the per-circuit table becomes one card per circuit, keeping
benchmark/measured/variance/basis. The KPI strip goes 4→2.
**Offline:** blocked.
**Copy:** mixed basis — "Lift lobby is billed on actual metered consumption this month after a
second month outside its band." Never let a mixed-basis month be presented as a single number
(FLOW-10 step 5 names this as a real presentation problem).
**Design:** a fragment of this screen was the test case for all three theme directions
(https://claude.ai/code/artifact/3c1e047c-e42b-4dc7-b8a2-a903c9343f81). The full screen, with all
states and the provenance drawer, is not yet drawn.

---

## SCR-091 — Savings report (ops view / editor)

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01, PER-08
**Features:** FEAT-059 · **Flows:** FLOW-10 (step 5)

**Purpose:** produce the document that proves the saving — the artefact an RWA committee actually
reads, and the one thing that justifies the fee.
**Primary action:** review the generated report and release it with the month.

**Native to the app, unlike the invoice.** The invoice is produced in Zoho and uploaded back
(CON-33); the savings report is generated here, which means every figure on it links to its
provenance (INV-02) instead of being retyped.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-090 | "View savings report" | Society + period |
| SCR-092 | queue row | Society + period |
| SCR-082 | row menu | Society + period |
| SCR-261 | ops viewing what the society sees | Society + period, read-only |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, period, status | | CMP-02 | `draft` / `released` |
| Summary | Total saved, fee, society's share | computed | ₹ + kWh | The society's share is the headline, not the fee — this document exists to show them what they gained |
| Summary | Cumulative saved since contract start | | ₹ | The number a committee quotes at an AGM |
| Body | Per-circuit breakdown | CMP-09, read-only | | Basis stated **per circuit** |
| Body | Mixed-basis explainer | conditional | `warn` banner | Only when at least one circuit is `actual-metered` |
| Body | Method note | static + contract terms | | How the figure was reached, in plain language |
| Body | Provenance links | INV-02 | per figure | Ops-only; stripped from the society's view |
| Footer | Preview of the society-facing version | | `.roomy` density | What SCR-261 will show |

### The mixed-basis problem

FLOW-10 step 5 names it directly: **a mixed-basis month presented as one number hides why the
total moved.** A society whose lift lobby flipped to actual-metered sees a total that changed for a
reason no single figure explains. This screen is where that is either handled or fumbled, so:

- The per-circuit table always states each circuit's basis, even in an all-fixed month, so the
  column is not a surprise the one month it matters.
- A mixed month carries a plain-language banner above the total: *"Three circuits billed at the
  agreed rate. The lift lobby is billed on actual metered consumption this month, after readings
  stayed outside its band for a second month. Here's what that changed."*
- The total is never shown without the per-circuit table on the same screen.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Edit commentary | inline | ops | Edits the narrative only — **never a figure** | none | Autosaved draft | — |
| Regenerate | header | ops | Re-runs from current inputs | modal warning figures may change | Background + toast | — |
| Release with month | header | ops lead | Marks releasable; actual release is SCR-092's gate | modal | → SCR-092 | Blocked if any circuit has an open deviation |
| Download PDF | header | ops, PER-08 | Renders the print artefact | none | Download | — |
| View as society | header | ops | Opens the `.roomy` society view | none | Preview | — |

**Figures are never editable.** Commentary is. A savings report whose numbers can be typed over is
not evidence, and INV-02 requires every figure to trace to its inputs.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | not yet generated | "This report is generated once July's calculation completes." + what's outstanding | Go to compliance |
| Empty — filtered | n/a | — | — |
| Partial / stale | inputs changed since generation | `warn` banner: "Readings changed after this report was generated on 12 Aug. Regenerate before releasing." | Regenerate |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | society-scoped user | SCR-221 | — |
| Success | released | Status chip → `released`; society-visible | View as society |

**Exits:** SCR-090, SCR-092, SCR-261, SCR-110.
**Live update:** none.
**Responsive:** desk-first for the editor; the society-facing preview is responsive to 360px.
**Offline:** blocked.
**Copy:** plain language throughout the society-facing half — no "deviation", no "actual-metered
basis" without the sentence that explains it.
**Not covered by the system:** the PDF is print, not screen (`../05a-theme-system.md` §3.11). It
needs its own treatment before this screen is done.

---

## SCR-092 — Accountant release queue

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-08
**Features:** FEAT-054 · **Flows:** FLOW-10 (step 6)

**Purpose:** the blocking gate before any figure reaches a society (CON-33) — one accountant
confirming a month's numbers are right.
**Primary action:** release the months that are clean; look properly at the ones that aren't.

**The stated risk is the design brief.** FEAT-054 and JTBD-09 both say it plainly: *at 200
societies a one-at-a-time gate becomes the month-end bottleneck.* A queue that treats all 200
identically guarantees either a rubber stamp or a missed window. So this screen's whole job is
**triage** — surface the handful that need a human, make the rest a single confident action.

### Triage rule

A month is **routine** when all of: every circuit in band, no basis change from last month, total
within 10% of the society's trailing 3-month mean, no open dispute, coverage ≥ 28 days. Anything
else is **needs review**, and the row states which condition failed.

Routine months are bulk-releasable. Needs-review months are not, ever — no bulk action reaches
them, which is the structural guarantee that the gate stays real.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-082 | month closed | Period |
| Sidebar → Release queue | direct | Open period |
| Email digest | "12 months awaiting release" | Period |
| SCR-091 | released with month | That society highlighted |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Period, days left in window | | CMP-02 | Same counter as SCR-082 |
| KPI strip | Routine / Needs review / Released / Total value | CMP-03 | | Routine count is the one that should be large |
| Section 1 | **Needs review** | CMP-01 | | Always first, always expanded, never collapsible |
| Row | Society, why flagged, total, delta vs trailing mean | | | The *reason* is a column, not a tooltip |
| Section 2 | **Routine** | CMP-01 with bulk-select | | Collapsed by default with a count |
| Detail drawer | Per-circuit figures + provenance | CMP-09 | | Opens without leaving the queue |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Release | per row | PER-08 | Releases to the society; overdue clock starts 2 days later (FLOW-10 step 10) | modal for needs-review; none for routine | Row → released, society notified | Failure names the society and leaves it queued |
| Release all routine | section header | PER-08 | Releases every routine row | modal with count and total value | Toast | Partial failure lists the survivors |
| Query | per row | PER-08 | Sends back to ops with a required note | note required | Row → `queried`, ops notified | — |
| Open figures | row click | PER-08 | Drawer with the per-circuit breakdown and provenance | — | — | — |
| Export | header | PER-08 | CSV for their own records | none | Download | — |

**Deliberately absent:** the accountant cannot edit a figure. They release or they query. Editing
belongs to ops, upstream, and would break INV-02's provenance chain.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton, both sections | — |
| Empty — first use | nothing calculated | "Nothing to release yet. Months appear here once ops closes them." | Go to readiness |
| Empty — filtered | filter excludes all | Names the filter, offers clear | Clear |
| Empty — all released | done | "All 40 societies released for July 2026." + the date and the total | View portfolio |
| Partial / stale | ops still closing | `info` banner: "Ops is still closing July. More will appear." | Wait |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | ops role, not PER-08 | Read-only view of the queue, release hidden | View |
| Success | released | Toast + rows move to released | — |

**Exits:** SCR-091, SCR-090, SCR-093, SCR-082.
**Live update:** polls every 120s while ops is still closing the period.
**Responsive:** desk-first. This is a desk task; below 768px it stacks but is not optimised for it.
**Offline:** blocked.
**Copy:** flag reasons in the accountant's language — "Total is 34% above the 3-month average",
"Lift lobby switched to metered billing", not "anomaly".
**Open questions:** ASSUM-21 (a distinct accountant persona exists and is a real gate rather than a
formality) is load-bearing. If PER-08 turns out to be the same person as PER-01, this screen is
ceremony and should be reconsidered rather than built.

---

## SCR-093 — Invoice upload & reconciliation

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-053, FEAT-101 · **Flows:** FLOW-10 (step 8)

**Purpose:** bring the formal tax invoice back from Zoho into the app and **prove it agrees with
what the system calculated**.
**Primary action:** upload the invoice and clear the reconciliation.

**FEAT-101 exists because Phase 4 found this missing (DF-07).** FLOW-10 step 8 is explicit: *the
uploaded invoice's total disagreeing with the computed total is the check that matters most here,
and nothing currently performs it.* The invoice leaves the product for Zoho and comes back; that
round trip is where a wrong number enters the record with full authority.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-092 | released month | Society + period + expected total |
| SCR-082 | row menu | Society + period |
| SCR-280 documents | upload flow, invoice type | Society + period |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, period, expected total | HL-01 output | ₹ | Shown **before** upload, so the reconciliation isn't circular |
| Body | Dropzone | CMP-07 | PDF | Existing AI-extraction flow |
| Body | Extracted fields | Gemini | editable | Invoice number, issue date, due date, total, GST |
| Body | **Reconciliation panel** | computed vs extracted | | The reason this screen exists |
| Body | Document preview | CMP-08 | | Side by side with the extracted fields |

### Reconciliation

| Comparison | Tolerance | On mismatch |
|---|---|---|
| Invoice total vs computed fee | exact to the rupee | **Blocks save.** Names both figures and the difference |
| Period on invoice vs selected period | exact | Blocks save |
| Society on invoice vs selected society | matched name | Blocks save |
| Due date vs contract terms | must match the contract's payment terms | Warns, does not block — terms get varied by agreement |
| GST | recomputed from the total | Warns |

A blocked mismatch is resolvable two ways, both recorded: correct the invoice in Zoho and
re-upload, or record an explicit **accepted variance** with a reason and an approver. It is never
silently overridable, because the invoice is what the society pays against and INV-03 makes it
immutable once accepted.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Upload | dropzone | ops | Stores to S3 under the naming convention, extracts fields | none | Fields revealed after extraction | Gemini down → fields revealed empty for manual entry, flow not blocked |
| Save & link | button | ops | Links the invoice to the month's calculation; **immutable thereafter** (INV-03) | modal when any variance was accepted | Toast → society can see it | Reconciliation failure blocks with the specific figures |
| Accept variance | on a blocked mismatch | ops lead | Records reason + approver, unblocks save | modal requiring a reason | Audit row written | — |
| Replace | on a saved invoice | ops lead | Voids and creates v2 — never edits (INV-03) | modal explaining v2 | Both versions on record | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton with the expected total already shown | — |
| Empty — first use | no invoice yet | Dropzone + "Expected total ₹48,210 for July 2026" | Upload |
| Empty — filtered | n/a | — | — |
| Partial / stale | calculation changed after upload | `warn`: "The calculation changed after this invoice was uploaded. Re-reconcile." | Re-reconcile |
| Error — network | upload fails | Retry; raw file retained | Retry |
| Error — permission | not ops | SCR-221 | — |
| Error — extraction | Gemini unavailable | Banner + manual entry; reconciliation still runs on the typed figures | Enter manually |
| Success | saved | Toast; invoice visible to the society | View society |

**Exits:** SCR-090, SCR-260, SCR-120, SCR-280.
**Live update:** none.
**Responsive:** desk-first; the side-by-side preview stacks below 1024px.
**Offline:** blocked.
**Copy:** mismatch — "This invoice says ₹52,400. The calculation says ₹48,210, a difference of
₹4,190. Fix the invoice in Zoho, or record why the difference is correct."

---

## SCR-110 — Deviation chart & initial findings

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-055, FEAT-056 · **Flows:** FLOW-11 (steps 1–2)

**Purpose:** let one person look at one circuit's month and tell, from the shape of it, what kind
of problem this is.
**Primary action:** resolve it from the data, or assign an inspector.

**Chart-first, and the chart is raw daily.** FLOW-11 step 1 is unusually specific about why: *is
this one bad day, a step change, or a gradual drift?* Those are three different problems with three
different responses, and **a monthly aggregate makes the question unanswerable.** This is the one
screen in the product where the visualisation is the feature rather than a presentation of it.

Runs **per circuit** (CON-11). A society with four typed circuits can have four independent reviews
open in one month.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-090 | "Open deviation" on an out-of-band circuit | Society + circuit + period |
| SCR-081 | anomaly escalated to a deviation | Society + circuit + period |
| SCR-240 | task card | The open deviation |
| Email | deviation notification | Deep link to the review |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, circuit, period, streak | | CMP-02 | **"Second consecutive month"** must be unmissable — it is what flips the fee line (CON-01c) |
| Chart | Raw daily readings vs benchmark, band, exclusions | `../05a-theme-system.md` §3.10 | | The screen's centre of gravity |
| Chart overlay | Inspection visits, ticket dates, rescales | markers on the time axis | | So a step change can be lined up against an event |
| Context | Coverage for the month | | `28 / 31` | |
| Context | Ingest anomalies for this circuit | | list | Resolved and unresolved |
| Context | Recent inspections | CMP-10 | | |
| Context | Recent tickets | CMP-10 | | |
| Context | **Sibling circuits' standing** | CMP-09 compact | | If all five circuits dropped together it is not a lighting fault — it is a metering or tariff event |
| Context | Light-count history | FEAT-041 | | A rescale mid-month explains a step change instantly |
| Findings | Initial note | free text | | Required before assigning |

**Why the sibling panel matters:** it is the cheapest diagnostic on the screen. One circuit down is
a circuit problem; all of them down together is a society-level or data-level event, and that
distinction changes who gets dispatched.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Resolve from desk | button | ops | Closes with a cause; → SCR-112 to record it | reason required | → SCR-112 | — |
| Assign inspector | button | ops | Creates a visit via FLOW-X1 | modal: who, when, what to check | → SCR-170, deviation → `investigating` | — |
| Exclude days | select on chart | ops | Marks days excluded; recalculates | reason required | Chart and variance update | Coverage below 20 → circuit flips to unusable (CON-12) |
| Request re-upload | button | ops | Sends the circuit back to SCR-080 | none | Deviation → `awaiting data` | — |
| Escalate | button | ops lead | → SCR-113 | reason required | Management notified | — |

**The balance FLOW-11 step 2 names:** *assigning everything defeats the chart; resolving everything
from the desk misses real physical faults.* Neither action is the default and neither is styled as
primary — the screen presents the evidence and makes both equally reachable.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton chart with the axes drawn | — |
| Empty — first use | no deviations ever | Not reachable — this screen exists only for an open deviation | — |
| Empty — insufficient data | coverage < 20 days | Chart drawn with the gap explicit; `warn`: "18 of 31 days. Too little to diagnose a trend." | Request re-upload |
| Partial / stale | readings still importing | `info` banner naming what is still coming | Wait |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | resolved or assigned | Status chip changes; audit row written | → SCR-112 / SCR-170 |

**Exits:** SCR-112, SCR-113, SCR-170, SCR-090, SCR-081, SCR-251.
**Live update:** none.
**Responsive:** desk-first, and honestly so. The chart is the screen; below 1024px the context
panels stack beneath it, and below 768px the page states that the plot needs a wider screen rather
than rendering a 360px chart nobody can diagnose from.
**Offline:** blocked.
**Accessibility:** the chart carries a full `aria-label` describing shape and finding, and every
figure on it is also available as a table via a "Show as table" toggle — per the system's rule that
a chart is the fast path, never the only path.
**Copy:** streak — "Second consecutive month outside the band. One more and this circuit moves to
metered billing." Never let that arrive as a surprise the following month.

---

## SCR-112 — Root-cause & decision record

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-057, FEAT-050 · **Flows:** FLOW-11 (steps 4, 5a)

**Purpose:** record which side of the guarantee this deviation falls on, because that classification
— not a fixable/not-fixable flag — is what moves the bill.
**Primary action:** classify the root cause and record the decision.

**CON-01b's list is the control.** FLOW-11 step 4 is explicit that a binary flag would be
insufficient: the *classification* drives billing. FirsThing-attributable and excluded/society-caused
move the money in opposite directions, and this screen is where that is chosen, by a named person,
at a recorded time (INV-03).

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-110 | "Resolve from desk" or a returning investigation | Deviation + circuit + period |
| SCR-111 | inspector submits findings | Deviation, findings attached |
| SCR-113 | management sends back to ops | Deviation + management's note |
| SCR-240 | task card "Deviation awaiting decision" | The open deviation |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Circuit, period, streak | | CMP-02 | |
| Summary | The deviation in figures | | | Benchmark, measured, variance, days excluded |
| Body | Evidence | chart thumbnail, inspector findings, photos | CMP-10, CMP-15 | Read-only; diagnosis happened on SCR-110/111 |
| Body | **Cause classification** | CON-01b list | radio group, two labelled groups | FirsThing-attributable vs excluded/society-caused, visually separated |
| Body | Sub-cause | dependent on group | select | e.g. driver failure, fitting removed by society, tariff change, metering fault |
| Body | Narrative | free text | required | What actually happened, in a sentence someone will read a year from now |
| Body | **Billing effect preview** | computed from the classification | | States the consequence *before* the decision is committed |
| Footer | CMP-12 approval bar | | | Owner and timestamp recorded |

### The billing effect must be shown, not implied

Selecting a classification changes what the society pays. The screen states the consequence in
plain terms as soon as a classification is picked, before it is saved:

- *Excluded / society-caused* → "Bill unchanged. The society will be told why."
- *FirsThing-attributable, corrected this month* → "Bill unchanged. No adjustment applies."
- *FirsThing-attributable, uncorrected, first month* → "Bill unchanged this month. If next month is
  also outside the band, this circuit moves to metered billing."
- *FirsThing-attributable, uncorrected, second consecutive month* → **"This circuit qualifies to
  move to actual metered consumption. That needs management sign-off before it applies — saving this
  sends it to them."** The flip is *proposed* here, never applied here (CON-42).

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Save decision | CMP-12 | ops | Records cause, owner, timestamp; applies the billing effect **except a second-month flip, which is proposed to management** | modal restating the effect | Deviation → `closed`, or `awaiting-sign-off` where a flip was proposed; audit row | — |
| Escalate instead | CMP-12 | ops | → SCR-113 without classifying | reason required | Management notified | — |
| Reopen | on a closed record | ops lead | Reopens with a required reason | modal | Audit row; billing effect reverted pending a new decision | Blocked once the month's invoice is issued |
| Notify society | auto on save | system | Sends the explanation (OQ-09, CON-39) | — | Logged on SCR-180 | Bounce → ops alerted |

**Barred:** applying an adjustment without a completed review (FEAT-050 AC-4). The adjustment is a
consequence of saving this record, never a control someone can reach directly.

**Silence is a failure mode.** FLOW-11 step 5a: *silence on an excluded-cause month reads to the
society as an unexplained bad month.* Notification on save is automatic, not a checkbox.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | n/a — always has a deviation | — | — |
| Empty — awaiting investigation | inspector assigned, no findings yet | "Waiting on the site visit on 19 Aug." Classification disabled, with that reason | Chase / escalate |
| Partial / stale | readings changed since the review opened | `warn`: "Readings changed. Re-check the chart before deciding." | → SCR-110 |
| Error — network | save fails | Inline; the form keeps everything | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | saved | Effect banner + audit row + society notified | → SCR-090 |

**Exits:** SCR-110, SCR-113, SCR-090, SCR-234 (audit), SCR-151.
**Live update:** none.
**Responsive:** desk-first.
**Offline:** blocked.
**CON-42 — decided 2026-08-12 (user's call): a second-month flip needs management sign-off.**
Saving a second-consecutive-breach classification does not change the fee line; it raises a
sign-off request to SCR-113. Ops' classification remains the judgement of *cause*; management owns
the judgement of *consequence*.

**The failure mode that choice creates, and how it is handled.** A sign-off that does not arrive
before the month closes cannot be allowed to stall billing inside a 17-day window. So: **the month
bills at the unchanged fixed rate, and the streak carries forward.** Never bill a society *more*
without a decision — the safe direction is the society's. The pending sign-off stays open and, if
approved later, applies from the *next* month rather than retrospectively, because an issued
invoice is immutable (INV-03). SCR-082 shows such a society as `Ready` with a `sign-off pending`
note, so the month is not blocked but the outstanding decision is visible.

---

## SCR-113 — Management escalation & benchmark adjustment

**Surface:** SUR-01 · **Type:** page · **Personas:** management
**Features:** FEAT-058 · **Flows:** FLOW-11 (steps 5b, 6)

**Purpose:** management's decision point on the two things ops cannot decide alone — a mid-term
benchmark change, and (since CON-42) a circuit's flip to actual-metered billing.
**Primary action:** approve, reject, or send back.

**Two case types arrive here**, and the screen handles both because they share the same evidence,
the same reviewer and the same rarity:

| Case | Raised by | Decision |
|---|---|---|
| **Benchmark adjustment** | ops escalation, FLOW-11 step 5b | Direction-dependent — see CON-37 below |
| **Second-month flip to actual-metered** | SCR-112, on saving a second consecutive FirsThing-attributable breach (CON-42) | Approve → the fee line flips from the next month. Reject → the circuit stays fixed and the streak resets |

**Seen rarely, so it carries its own context.** FLOW-11's own note: management sees this path
infrequently, which means the screen cannot assume familiarity. It restates the case from the
beginning rather than linking away to it.

### CON-37 is the structural rule

The decision is **direction-dependent**, and the screen enforces it rather than trusting care:

| Direction | Path |
|---|---|
| **Favours the society** (benchmark lowered, society pays less) | Applies immediately on approval. Society notified. No amendment needed. |
| **Favours FirsThing** (benchmark raised, society pays more) | **Cannot be applied here.** Requires a signed amendment first (FLOW-17, FEAT-064). This screen creates the amendment request and stops. |

Applying a FirsThing-favouring change without the amendment would be a unilateral repricing of a
signed contract. The screen makes that structurally impossible: on that branch the apply action
does not exist.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-110 | ops escalates | Deviation + circuit + reason |
| SCR-112 | "Escalate instead" of classifying | Deviation + evidence |
| Email | escalation notification to management | Deep link to the case |

Management arrives here rarely and often cold, frequently from an email rather than from inside the
product — which is why the case is restated in full below rather than linked to.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Case type | | CMP-02 | `benchmark adjustment` or `basis flip` — they read very differently |
| Header | Society, circuit, current benchmark, streak | | | |
| Case | Full history restated | CMP-10 | | Deviation, investigation, findings, ops' recommendation |
| Case | Post-investigation readings | chart | | CON-31 step 5b — the evidence the decision rests on |
| Case | Contract terms | | | Current benchmark, band, revenue share, remaining term |
| Case | Financial impact | computed | ₹/month and over the remaining term | Both directions modelled |
| Decision | Proposed new benchmark | number input | | Direction computed and stated live as it is typed |
| Decision | Direction banner | computed | CMP-02 | Changes the available actions in place |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Approve — favours society | button, society-favouring branch only | management | Applies immediately from the stated month; society notified | modal with the figure and effective month | Benchmark updated; audit row | — |
| Raise amendment — favours FirsThing | button, FirsThing-favouring branch only | management | Creates an amendment request; **no benchmark change** | modal explaining nothing changes until signed | → SCR-160 | — |
| Approve flip | button, flip cases only | management | That circuit's fee line moves to actual-metered **from the next month** — never retrospectively, since an issued invoice is immutable (INV-03) | modal stating the effective month and the estimated change | Circuit basis updated; society notified | Blocked if the month's invoice is already issued, stating the effective month instead |
| Reject | button | management | Closes with a reason; benchmark and basis unchanged | reason required | → SCR-112; streak resets | — |
| Send back to ops | button | management | Returns for more evidence | note required | Ops notified | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | no escalations | Not reachable except from an escalation or a flip proposal | — |
| Empty — decision overtaken | month closed before sign-off | "July closed at the fixed rate while this was pending. Approving now applies from August." | Approve / reject |
| Empty — filtered | n/a | — | — |
| Partial / stale | post-investigation readings incomplete | `warn`: "Only 9 days of readings since the fix. A benchmark decision on this is premature." Approve disabled with that reason | Wait |
| Error — network | save fails | Inline retry | Retry |
| Error — permission | not management | SCR-221 | — |
| Success | decided | Banner stating what happens next and when | → SCR-160 / SCR-090 |

**Exits:** SCR-160, SCR-112, SCR-090, SCR-053.
**Live update:** none.
**Responsive:** desk-first.
**Offline:** blocked.
**Copy:** direction banner — "This lowers what Settlement Nexus pays. You can apply it now." /
"This raises what Settlement Nexus pays. It needs a signed amendment before it can take effect."

---

## SCR-120 — Arrears board (with dispute flags)

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-087, FEAT-102 · **Flows:** FLOW-12 (steps 2, 4–8)

**Purpose:** track who owes what, how close each is to suspension, and who has an open dispute.
**Primary action:** record a payment, or grant an extension.

**The unusual property, and the one the screen must make legible:** CON-13 — *manual intervention
is only ever a brake, never an accelerator.* Nobody can suspend a society from this screen.
Suspension fires automatically; a person can only slow it down.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-240 ops home | "Overdue" task card | Filtered to overdue |
| Sidebar → Arrears | direct | All unpaid |
| SCR-151 society 360 | "See arrears" | Filtered to that society |
| SCR-121 | society requests an extension | Filtered to extension-requested |
| Email digest | weekly arrears summary | Filtered to overdue |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Total outstanding, count overdue | | ₹ | |
| Header | **Payment data freshness** | CMP-17 | `Confirmed today, 09:15` | Load-bearing — see below |
| Filters | All, Overdue, Warning, Suspended, Disputed, Extension requested | CMP-04 | | |
| Table | One row per unpaid invoice | CMP-01, risk accent by proximity to suspension | | |
| Row | Society, invoice, amount, days overdue, countdown, extensions used, status | | | |
| Row | Countdown | days to suspension | CMP-02, escalating tone | A frozen countdown is shown explicitly, with its reason |
| Row | Dispute flag | FEAT-102 | CMP-02 `info` | Visible but **does not stop the clock** (CON-41) |
| Detail | Payment and communication history | CMP-10 | | |

### The three rules the board has to encode

**1 — Suspension only fires against same-day-confirmed payment data (CON-13).** Payment status
comes from Zoho manually, so it can be stale, and firing on stale data would suspend a society that
has already paid. If the freshness pill is not same-day, **countdowns freeze** and the board says so
at the top: *"Payment data was last confirmed on 10 Aug. Suspensions are paused until it's
refreshed."* This is the most important state on the screen, so it is a header banner, not a column.

**2 — A bounced warning email must not advance the countdown (FEAT-091 AC-5).** A society that was
never actually told cannot be suspended for not responding. A bounced notification freezes that
row's countdown and raises a task for ops to reach them another way. The row states *"Warning email
bounced 8 Aug — countdown paused"* rather than silently continuing.

**3 — A dispute does not pause the arrears clock (CON-41, the user's explicit call).** The flag is
visible so nobody is surprised, and the residual risk is accepted as ASSUM-23: a dispute that
outlives the window is handled by ops granting an extension, not by the system pausing. The board
therefore shows disputed rows with their countdown still running — which is exactly the situation
extensions exist for.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Record payment | per row | ops | Marks paid, stops the countdown, restores if suspended | modal: amount, date, reference | Row → paid; service restored | — |
| Grant extension | per row | ops | Up to **5 days per request** (FLOW-12 step 4) | modal showing days used and remaining | Countdown extended; society notified | Blocked past the cap, stating the cap |
| Refresh payment data | header | ops | Records that Zoho was checked today; unfreezes countdowns | modal confirming they actually checked | Freshness pill updates | — |
| Open society | row click | ops | → SCR-151 | — | — | — |
| Log a dispute | per row | ops | Creates a dispute record (FEAT-102) | modal: what is disputed | Row flagged; clock continues | — |
| Restore | on a suspended row | ops | Single state change; no backfill needed | modal | Field servicing resumes | — |

**Absent by design:** there is no "suspend now". CON-13 permits no accelerator, and offering the
button would invite exactly the manual suspension the rule forbids.

### What suspension actually does

Stated on the screen, because it is narrower than people assume (CON-13, resolved at the audit):
**field servicing only halts** — routine inspections, ticket dispatch, spare replacement. Meter
ingest, monthly calculation, invoicing and portal access all continue. The suspended row says so in
one line, so nobody believes the society has gone dark.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | nothing overdue ever | "Nothing outstanding. Invoices appear here two days after release if they're unpaid." | — |
| Empty — filtered | filter excludes all | Names the filter, offers clear | Clear |
| Empty — all paid | cleared | "Everything's paid. ₹0 outstanding across 40 societies." | — |
| Partial / stale | **payment data not same-day** | `warn` header banner; every countdown shown frozen with the reason | Refresh payment data |
| Error — network | load fails | Inline retry | Retry |
| Error — permission | not ops | SCR-221 | — |
| Success | payment recorded | Toast; row clears; service restored if it was suspended | — |

**Exits:** SCR-151, SCR-122, SCR-260, SCR-121, SCR-180.
**Live update:** countdowns recompute on load and every 5 minutes; the freshness pill is checked on
every load.
**Responsive:** desk-first; below 768px rows become cards keeping society, amount, countdown and
status.
**Offline:** blocked.
**Copy:** frozen countdown — "Paused: payment data is from 10 Aug." Extension — "Extended to 24 Aug.
5 of 10 days used." Suspension — "Field servicing paused. Readings, billing and portal access
continue."
**Open questions:** ASSUM-23 — that disputes resolve inside the 17-day window. If they routinely do
not, the extension mechanism becomes load-bearing in a way nobody chose, and CON-41 should be
revisited.

---

## SCR-084 — Ingest health & meter status

**Surface:** SUR-01 · **Type:** page · **Personas:** PER-01
**Features:** FEAT-104, FEAT-105, FEAT-106 · **Flows:** FLOW-09 (steps 0, 0a)

**Purpose:** know that readings are actually arriving — and when they are not, know *which of three
different problems* it is.
**Primary action:** resolve an alert, or refresh a meter now.

**This screen exists because ASSUM-16 had no surface.** The vendor export shape and the meter fleet
are load-bearing for the entire monthly loop, and until CON-43 nothing in the product noticed a
meter going dark. The 17-day window is far too late to find out.

### The three-way distinction is the whole design

The user's requirement was explicit that these stay separable, and they must, because each has a
different owner and a different next action:

| Cause | What it means | Owner | Action offered |
|---|---|---|---|
| **Vendor API failing** | The integration is erroring, timing out, or rejecting auth | Integration / engineering | Retry, view the error, fall back to the CSV path |
| **Meter offline** | This meter has stopped reporting while others continue | Field service | Raise a visit (FLOW-X1) |
| **Period missing** | The meter reports normally but days are absent from its history | Data quality | Refresh, or upload the CSV for that period |

Collapsing these into one "ingest failed" alert would route every case to the wrong person, which is
why the screen groups by cause before it groups by society.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-240 ops home | "Ingest alerts" card | Filtered to unresolved |
| SCR-082 readiness | "Missing readings" on a row | Filtered to that society |
| Sidebar → Ingest health | direct | Unresolved, all causes |
| SCR-110 | investigating a deviation | Filtered to that circuit |
| Email | ingest alert notification | Deep link to the alert |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Fleet summary | | `812 of 840 meters reporting` | The one-second answer |
| Header | **Last successful fetch** | CMP-17 | `14:05 today` | If this is stale, everything below is suspect |
| KPI strip | API status / Meters offline / Period gaps / Alerts unresolved | CMP-03 | | One tile per cause, plus the backlog |
| Section | **Vendor API** | | CMP-13-style banner | Present only when failing; always first when present |
| Section | Offline meters | CMP-01 | | Society, circuit, last seen, days dark |
| Section | Period gaps | CMP-01 | | Society, circuit, the exact missing dates |
| Section | Conflicts | CMP-01 | | Where CSV superseded API values (CON-43) |
| Table | Meter fleet | CMP-01, filterable | | Every active meter, last seen, health, source of last reading |
| Row | Source | `api` / `csv` | CMP-02 | Which path last supplied this circuit |

**Severity rises with the close window.** A gap on day 2 of the month is informational; the same gap
on day 12 is blocking, because it now threatens the 17-day window. The tone escalates rather than
the alert being re-raised, so the count stays honest.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Refresh meter | per row | **`fetch_readings`** | Fetches that meter immediately (FEAT-105) | none | Row updates with a fresh timestamp | Names the specific failure — auth, timeout, meter not found |
| Refresh selected | bulk bar | `fetch_readings` | Fetches the selected set | modal with the count | Partial success reported per meter; **never rolled back** | The 3 that failed are named; the 37 that worked are kept |
| Resolve alert | per alert | ops | Closes it with a recorded reason | reason required | Alert closed; audit row | — |
| Snooze alert | per alert | ops | Suppresses until a stated date | reason + date required | Reappears on that date | Not available on a blocking-severity alert |
| Raise field visit | on an offline meter | ops | Creates a visit (FLOW-X1) | modal | → SCR-170 | — |
| Upload for this period | on a gap | ops | → SCR-080, pre-filtered | — | — | — |

**`fetch_readings` is a named permission, not a role** — the user's explicit requirement that not
every backend user can trigger a fetch. It follows the existing `AdminPermission` pattern already
used for `manage_admins`/`manage_users`. The UI hiding the action is a courtesy; the server action's
own check is the boundary, exactly as `requireAdminPermission()` already works.

**Refresh is rate-limited** per user and per meter. That is a functional requirement, not a nicety:
unrestricted refreshing during a month-close could exhaust the vendor's rate limit and break the
scheduled fetch for every society.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton KPI strip + fleet table | — |
| Empty — first use | no meters commissioned | "No meters yet. They appear here once a circuit is commissioned." | Go to commissioning |
| Empty — all healthy | nothing wrong | "All 840 meters reporting. Last fetch 14:05 today." — the caught-up state, not a blank page | View fleet |
| Empty — filtered | filter excludes all | Names the filter, offers clear | Clear |
| Partial / stale | **fetch itself is stale** | `warn` header: "No successful fetch since 09:00 yesterday. Everything below may be out of date." | Retry / check API |
| Error — network | screen load fails | Inline retry, keeps last data | Retry |
| Error — permission | ops without `fetch_readings` | Full visibility; refresh actions not rendered | View, resolve |
| Error — vendor API down | API unreachable | Dedicated banner with the last success time and the error, plus "the CSV path still works" | Fall back to upload |
| Success | alert resolved | Toast; counts update | — |

**Exits:** SCR-080, SCR-082, SCR-170, SCR-251, SCR-110.
**Live update:** polls every 5 minutes; the fetch-freshness pill is checked on every load.
**Responsive:** desk-first; below 768px sections stack and the fleet table becomes cards keeping
society, circuit, last seen and health.
**Offline:** blocked.
**Performance:** the fleet view must handle 800+ meters — paginate at 50, aggregate the health
counts in one query.
**Copy:** offline meter — "Last reported 6 Aug, 11 days ago." API failure — "The vendor API has
failed 3 times since 09:00. Readings aren't arriving. You can still upload the monthly CSV."
**Open questions / assumptions:** **ASSUM-24** — that the vendor exposes a usable API at all. The
offline-meter and period-gap halves of this screen work on the CSV path alone and do **not** depend
on it; only the API-status section and the refresh actions do. That split is deliberate, so the
screen degrades to something useful rather than nothing if the API turns out not to exist.

---

## Coverage
**Rendered mockups:** https://claude.ai/code/artifact/cec984c8-6007-4411-996f-3dcd3280e604 — every screen below, each with its full state set.

| Screen | Spec | Mockup | Blueprint |
|---|---|---|---|
| SCR-080 CSV ingest | ✅ | ✅ | — |
| SCR-084 vendor API ingest | ✅ | ✅ | — |
| SCR-081 anomaly & coverage review | ✅ | ✅ | — |
| SCR-082 benchmark commissioning | ✅ | ✅ | — |
| SCR-090 per-circuit compliance | ✅ | ✅ | — |
| SCR-091 mixed-basis month | ✅ | ✅ | — |
| SCR-092 deviation review | ✅ | ✅ | — |
| SCR-093 invoice build | ✅ | ✅ | — |
| SCR-110 exception queue | ✅ | ✅ | — |
| SCR-112 month-close board | ✅ | ✅ | — |
| SCR-113 meter fleet health | ✅ | ✅ | — |
| SCR-120 arrears & suspension | ✅ | ✅ | — |

**All 12 priority-1 screens in this group are specified and mocked up.**
