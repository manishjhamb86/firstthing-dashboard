# Founder operations dashboard — codebase fit

All sources are files in the repository at `/home/user/firstthing-dashboard` (branch `android-app`, read 2026-10-22). Links are repo-relative paths. Nothing was modified.

## Q1. Is the requested dashboard largely a reorganisation of the existing Portfolio page?

### Takeaway
Mostly yes. The Portfolio page (`/admin`) already draws on almost every source the founders asked for. It reads the shared notification feed (overdue invoices, tickets, field help, inspection reminders), meter alerts, the below-band circuits, your tasks and coming meetings. What it lacks is: payment **counts and money totals** (received / outstanding / overdue), an **installation status** view, a **demo status** view, an **all complaints** list (it shows only *open* tickets, folded into a mixed list), and any cross-cutting **"late items"** view.

### Cited Findings
- **Gating.** `src/app/admin/page.tsx` (`AdminHomePage`, 610 lines) calls `requireAdminPage()`. It then gates sections on three permissions: `manage_pipeline` → `canSeePipeline`, `manage_survey` → `canSeeMonitoring`, `manage_users` → `canSeeMeters` — [src/app/admin/page.tsx](src/app/admin/page.tsx)
- **Queries.** One `Promise.all` runs 13 reads — [src/app/admin/page.tsx](src/app/admin/page.tsx):
  - `db.society.count`;
  - `loadSocietyStandings()`;
  - the open-pipeline count (stage `lead`/`survey_pending`);
  - `pipeline.findMany({authoritative:false})` (leads awaiting confirmation);
  - the count of circuits in commissioning states;
  - the count of circuits at `benchmark_confirmed`;
  - recent pipelines;
  - circuits in `benchmark_review`/`surveyed`;
  - `pipeline.groupBy(stage)`;
  - the top benchmarked circuits;
  - `allMeterRows()`;
  - open `meterAlert` of kind `savings_out_of_band`;
  - `openNotifications()`.
- **Layout**, top to bottom — [src/app/admin/page.tsx](src/app/admin/page.tsx):
  - `PageHeader` "Portfolio", with three `btn-secondary btn-sm` quick links (Societies, Live monitoring, Add stock) and an "N items need you" chip that links to `#needs-decision`;
  - `<YourTasks>`;
  - a `StatRow` of 4 `Stat`s: Societies (active/paying/prospect), Open pipelines, Circuits commissioning, Benchmarks confirmed;
  - a 12-column grid. The left column (7 of 12) holds the Deal pipeline funnel (CSS bars) and Recent leads. The right column (5 of 12) holds Below the agreed band, Meters, Needs you, and Commissioned savings.
- **"Needs you".** It merges three sources: leads awaiting confirmation, circuits awaiting a decision, and every unacknowledged feed item *except* the kinds `offline`, `out_of_range` and `savings_out_of_band`. Those three are excluded because they already have their own cards ("listing them twice on one screen is the duplication this page has been pulled up on before") — [src/app/admin/page.tsx](src/app/admin/page.tsx)
- **"My meetings" already exists.** `src/app/admin/your-tasks.tsx` (`YourTasks`) queries `scheduledEvent` with `assigneeId = userId, status "scheduled"` for tasks. Separately, it queries meetings: `kind: "meeting"`, scheduled, `startAt` within the next 7 days, `OR [{assigneeId}, {attendees.some.adminUserId}]`, `take: 4`. Each meeting shows a Join link when `meetLink` exists — [src/app/admin/your-tasks.tsx](src/app/admin/your-tasks.tsx)
- **Bell and Portfolio agree.** `unreadNotificationCount` is computed from `openNotifications()` itself, so the bell and the Portfolio cannot disagree — [src/lib/notifications.ts](src/lib/notifications.ts)

### Inferences
- A founders' dashboard can reuse `YourTasks` for "my meetings" unchanged, or lift its meeting query out of it.
- The "no duplication on one screen" rule (the `SHOWN_ELSEWHERE` set) must be kept if feed items and dedicated cards share a page.
- Two choices: extend Portfolio with founder-only cards, or add a new route that reuses its pieces. Both are viable. Portfolio already runs 13 queries, so a separate page avoids slowing everyone's landing page.

### Gaps
- No current screenshot or user feedback on Portfolio's layout was reviewed. Whether the founders find it insufficient because of missing data or because of the layout is not known from the code.

