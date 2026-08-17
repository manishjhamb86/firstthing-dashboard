# SONOFF meter ingest → pre-install baseline → post-install savings → daily monitoring
**Product:** FirsThing Platform · **Status:** Built & verified 2026-08-17 — see CON-45 in `../product/00-intake.md` for the decision record
**Last updated:** 2026-08-17 · **Owner:** this branch

> **Outcome.** All six decisions resolved by the user the same day (D1 range-not-month — implemented
> as the system-derived window off the circuit's own dates; D2 replace day-level ±5% — implemented
> as the user's refined spec: theoretical-load bands pre-install, savings bands after, nothing
> blocking; D3 partial days kept-shown-excluded; D4 one store — `MeterReading`, with legacy
> window-flow circuits keeping their `CommissioningReading` path untouched; D5 signature-before-AI;
> D6 zero-run collapse — subsumed by the out-of-window fold and the theoretical comparison, with
> zero days still filing blocking anomalies on monitoring commits per INV-09). Plus three
> refinements from mid-build messages: one shared colour system everywhere a reading shows, a
> "suspect" band above CON-20's 80%, and exclusion as one persistent `excludedAt` mechanism usable
> any time before a report. Verified end to end against the real 4,536-row export: 25 + 29 browser
> checks, every figure asserted against the database.

The feature, as specified by the user 2026-08-17: upload a smart-meter CSV **under a specific
society's specific circuit**, have AI read its shape, convert it to our canonical daily readings,
**show every reading on screen for accept/reject before anything is saved**, and on acceptance write
it against that circuit — then use that one store to produce (1) the pre-installation consumption
report, (2) the post-installation consumption + savings report, and (3) daily monitoring of the same
circuit after full installation.

Scope now: **SONOFF only.** Two further manufacturer formats are named as later work and the design
must not have to change to admit them.

---

## 1. What already exists

This is not a greenfield feature. MS-04 and MS-07 built most of the machinery, and the plan below is
mostly **hardening and joining** rather than new construction.

| Piece | Where | State |
|---|---|---|
| Raw-file-first upload to S3 (`Ingest/` prefix), presigned PUT | `readings/uploads.ts`, `lib/ingest-keys.ts` | works |
| AI proposes a *mapping*, never a value | `lib/gemini.ts`, `lib/reading-ingest-ai.ts` | works |
| Deterministic normalisation, replayable from raw file + mapping | `lib/reading-normalize.ts` | works |
| Anomaly detection (4 detectors) | `lib/reading-anomaly.ts` | **wrong at day level — §2.2** |
| Coverage floor (CON-12, 20 days) + monthly figure | `lib/reading-coverage.ts` | works |
| Duplicate-period detect → replace/discard, supersession | `readings/actions.ts` `commitUpload` | works |
| Abandon path, raw retention, provenance | `readings/actions.ts` | works |
| Commissioning windows (pre/post-install, 5 valid days → benchmark) | `lib/monitoring-window.ts`, `commissioning-anomaly.ts` | works, but **separate store — §2.4** |
| Daily monitoring dashboard | `/admin/monitoring` | works, commissioning-scoped only |

Canonical stores today are **two**: `MeterReading` (billing ingest, AI pipeline) and
`CommissioningReading` (pre/post-install windows, hand-entered or a simple comma parser). The user's
feature description assumes **one** upload path feeding all three consumers.

---

## 2. What the real file proves

Measured against `History_2025.12.15-2026.06.22_UTC +5.5 1782110948545.csv` (115 KB, 4,536 data
rows, 190 days, 2025-12-15 → 2026-06-22), by replaying the existing pipeline's own logic.

### 2.1 The SONOFF shape

```
data,time,consumption/KWh          ← UTF-8 BOM before "data"; note "data", not "date"; "KWh"
2025-12-15,13:00-14:00,0
2025-12-15,23:00-24:00,0           ← hour 24 exists
2026-06-22,12:00-13:00,0.32
```

