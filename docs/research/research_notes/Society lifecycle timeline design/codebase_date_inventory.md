# Codebase date inventory for a society lifecycle timeline

All sources are repository files, cited as path:line and taken from the working tree at commit 664578b (branch `portal-redesign`).

**Conventions**
- **"Typed"**: a person entered a real-world date. The code stores it at UTC midnight as `new Date("YYYY-MM-DDT00:00:00Z")`.
- **"Stamped"**: `@default(now())`, or `new Date()` in an action. It is an instant.
- **"Hybrid"**: stamped by default, but an input can override it.

Every field name below was checked in `prisma/schema.prisma`. Things that could not be checked are marked **uncertain**.

## Q1–Q3. Every lifecycle date, in stage order, with model/field, typed-vs-stamped, nullability

### Takeaway
The spine has about 60 meaningful dates spread over about 25 models.

Most commissioning facts (meter, periods, replacement) moved from `Circuit` to `CircuitDemo` on 2026-09-26. `Circuit` no longer carries `meterInstalledAt` or `lightReplacementDate`.

Three steps have no date field of their own:
- **"Lead logged"** is `Pipeline.createdAt`, which can be backdated. There is no `loggedAt` column.
- **"Survey happened"** is the `survey_visit` ScheduledEvent's `startAt`. If no visit was booked, it falls back to `SiteSurvey.createdAt`.
- **"Demo meeting"** is `Pipeline.meetingDate`, mirrored by a `demo_meeting` ScheduledEvent.

### Cited Findings

**L0 — Society** — [schema](prisma/schema.prisma) lines 305–350

| Step | Model.field | Kind | Null? |
|---|---|---|---|
| Society record created | Society.createdAt (:337) | Hybrid. It can be backdated only through `createSociety`'s `createdOn` (demo mode, via `resolveBackdate`; src/app/admin/societies/actions.ts:68). The lead path's quick-create also backdates it. | no |
| GSTIN recorded | Society.gstNumberRecordedAt (:334) | stamped | yes |
| Tariff recorded | Society.electricityUnitRateRecordedAt (:336) | stamped | yes |
| Next committee election | Society.nextElectionDate (:328) | typed prompt | yes |
| Society rejected/terminated | Society.closedAt (:325), plus closedReason | stamped (close-actions.ts:111) | yes |
| Status | Society.status (prospect/active/suspended/terminated) | enum, no date | — |

**L1 — Service line**

| Step | Model.field | Kind | Null? |
|---|---|---|---|
| Line enrolled | Engagement.createdAt (:381), unique on (societyId, serviceLine) | stamped | no |

**L2 — Deal (Pipeline, :589–660)**

Keyed by societyId + serviceLine + dealScope.

| Step | Field | Kind | Null? |
|---|---|---|---|
| Lead logged | Pipeline.createdAt (:645) | Hybrid, correctable (see Q4) | no |
| Demo meeting | Pipeline.meetingDate (:601) | typed; may be in the future | **no** |
| Survey assigned | Pipeline.surveyAssignedAt (:617) | stamped (pipeline/actions.ts, assignSurveyOwner) | yes |
| Demo skipped | Pipeline.demoSkipDate (:631) | not set by any MS-03 code, per schema comment | yes |
| Proposal decided | Pipeline.proposalDecidedAt (:636) | Hybrid (`decidedOn` in demo mode) | yes |
| Closed lost | Pipeline.closedLostAt (:641), plus closedLostStage | stamped | yes |
| (bookkeeping) | Pipeline.updatedAt | stamped | — |

**ScheduledEvent (:681–760)**

Its links are: kind; societyId, pipelineId, circuitId and demoId, all nullable; startAt (not null); endAt; status; cancelledAt; completedAt; createdAt.

| Kind | Meaning | Who creates it |
|---|---|---|
| `demo_meeting` | the meeting | createLead, with startAt = meetingDate. It is marked `done` if the meeting is past. |
| `survey_visit` | the site visit | updateSurveyVisit. Its startAt is a timed instant (`${input}:00.000Z`). |
| `installation_day` | the **demo** light-replacement day, linked to demoId | updateDemoReplacementVisit |
| `task`, `meeting`, `other` | office work | — |

Enum at schema :808.

**L3 — Survey**

| Step | Field | Kind |
|---|---|---|
| Survey (bookkeeping) | SiteSurvey.createdAt (:835) | Set to the proposal-decision date by submitProposal, and moved by correctProposalDate and correctSurveyDate. |
| Inventory area added | LightingInventoryArea.createdAt | stamped |