## Q2. Payments — where received / outstanding / overdue come from today

### Takeaway
All the raw data exists: `BillingInvoice` (amount, `dueDate`, `status`, CON-13 clock timestamps) and `Payment` (amount + `tdsAmount`). Settlement maths is in `src/lib/payment.ts`. Nothing yet sums **received / outstanding / overdue in rupees across the portfolio**. The notification feed lists overdue invoices, grouped per society, but has no totals.

### Cited Findings
- **`BillingInvoice` fields** — [prisma/schema.prisma](prisma/schema.prisma):
  - `number`, `issueDate`, `dueDate`, `amount`, `subtotal`, `taxAmount`;
  - `status` (`BillingInvoiceStatus`: `attached | released | overdue | warning | suspended | paid`);
  - `releasedAt`, `overdueTrackingAt`, `warningStartedAt`, `suspendDueAt`, `suspendedAt`;
  - `paymentStatusConfirmedAt`, and the soft-void fields `voidedAt`/`voidReason`;
  - a link to `MonthlyCalculation` (which carries `societyId` and `period`).
- **`Payment` fields:** `amount`, `confirmedAsOf`, `method` (`bank_transfer|upi|cheque|cash|other`), `utrNumber`, the cheque fields, `tdsAmount`, `tdsRatePct`, `recordedAt`. `InvoiceExtension` has `days`, `reason` and `grantedAt` — [prisma/schema.prisma](prisma/schema.prisma)
- **Settlement maths** — [src/lib/payment.ts](src/lib/payment.ts):
  - `settles(p)` = amount + TDS;
  - `settledTotal(payments)`;
  - `isSettled(invoiceAmount, payments)`, with ₹1 tolerance per PROJECT_CONTEXT.
- **CON-13 clock** (`src/lib/arrears.ts`): `arrearsStateOf()` returns `phase` (`not_released|current|overdue|warning|suspended|paid`), `overdueTrackingFrom`, `warningFrom`, `suspendDueAt` and `daysUntilSuspension`. The pivot is the later of `dueDate` and `releasedAt`. Constants: `OVERDUE_TRACKING_AFTER_DAYS = 2`, `WARNING_AFTER_OVERDUE_DAYS = 10`, `WARNING_WINDOW_DAYS = 5`, `MAX_EXTENSION_DAYS = 5` — [src/lib/arrears.ts](src/lib/arrears.ts)
- **The sweep writes the status.** The `arrears_sweep` job (`scripts/job-worker.ts`) writes the invoice `status` progression. The feed reads only `status in [overdue, warning, suspended]`, non-voided (`openInvoiceNotifications`, `cache()`-wrapped) and collapses them to one row per society (`invoicesToNotifications`) — [src/lib/notifications.ts](src/lib/notifications.ts)
- **Defaulter societies are split out.** Their notifications are removed from `openNotifications()` and moved into `defaulterNotifications()`. A founders' payment view built on the main feed would therefore *miss* defaulters' overdue invoices — [src/lib/notifications.ts](src/lib/notifications.ts)
- **Per-society aggregates exist but are not totals.**
  - `loadSocietyStandings()` gives each society's standing: `paying` = at least one bill payment recorded [src/lib/society-standing-loader.ts](src/lib/society-standing-loader.ts).
  - `allPaymentRatings()` gives the amount-weighted days-late rating per society [src/lib/payment-rating-loader.ts](src/lib/payment-rating-loader.ts).
- **Release queue.** `loadReleaseQueue()` / `computeQueueRow()` cover invoices waiting for the accountant to release them (the stage before the clock starts) — [src/lib/release-queue-loader.ts](src/lib/release-queue-loader.ts)
- **Retail sales are separate.** `RetailInvoice` holds payment status Paid / Advance / Unpaid plus an advance amount (PROJECT_CONTEXT, 2026-09-25 "Retail customers" and "advances on retail invoices"). Its unpaid amounts are outside `BillingInvoice` — [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)

### Inferences
- **"Received this month/period"** = sum of `settles()` over `Payment` rows by `recordedAt` or `confirmedAsOf`, joined to non-voided invoices.
- **"Outstanding"** = for each released, non-voided, non-paid invoice: `amount − settledTotal(payments)`.
- **"Overdue"** = the outstanding amount on invoices with `status ∈ {overdue, warning, suspended}`. Equivalently, `arrearsStateOf().phase` can be recomputed live, which does not depend on the sweep having run.
- **Write it once.** A new pure aggregator (say `src/lib/payment-summary.ts` plus a loader) fits the repo's "pure decision module + thin loader" convention. It should include defaulter societies, either explicitly or on a separate line.
- **Two definitions of "overdue".** The sweep's `overdue` is 2 days after due; a lay "overdue" is past due. The dashboard must say which it uses.