| Property | Value | Consequence |
|---|---|---|
| BOM | present (`EF BB BF`) | Harmless today (it sits on the header row, which is skipped) but it corrupts the column *name* the model sees, and would corrupt the first date cell in a headerless file. Strip it at read. |
| Delimiter / endings | `,` / LF | fine |
| Header | `data,time,consumption/KWh` | `data` is not `date` — the model must not be relied on to guess this; SONOFF is a known format and should be matched by signature (§3.1). |
| Time column | **a range**, `13:00-14:00` | `parseTimestamp`'s `^(\d{1,2}):(\d{2})` already takes the start of the range. Correct, but by accident — it needs a test that pins it. |
| Hour 24 | `23:00-24:00` present | Already handled (clamped to 23:59 in the same day). Needs a test. |
| Value | interval kWh, ≤2 dp, 0–1.66/hour | `valueKind: "interval"`, `valueUnit: "kWh"` |
| Rows/day | 24, **except first and last day** (11 and 13) | **Correctness bug — §2.3** |
| Zero rows | **3,860 of 4,536 (85%)**; 158 of 190 days total exactly 0 | The meter was live but the circuit was not energised until 2026-05-22. **§2.2** |
| Real data | 32 days, 2026-05-22 → 2026-06-22, 4.17–38.87 kWh/day, median 13.6 | This is the only usable range in the file |
| Span | **7 calendar months** | One-period-per-upload means 7 uploads of one file. **§2.5** |

### 2.2 The ±5% day-level band is wrong, and the real file proves it

`detectAnomalies` flags any day more than ±5% from the circuit's median day, as **blocking**.
Replayed per period:

| Period | Days | Blocking findings | Detail |
|---|---|---|---|
| 2025-12 | 17 | **17** | all zero-days |
| 2026-01 | 31 | **31** | all zero-days |
| 2026-05 | 31 | **40** | 21 zeros + **10 of 10 non-zero days out of band** + 9 day-over-day |
| 2026-06 | 22 | **32** | **19 of 22 non-zero days out of band** + 13 day-over-day |

A month of genuine, healthy readings from a working meter produces **32 blocking findings that must
each be resolved by hand before the month can bill**. 86% of real days violate the band. The band is
not detecting faults; it is detecting Tuesday.

The mistake is one the commissioning path already made and already fixed: the other session found
that post-install monitoring was "asking the wrong question" and split the rule — ±5% is a
*self-consistency* check, CON-20's 60–80% band is the *performance* check. The billing ingest never
got the same correction. **±5% is a monthly compliance question against the contracted benchmark
(CON-01a), not a daily plausibility question**, and applying it per day at ingest time is a category
error. Real common-area lighting varies with weekends, weather, and occupancy across a range of
roughly 3× — 4.17 to 38.87 kWh here.

### 2.3 A truncated export day is being counted as a full day

`2026-06-22` has 13 hourly rows and totals 6.13 kWh. Nothing compares `intervalCount` against what a
full day should hold, so the day enters the store as if it were a complete day at 6.13 kWh — which
then reads as **−50.5% against the median** and, worse, would drag down any average or baseline
computed over it. `2025-12-15` (11 rows) is the same. Every export whose range starts or ends
mid-day carries this, which is to say every export a human ever takes.

`MeterReading.intervalCount` already exists and is already populated. Nothing reads it.

### 2.4 The three consumers do not share a store

The user's flow is one upload feeding all three. Today:

- **Pre-install baseline** and **post-install savings** read `CommissioningReading`, written by hand
  one day at a time or by `parseCommissioningCsv` (a deliberately naive comma parser, no AI, no raw
  retention, no supersession).
- **Billing** reads `MeterReading`, written by the AI ingest.

So a SONOFF file uploaded through the real pipeline **cannot currently produce a pre-install
baseline**, and the commissioning CSV path cannot produce provenance. The two need joining, and this
is the single largest design decision in the plan (D4).

### 2.5 One file, seven months

`applyMapping` drops every row outside the operator's single selected period (INV-04: the period is
always an explicit selection). Correct as a rule, but it means this file must be uploaded 7 times,
answering the mapping questions each time, to land the data it contains. For a pre-install baseline
the operator wants a *date range*, not a month.

---

## 3. Target design

### 3.1 Format signature before AI (new)

A known vendor should not cost a model call. `lib/reading-formats.ts` holds a signature table:
SONOFF matches on the exact header `data,time,consumption/KWh` (BOM-stripped, case-insensitive) and
yields the full mapping with `vendor: "sonoff"`, `confidence: "exact"`. On a match the AI is skipped
entirely; the operator still sees and can override the mapping. On no match, the existing
`proposeMapping` path runs unchanged. This is how manufacturers 2 and 3 get added later — one table
entry each, no new code path.