`surveyHappenedAt()` (src/lib/step-dates.ts:166–172) prefers the booked visit's startAt over `SiteSurvey.createdAt`.

**L4 — Circuit (:862–960)**

| Step | Field | Kind |
|---|---|---|
| Candidate recorded | Circuit.createdAt | stamped |
| Working hours changed | Circuit.workingHoursEffectiveAt | stamped |
| Benchmark overridden | Circuit.benchmarkOverrideAt | stamped (demo-step-actions.ts:1023) |
| Circuit removed | Circuit.voidedAt | stamped |

There is no meter-install or replacement date on the circuit any more.

**L5 — Demo (CircuitDemo, :1001–1085)**

Up to 3 demos per circuit; `@@unique([circuitId, sequence])`.

| Step | Field | Kind | Null |
|---|---|---|---|
| Demo started | CircuitDemo.createdAt (:1057) | stamped | no |
| Meter installed | CircuitDemo.meterInstalledAt (:1014) | typed (`installedOn`) | yes |
| Pre-install period | preFrom / preTo (:1022–1023) | typed | yes |
| Replacement assigned | replacementAssignedAt (:1028) | stamped | yes |
| Replacement day booked | ScheduledEvent(kind `installation_day`, demoId).startAt | typed instant | — |
| Lights replaced (pivot day) | lightReplacementDate (:1031) | typed | yes |
| Post-install period | postFrom / postTo (:1024–1025) | typed | yes |
| Demo rejected/accepted decision | decidedAt (:1054) | stamped | yes |
| Unlocked until | unlockedUntil (:1042) | stamped (+24h) | yes |
| Demo removed | voidedAt (:1046) | stamped | yes |

Related demo records:
- **Days accepted:** CircuitDemoAcceptance.acceptedAt (:1149, stamped), versioned per phase.
- **Daily readings:** CircuitDemoReading.date (:1109, `@db.Date`), with its own excludedAt.
- **Gate passes (demo_install, demo_install_completion):** GatePass.submittedAt (:247, stamped, not null) and approvedAt (:249, stamped). Each carries circuitId and demoId.
- **Out-of-band review:** DemoResultReview.raisedAt/resolvedAt (:1284–1285).
- **Per-line replacement:** CircuitDevice.replacedAt (:3047), which follows lightReplacementDate (demo-step-actions.ts:813, 825).
- **Kept-fixture outcome recorded:** CircuitDevice.keptRecordedAt (:3059).

**L6 — After the demo (all hang off pipelineId)**

| Step | Model.field | Kind |
|---|---|---|
| Demo report generated / shared | DemoReport.generatedAt (:1342) / sharedAt (:1345). The report is versioned and has a status (draft/shared); `demoIds[]` links it to demos. | stamped (report/actions.ts:208) |
| KYC item marked N/A | KycRequirement.markedNaAt | stamped |
| KYC file uploaded / verified | KycDocumentFile.uploadedAt / verifiedAt | stamped |
| KYC follow-up | KycFollowUp.recordedAt | stamped |
| Offer created | Offer.createdAt (:1548) | stamped |
| Offer issued | Offer.issuedAt (:1536) | stamped at issue; correctable |
| Offer accepted/rejected/countered | Offer.respondedAt (:1541). Set in admin offer/actions.ts:292/328 and in portal offer-actions.ts:55. | stamped; correctable |
| Agreement prepared | Agreement.preparedAt (:1570), not null | stamped; correctable |
| Printed / Notarised / Signed | Agreement.printedAt / notarizedAt / signedAt (:1572–1574) | Hybrid (the optional `on` argument of markAgreementStep) |
| Executed scan uploaded | Agreement.uploadedAt (:1580) | stamped; correctable |
| Contract activated | Contract.activatedAt (:1621) | stamped; correctable |
| Term start / end | Contract.termStart / termEnd (:1618–1619), not null. termEnd = termStart + offer.termMonths (agreement/actions.ts, lines ~225–226). | typed / derived |
| Terms version effective | ContractTermVersion.effectiveFrom (:1652), recordedAt | typed = termStart for v1 |
| Contract terminated (last served day) | Contract.terminatedOn (:1628) | typed |
| Termination recorded | Contract.terminatedAt (:1629) | stamped |
| Installation project published | InstallationProject.publishedAt (:1830) | stamped |
| Installation project created | InstallationProject.createdAt | stamped |
| Gate skip used | InstallationProject.gateSkipUsedAt (:1825) | stamped |
| Planned day | InstallationPlannedDay.plannedDate / startAt (:1857, 1860) | typed |
| Day's work done | InstallationBatch.submittedAt (:1920) | Hybrid (`workedOn`) |
| Society approved day | BatchReview.reviewedAt (:1957) | stamped; correctable |
| Blocker raised / resolved / affects | InstallationBlocker.raisedAt / resolvedAt / affectedDate (:1998–2011) | stamped; affectedDate is typed |
| Certificate signed | CompletionCertificate.signedAt (:2031) | typed |
| Billing starts | CompletionCertificate.billingStartDate (:2038) = signedAt + 1 day (src/lib/billing-start.ts:34–37), with proratedDays and daysInMonth | derived |
| Certificate recorded | CompletionCertificate.recordedAt (:2049) | stamped |