### Gaps
- Whether the founders want retail invoices included in the payment totals was not determined.
- Whether "received" should count TDS as received was not decided. The code counts TDS toward *settlement*.

## Q3. Live metering issues

### Takeaway
Fully covered by existing loaders.
- `allMeterRows()` (cached) gives per-meter health and open alerts.
- `MeterAlert` rows give offline, out-of-range, below-band and the three demo-monitoring kinds.
- Portfolio already renders the "Meters" and "Below the agreed band" cards. These could be reused as they are, but they are gated on `manage_users` and `manage_survey`.

### Cited Findings
- **`MeterAlert` fields** — [prisma/schema.prisma](prisma/schema.prisma):
  - `kind` (`MeterAlertKind`: `offline`, `out_of_range`, `savings_out_of_band`, `demo_pre_variance`, `demo_post_variance`, `demo_readings_missing`);
  - `openedAt`, `acknowledgedAt`, `reraisedAt`, `raiseCount`, `closedAt`, `closedReason`;
  - `meterId?`, `circuitId?`, `detail` (JSON).
- **Per-meter view.** `allMeterRows = cache(...)` loads every meter and adds `hourlySpans` and `sparkSeries` (a moderately expensive read). `MeterRow` includes `state: MeterState | null` (from `evaluateMeterHealth`) and `openAlerts` — [src/lib/meter-view.ts](src/lib/meter-view.ts)
- **How Portfolio uses it.** Portfolio filters `meterRows` into `metering`, `watched` and `reportingMeters`, and flattens `openAlerts` — [src/app/admin/page.tsx](src/app/admin/page.tsx)
- **Demo-monitoring alerts.** These are written by `syncDemoMonitoringAlerts(circuitId)` from the daily `demo_monitoring_sweep` job — [src/lib/demo-monitoring-alerts.ts](src/lib/demo-monitoring-alerts.ts)
- **Feed exclusions.** The feed hides an alert whose circuit or deal context is closed (`alertContextClosed`), and hides defaulter-society alerts — [src/lib/notifications.ts](src/lib/notifications.ts)

### Inferences
- **What "late" means for meters.** It is already expressible as age: `now − openedAt` (and `raiseCount` for alerts that came back). There is no SLA for fixing a meter.
- **Cheaper option.** A founders' widget could use `db.meterAlert.findMany({closedAt: null})` directly instead of `allMeterRows()`. It needs the sparklines only if it shows the fleet bar.

### Gaps
- No target time for resolving a meter alert exists in schema or code, so "not on time" for meters needs a threshold decided by the founders.

## Q4. Current installation status

### Takeaway
The data model is rich:
- projects;
- planned days with `plannedDate`/`startAt`;
- batches with submit and review times;
- blockers;
- the completion certificate.

`installation-gate.ts` computes a per-day gate status that includes **`blocked`, `at_risk` and `late_approved`**. There is no portfolio-wide installation loader or view. The per-deal page (`/admin/pipeline/[id]/installation`) computes this for one deal only.

