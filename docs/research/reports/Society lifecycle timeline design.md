# Build one checked chronology per society

FirsThing should add a **Timeline tab to each society** (`/admin/societies/[id]/timeline`). It should be an **indented, collapsible vertical list, not a Gantt chart**:
- society at the top, then service line, deal, circuit, demo;
- every step on a left date rail with an absolute DD-MM-YYYY date;
- a computed summary bar at the top that states either **"All N dates are in order"** or counts each kind of problem, with a link to each.

The research supports the list form because the reviewer's main task is **order**. A sequential list with dates as labels is the form built for order ([Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)). No mainstream product draws four or more hierarchy levels on one time axis ([Asana](https://help.asana.com/s/article/timeline?language=en_US), [Jira](https://support.atlassian.com/jira-software-cloud/docs/customize-your-roadmaps-view-settings/)).

**The codebase inventory** found:
- roughly **60 meaningful dates across about 25 models**;
- ordering rules spread across about 8 pure functions and inline checks, **with no single function that checks a whole society's chain**;
- **several unguarded links**: demo report ↔ offer, contract term start ↔ signature and certificate, light-count change ↔ anything;
- a `ChangeLog` table that is written but **never read**;
- **no change-request model at all**.

The recommended change model has two phases:
- **Before go-live**, demo mode lets people edit a date directly from the timeline, through the same checks and the same audit log.
- **After go-live**, every change is a **`DateChangeRequest`**. The live value stays in force until a different admin approves the request. The request is checked when it is raised and again when it is approved. At most one can be open per date, and it is closed as *superseded* if the date moved underneath it. These are the maker–checker rules used by SAP MDG, Salesforce, FLEXCUBE and Jira Service Management, cited below.

## A list for order, a lane strip only for overlap

The visualisation literature separates two tasks this screen has to serve.

**Reading each branch step by step** is an order task. Brehmer et al. surveyed 263 timelines. They describe a *sequential* scale, with equal spacing and dates as labels, as "appropriate for communicating solely the order of events" ([Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)).

**Seeing whether two branches overlap** is a synchronicity task. For that they recommend a **linear, chronological, faceted** layout with one lane per branch on a shared axis, the most common design in their corpus ([Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)).

