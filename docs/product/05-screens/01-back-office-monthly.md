# SUR-01 back office — monthly loop
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft — in progress
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

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Upload files | drop / browse | ops | **Stores the raw file first**, before any interpretation (CON-30) | none | Per-file row appears as `Reading` | Upload fails → row shows retry; raw file not lost |
| Confirm mapping | Confirm on a file | ops | Persists normalised hourly rows aggregated to daily (FEAT-044); raw retained alongside | none | Row → `Validated` | Mapping rejected by validation → inline error naming the column |
| Change circuit | circuit dropdown | ops | Re-attaches the file | required if AI-detected | Row re-validates | — |
| Commit all | header button | ops | Commits every `Ready` file in one batch | modal listing counts | Toast; redirect to SCR-081 if any anomalies | Partial failure commits the good ones and lists the rest |
| Quarantine | Skip on a file | ops | Moves it to SCR-083 with a reason | none | Row removed | — |

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
| Success | commit | Toast + progress advances; anomalies route to SCR-081 | Go to review |

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
fine." Commit — "Commit 12 files?" / "12 circuits validated for July 2026."
**Open questions:** ASSUM-16 (vendor export shape is stable) is load-bearing here — if the vendor
changes their CSV, FLOW-09 step 1 has *no system visibility at all*. Worth a monitoring feature.

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

*Not yet specified.*

## SCR-092 — Accountant release queue

*Not yet specified.*

## SCR-093 — Invoice upload & reconciliation

*Not yet specified.*

## SCR-110 — Deviation chart & initial findings

*Not yet specified. No longer blocked — the chart system landed 2026-08-12
(`../05a-theme-system.md` §3.10) and this screen's chart is the one rendered there.*

## SCR-112 — Root-cause & decision record

*Not yet specified.*

## SCR-113 — Management escalation & benchmark adjustment

*Not yet specified.*

## SCR-120 — Arrears board (with dispute flags)

*Not yet specified.*