### Cited Findings
- **`InstallationProject`:** `state` (`planning | published | complete`), `contractedLightCount`, `surveyedLightCount`, `onlookerId`, `gateSkipUsedAt`, `publishedAt` — [prisma/schema.prisma](prisma/schema.prisma)
- **`InstallationPlannedDay`:** `day`, `plannedDate`, `startAt`, `areaKey`, `plannedCount`, `assignedToId`, `onlookerId` — [prisma/schema.prisma](prisma/schema.prisma)
- **`InstallationBatch`:** `installedCount`, `skippedCount`, `state` (`draft | awaiting_review | approved | disputed`), `submittedAt`. `BatchReview` has `decision` and `reviewedAt` — [prisma/schema.prisma](prisma/schema.prisma)
- **`InstallationBlocker`:** `type`, `status` (`open | resolved | waived`), `raisedAt`, `affectedDate`, `resolvedAt`, `discoveredLightCount` — [prisma/schema.prisma](prisma/schema.prisma)
- **`CompletionCertificate`:** `signedAt`, `billingStartDate`, `totalInstalledCount`, `isPartial`, `fullLightCount` — [prisma/schema.prisma](prisma/schema.prisma)
- **CON-21 gate.** `reviewDeadlineFor(startAt)` = `startAt − REVIEW_LEAD_HOURS` (3 h). `evaluateDayGate()` and `evaluateDayGateChain()` return `DayGateStatus`: `clear | pending | at_risk | blocked | late_approved | skipped`. A late approval is deliberately reported as `late_approved`, never as `clear`. `completionBlockers()` lists what stops completion — [src/lib/installation-gate.ts](src/lib/installation-gate.ts)
- **Where the gate is computed today.** `src/app/admin/pipeline/[id]/installation/page.tsx` computes gate inputs per planned day. This is the only consumer outside the field app — [src/app/admin/pipeline/[id]/installation/page.tsx](src/app/admin/pipeline/%5Bid%5D/installation/page.tsx)
- **Deal stages.** `Pipeline.stage` includes `installation` and `active_billing`, and Portfolio's funnel already counts deals at `installation` — [src/app/admin/page.tsx](src/app/admin/page.tsx)

### Inferences
- **What "on time" can be derived from.** Installation is the area with the best real deadlines:
  - a planned day whose `plannedDate` has passed with no batch submitted is late;
  - progress against contract = sum of `installedCount` vs `contractedLightCount`;
  - a day gate at `blocked` or `at_risk` is late or at risk;
  - an open blocker's age is `now − raisedAt`.
- **A new loader is needed.** Something like `loadInstallationBoard()` over projects with `state != complete` could reuse the gate functions unchanged.

### Gaps
- There is no planned *completion date* per project. The latest `plannedDate` among its planned days is the only proxy.

## Q5. Demo status

### Takeaway
The Demo monitoring board (`/admin/demo-monitoring`) already loads every live demo, works out its current step via `demoSteps()` and its projected saving, and lists open `DemoResultReview`s with a **24-hour SLA** (`reviewUrgency`). This is the only explicit SLA in the product besides CON-21 and CON-13. A founders' widget can reuse the same queries.

### Cited Findings
- **The board's query.** `src/app/admin/demo-monitoring/page.tsx` requires `manage_survey` or `manage_pipeline`. It loads open `demoResultReview` (ordered by `occurrence desc, raisedAt asc`), non-voided non-rejected `circuitDemo` with `demoFactsInclude`, and excludes circuits that are already live (`LIVE_MONITORING_WHERE`) — [src/app/admin/demo-monitoring/page.tsx](src/app/admin/demo-monitoring/page.tsx)
- **Demo steps** (`src/lib/demo-steps.ts`): `demoSteps(f)`, `demoComplete(f)`, `demoNextLabel(f)`, `demoCircuitState(f)`. The steps are eligibility, meter, install-gate, pre-readings, replacement assignment and replacement, completion gate, and post-readings — [src/lib/demo-steps.ts](src/lib/demo-steps.ts)
- **Review SLA.** `REVIEW_SLA_HOURS = 24`; `reviewUrgency({raisedAt, occurrence, now})` returns `overdue`, `repeat`, `hoursOpen` and a label (`Overdue — open Nd`) — [src/lib/demo-result-review.ts](src/lib/demo-result-review.ts)
- **`CircuitDemo` dates:** `meterInstalledAt`, `preFrom/preTo`, `postFrom/postTo`, `replacementAssignedAt`, `lightReplacementDate`, `decidedAt`, `createdAt`, `updatedAt`, `unlockedUntil`. The replacement day itself is a `ScheduledEvent` (`installation_day`, linked by `demoId`) with `startAt` — [prisma/schema.prisma](prisma/schema.prisma)
- **Replacement follow-ups.** `DemoReplacementFollowUp` (`raisedAt`, `completedAt`, `plan`) feeds the `replacement_followup_open` notification — [prisma/schema.prisma](prisma/schema.prisma), [src/lib/notifications.ts](src/lib/notifications.ts)
- **Gate pass timeout.** `GatePass` has `submittedAt`/`approvedAt`/`status`, with the ADR-006 30-minute provisional sweep — [prisma/schema.prisma](prisma/schema.prisma)