**Billing** — keyed by societyId + serviceLine + period

| Step | Model.field | Kind |
|---|---|---|
| Month computed | MonthlyCalculation.calculatedAt (:2495). `period` is a String YYYY-MM, not a date. | stamped |
| Month released | MonthlyCalculation.releasedAt (:2496) | stamped |
| Month sent back | MonthlyCalculation.sentBackAt (:2499) | stamped |
| Month superseded | MonthlyCalculation.supersededAt (:2504) | stamped |
| Month re-derived | MonthlyCalculation.rederivedAt (:2471) | stamped |
| Invoice issued / due | BillingInvoice.issueDate / dueDate (:2656–2657) | typed from the Zoho PDF |
| Invoice uploaded | BillingInvoice.uploadedAt | stamped |
| Invoice released | BillingInvoice.releasedAt (:2694) | stamped |
| Overdue / warning / suspend-due / suspended | overdueTrackingAt, warningStartedAt, suspendDueAt, suspendedAt (:2695–2698) | stamped by the arrears sweep |
| Invoice voided | BillingInvoice.voidedAt | stamped |
| Payment received | Payment.confirmedAsOf (:2869) | typed (invoice-actions.ts:262) |
| Cheque date | Payment.chequeDate | typed |
| Payment recorded | Payment.recordedAt | stamped |
| Extension granted | InvoiceExtension.grantedAt | stamped |
| Intake submitted | InvoiceIntake.submittedAt | stamped |
| Savings report published | PublishedSavingsReport.publishedAt | stamped |

**Circuit-level change events**

| Event | Fields |
|---|---|
| Light-count change (BenchmarkRescaleEvent, :1188–1228) | effectiveDate (typed, not null); recordedAt; voidedAt; correctedByEventId |
| Represented-count change (:2838) | `effectiveFrom` is a **String YYYY-MM**; recordedAt |
| Meter history (MeterInstallation, :3246) | installedAt (not null) and removedAt, half-open; startInferred flag; createdAt. Links meterId, circuitId, societyId. |

**Operations and people**

| Record | Date fields | Linked by |
|---|---|---|
| Inspection | inspectedAt (typed instant); period (String); createdAt; voidedAt | societyId, circuitId? |
| SocietyFmEngagement | startedOn (not null), endedOn (typed) | — |
| FmEmployment | startedOn, endedOn | — |
| SocietyMember | startedOn, endedOn (typed, nullable), createdAt | — |
| Water tank | WaterTank.assignedAt | — |
| Meter | MeterDevice.assignedAt | — |
| Ticket | createdAt, resolvedAt | — |
| StoredDocument | uploadedAt, releasedToSocietyAt | — |
| RetailInvoice | invoiceDate, paidOn, advanceOn | — |

`FieldVisit` (scheduledFor, proposedAt) is an installation-batch field visit.

### Inferences
- A timeline should read "Survey done" from `surveyHappenedAt`, not from `SiteSurvey.createdAt`, to match the ordering rules.
- The demo step "replacement day booked" is a ScheduledEvent joined by demoId. It is not a CircuitDemo column.

### Gaps
- No field records **when the lead was "approved"** (`approveLead` only flips `authoritative`), and none records **when the survey itself was completed**.
- `Pipeline.demoSkipDate` has no writer in the searched actions — **uncertain**.
- **Load test passed:** there is no date field for it. `CircuitDemo` stores meterDisplayedLoad and loadDiscrepancyPct only.

