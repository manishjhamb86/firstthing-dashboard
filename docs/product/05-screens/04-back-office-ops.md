# SUR-01 back office — portfolio, registry & dispatch
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft — all 6 priority-1 specified
**Last updated:** 2026-08-13

The screens the flows never reach. Phase 4 classified CAP-08 as a *view* rather than a journey, and
it is still six real screens — including the one PER-01 opens first every morning.

Global rules: [`00-global-patterns.md`](00-global-patterns.md). Visual system:
[`../05a-theme-system.md`](../05a-theme-system.md) — Console density throughout.

**Screens (6 priority 1):** SCR-240, 241, 242, 250, 251, 170.

---

## SCR-240 — Ops home, priority task queue

**Features:** FEAT-066, FEAT-067 · **Flows:** none — every flow lands here · **Personas:** PER-01

**Purpose:** tell one person, in the first ten seconds of their day, what will break if they do
nothing.
**Primary action:** work the top of the list.

**Arguably the most-used screen in the product**, and the only one with no flow behind it. Its
difficulty is that every capability wants to put something on it, and a queue that lists everything
ranks nothing.

### The priority model, derived rather than invented

Ordering comes from **what has a deadline and what that deadline costs**, not from a hand-set
importance field:

| Band | What qualifies | Why it outranks the next |
|---|---|---|
| **1 — Idle crew today** | A batch approval missed its CON-21 cutoff; a technician blocked on a gate-pass approval | People are standing still right now, and the cost is a wasted day that cannot be recovered |
| **2 — Window at risk** | Month-close items with fewer days left than work remaining; releases queued near the 17-day edge | Missing the window delays every society's invoice, not one |
| **3 — Decision expiring** | A deviation review that must conclude before the next close, or CON-01c evaluates a streak against an unknown cause | The cost is a wrong billing basis that is hard to unwind |
| **4 — Clock running** | Arrears countdowns, provisional gate passes awaiting review, extension requests | Real deadlines, but days not hours |
| **5 — Queued work** | Surveys awaiting review, KYC verification, tickets, escalations | No hard deadline; ages into band 4 if ignored |

**Band 1 is never collapsed, never paginated, and never more than a handful.** If it is routinely
long, that is an operational signal the screen should surface rather than absorb — a persistent
band-1 count is shown as a trend, because "we start every day with six idle crews" is a fact
somebody needs to see.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Date, open close-period, days left | | CMP-02 | The 17-day counter, everywhere it matters |
| Band 1 | Idle-crew items | | CMP-01, `bad` accent | Always expanded |
| Bands 2–5 | Grouped, collapsible, counted | CMP-01 | | Band 2 expanded by default during a close window |
| Each item | What, which society, why it is here, how long | | | The *why* is a column — an item whose reason is not stated is an item that gets skipped |
| Side | My assigned work | | CMP-01 | Distinct from the shared queue |
| Side | Portfolio pulse | 4 tiles | CMP-03 | Societies active, months closed, overdue, open deviations |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Open an item | row | ops | Deep-links to the owning screen with context | — | — | — |
| Claim | row | ops | Assigns to self | none | Moves to "my work" | Already claimed → names who |
| Snooze | row menu | ops | Hides until a chosen time; **band 1 cannot be snoozed** | reason required | Item returns then | — |
| Delegate | row menu | ops lead | Assigns to another operator | none | They are notified | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton bands | — |
| Empty — first use | no data yet | "Nothing needs you yet. Work appears here as societies come on." | — |
| Empty — filtered | filter excludes all | Names the filter | Clear |
| Empty — all clear | genuinely nothing | "Nothing is blocked and nothing is at risk." Stated plainly — this is a real and good state | — |
| Partial / stale | a source failed to load | Names which band is incomplete rather than silently showing fewer items | Retry |
| Error — network | load fails | Retry | Retry |
| Error — permission | non-ops | SCR-221 | — |
| Success | item worked | Item leaves the queue with a brief confirmation | — |

**Exits:** everywhere. This screen is the hub.
**Live update:** polls every 60s; band 1 every 30s.
**Responsive:** desk-first.
**Offline:** blocked.
**Copy:** band 1 — "Prestige Ferns hasn't approved yesterday's batch. The crew is due on site at
09:00 and can't start."
**Open questions:** the band definitions are derived from constraints, not from watching anyone
work. They should be checked against a real ops day before they harden.

---

## SCR-241 — Portfolio society list