### Inferences
- **Where demo lateness can come from:**
  - a review open more than 24 h (exists);
  - a scheduled replacement day (`ScheduledEvent.startAt`) in the past and still `scheduled`;
  - a demo whose current step has not moved for N days (`updatedAt` is a weak proxy);
  - an open `demo_readings_missing` alert.

### Gaps
- There is no target duration per demo step, so "demo late" beyond the review SLA and booked days needs a founder-chosen threshold.

## Q6. Customer complaints (tickets) and field help

### Takeaway
`Ticket` (types complaint, device_replacement, pickup, enquiry; statuses open, in_progress, resolved) is the society complaint desk at `/admin/tickets`, with counts already computed there. Tickets have **no due date or SLA**. "Late" can only be age since `createdAt` or `assignedAt`. The notification feed carries only `open` tickets (not `in_progress`). Field-team help is a separate model, `HelpReport`.

### Cited Findings
- **`Ticket` fields:** `type` (`complaint | device_replacement | pickup | enquiry`), `status` (`open | in_progress | resolved`), `subject`, `detail`, `createdAt`, `updatedAt`, `resolvedAt`, `resolutionNote`, `assignedToId`, `assignedAt`, `societyId` — [prisma/schema.prisma](prisma/schema.prisma)
- **The ticket desk.** `/admin/tickets` filters by status and "mine". It counts `open`, `in_progress`, `resolved` and `assignedToMe` with separate `db.ticket.count` calls, and orders by `status asc, createdAt desc` — [src/app/admin/tickets/page.tsx](src/app/admin/tickets/page.tsx)
- **In the feed.** `openTicketNotifications` includes only `open` tickets; in-progress tickets are left out on purpose ("taking one up IS the attention") — [src/lib/notifications.ts](src/lib/notifications.ts)
- **`HelpReport`:** `category` (`question | bug | blocker | suggestion`), `status` (`new | open | answered | in_progress | resolved`), `routedToIds`, `createdAt`, `resolvedAt`. The help desk is `/admin/help` — [prisma/schema.prisma](prisma/schema.prisma), [src/app/admin/help/page.tsx](src/app/admin/help/page.tsx)
- **Not in the feed.** Water-pitch enquiries are tickets of type `enquiry`; marketing-site enquiries have their own page `/admin/marketing-enquiries` — [src/components/app-shell.tsx](src/components/app-shell.tsx), [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)

### Inferences
- **"All customer complaints"** most likely means tickets of type `complaint` (and possibly `device_replacement`), shown with status and age. Sales enquiries should be kept out of a complaints count.
- **Ticket lateness** needs a new threshold (e.g. open more than X days), or a new `dueAt` field if one should be set per ticket.

### Gaps
- No response or resolution target exists anywhere for tickets.

## Q7. "My meetings", tasks, schedule and Google Calendar

### Takeaway
Everything is one table, `ScheduledEvent`:
- kinds: `demo_meeting`, `survey_visit`, `installation_day`, `other`, `task`, `meeting`;
- `startAt` is the due time;
- `status`: scheduled, done, cancelled.

`taskState()` already classifies items as `overdue`, `due_today` and `upcoming`. That makes it the most ready-made "not on time" signal for anything assigned to a person. Meetings sync to Google Calendar two ways.

### Cited Findings
- **`ScheduledEvent` fields:**
  - `kind`, `title`, `startAt`, `endAt`, `status`, `assigneeId`, `createdById`;
  - links to `societyId`, `pipelineId`, `circuitId`, `demoId`;
  - `priority`, `allDay`, `completedAt`, `requiresProof`, `proofKey`;
  - `meetLink`, `googleEventId`, `googleHtmlLink`, `calendarSyncError`.

  `ScheduledEventAttendee` has `adminUserId`, `email`, `responseStatus` — [prisma/schema.prisma](prisma/schema.prisma)
- **Task status.** `taskState(t, today)` compares calendar days in UTC wall clock: earlier than today is `overdue`. `taskSummary()` returns `{open, overdue, dueToday, dueThisWeek}`. `mayActOnTask(actorId, t, isOps)` decides who may act — [src/lib/tasks.ts](src/lib/tasks.ts)
- **Calendar helpers.** `groupByDay`, `dayRelation`, `timeLabel`, `scheduleEventHref` — [src/lib/schedule.ts](src/lib/schedule.ts)
- **Google Calendar sync.** Read-back of time, title, guest changes and deletions is done by the 5-minute `calendar_sync` job — [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) ("Two-way Google Calendar sync")
- **Meeting query.** "Coming meetings" on Portfolio uses the hosted-or-invited query described in Q1 — [src/app/admin/your-tasks.tsx](src/app/admin/your-tasks.tsx)