### 3.2 Interval-count awareness (new)

`ReadingMapping` gains `expectedIntervalsPerDay` (24 for hourly, 1 for daily, 96 for 15-minute —
inferred from the mapping and confirmable). `applyMapping` marks each day `complete` or `partial`.
A partial day is **kept, shown, and excluded from every average and baseline by default**, with the
operator able to include it explicitly. New anomaly kind `partial_day`, non-blocking (it is a known,
explained fact, not a fault).

### 3.3 Day-level detection answers plausibility only (change)

Day-level, at ingest, blocking:
- `zero_reading` — a metered lighting circuit consuming nothing (kept as-is)
- `implausible_high` — > **3×** the circuit's median day
- `implausible_low` — < **⅓** of the median day (excluding partial days, which have their own kind)
- `negative` — already handled upstream in the cumulative branch

Day-level, non-blocking, informational: `partial_day`, `missing_days`, `zero_run` (a consecutive run
of zeros collapsed into **one** finding, not 31 — the 2026-01 case).

The ±5% band moves to where the contract puts it: the **monthly** figure against the circuit's
benchmark, which `monthly-calculation.ts` already computes. `ANOMALY_TOLERANCE_PCT` stays exported
and stays 5 for that purpose; the day-level detectors stop using it.

Replayed against the real file, this turns 2026-06's **32 blocking findings into 0**, with two
informational ones (8 missing days, 1 partial day) — while still catching every fault class the old
rule caught, because a dead meter reads as zero and a transcription error by 10× is outside 3×.

### 3.4 Row-level review before save (new — the user's core ask)

Today: a 10-row read-only preview, then commit. Required: **every day, on screen, individually
accept/reject, then save or abort.**

`review-table.tsx` renders one row per produced day: date, kWh, intervals (`24/24` or `13/24`), any
findings, and an include/exclude toggle defaulting to *include* except for partial days and
implausible values, which default to *exclude* with the reason shown. Header controls: include all,
exclude all findings, and a live footer — days included, total kWh, mean day, coverage against the
range. **Save** writes only included rows; **Abort** writes nothing and marks the file abandoned
with a reason (the existing `abandonUpload`). Excluded rows are recorded as excluded *with the
operator's reason*, not silently dropped — `MeterReading.excludedAt/excludedById/excludedReason`
already exist for exactly this.

### 3.5 Range ingest instead of single-period (change, D1)