**Features:** FEAT-067 · **Personas:** PER-01, management

**Purpose:** every society, its state, and what is wrong with it, in one scannable list.
**Primary action:** find a society, or find the ones in trouble.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Counts by lifecycle | | CMP-03 | Prospect, onboarding, active, suspended, ended |
| Filters | Lifecycle, service line, city, health, month-close state | CMP-04 | | |
| Search | Name typeahead | CMP-05 | | |
| Table | One row per society | CMP-01, risk accent | | Name, city, flats, service lines, this month's state, outstanding, open issues |
| Row | **Health** | composite | CMP-02 | See below |
| Footer | Portfolio totals | | | Flats, monthly value, outstanding |

**Health is a composite and must be decomposable.** A single chip that says "attention" and cannot
be expanded is worse than no chip. Hovering or tapping states the contributing facts — overdue
invoice, open deviation, missed batch approval, unresolved tickets — because an operator acts on
the fact, not the summary.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Open | row | ops | → SCR-250 | — | — | — |
| Drill to circuits | row menu | ops | → SCR-242 | — | — | — |
| Export | header | ops | CSV of the current filter | none | Download | — |
| Bulk notify | selection | ops lead | Sends a templated message (FEAT-093) | modal listing recipients | Queued | Bounces reported per society |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | no societies | `EmptyState` + "Add your first society" | Add |
| Empty — filtered | filter excludes all | Names the filter | Clear |
| Partial / stale | health inputs stale | The health column labelled with its as-of time rather than shown as current | Refresh |
| Error — network | load fails | Retry | Retry |
| Error — permission | non-ops | SCR-221 | — |
| Success | loaded | List with totals | — |

**Exits:** SCR-250, SCR-242, SCR-082, SCR-120.
**Live update:** none; refreshes on navigation.
**Responsive:** desk-first; cards below 768px.
**Offline:** blocked.

---

## SCR-242 — Society to circuit drill-down

**Features:** FEAT-068 · **Personas:** PER-01

**Purpose:** consumption against benchmark, per circuit, over time — the diagnostic view that is
not tied to a single month's review.
**Primary action:** understand a circuit's history.

**Distinct from SCR-110 and it must stay distinct.** SCR-110 investigates *one month's* deviation
and ends in a decision. This screen is exploratory, spans the whole term, and ends in nothing — it
is where someone goes to ask "has this circuit always been like this?" Collapsing the two would
either make the review screen unfocused or make this one falsely decisive.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, term to date | | | |
| Selector | Circuit picker, multi-select | CMP-05 | | Comparing siblings is the main use |
| Chart | Monthly saving vs benchmark, per circuit | `../05a-theme-system.md` §3.10 | | Band shaded; basis changes marked on the axis |
| Chart | Event markers | rescales, amendments, inspections, meter changes | | A step change explained by an event is not a mystery |
| Table | Month-by-month, per circuit | CMP-01 | | Benchmark, measured, variance, basis, fee |
| Panel | Circuit facts | SCR-251 | | Light count, represented count, wattage, benchmark version history |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Compare circuits | selector | ops | Overlays series | — | — | — |
| Open a month | chart point or row | ops | → SCR-090 | — | — | — |
| Open the review | on a month with one | ops | → SCR-110 or SCR-112 | — | — | — |
| Export | header | ops | CSV | none | Download | — |
| Show as table | chart toggle | any | Accessibility path, per the system's chart rule | — | — | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton chart with axes | — |
| Empty — first use | no released months | "This society hasn't been billed yet." | — |
| Empty — filtered | no circuit selected | Prompt to pick one | Select |
| Partial / stale | current month not closed | Shown dashed and labelled provisional | — |
| Error — network | load fails | Retry | Retry |
| Error — permission | non-ops | SCR-221 | — |
| Success | loaded | Chart + table | — |

**Exits:** SCR-090, SCR-110, SCR-251, SCR-250.
**Live update:** none.
**Responsive:** desk-first; below 768px the page states the chart needs a wider screen and offers
the table.
**Offline:** blocked.

---

## SCR-250 — Society record

**Features:** FEAT-085 · **Personas:** PER-01

**Purpose:** everything about one society in one place, across its whole lifecycle.
**Primary action:** find what you need about this society without leaving.