### Inferences
- **"My meetings"** can reuse the `YourTasks` meeting query (perhaps widened past 4 items or 7 days).
- **"Not on time" for assigned work.** `scheduledEvent.findMany({status: "scheduled", startAt < startOfToday})` across *all* assignees gives every overdue assigned item: tasks, survey visits, replacement days, demo meetings. `taskState` decides it; nothing new is needed.

### Gaps
- None for data. Whether founders want *everyone's* overdue items or only their own is a product choice.

## Q8. What "on time" can already be computed from, and what is missing

### Takeaway
Existing deadlines:
- invoices: `dueDate` plus the CON-13 phases;
- assigned work: `ScheduledEvent.startAt` through `taskState`;
- installation days: the CON-21 3-hour gate and `plannedDate`;
- demo result reviews: a 24 h SLA;
- inspections: a monthly reminder computed from the previous IST month;
- gate passes: the 30-minute provisional sweep.

No deadline at all: tickets, help reports, meter alerts, deal stages (lead → survey → offer → agreement), offers (no expiry field), contracts' installation completion, and demo steps other than the booked days.

### Cited Findings
- **Inspections.** `inspectionReminderPeriod()` and `societiesMissingInspection` (cached) find active-contract societies with no finalised inspection for the elapsed month — [src/lib/notifications.ts](src/lib/notifications.ts)
- **`Pipeline` dates:** `meetingDate`, `surveyAssignedAt`, `demoSkipDate`, `proposalDecidedAt`, `closedLostAt`, `createdAt`, `updatedAt`. There is no per-stage target — [prisma/schema.prisma](prisma/schema.prisma)
- **`Offer` dates:** only `issuedAt`, `respondedAt`, `createdAt`; no validity or expiry — [prisma/schema.prisma](prisma/schema.prisma)
- **`Contract`:** `termStart`, `termEnd`, `activatedAt`, `terminatedOn` — [prisma/schema.prisma](prisma/schema.prisma)
- **Deal spine.** `dealProgress(f)` gives "you are here, do this next" per deal; `loadDealProgress(pipelineId)` loads one deal at a time. It has no timing — [src/lib/deal-progress.ts](src/lib/deal-progress.ts), [src/lib/pipeline-facts.ts](src/lib/pipeline-facts.ts)
- **Job types.** `gatepass_sweep`, `tank_level_sample`, `meter_poll`, `arrears_sweep`, `invoice_intake_sweep`, `calendar_sync`, `demo_relock_sweep` and others — [prisma/schema.prisma](prisma/schema.prisma)

### Inferences
- **"Not on time" needs a single rule set.** A widget built on today's data can be honest only for items with a real deadline: tasks, booked visits and days, invoices, CON-21 days, demo reviews, inspections. Every other item needs either a founder-set age threshold or a new deadline field.
- **Repo convention.** Thresholds should go in one pure module (e.g. `src/lib/lateness.ts`) with tests, as `release-triage.ts` and `demo-result-review.ts` already do.
- **Deal loading cost.** `loadDealProgress` is one deal per call, so a portfolio-wide "deal stalled" view would need a batch loader. Deal-step ageing would also need stage-entered timestamps, which are not stored (`Pipeline.updatedAt` is a weak proxy).

### Gaps
- Stage-entered timestamps for deals are not stored. Without a migration or a backfill from ChangeLog/logs, "how long has this deal been in this stage" cannot be computed exactly.

## Q9. Design system and page rules

### Takeaway
Reuse the existing pieces:
- `PageHeader`, `Card`/`CardTitle`, `StatRow`/`Stat`, `StatusChip`, `EmptyState`, `StatPending`/`ChartPending` from `src/components/ui.tsx`;
- the CSS classes `.card`, `.tbl`, `.btn-*`, `.chip`, `.lbl`, `.num`, `.link-arrow` and the theme tokens in `globals.css`.

The binding rules are in CLAUDE.md and in comments in `ui.tsx`.