A controlled study bears on the lane view. **Leaving rows unaligned gave 88% correct duration judgments, against 36% for dual-event alignment.** The differences grew with more rows ([Zhang et al. 2019](https://arxiv.org/pdf/1908.07316)). So a lane view must keep real dates and must not snap deals to a common start.

**Products cap how much hierarchy they draw on a time axis:**
- Asana shows only the first level of subtasks ([Asana](https://help.asana.com/s/article/timeline?language=en_US)).
- Basic Jira indents only children under epics; deeper hierarchies need a premium plan ([Atlassian](https://support.atlassian.com/jira-software-cloud/docs/configure-custom-hierarchy-levels-in-advanced-roadmaps/)).
- Linear puts only projects on its timeline ([Linear](https://linear.app/docs/timeline)).

Tree-view guidance supplies the controls: chevrons, nesting lines, and remembering what was expanded when a parent collapses ([Primer](https://primer.style/product/components/tree-view/guidelines/), [Carbon](https://carbondesignsystem.com/components/tree-view/usage/)). Jira's "show full hierarchy" keeps a matched item's ancestors visible while filtering ([Atlassian](https://support.atlassian.com/jira-software-cloud/docs/show-full-hierarchy-while-filtering-issues-on-your-timeline/)).

**Design systems give the row vocabulary.** A record usually needs two views: a stepper for "where is it now" and a dated timeline for "what happened when". The stepper side exists in Carbon, PatternFly and Salesforce Path; the dated side in Ant Design, MUI and Primer ([Carbon](https://carbondesignsystem.com/components/progress-indicator/usage/), [PatternFly](https://www.patternfly.org/components/progress-stepper/design-guidelines), [SLDS Path](https://v1.lightningdesignsystem.com/components/path/), [Ant Design](https://ant.design/components/timeline), [MUI](https://mui.com/material-ui/react-timeline/)). The specific rules that apply here:
- **Date placement.** MUI puts timestamps in a dedicated slot opposite the content ([MUI](https://mui.com/material-ui/react-timeline/)).
- **Terminal states.** Salesforce Path treats *lost* and *won* as terminal states, not as "incomplete" ([SLDS](https://v1.lightningdesignsystem.com/components/path/)).
- **Tense.** PatternFly writes completed steps in the past tense and active steps with "-ing" ([PatternFly](https://www.patternfly.org/components/progress-stepper/design-guidelines)).
- **Absolute dates.** People return to this record, which argues for absolute dates, with relative time at most as a secondary label ([UX Movement](https://uxmovement.com/content/absolute-vs-relative-timestamps-when-to-use-which/)).
- **Accessibility.** Primer's own docs say its div-based timeline should be a semantic list so screen readers announce the count and boundaries ([Primer](https://primer.style/product/components/timeline/accessibility/)). PatternFly asks for an ordered list with `aria-current` on the active step ([PatternFly](https://www.patternfly.org/components/progress-stepper/design-guidelines)). GOV.UK marks status with words, not colour alone, and avoids uppercase ([GOV.UK](https://design-system.service.gov.uk/components/task-list/)).
- **Long feeds.** CRMs manage them with type filters, expand/collapse-all and a separate "upcoming & overdue" block ([Salesforce](https://help.salesforce.com/s/articleView?id=sf.activitytimeline_sorting_future_activities.htm&language=en_US&type=5), [HubSpot](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline?src=leap)).

**What was not found.** No source specifies how to show elapsed time between steps, a "skipped" state, or a phone layout for hierarchical timelines. Those parts of the layout below are inference.

## Sixty dates in twenty-five models, three of them without a column

The inventory, read from the working tree at `664578b`, establishes where every date lives and what kind it is:
- **typed**: a real-world date stored at UTC midnight;
- **stamped**: a machine instant;
- **hybrid**: stamped by default, but a backdate can override it.

Two structural facts matter for building the timeline:
- **Commissioning facts moved onto `CircuitDemo` on 2026-09-26.** `Circuit` no longer has a meter or replacement date.
- **Three steps have no column of their own:**
  - "lead logged" is `Pipeline.createdAt`;
  - "survey happened" is the booked `survey_visit` event's `startAt`, falling back to `SiteSurvey.createdAt`, through `surveyHappenedAt()` (`src/lib/step-dates.ts:166`);
  - "demo meeting" is `Pipeline.meetingDate`.

**Joins.** Everything joins to the society through `societyId` or `pipelineId`. Three joins are not foreign keys:
- `Engagement` joins `Pipeline` only on `(societyId, serviceLine)`;
- `DemoReport` reaches demos through a `demoIds String[]`;
- `MonthlyCalculation` has no pipeline, so a month joins a deal only through its circuits' survey → pipeline → contract.

**Gaps in the data.** Several steps a reviewer would expect carry **no date at all**:
- lead approval;
- survey completion;
- load-test passed;
- `Pipeline.demoSkipDate`, which has no writer found.

The timeline must show these as "no date recorded". It must not invent one.

**The existing ordering rules**, chained, give this order:
- **deal:** society → lead → meeting → proposal decision → survey visit;
- **demo:** meter install → pre period → replacement → post period;
- **agreement:** offer issued → responded → agreement prepared → printed → notarised → signed → uploaded, with activated ≥ signed and term end > term start;
- **installation:** batch work ≤ approval ≤ certificate, and billing start = certificate + 1 day.

These rules sit in `refuseOrderedDate`, `refuseDemoPeriods`, `refuseAgreementDates`, `refuseInstallationDates` and inline checks in the actions.

**Correction paths are inconsistent:**
- **The newer installation and agreement paths** use the `refuseDateCorrector` rule: in demo mode, field or operations staff may correct, reason optional; live, operations only with a reason. They write `ChangeLog`.
- **The older paths do not follow it.** `updateLeadDetails` and `correctOfferDates` are operations-only, **not demo-gated, with no reason and no `ChangeLog`**. `correctProposalDate` is demo-only, again with no reason and no log.
- **About a dozen dates have no correction path at all**, among them the demo report's share date, the gate passes, KYC, `Engagement.createdAt`, `Society.closedAt`, `Contract.terminatedOn` and a payment's `confirmedAsOf`.

**`ChangeLog` itself cannot yet drive a history view.** It has no `societyId` or `pipelineId`, its `actorId` has no foreign key, and **no code reads it**.

## Out-of-order is a data-quality class, not just a rule failure

Process-mining research names the exact failure modes a backdated admin app produces. Suriadi et al. list three that apply here ([Suriadi et al. 2017](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf)):
- **"form-based event capture"**: the save time masquerades as the event time — a date defaulted to today on a record typed up months later;
- **"inadvertent time travel"**: a mistyped day or month, or a midnight roll-over;
- **"unanchored event"**: day-month and month-day confused, which in their hospital example imported three dates wrongly **without a single warning**.

Their remedy is to write down "the minimum restrictions applicable to the ordering of all activities" and check cases against them ([Suriadi et al.](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf)). That is an argument for **one declared rule table checked by one function**, not scattered per-action checks.

Fischer et al. split timestamp problems into separate classes:
- **completeness**: a missing timestamp;
- **accuracy**: a future entry, or events in an unusual order;
- **precision**: a coarse or estimated time.

They also show that **mixing day-precision dates with timestamps creates false reorderings** ([Fischer et al.](https://www.fim-rc.de/Paperbibliothek/Veroeffentlicht/1060/wi-1060.pdf)). Every comparison should therefore be made at day precision.

**How to express the rules.** Declare's *precedence* template ("B only if A before"), with Timed-Declare's bounds, is the established way to write "on or after" and "within N days" ([Declare in ASP](https://arxiv.org/pdf/2412.10152), [Timed Declare](https://link.springer.com/chapter/10.1007/978-3-032-02867-9_4)). Allen's 13 interval relations cover steps that span a period — pre and post periods, a contract term ([Allen's interval algebra](https://en.wikipedia.org/wiki/Allen%27s_interval_algebra)). Celonis reports parallel model arcs producing spurious violations ([Celonis community](https://community.celonis.com/process-analysis-5/conformance-checker-analysis-problems-with-parallel-arcs-4869)). So a parallel branch such as KYC, or a second deal, should be checked against its **parent step**, never against its sibling.

**Backdating.** Fowler's bitemporal model keeps two times per fact: **"actual time" (when it happened) and "record time" (when we knew)** ([Fowler, via mirror](https://www.goodreads.com/author_blog_posts/21166503-bitemporal-history?tab=book), [JUXT](https://www.juxt.pro/blog/bitemporality-more-than-a-design-pattern/)). Order is checked on actual time. Record time is only provenance, so "entered three months later" is a neutral note, not an error.

**Presenting violations.** Design systems agree on a summary plus inline messages:
- GOV.UK always shows an error summary, even for one problem, **worded exactly like the inline message and linking to it** ([GOV.UK](https://design-system.service.gov.uk/components/error-summary)).
- Carbon and PatternFly separate error, warning, info and success ([Carbon](https://carbondesignsystem.com/components/notification/usage/), [PatternFly](https://www.patternfly.org/components/helper-text/)).
- NN/g asks for:
  - the message placed next to its source;
  - indicators that are not colour alone;
  - treatment scaled to impact;
  - precise wording with a constructive fix;
  - no premature flags.

  ([NN/g](https://www.nngroup.com/articles/error-message-guidelines/))

## Maker–checker: a staging copy, a second person, and a stale check

Mature approval systems all hold a proposed change apart from the live record until a different person decides:
- SAP MDG keeps a **staging area** and writes to the **active area** only at final approval, locking the object for the life of the change request ([SAP MDG](https://s3-eu-west-1.amazonaws.com/gxmedia.galileo-press.de/leseproben/4883/reading_sample_sappress_1835_master_data_governance.pdf), [SAP KBA 3070316](https://userapps.support.sap.com/sap/support/knowledge/en/3070316)).
- FLEXCUBE lets **anyone other than the maker** authorize, and shows the checker every validation the maker overrode ([Oracle FLEXCUBE](https://docs.oracle.com/en/industries/financial-services/flexcube-investor-servicing/14.7.6.0.0/divis/authorize-selected-uh-record.html)).
- **States.** Salesforce Flow Approvals use *In Progress / Approved / Rejected / Recalled* ([Salesforce](https://help.salesforce.com/s/articleView?id=platform.automate_automated_approvals_manage.htm&language=en_US&type=5)). ServiceNow adds a system-set **"no longer required"**, and treats approved and rejected as final ([ServiceNow community](https://www.servicenow.com/community/itsm-forum/approvals-are-going-to-no-longer-required-state/m-p/3001608)).
- **Self-approval.** Jira Service Management's exclusion of the requester **blocks the decision, not just the listing** ([Atlassian](https://confluence.atlassian.com/adminjiraserver/configuring-jira-service-management-approvals-938847527.html)).
- **Stale approvals.** GitHub dismisses an approval when the reviewed content changes ([GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)).

**Audit requirements** converge on who, what, when, old value → new value, and why:
- EU GMP Annex 11 §9 requires the reason for a change to be documented ([EC Annex 11](https://health.ec.europa.eu/system/files/2016-11/annex11_01-2011_en_0.pdf)).
- 21 CFR 11.10 requires time-stamped audit trails, "operational system checks to enforce permitted sequencing", and authority checks ([21 CFR 11.10](https://www.law.cornell.edu/cfr/text/21/11.10)).
- **India's Companies (Accounts) Rules** require an edit log of every change to books of account, with its date, that **cannot be disabled** ([Rule 3](https://ca2013.com/rule-3-companies-accounts-rules2014/)). The rule applies from 1 April 2023 ([Tally](https://tallysolutions.com/accounting/key-requirements-of-audit-trail-rule-issued-by-mca/)). The ICAI guide sets **8 years' retention** ([ICAI](https://eirc-icai.org/uploads/background_materials/Revised%202024_Implementation%20Guide%20on%20Reporting%20of%20Audit%20Trail%20(1)_1712114860.pdf)).

**Whether FirsThing's lifecycle dates are "books of account" is a legal question these sources cannot settle.** Billing start and contract term drive invoices, which makes them the closest candidates.

**Switching from free editing to approval.** GitHub rulesets offer the nearest analogue: an **Evaluate** mode that logs without enforcing, an **Active** mode that enforces, and a bypass list ([GitHub rulesets](https://docs.github.com/en/enterprise-cloud@latest/organizations/managing-organization-settings/creating-rulesets-for-repositories-in-your-organization)). Salesforce keeps a pending request on the rules it was submitted under ([Salesforce KB](https://help.salesforce.com/s/articleView?id=000213116&language=en_US&type=1)).

## The buildable recommendation for this codebase

Everything in this section is **inference** applying the findings above to the inventory, unless a row cites an existing file.

### Layout

The route is `/admin/societies/[id]/timeline`, a tab on the society page, readable by any admin.

**Top of the page.** One summary bar. With no problems it reads **"All 41 dates are in order · 3 not yet reached"**. With problems it reads, for example, "2 out of order · 1 in the future · 1 missing before a dated step". Each count is a link to the rows. It is worded identically to the inline messages, as GOV.UK does. Beside it sit:
- a **"Show only problems"** filter, which keeps ancestors visible (Jira's full-hierarchy behaviour);
- branch-type filters (deal, installation, billing, people);
- expand/collapse all;
- an "Upcoming & open" block for booked visits, open requests and unpaid invoices.

**Body.** One `<ol>` tree: **Society → Service line → Deal (by `dealLabel`) → Circuit → Demo**.

**Each row carries:**
- the date on a fixed-width left rail, as `<time datetime>` through `formatDate`. Ranges show as "06-08 → 15-08-2026", and a scheduled instant shows its time.
- the step name in past tense;
- a state **in words**: Done · Scheduled · Not reached · No date recorded · Closed – lost · Terminated;
- the gap to the previous step as quiet text: "+12 days";
- a provenance line: "entered 26-09-2026 by X", and "corrected 27-09-2026 by Y (was 26-09-2026)" from `ChangeLog`.

**Collapsing.** A finished deal collapses to one line: current step, last date, and a warning flag if anything inside it is out of order. The deal holding the current step is open. A demo forks from its circuit with a small connector at its `createdAt`. A closed or voided demo stays listed, struck through with its reason, following the repo's soft-delete rule.

**Width.**
- **Phones:** the date stacks above the step, and indentation stops at two levels. Deeper levels become breadcrumb headers ("Lighting › Basement B1 › Demo 2").
- **Desktop:** an optional **"Overlap" strip** below the list draws one lane per deal and per demo on a shared chronological axis, **never aligned**, following Zhang et al.

**Date format.** Dates stay DD-MM-YYYY, per the product's own `format-date.ts` rule, although the UX source prefers month names. That is a deliberate local override.

**Reuse.** `lightCountStages()` already shows the dated-stage rendering on the portal. `StepSection`'s done/current/locked vocabulary carries over. `dealProgress` carries no dates, so the timeline must read the fields directly.

### Steps and source fields, in order

| Branch | Step (in order) | Source field | Kind |
|---|---|---|---|
| Society | Record created | `Society.createdAt` | hybrid |
| Society | GSTIN / tariff recorded | `gstNumberRecordedAt`, `electricityUnitRateRecordedAt` | stamped |
| Society (side track) | Facility-management spans; members | `SocietyFmEngagement.startedOn/endedOn`, `SocietyMember.startedOn/endedOn` | typed |
| Society | Rejected / terminated | `Society.closedAt` | stamped |
| Service line | Enrolled | `Engagement.createdAt` (join on societyId+serviceLine) | stamped |
| Deal | Lead logged | `Pipeline.createdAt` | hybrid |
| Deal | Demo meeting | `Pipeline.meetingDate` (+ `demo_meeting` event) | typed |
| Deal | Proposal decided | `Pipeline.proposalDecidedAt` | hybrid |
| Deal | Survey assigned | `Pipeline.surveyAssignedAt` | stamped |
| Deal | Survey happened | `surveyHappenedAt()` → `survey_visit.startAt`, else `SiteSurvey.createdAt` | typed/derived |
| Circuit | Candidate recorded | `Circuit.createdAt` | stamped |
| Demo | Started | `CircuitDemo.createdAt` | stamped |
| Demo | Meter installed | `CircuitDemo.meterInstalledAt` | typed |
| Demo | Install gate pass submitted / approved | `GatePass.submittedAt/approvedAt` (demo_install, demoId) | stamped |
| Demo | Pre-install period | `preFrom → preTo` | typed |
| Demo | Replacement assigned / booked | `replacementAssignedAt`; `installation_day` event `startAt` (demoId) | stamped / typed |
| Demo | Lights replaced | `lightReplacementDate` | typed |
| Demo | Completion gate pass | `GatePass` (demo_install_completion) | stamped |
| Demo | Post-install period | `postFrom → postTo` | typed |
| Demo | Days accepted; decided | `CircuitDemoAcceptance.acceptedAt`; `decidedAt` | stamped |
| Deal | Demo report generated / shared | `DemoReport.generatedAt/sharedAt` | stamped |
| Deal (parallel) | KYC uploaded / verified | `KycDocumentFile.uploadedAt/verifiedAt` | stamped |
| Deal | Offer issued / responded | `Offer.issuedAt/respondedAt` | stamped, correctable |
| Deal | Agreement prepared → printed → notarised → signed → scan uploaded | `Agreement.preparedAt … uploadedAt` | hybrid |
| Deal | Contract activated; term start → end | `Contract.activatedAt`, `termStart/termEnd` | stamped / typed |
| Deal | Installation published; planned days | `InstallationProject.publishedAt`; `InstallationPlannedDay.plannedDate` | stamped / typed |
| Deal | Each day worked → society approved | `InstallationBatch.submittedAt` → `BatchReview.reviewedAt` | hybrid |
| Deal | Certificate signed → billing starts | `CompletionCertificate.signedAt` → `billingStartDate` | typed / derived |
| Circuit events | Light-count changes; meter stays | `BenchmarkRescaleEvent.effectiveDate`; `MeterInstallation.installedAt/removedAt` | typed |
| Billing (one collapsed row per month) | Released → invoice issued / due → paid | `MonthlyCalculation.releasedAt`, `BillingInvoice.issueDate/dueDate`, `Payment.confirmedAsOf` | stamped / typed |
| Deal | Closed lost / terminated | `Pipeline.closedLostAt`; `Contract.terminatedOn` | stamped / typed |

### Ordering rules and the gaps to close

Put every rule in **one declared table** in a pure module, `src/lib/society-chronology.ts`. Each rule is `{ later, earlier, op: ">=" | ">", severity, message }`, checked at day precision by one function, `checkSocietyChronology(snapshot)`. The page runs it, and every direct edit and change request re-runs it on the **proposed** state, as `refuseAgreementDates` and `refuseInstallationDates` already do so that dates moving together cannot deadlock. The existing per-action refusers should call into this table rather than restate it.

**Existing rules, severity error** (already enforced in code):
- lead ≥ an existing society's record;
- decision ≥ meeting and ≥ lead;
- survey ≤ earliest meter install;
- meter ≥ survey visit;
- `refuseDemoPeriods`: meter < preFrom ≤ preTo < replacement < postFrom ≤ postTo ≤ today;
- responded ≥ issued, and responded ≤ signed;
- prepared ≥ offer accepted, and the chain prepared ≤ printed ≤ notarised ≤ signed ≤ uploaded;
- activated ≥ signed;
- termEnd > termStart;
- approval ≥ work;
- certificate ≥ every day's work and approval;
- billing start = certificate + 1;
- no completed-fact date in the future.

**Gaps the inventory found**, proposed as new rules:
- demo report shared ≥ its demos' latest `postTo`;
- offer issued ≥ demo report shared, unless the demo was skipped;
- contract `termStart` ≥ agreement signed;
- certificate ≥ agreement signed;
- **billing start vs term start**: surface the gap rather than forbid it;
- first installation day ≥ agreement signed;
- gate passes ≥ their demo's meter install;
- survey assigned ≥ proposal decided;
- service-line enrolment ≤ its first lead;
- rescale `effectiveDate` ≥ the demo's replacement and not in the future;
- invoice issue ≥ billing start;
- payment ≥ invoice issue;
- `terminatedOn` ≥ `termStart`;
- **the first signing of a certificate must itself be ordered**: today it checks only blockers.

**New rules ship as warnings first** — GitHub's Evaluate idea. Existing stage data may already break them. Promote a rule to error once the stage data is clean.

**Parallel tracks are never compared with their siblings.** KYC, a second deal and a second demo are checked only against their parent step.

### How violations show

**Distinct states, each with its own words and icon, never colour alone:**
- **Out of order** (error). The message names both dates and the rule: *"Meter installed 04-11-2025 is before the site survey visit 07-11-2025 — the meter goes in on or after the survey."* The row links to that date's edit control or request form.
- **In the future** (error for a fact; normal for a scheduled step).
- **Missing before a dated step** (warning). A step not yet reached is **"Not reached"**, never missing.
- **Inferred** (info, "≈"). Examples: `startInferred` meter stays, and a survey dated from `SiteSurvey.createdAt`.
- **Unusual gap** (warning, e.g. more than 180 days between consecutive deal steps).
- **Entered long after** (neutral provenance). This is not an error, per the bitemporal model.

### Change model

**Demo mode** (`isDemoMode()`): the date on each row opens a `ClickToEdit` control. It calls the existing correction action for that field, and optionally a reason. `checkSocietyChronology` runs on the result, and `ChangeLog` is always written. First, bring `updateLeadDetails`, `correctOfferDates` and `correctProposalDate` up to that standard, and add correction paths for the uncorrectable dates the reviewer will need (demo report shared, gate passes, `terminatedOn`, `Engagement.createdAt`).

**Live mode**, as specified by the user: nobody edits a date directly. The row offers **"Request a change"**.

**Decision for the user.** `refuseDateCorrector` currently allows operations to edit directly, with a reason, in live mode. The user's spec replaces that with requests. If a break-glass direct edit is wanted, it should be a separate, logged permission, not the default.

**New table `DateChangeRequest`:**
- the record: `entity`, `entityId`, `field`, `societyId`, `pipelineId?`, `demoId?`;
- `groupId`, so that dates which must move together are one request;
- the values: `fromValue` (the value the requester saw), `toValue`, `reason` (required);
- the status: `pending | approved | rejected | withdrawn | superseded`;
- the people and times: `requestedById/At`, `decidedById/At`, `decisionNote` (required on reject), `appliedAt`.

**Rules:**
- **One open request per date**, as a partial unique index `WHERE status = 'pending'`. A second request is refused, naming the open one.
- **Checked when raised** with the same pure rules and words as a direct edit.
- **Re-checked when approved**:
  - if the current value ≠ `fromValue`, the request becomes **superseded**;
  - it is refused if the change would restate a released month (GATE-02);
  - otherwise it is applied through the **same correction function** a direct edit uses, in one transaction, with a `ChangeLog` row carrying the request id.
- **No self-approval**, refused and logged server-side.
- **Approvers** need a new `AdminPermission`, e.g. `approve_date_changes`.
- **Withdrawal** by the requester is allowed while pending.
- **Requests left over from demo mode** are closed as superseded at go-live.

**Where requests appear:**
- a warn chip on the row: "Change requested → 12-08-2026 by X";
- an approvals queue at `/admin/timeline/requests` showing old → new, the reason, and any rule warnings the requester acknowledged;
- a derived notification for approvers, and one for the requester when a decision is made;
- "My requests";
- the row's history.

**Supporting changes to `ChangeLog`:**
- add `societyId`/`pipelineId` so the timeline can read it;
- add a reader;
- **stop the demo-mode purge of `ChangeLog` once live**. A trail that can be deleted fails the "cannot be disabled" standard.

## Conclusion

The screen the user asked for turns out to be more than a view. **It is the first place where the society's whole chronology is ever checked as one object.** Every rule in the codebase today guards a single action. So a date can be legal at the moment it is entered and wrong in the context of the full lifecycle. The declared rule table, run over a snapshot, is the load-bearing piece. The tree list and the approvals queue are the surfaces over it.

Building it will expose data. The gap rules — offer before a shared report, term start before signature, a certificate signed with no ordering check — have never been enforced, so **stage almost certainly holds dates that will flag on day one**. That is the reason to launch new rules as warnings and clean the data under demo-mode direct edit before go-live flips the timeline to requests.

**Two open questions need the user's decision:**
- whether live operations keep a break-glass direct edit;
- whether the audit trail must meet India's accounting edit-log standard.

Neither changes the structure. Both change who may press which button.