**Carries the lifecycle from prospect to ended** (FEAT-085), so the same screen serves a lead with
a name and a city and an 18-month customer with four service lines. Sections appear as they become
real rather than sitting empty from day one.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Name, city, flats, lifecycle | | CMP-02 | |
| Header | Health, decomposed | SCR-241 | | Same composite, same expandability |
| Tabs | Overview · Circuits · Billing · Documents · People · Activity | | | |
| Overview | Profile, governance, **next election date** | CON-28a | | The election prompt CON-45 rule 4 depends on |
| Overview | Service lines and their pipeline states | FEAT-039 | CMP-09 | One society, several independent pipelines (CON-24) |
| Circuits | Summary, linking to SCR-251 | | | |
| Billing | Invoices, savings reports, arrears, disputes | | CMP-01 | |
| Documents | Everything filed, by type | | CMP-01 | |
| **People** | Portal accounts and their authorities | FEAT-108 | CMP-01 | Who holds `office-bearer`, and whether anyone does |
| Activity | Audit trail | INV-03 | CMP-10 | Who did what, when |

**The People tab carries CON-45's escape hatch.** A society whose committee turned over with no
handover has no reachable office-bearer, and this is where PER-01 re-designates one. The tab states
that condition loudly rather than leaving someone to notice an empty list — a society silently
unable to accept anything is the failure CON-45 rule 3 exists to prevent.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Edit profile | tab | ops | Updates; names normalised to Title Case per the existing convention | none | Saved | — |
| Promote prospect → active | header | ops | Pulls survey-captured data rather than re-asking (FEAT-085) | modal | Lifecycle advances | Missing prerequisites named |
| Add portal account | People tab | ops | Creates a named account with an authority | modal | Account created | — |
| **Re-designate an office-bearer** | People tab | ops | CON-45 rule 3 escape | modal stating why this exists | Authority granted; audit row | — |
| Suspend / restore | header | ops lead | FEAT-087 | modal naming what suspension actually halts | State change | No manual suspension for arrears — that is automatic (CON-13) |
| End contract | header | ops lead | FLOW-17 termination | modal | → SCR-163 | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | bare prospect | Only Overview populated; other tabs state what makes them appear | Edit |
| Empty — filtered | empty tab | Per-tab `EmptyState` (INV-06) | — |
| **No office-bearer** | none active | `warn` banner on every tab, not only People — this blocks every binding act | Re-designate |
| Partial / stale | mid-onboarding | Progress against the pipeline | Continue |
| Error — network | load fails | Retry | Retry |
| Error — permission | non-ops | SCR-221 | — |
| Success | saved | Toast | — |

**Exits:** SCR-251, SCR-242, SCR-260, SCR-053, SCR-163, SCR-151.
**Live update:** none.
**Responsive:** desk-first.
**Offline:** blocked.

---

## SCR-251 — Circuit registry & configuration

**Features:** FEAT-040, FEAT-041 · **Personas:** PER-01

**Purpose:** the definitive record of what each circuit is, what it represents, and what its
benchmark has been over time.
**Primary action:** keep the represented light count honest.

**This is the most dangerous editable screen in the product.** `representedLightCount` is the
multiplier on every extrapolation (CON-11): change it and every future bill changes. INV-07 requires
a light-count change to produce a **deterministic rescale**, not a free edit, and this screen is
where that rule either holds or is quietly bypassed.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, circuit count by type | | | |
| Table | One row per circuit | CMP-01 | | Light type, panel location, metered count, **represented count**, wattage, benchmark, band, basis, meter serial |
| Detail | Benchmark version history | | CMP-10 | Every value it has held, when, why, and who approved |
| Detail | Light-count history | FEAT-041 | CMP-10 | Every rescale with its trigger and its effect |
| Detail | Meter history | | | Installs, replacements, faults |
| Detail | CON-16 eligibility record | SCR-012 | | Why this circuit was chosen at survey |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| **Change light count** | row | ops lead | Runs the deterministic rescale (FEAT-041, INV-07) and **shows the resulting benchmark before committing** | modal stating old and new count, old and new benchmark, and the month it takes effect | Rescale recorded with its trigger | Blocked for a month already released (INV-03) |
| Edit circuit facts | row | ops | Panel location, description — never counts or benchmark | none | Saved | — |
| Replace meter | row menu | ops | Records the swap; → SCR-020 for the field side | modal | Meter history updated | — |
| Retire a circuit | row menu | ops lead | Marks inactive from a stated month | modal naming the billing effect | Excluded from future calculations | Blocked mid-month unless the month is reopened |
| Add a circuit | header | ops lead | Mid-term addition; routes to an amendment (FLOW-17) if it changes scope | modal | Amendment raised | Never a silent scope increase |