## Q4. Existing correction paths

### Takeaway
Correction paths exist for most typed dates, but the rules are inconsistent:
- **Newer (2026-09-27) paths** for installation and agreement use a shared rule: demo mode lets field/ops correct freely; live mode is ops-only with a reason. They write ChangeLog.
- **Older deal-level paths** are ops-only with no reason and no ChangeLog: updateLeadDetails, correctProposalDate and correctOfferDates.

### Cited Findings

**Deal and survey**
- **updateLeadDetails** — src/app/admin/pipeline/actions.ts:440.
  - Corrects meetingDate, `loggedOn` (→ Pipeline.createdAt), owner and scope.
  - Operations team plus manage_pipeline; **not demo-gated; no reason; no ChangeLog** (logger only).
  - Moves the `demo_meeting` event's startAt with it.
- **correctProposalDate** — pipeline/actions.ts:328.
  - Operations team plus manage_pipeline, **and demo mode only**; no reason; no ChangeLog.
  - Moves SiteSurvey.createdAt too.
- **correctSurveyDate** — pipeline/actions.ts:931.
  - Operations team plus manage_pipeline; **reason required**; not demo-gated.
  - Writes ChangeLog as entity "pipeline", with fields surveyDate / surveyVisit / leadLoggedAt / meetingDate / proposalDecidedAt.
  - With `moveEarlier`, it cascades earlier dates (lead, meeting, decision) to the same day.
- **updateSurveyVisit** — pipeline/actions.ts:749. Reschedules the visit; open to the assignee or operations.
- **createSociety `createdOn`** — backdates the society record, demo mode only (societies/actions.ts:68).

**Demo** — src/app/admin/societies/[id]/circuits/[circuitId]/demo-step-actions.ts

Every action below goes through `editableDemo` (:104). It refuses once the demo is locked by a shared report, except in demo mode or during a 24-hour ops unlock (src/lib/demo-lock.ts:25–30, refuseUnlock :35). All of them write ChangeLog; none requires a reason.

| Action | Line | Notes |
|---|---|---|
| recordDemoMeter | :181 | Re-records the meter date. Rewriting closed meter history needs demo mode (:255–259). |
| setDemoPeriods | :389 | — |
| recordDemoReplacement | :759 | Also a correction: `correcting = lightReplacementDate !== null` (:767) skips the assign/booked checks. |
| updateDemoReplacementVisit | :687 | — |
| assignDemoReplacement | :648 | — |

**Unlocking and removal**
- **unlockDemo** (:843) is ops-only with a reason; `relockDemo` (:865).
- **removeDemo** (:937) is ops-only; the reason is required outside demo mode. `purgeRemovedDemo` (:974) is demo mode only.

**Light-count changes** — rescale-actions.ts
- `voidRescaleEvent` (:131) and `correctRescaleEvent` (:198) need a reason; the correction is a void plus a new event.
- `removeRescaleEvent` (:349) is demo mode only.

**Offer**
- **correctOfferDates** — src/app/admin/pipeline/[id]/offer/actions.ts:436.
  - issuedAt and respondedAt; operations plus manage_pipeline; **not demo-gated; no reason; no ChangeLog**.

**Agreement and contract**
- **markAgreementStep(..., on)** — agreement/actions.ts:78. Backdates printed, notarised or signed when the step is first recorded.
- **correctAgreementDates** — agreement/actions.ts:302. All eight dates, corrected together:
  - agreement: prepared, printed, notarised, signed, uploaded;
  - contract: activated, termStart, termEnd.
- Its gate is **refuseDateCorrector** (src/lib/installation-dates.ts:51–56): demo mode → field or ops, reason optional; live → ops only, reason required.
- It logs ChangeLog for the agreement, the contract and contract_term_version v1's effectiveFrom.
- If the term start moves and there is no certificate, it re-projects monitoring and re-derives invoice months.

**Installation**
- **correctBatchDates** — installation/actions.ts:728. Covers submittedAt and reviewedAt.
- **correctCertificateDate** — installation/actions.ts:796. Covers the certificate plus the batches together, and recomputes billingStartDate and proration.
- Both use `refuseDateCorrector` and write ChangeLog.
- **submitBatch `workedOn`** sets submittedAt at submit time; it cannot be in the future.