The upload takes an explicit **date range** (defaulted from the file's own span but never adopted
silently — the operator confirms it, satisfying INV-04's "explicit selection"). Days land in their
own periods. `RawReadingFile` gains `rangeStart`/`rangeEnd` and `period` becomes nullable, retained
for the single-month path and for the duplicate check, which becomes per-day rather than per-period:
a day already committed for this circuit is surfaced in the review table as a conflict with both
values, and the operator chooses. `usedInCalculationId` still makes a released day untouchable
(INV-03).

### 3.6 One store, three consumers (D4)

`MeterReading` becomes the single canonical daily store; `ReadingSource` distinguishes how a day
arrived. The commissioning windows stop owning their own data and instead **read** `MeterReading`
filtered to the window, keeping `CommissioningReading` only for the hand-entered path already in
production (migrated, not deleted — MS-04's verified data exists). `monitoring-window.ts`'s
`getWindowProgress`, `averageOfFirstValid` and the benchmark computation take a reading list rather
than querying, which also makes them unit-testable without a database.

Consumers then are three reports over one store:
1. **Pre-install consumption report** — the range before `lightReplacementDate`, complete days only,
   5-valid-day baseline per CON-19, average kWh/day, the days behind it.
2. **Post-install consumption + savings report** — same over the post-install range, plus savings %
   against the in-force baseline (replayed through `effectiveBaselineAt`, so INV-07 rescales apply),
   checked against CON-20's 60–80%.
3. **Daily monitoring** — the running series after installation, each day against the in-force
   baseline, feeding `/admin/monitoring` and the monthly compliance check.

---

## 4. Work breakdown

| # | Change | Files | Test level |
|---|---|---|---|
| W1 | BOM strip; pin the time-range and hour-24 behaviour | `reading-normalize.ts` | unit |
| W2 | Format signature table + SONOFF entry; skip AI on exact match | `lib/reading-formats.ts` (new), `readings/actions.ts` | unit + integration |
| W3 | `expectedIntervalsPerDay`, complete/partial day marking | `reading-normalize.ts` | unit |
| W4 | Detector rework: plausibility not ±5%; zero-run collapse; `partial_day` | `reading-anomaly.ts` | unit |
| W5 | Range ingest: schema + normalise + duplicate-per-day | `schema.prisma`, `reading-normalize.ts`, `readings/actions.ts` | unit + integration |
| W6 | Row-level review table, save/abort, per-row exclusion reasons | `review-table.tsx` (new), `upload-panel.tsx`, `readings/actions.ts` | browser |
| W7 | Circuit-scoped upload entry (Society → service line → circuit) | `societies/[id]/circuits/[circuitId]/page.tsx` | browser |
| W8 | Windows read `MeterReading`; commissioning path preserved | `monitoring-window.ts`, `monitoring-actions.ts` | unit + browser |
| W9 | Pre-install report | `lib/consumption-report.ts` (new) + route | unit + browser |
| W10 | Post-install + savings report | same | unit + browser |
| W11 | Daily monitoring reads the unified store | `/admin/monitoring` | browser |
| W12 | Blueprint updates: FEAT-043/045/046 ACs, CON-30, a new constraint for the plausibility rule | `docs/product/03-features.md`, `00-intake.md`, `docs/backlog.yaml` | — |

## 5. End-to-end test, using the real file

One circuit, walked with the actual 115 KB SONOFF export, asserting against the database rather than
the screen:

1. Upload under Society → lighting → circuit. Raw file in S3 under `Ingest/`, row created, **before**
   any interpretation.
2. Signature match: mapping proposed with no AI call, `vendor: sonoff`, confidence exact.
3. Review table shows **190 days**; 158 zero-days collapsed to informational zero-runs; the two
   partial days default to excluded and say why; 0 blocking findings.
4. Reject a day by hand; accept the rest; save. Assert: 188 included, 2 excluded **with reasons**,
   the rejected day excluded with the operator's own reason, `intervalCount` stored.
5. Abort path on a second upload: nothing written, file `abandoned` with a reason.
6. Re-upload the same file: every day flagged as a conflict, both values shown, neither applied until
   chosen; a day already used in a released calculation is refused outright (INV-03).
7. Pre-install report over 2026-05-22 → 2026-05-31: baseline from the first 5 complete valid days,
   asserted to the number by hand.
8. Post-install report: savings % against the in-force baseline, CON-20 band checked, rescale
   applied if one exists.
9. Daily monitoring: the series renders, today's variance against the in-force baseline is correct.
10. Permission gates driven through paths the client cannot pre-block (revoke behind the open form),
    per this repo's standing rule that a disabled button proves nothing about the server.

Plus `tsc`/`lint`/`build`/`vitest` clean, and fixtures removed via `psql` afterward with a count
query, as every prior verification pass in this repo has done.

---

## 6. Decisions needed before building

| # | Decision | Recommendation |
|---|---|---|
| **D1** | One upload = one month, or a date range? | **Range.** A 190-day export is one operator action, not seven. INV-04 is satisfied by confirming the range explicitly. |
| **D2** | Day-level ±5% band: keep, widen, or replace with plausibility? | **Replace** with 3× / ⅓ plausibility. The real file makes 86% of good days blocking. ±5% stays for the monthly benchmark check. |
| **D3** | Partial days (13 of 24 hours): exclude, include, or refuse? | **Keep, show, exclude from averages by default**, operator may include. |
| **D4** | Unify `CommissioningReading` into `MeterReading`? | **Yes** — one store, `source` distinguishes origin. It is the only way one upload feeds all three reports. Existing commissioning data migrates, the hand-entry path stays. |
| **D5** | Skip the AI when a format signature matches exactly? | **Yes.** Cheaper, deterministic, and the operator still confirms. |
| **D6** | Zero-runs: one finding per run, or per day? | **Per run.** 31 identical blocking findings for one fact trains people to bulk-dismiss. |