**No free edit of a benchmark.** A benchmark changes by exactly two paths: a deterministic rescale
from a light-count change (INV-07), or a management decision on SCR-113 with CON-37's
direction-dependence enforced. There is no third control here, deliberately.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | pre-survey | "Circuits are created when the survey is confirmed." | → SCR-014 |
| Empty — filtered | filter excludes all | Names the filter | Clear |
| Partial / stale | some circuits not yet benchmarked | Those rows show their commissioning progress instead of a benchmark | → SCR-022 |
| Error — network | load fails | Retry | Retry |
| Error — permission | not ops lead for changes | Read-only; the reason stated | View |
| Success | rescale committed | Toast restating the new benchmark and its effective month | — |

**Exits:** SCR-242, SCR-250, SCR-020, SCR-022, SCR-160.
**Live update:** none.
**Responsive:** desk-first; the table scrolls horizontally rather than dropping columns — every
column here is load-bearing.
**Offline:** blocked.
**Copy:** rescale — "Basement car park goes from 420 to 468 lights. The benchmark rescales from
68.4% to 68.4% — the percentage is unchanged, but the represented consumption rises, so the fee
increases by about ₹1,880 a month from September."

---

## SCR-170 — Field visit scheduler

**Features:** FEAT-016 · **Flows:** FLOW-X1 · **Personas:** PER-01

**Purpose:** put the right people on the right site on the right day.
**Primary action:** schedule a visit and assign its team.

**Assigns a team, not a person** (CON-44). Every visit carries a roster; a survey of a
1,500-light society is two people and an installation day is three. The scheduler is where that
roster is set, and it is the origin of the area partition the field surface then works within.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Week, unassigned count | | CMP-02 | |
| Calendar | Week view by person | CMP-01 | | Who is where, which visits are unconfirmed |
| Queue | Visits needing scheduling | | CMP-01, risk accent | Deviation investigations first — they are time-bound by the next close (FLOW-11) |
| Detail | Visit type, society, purpose, **team** | | | |
| Detail | **Suspension check** | CON-13 | `warn` | A suspended society halts field servicing; the scheduler is where that is caught, not the gate |
| Detail | Access details | CON-28a | | Gate contact, timings, restrictions — pulled into the field data pack |
| Detail | Areas to cover | for surveys and installs | | Seeds the field partition (§0.1b) |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Schedule | queue item | ops | Creates the visit, sets date and team | modal | Team notified; each accepts independently | Suspended society → blocked, naming why |
| Add or remove a team member | detail | ops | Adjusts the roster | none | Added member gets the data pack | Removing someone with unsynced work → warned, not blocked, and their work still syncs |
| Reassign | calendar drag | ops | Moves a visit | modal if within 24h | Both parties notified | — |
| Set areas | detail | ops | Pre-partitions the work | none | Seeds the field claim list | Optional — the field can partition on the day |
| Handle a reschedule request | queue | ops | Accepts or counters (FEAT-096) | reason if declined | Field notified | — |
| Record repeated access failure | queue | ops | Third block at one society escalates (FEAT-096 AC-5) | none | Escalation raised | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton calendar | — |
| Empty — first use | nothing to schedule | "No visits needed this week." | — |
| Empty — filtered | filter excludes all | Names the filter | Clear |
| Partial / stale | some visits unaccepted | Those marked, with how long they have been waiting | Chase |
| Error — network | save fails | Retry | Retry |
| Error — permission | non-ops | SCR-221 | — |
| Success | scheduled | Team notified; visit appears on their SCR-171 | — |

**Exits:** SCR-171, SCR-172, SCR-250, SCR-110.
**Live update:** acceptance status polls every 2 minutes.
**Responsive:** desk-first.
**Offline:** blocked.
**Copy:** suspended — "Brigade Cornerstone is suspended for non-payment, so field servicing is on
hold. Readings and billing continue. Clear the arrears or record an exception to schedule this."

---

## Coverage

| Screen | Spec | Mockup | Blueprint |
|---|---|---|---|
| SCR-240 ops home | ✅ | — | — |
| SCR-241 portfolio list | ✅ | — | — |
| SCR-242 circuit drill-down | ✅ | — | — |
| SCR-250 society record | ✅ | — | — |
| SCR-251 circuit registry | ✅ | — | — |
| SCR-170 visit scheduler | ✅ | — | — |