**Meter history** — src/app/admin/meters/actions.ts
- `assignMeterSpan`, `editMeterStay` and `deleteMeterStay`.
- Demo mode only plus manage_users (`demoModeHistoryActor`, :299–308); **reason required**; ChangeLog entity "meter_installation".

**Close and reopen** — src/app/admin/societies/close-actions.ts
- closeDeal (:69), rejectSociety (:93), reopenDeal (:161), reopenSociety (:177).
- Operations only; reason required. There is **no correction path for terminatedOn** other than reopen and close again.

**Members and facility management**
- Members: `updateMember` (members/actions.ts:95) changes startedOn; `endMember` (:135) sets endedOn with a reason.
- Facility management: `setSocietyFmCompany` (facility-management/actions.ts:80). A same-day change is treated as a correction (`planSpanChange` "correct", src/lib/facility-management.ts:46).

**No correction path found**

| Date | Where it is set |
|---|---|
| DemoReport.sharedAt / generatedAt | report/actions.ts:208 |
| GatePass.submittedAt / approvedAt | — |
| Pipeline.surveyAssignedAt | — |
| CircuitDemoAcceptance.acceptedAt | — |
| KYC dates | — |
| Payment.confirmedAsOf | typed at recording; no edit action found |
| BillingInvoice issue/due dates | from intake; void and re-attach instead |
| Engagement.createdAt | — |
| Society.closedAt | — |
| Contract.terminatedOn | — |
| RepresentedCountChange.effectiveFrom | — |

### Inferences
- A unified "correct a date" screen would need to bring the older deal/offer paths up to the refuseDateCorrector + ChangeLog standard, or wrap them.

### Gaps
- Whether portal (society) accounts can correct any date — none found.

## Q5. Ordering rules already enforced (precise)

### Takeaway
Ordering rules are spread across about 8 pure functions plus inline checks in actions. Chaining them gives this implied order:

**society → lead → meeting → proposal decision → survey (visit) → meter install → pre period → replacement → post period; offer issued → responded → agreement prepared → printed → notarised → signed → uploaded, and signed ≤ activated; term end > term start; batch work ≤ approval ≤ certificate; billing start = certificate + 1.**

There are **no enforced links** between these pairs:
- demo report share and offer issue;
- contract term start and the certificate / installation;
- a rescale's effective date and anything else.

### Cited Findings

**Generic rules** (src/lib/step-dates.ts)
- `refuseOrderedDate` (:131–153): rejects an invalid date, a future date (compared by UTC day), and any date earlier than a listed predecessor. Null predecessors are skipped.
- `resolveBackdate` (src/lib/backdate.ts:20–33): ignores the input outside demo mode.
- `createLead`: the lead's backdate must not precede an **existing** society's createdAt. The meeting date is deliberately unordered against the society (pipeline/actions.ts, ~lines 150–185 comments).

**Lead and meeting** (updateLeadDetails, pipeline/actions.ts)
- The meeting may not be after proposalDecidedAt.
- The lead's logged date may not be in the future, and may not be after proposalDecidedAt.
- Neither is ordered against the society record, deliberately, because the lead path creates that record (circular).

**Proposal decision** (submitProposal and correctProposalDate)
- Not before meetingDate, not before the lead's createdAt, not in the future (pipeline/actions.ts:369–378; submitProposal ~:667–670).
- correctProposalDate also refuses a decision later than the earliest live demo's meterInstalledAt (:381–391).

**Survey date** (correctSurveyDate)
- Not in the future.
- Not later than the earliest demo meter install.
- Must not precede the lead, meeting or decision unless `moveEarlier` cascades them.

**Meter install** (recordDemoMeter)
- Not in the future; not before `surveyHappenedAt` (:201).
- Must be before preFrom (:203) and before lightReplacementDate (:204).
- Meter history must not overlap: `refuseOverlap` (src/lib/meter-installation.ts:90+), which requires to > from and no overlap per meter or per circuit, and `planSpanAssignment` (:191+).
- Released-bill days cannot move (demo-step-actions.ts:263–265; meters/actions.ts).

**Demo periods** — `refuseDemoPeriods` (src/lib/demo-periods.ts:69–90)
- Both ends are set, or neither.
- preFrom > meterInstalledAt; preFrom ≤ preTo; preTo < lightReplacementDate; preTo ≤ today.
- postFrom > lightReplacementDate; postFrom ≤ postTo; postTo ≤ today.
- preTo < postFrom.