### Cited Findings
- **Primitives in `ui.tsx`:** `ChipTone` (`ok|warn|bad|info|neu`), `StatusChip`, `Card`, `InfoNote`, `CardTitle`, `PageHeader` (title, subtitle, action, chip), `EmptyState`, `Field`, `ErrorText`, `PageRibbon`, `StatRow`, `Stat({label, value, detail, tone})`, `StatPending`, `ChartPending` — [src/components/ui.tsx](src/components/ui.tsx)
- **Tone rule.** `STAT_TONE` maps `ok` and `info` to plain `var(--text)`; only `warn` and `bad` are tinted. In the code's words: "a green number carries no information the absence of amber does not already carry". There is deliberately no icon variant — [src/components/ui.tsx](src/components/ui.tsx)
- **`StatRow`** is a container query (`.stat-row-wrap`), not a viewport breakpoint. `Stat` always reserves two detail lines so tiles stay the same height — [src/components/ui.tsx](src/components/ui.tsx)
- **CLAUDE.md rules:**
  - one solid button per page, with secondary actions as `btn-secondary`;
  - theme `light|dark|slate` stamped server-side, with no `prefers-color-scheme`;
  - all dates rendered through `src/lib/format-date.ts` (eslint refuses `toLocaleDateString` elsewhere);
  - every list surface needs loading, empty, error and degraded states (INV-06);
  - use the existing `Modal`. [CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md)
- **Duplication rule.** Portfolio's comments record "money before machinery" ordering and the no-duplication rule between feed and cards. CSS bars are always a second encoding of a printed number — [src/app/admin/page.tsx](src/app/admin/page.tsx)
- **Navigation.** The sidebar is built in `src/components/app-shell.tsx` as grouped items: Portfolio (`/admin`, exact), Schedule, Tasks, Deals, Societies, Lighting, Water, Billing and Settings groups. Items are filtered by `show*` booleans and by `superAdmin` — [src/components/app-shell.tsx](src/components/app-shell.tsx)
- **No internal codes.** A test fails if internal codes ("CON-13", "INV-02") reach user-facing text — [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) ("Internal codes removed from everything people read")

### Inferences
- **Layout.** A founders' page fits the Portfolio pattern: a `PageHeader` with a waiting-count chip, then a `StatRow` of payment and issue counts, then a 7/5 grid of cards.
- **Mobile.** A single column with `min-w-0` grid children (the 2026-08-31 grid overflow lesson). Tables need either `sm:hidden` folding of columns or a stacked list.

### Gaps
- None.

## Q10. Restricting the page to the two founders

### Takeaway
There is no founder or owner concept. Access is by `AdminPermission[]` and `AdminTeam`, always read fresh from the database through `resolveAdmin()`. The one precedent for a person-specific gate is `isSuperAdmin(email)`, hard-wired to `yogesh@firsthing.earth`. Its own comment says it is "not a general pattern". A clean approach is a new permission (e.g. `view_founder_dashboard`), the same route the star showcase took with `approve_showcase`.

### Cited Findings
- **`AdminPermission` enum:** `manage_admins`, `manage_users`, `manage_pipeline`, `manage_survey`, `release_billing`, `approve_date_changes`, `approve_showcase`. `AdminTeam`: `operations | sales | support | engineering | inspection | finance` — [prisma/schema.prisma](prisma/schema.prisma)
- **Database-fresh access checks** — [src/lib/admin-permissions.ts](src/lib/admin-permissions.ts):
  - `resolveAdmin = cache(...)` reads `adminUser` fresh (permissions, team, isActive, deletedAt);
  - `requireAdminPage(permission?)` redirects to `/admin` without the permission;
  - `requireAdminPermission` throws, and CLAUDE.md says actions should return `{error}` instead.
- **Super admin.** `SUPER_ADMIN_EMAIL = "yogesh@firsthing.earth"`; `isSuperAdmin(email)` is used for live-credential settings and data corrections — [src/lib/super-admin.ts](src/lib/super-admin.ts)
- **The operations proxy.** "PER-01 / operations" means holding BOTH `manage_pipeline` and `manage_survey` (CLAUDE.md). `isOperations(team)` is true when team is `operations`. `mayAct()` is in `src/lib/admin-teams.ts`. Billing has `requireBillingOps`, `requireAccountant` and `isOps` — [src/lib/admin-teams.ts](src/lib/admin-teams.ts), [src/app/admin/billing/access.ts](src/app/admin/billing/access.ts), [CLAUDE.md](CLAUDE.md)
- **Manish.** `company.ts` lists him as a sales contact (`SALES_CONTACTS`, 9811322159). No admin account for him appears in tracked seed or migration files — [src/lib/company.ts](src/lib/company.ts)