**Replacement** (recordDemoReplacement, demo-step-actions.ts:766–777)
- Requires meterInstalledAt; not in the future; must be after the meter day.
- Must be after preTo and before postFrom.
- On the first recording only, it requires an assigned owner and a booked `installation_day` event.
- The older `refuseReplacementDate` / `refuseReplacementMove` (step-dates.ts:35–95) express the same meter-day rules plus "not before the last pre-install reading".

**Offer** (correctOfferDates)
- Issued: not before meetingDate, not in the future.
- Responded: not before issued, not after agreement.signedAt.

**Agreement and contract**
- `refuseAgreementDates` (src/lib/agreement-dates.ts:28–67):
  - no step in the future;
  - prepared ≥ offer accepted;
  - prepared ≤ printed ≤ notarised ≤ signed ≤ uploaded (null steps skipped);
  - activated ≥ signed;
  - termEnd > termStart.
- `markAgreementStep` checks that the step is not before offer.respondedAt and not before the previous step (agreement/actions.ts:85–106).
- The term start cannot move later past a released month when there is no certificate (correctAgreementDates).

**Installation** — `refuseInstallationDates` (src/lib/installation-dates.ts:24–43)
- Work and approval: not in the future; approval ≥ work.
- Certificate: not in the future; ≥ every batch's latest work/approval date.
- Moving billing start later past a released month is refused (installation/actions.ts, correctCertificateDate).
- `signCompletionCertificate` checks completion blockers only — **no date ordering on first signing** (installation/actions.ts:632–648).

**Billing start and proration**
- `billingStartFor` = signedAt + 1 day; the first month is prorated inclusively (src/lib/billing-start.ts:34–60).
- The final month is prorated to terminatedOn (:72–81); `servedUntil` = min(termEnd, terminatedOn) (src/lib/deal-close.ts:62–64).

**Close and reopen** (src/lib/deal-close.ts)
- `refuseClose` (:54–58): reason required; last served day present and not in the future.
- `refuseReopen` (:67–72): refused if the termination month is released.

**Members and facility management**
- `refuseEnd` (src/lib/society-members.ts:36–42): ended date not in the future, not before startedOn; reason required.
- `planSpanChange` (src/lib/facility-management.ts:42–52): not in the future; not before the open span's start; closes the old span the day before.

**Rescale**
- `refuseRescale` (src/lib/benchmark-rescale.ts:68–83) only needs a valid effective date. There is **no ordering** against replacement, billing start or the future.

### Inferences
- Rules are checked per action. No single function validates a whole society's chain.
- A timeline editor that moves several dates at once needs the "checked once against the result" pattern already used by `refuseAgreementDates` and `refuseInstallationDates`.

### Gaps
- Nothing orders the offer against the demo report, the contract termStart against signedAt, or the certificate against termStart.

## Q6. Joins (foreign keys) for a timeline

### Takeaway
Everything reaches the society through societyId or pipelineId.

### Cited Findings
- **Society** → Engagement(societyId, serviceLine) and Pipeline(societyId).
- **Pipeline** → the 1:1 records SiteSurvey, Agreement, Contract and InstallationProject, all unique on pipelineId.
- **Pipeline** → the 1:n records DemoReport, KycRequirement, Offer and ScheduledEvent(pipelineId).
- **SiteSurvey** → Circuit(siteSurveyId) → CircuitDemo(circuitId) → CircuitDemoReading, CircuitDemoAcceptance, GatePass(demoId), and ScheduledEvent(demoId, `installation_day`).
- **Circuit** also carries societyId.
- **Engagement ↔ Pipeline:** there is no FK. They join on (societyId, serviceLine).
- **Circuit-level events:** BenchmarkRescaleEvent, RepresentedCountChange, MeterInstallation, Inspection, PublishedSavingsReport and CircuitFeeLine all carry circuitId.
- **InstallationProject** → InstallationPlannedDay, InstallationBatch → BatchReview(batchId); InstallationBlocker; CompletionCertificate(projectId).
- **Contract** carries pipelineId, societyId and agreementId; ContractTermVersion(contractId).
- **MonthlyCalculation** has societyId and serviceLine, and is **not linked to a pipeline**. Each circuit's part is resolved through survey → pipeline → contract. BillingInvoice links to monthlyCalculationId; Payment to invoiceId.
- **DemoReport ↔ CircuitDemo** go through the `demoIds String[]` array. There is no FK.
- **Offer** links to demoReportId.
- **ChangeLog** has only entity, entityId, circuitId, demoId and meterId (:1162–1180). There is **no societyId or pipelineId**, so pipeline, agreement and contract entries can be reached only through entityId.

### Inferences
- A society-level timeline query must fan out per pipeline and per circuit.
- Society-level ChangeLog history needs either new columns (societyId, pipelineId) or entityId joins per entity type.

### Gaps
- None beyond the above.

## Q7. ChangeLog, logChange, demo mode, and change-request/approval models

### Takeaway
- **ChangeLog** is a write-only audit table: no code reads it. `changeLog.find*`, `count` and `groupBy` return nothing; the only other use is deleteMany in demo purge (demo-step-actions.ts:920–921).
- **Demo mode** needs both an env flag and the admin's own per-user flag.
- **No change-request or approval model exists.**

### Cited Findings
- **ChangeLog fields** (schema :1162–1180): id, entity, entityId, circuitId?, demoId?, meterId?, kind, field?, oldValue Json?, newValue Json?, reason?, actorId? (no FK), at (default now). Indexed on (demoId, at), (circuitId, at) and (meterId, at).
- **logChange(tx, entry)** (src/lib/change-log.ts:8–40) runs inside a transaction and JSON-serialises the old and new values.
- **Callers:** demo-step-actions, demo-review-actions, inventory-actions, pipeline/actions (correctSurveyDate only), agreement/actions, installation/actions, meters/actions, lib/meter-history, lib/offer-demo-reconcile.
- **Demo mode** (src/lib/demo-mode.ts)
  - `demoModeAvailable()` checks `process.env.DEMO_MODE === "true"` (:29–31).
  - `isDemoMode()` also requires `resolveAdmin().demoMode === true` (:38–42).
  - `demoBypass()` logs `demo.bypass` (:50–57).
  - It relaxes time gates only, never money or authority rules (:8–14).
- **No approval model:** no model named *Request or *Approval exists. A grep for `model \w*(Request|Approval)` returned nothing.
- **Closest analogues:**
  - demo unlock (`unlockedUntil` / `unlockReason`, a 24-hour ops unlock);
  - the "special request" is implemented as "operations with a reason" (refuseDateCorrector).
  - Records that imply an approval: GatePass status/approvedAt, Pipeline.authoritative, DeviceType approval.

### Inferences
- A new timeline screen can reuse logChange but must add a reader.
- A request/approve workflow would be new schema.

### Gaps
- ChangeLog.actorId has no FK; actor names must be joined manually.

## Q8. Existing step maps / partial timelines

### Takeaway
- **Deal spine:** `dealProgress` shows the steps and statuses but **carries no dates**.
- **Demo steps:** `demoSteps` **does** show a few dates in its summaries.
- The only real dated history view is the portal's light-count history.

### Cited Findings
- **dealProgress** (src/lib/deal-progress.ts)
  - `DealStep` = {key, title, status: done/current/parallel/locked, summary, href?, blockedBy?, parallelTrack?} (:2–30).
  - Spine keys: lead, assign-survey, survey, commissioning, report, share-report, kyc, offer, agreement, installation, billing (:311–455).
  - It never calls formatDate (0 matches); the summaries are text only ("Assigned to X", "Proposal agreed").
- **circuitSteps**: eligibility and similar keys (deal-progress.ts:608+).
- **demoSteps** (src/lib/demo-steps.ts:87+)
  - Keys: eligibility, meter, install-gate, pre-readings, assign-replacement, replacement, completion-gate, post-readings.
  - Summaries with dates: "Meter installed DD-MM-YYYY" (:104–105), "owner · DD-MM-YYYY" for the replacement booking (:132–134), and "Replaced DD-MM-YYYY" (:144–145).
  - It formats dates with its own `fmt` (:51), not format-date.ts.
- **Rendering components:** `DealStepper` (src/components/deal-stepper.tsx) and `StepSection` (src/components/step-section.tsx).
- **Light-count history:** `lightCountStages()` (src/lib/light-count-history.ts), rendered by src/app/portal/light-count-history.tsx. It shows dated stages from/to with baseline and benchmark.
- No other "timeline" component exists; grep found only that file.

### Inferences
- A lifecycle timeline can reuse the StepSection closed/done/locked vocabulary, but must source its dates independently from the fields in Q1.

### Gaps
- Whether `DealStepper`'s layout accommodates dates — not inspected in depth.