### Inferences
- **Recommended:** add an `AdminPermission` value granted to both founders through `/admin/users`, check it in `requireAdminPage(...)`, and gate the nav item on it. This avoids a second hard-wired email and survives a founder changing their email address.
- **Not recommended:** a team-based gate (`operations`) would include every ops account.
- **Data visible inside the page.** The page may show billing, meter and ticket data whose own pages have narrower gates (e.g. `manage_users` for meters). That is acceptable for a founder-only page, but it should be a stated decision.

### Gaps
- Whether Manish has an active `AdminUser` row on stage or production cannot be confirmed from the repo, because accounts live in the gitignored `restore/`.

## Q11. Performance and caching

### Takeaway
Feed builders and the heavy fleet loader are memoised per request with React `cache()`, but nothing is cached across requests: there is no `unstable_cache`, `revalidateTag` or `export const revalidate` in `src/`. Every load of the dashboard re-runs every query.

The expensive pieces:
- `allMeterRows()`: all meters plus hourly spans plus sparkline series;
- `openNotifications()`: 7 sub-sources plus `loadShowcaseAdmin()`, which loads every society with its consents and listings plus `allPaymentRatings()`;
- `loadSocietyStandings()`;
- `loadReleaseQueue()`.

### Cited Findings
- **Composition.** `openNotifications = cache(...)` runs `Promise.all` over: `meterAlert.findMany({closedAt:null})` with nested includes, `openInvoiceNotifications`, `openInspectionOverdueNotifications`, `openTicketNotifications`, `openHelpNotifications`, `openReplacementFollowUpNotifications` and `defaulterSocietyIds`. It then awaits `openShowcaseNotifications()` (cached), which calls `loadShowcaseAdmin()` — [src/lib/notifications.ts](src/lib/notifications.ts)
- **`loadShowcaseAdmin(now)`** is not `cache()`-wrapped itself. It reads all societies with all `showcaseConsents` and `starListings` (3 nested user selects) plus `allPaymentRatings(now)`, which reads rating invoices across all societies — [src/lib/star-showcase-loader.ts](src/lib/star-showcase-loader.ts), [src/lib/payment-rating-loader.ts](src/lib/payment-rating-loader.ts)
- **`allMeterRows`** = `cache(loadMeters + hourlySpans + sparkSeries)` — [src/lib/meter-view.ts](src/lib/meter-view.ts)
- **Root-level dynamic rendering.** The root layout's `resolveTheme()` forces every route dynamic, so pages render per request — [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) ("Theme system")
- **No cross-request caching.** A repository search for `unstable_cache|revalidateTag|export const revalidate` in `src/` returned no matches — repository grep, 2026-10-22.
- **Ticket desk counts.** The desk issues 4 sequential `await db.ticket.count` calls inside an object literal, which are not parallel — [src/app/admin/tickets/page.tsx](src/app/admin/tickets/page.tsx)
- **Portfolio already pays for the feed.** It awaits `openNotifications()`, and the layout's bell calls `unreadNotificationCount()`. Thanks to `cache()` that is one feed computation per request — [src/app/admin/page.tsx](src/app/admin/page.tsx), [src/lib/notifications.ts](src/lib/notifications.ts)

### Inferences
- **Reusing the feed is free.** A founders' page that calls `openNotifications()` costs no extra queries because the layout's bell already triggers it.
- **What adds cost:** payment totals (one grouped query over invoices and payments), installation board (projects, days, batches), demo board (all demos with readings via `demoFactsInclude`, which is heavy).
- **Ways to reduce cost:**
  - wrap new loaders in `cache()`;
  - use `groupBy` and aggregates rather than loading rows;
  - stream slow cards with `<Suspense>` (Server Components, so cards render as their queries finish);
  - optionally, `unstable_cache` with a short revalidate for portfolio totals. This needs a Research Gate check against `node_modules/next/dist/docs/` because this Next version has breaking changes (AGENTS.md).
- **Small cleanup.** `loadShowcaseAdmin` could be `cache()`-wrapped, since both the feed and `/admin/star-societies` call it.

### Gaps
- No query timings or EXPLAIN output were collected. The cost assessment is based on query shape, not measurement.
