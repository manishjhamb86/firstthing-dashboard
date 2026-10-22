# Defining and displaying "not on time" across heterogeneous work items (founders' dashboard)

Scope: industry practice and Indian rules for SLAs, aging and lateness, to turn into concrete per-item-type rules for FirsThing's founders' dashboard (payments, meter issues, installation days, meetings, complaints, demos/gate passes). Research done 2026-10-22. Several primary-source sites (vikaspedia, drishtiias, nngroup) could not be fetched from this environment, so some points rest on search-result summaries of those pages; this is noted where it applies. Every threshold below is labelled **[STANDARD/LAW]**, **[VENDOR DEFAULT/EXAMPLE]**, or **[DESIGN CHOICE]**.

## 1. Customer-complaint SLAs (first response, resolution) — field service, facilities, utilities, India

### Takeaway
India has one directly relevant statutory pair: the e-commerce rules' **acknowledge within 48 hours, redress within one month**. Electricity-sector rules cap grievance redressal at **45 days**, with item-level limits set by each state commission (e.g. Delhi's burnt-meter restoration in hours and replacement in days). Field-service and facilities SLAs are contractual. The common shape is a P1–P4 priority grid, roughly **30 min–4 h first response** and **4 h–5 days resolution**. No Indian norm was found specifically for housing-society or RWA complaint handling.

### Cited Findings
- **E-commerce complaints [LAW]:** the Consumer Protection (E-Commerce) Rules, 2020 require the grievance officer to "acknowledge the receipt of any consumer complaint within 48 hours" and to redress it "within one month from the date of receipt". — [ONDC legal handbook, Annexure E (rule text)](https://www.ondc.org/legal-compliance-handbook/ANNEXURE-–-E.1086291982.html); [Lakshmikumaran & Sridharan briefing](https://cn.lakshmisri.com/newsroom/news-briefings/e-commerce-consumer-protection-e-commerce-rules-2020-notified)
  - Strictly this applies to e-commerce entities, not to a B2B energy-services firm. It is still a widely recognised Indian consumer-grievance benchmark.
  - A 2026 amendment is reported to keep the same 48 h / 1 month timelines (operational 1 Jan 2027). This comes from a coaching-site summary and is **unverified** — [CivilsDaily](https://www.civilsdaily.com/news/e-commerce-firms-brought-under-tighter-regulation/)
- **Electricity grievances [LAW, via secondary sources]:** the Electricity (Rights of Consumers) Rules, 2020 set a maximum of 45 days for grievance redressal, and the licensee specifies time limits per grievance type and forum level. — [Vikaspedia summary](https://vikaspedia.in/energy/policy-support/electricity-(rights-of-consumers)-rules-2020); [Sansa Legal (CGRF must decide within 45 days)](https://www.sansalegal.com/post/how-to-file-a-complaint-with-the-electricity-ombudsman-in-india-consumer-rights-and-process)
  - The same rules set connection timelines of 7 days (metro), 15 days (other municipal areas) and 30 days (rural). — [Drishti IAS](https://www.drishtiias.com/daily-updates/daily-news-analysis/electricity-rights-of-consumers-rules-2020)
  - Gazette G.S.R. 818(E), 31 Dec 2020 was **not read directly**.
- **Delhi's Supply Code timelines [LAW, state level], as applied in DERC orders:**
  - Under the 2007 Code, a licensee restores connection within 6 hours of a burnt-meter complaint, and the new meter is provided within 3 days. A disputed meter must be tested within 15 days of the complaint. — [DERC order, Vinod Kumar Gupta vs TPDDL (2017)](https://www.derc.gov.in/sites/default/files/Vinod%20Kumar%20Gupta%20vs%20TPDDL%20-%2010.11.2017.pdf)
  - The 2017 Code tightened restoration to 3 hours. — [DERC orders index](https://www.derc.gov.in/sites/default/files/Yogesh%20vats%20vs%20BRPL.pdf)
  - Enforcement works by complaint to the commission, not by automatic penalty. One order found a replacement made after 402 days instead of 3. — [DERC, Sanjay Jain vs BYPL](https://www.derc.gov.in/sites/default/files/Sanjay-Jain-vs-BYPL-Case-ID-YM150118NY110_0.pdf)
- **ITIL [STANDARD]:** ITIL prescribes the *method* (priority = impact × urgency), not the numbers. — [IT Process Maps, Checklist Incident Priority](https://wiki.en.it-processmaps.com/index.php/Checklist_Incident_Priority); [Univ. of Alaska ESM priority matrix ("define times after discussion with stakeholders")](https://service.alaska.edu/TDClient/36/Portal/KB/Article/564/Enterprise-Service-Management-Priority-Matrix)
- **Insight managed services [VENDOR EXAMPLE]:** acknowledgement / update cadence / resolution by priority (95th percentile):
  - P1: 15 min / 1 h / 4 h
  - P2: 1 h / 4 h / 8 h
  - P3: 4 h / 24 h / 72 h
  - P4: 24 h / 72 h / 120 h

  — [Insight managed services service levels](https://www.insight.com/en_US/help/managed-services-service-levels-and-requests.html)
- **Facilities maintenance [VENDOR EXAMPLES]:**
  - One guide: P1 critical 30 min response, 4 h resolution, 99% compliance; P2 urgent 2 h response, 24 h resolution. — [Oxmaint, building maintenance SLA tracking](https://oxmaint.com/industries/facility-management/building-maintenance-sla-tracking-for-work-orders)
  - Another: P1 at 30–60 min response with same-day resolution. — [FacilityBot](https://blog.facilitybot.co/?p=9287)
  - "Many SLAs specify a maximum time within which a submitted request must be acknowledged — often 30 minutes to two hours depending on priority level." — [Oxmaint vendor SLA guide](https://oxmaint.com/industries/facility-management/facility-vendor-sla-tracking-response-time-cmms-guide)
- **Zendesk metrics [VENDOR DEFINITION]:**
  - First reply time runs from creation to the first public agent response.
  - Next reply time runs from the customer's latest unanswered comment to the next public reply.
  - First reply, next reply, periodic update and total resolution do **not** pause in "pending".
  - Policies are evaluated top to bottom, and the first match applies.

  — [Zendesk: defining SLA policies](https://support.zendesk.com/hc/en-us/articles/4408885881498); [Zendesk SLA article 218161007](https://support.zendesk.com/hc/en-us/articles/218161007)
- **Freshdesk mechanics [VENDOR DEFINITION]:**
  - Reminders fire 5 min to 4 h *before* the due time, separately for first response, next response and resolution.
  - Escalations fire *after* a breach: one level for response, up to four levels for resolution, each delayed from immediately to 1 month, to agents or managers.
  - A breached response is tagged "response due"; a breached resolution is tagged "overdue".

  — [Freshdesk: setting up SLA reminders](https://support.freshdesk.com/solution/articles/224638-setting-up-sla-reminders); [Freshdesk: escalation emails](https://support.freshdesk.com/en/support/solutions/articles/228175-how-to-send-escalation-emails-to-unresponsive-agents-)
- **Jira Service Management [VENDOR DEFINITION]:**
  - SLAs have start, pause and stop conditions. A re-triggered start begins a new cycle.
  - Time counts against a goal-specific calendar (e.g. 9–5), so a clock reads "paused" outside working hours.
  - A breach is shown as negative remaining time.
  - JQL distinguishes `breached()` (last cycle) from `everBreached()` (any cycle).

  — [Atlassian: why an SLA is paused](https://support.atlassian.com/jira/kb/understanding-why-an-sla-is-paused-in-a-jira-service-management-ticket/); [Atlassian: How teams see SLAs](https://confluence.atlassian.com/servicemanagementserver0416/how-teams-see-slas-1062241751.html); [Atlassian: SLA JQL](https://confluence.atlassian.com/servicemanagementserver101/using-jql-queries-specific-to-slas-1455887606.html)

### Inferences
- **A defensible Indian anchor for society complaints [DESIGN CHOICE grounded in LAW]:** acknowledge ≤ 48 h, which is the e-commerce rule and well inside the facilities norm of 30 min–2 h. Resolution then splits by type:
  - **Statutory outer limit:** ≤ 30 days (one month) for anything not otherwise specified.
  - **Hard ceiling:** 45 days, which mirrors the electricity grievance cap.
  - **Internal targets:** much shorter, set by priority (see below).
- **A suggested ticket grid for the existing `Ticket` types [DESIGN CHOICE, based on the vendor examples]:**

  | Ticket type | First response | Resolution |
  | --- | --- | --- |
  | Complaint, lights out across a common area (safety, e.g. basement or stair dark) | 4 h | 24–48 h |
  | Ordinary complaint, device replacement | 1 business day | 5 business days |
  | Pickup | 1 business day | 7 days |
  | Sales enquiry | 1 business day | No resolution SLA (it is a lead, not a defect) |

- **Show two clocks per ticket,** as Zendesk and Freshdesk do: response and resolution. A ticket can be responded to on time and still be late to resolve.
- **Pause rule:** reply clocks should not pause. A resolution clock *may* pause while waiting on the society, but only for an explicit "waiting on society" state, never silently. This follows the JSM pause/start model.
- **Calendar choice is a decision to make explicitly.** Business hours (IST, Mon–Sat?) or 24×7 changes every figure. JSM shows clocks paused outside the calendar, which can confuse founders reading at night.

### Gaps
- The Electricity (Rights of Consumers) Rules 2020 gazette text was not read directly; the 45-day figure rests on secondary summaries, which disagree on whether it is a hard cap or a default.
- No Indian RWA, housing-society or FM-contract norm for complaint response was found. FM SLAs in India appear to be contractual (AMC-specific).
- CEA / SERC standards of performance for supply restoration (urban/rural hours) beyond Delhi were not collected.

## 2. Receivables aging, DSO, and India-specific payment rules (MSMED 45 days, TDS, credit terms)

### Takeaway
Receivables are conventionally reported in aging buckets measured from the **due date**: Current, 1–30, 31–60, 61–90 and 90+ days past due. DSO is a period average and must be read beside the buckets, because it hides a 90+ tail. In India the MSMED Act gives a supplier like FirsThing a legal hook if it is a registered micro or small enterprise: payment is due on the agreed date, never later than 45 days from acceptance (15 days with no written agreement). After that, compound interest at 3× the RBI bank rate runs. Section 43B(h) denies the buyer a tax deduction for late payment, but it applies only to buyers that are businesses claiming deductions, which housing societies often are not.

### Cited Findings
- **Aging buckets [CONVENTION]:** commonly Current, 1–30, 31–60, 61–90 and 90+ days past due, or 0–30 / 31–60 / 61–90 / 90+. — [Relay](https://relayfi.com/blog/calculate-days-sales-outstanding/); [Orb](https://www.withorb.com/blog/aging-report)
  - One SaaS guide calls a book healthy with ≥80% current and ≤5% across all 30+ buckets [VENDOR EXAMPLE, SaaS-specific]. — [Dodo Payments](https://dodopayments.com/blogs/accounts-receivable-saas-guide)
- **DSO [STANDARD FORMULA, inputs vary]:** DSO = AR ÷ credit sales × days in period. Some sources use average AR, and some use total revenue.
  - Worked example: $1.5M AR on $3M of Q1 credit sales over 90 days gives 45 days. — [Stuut](https://www.stuut.ai/blog/dso-vs-ar-aging-report); [Tesorio](https://tesorio.com/blog/understanding-the-dso-formula-a-complete-guide-for-accounts-receivable-efficiency)
  - DSO is an average, so it can look healthy while a large 90+ tail exists; read it with the aging report. — [Stuut](https://www.stuut.ai/blog/dso-vs-ar-aging-report)
- **MSMED Act s.15 [LAW]:**
  - With a written agreement, payment is due on the agreed date but in no case beyond 45 days from acceptance or deemed acceptance of the goods or services.
  - With no agreement, payment is due within 15 days. One taxguru article says 45 days, which appears to be an error.

  — [TaxGuru on s.43B(h)](https://www.taxguru.in/income-tax/section-43bh-msme-payment.html); [busy.in](https://busy.in/tds/section-43bh-msme-payment-rule-and-45-day-limit-explained/); [SCC Online](https://www.scconline.com/blog/post/2022/12/14/when-is-the-interest-rate-payable-under-section-16-of-the-msmed-act-2006-applicable/)
- **MSMED Act s.16 [LAW]:** a buyer who misses the s.15 limit pays compound interest with monthly rests at 3× the RBI bank rate, notwithstanding any agreement. Worked example: 8.75% × 3 = 26.25%. — [LiveLaw](https://www.livelaw.in/amp/law-firms/law-firm-articles-/the-stringency-of-interest-provisions-under-msmed-act-implementation-and-judicial-interpretation-310929); [WIRC-ICAI MSME deck](https://old.wirc-icai.org/images/material/MSME-PPT-WIRC.pdf)
- **Section 43B(h) [LAW]:** a buyer's payment to a registered *micro or small* enterprise made beyond the s.15 limit is deductible only in the year actually paid.
  - The Finance Ministry confirmed (July 2026 Rajya Sabha reply) that the limit is at most 45 days and maps to s.37(2)(g) of the Income-tax Act, 2025.
  - Medium enterprises and pure traders are outside it, and the supplier's Udyam registration determines applicability.

  — [TaxGuru: Finance Ministry clarifies](https://taxguru.in/income-tax/finance-ministry-clarifies-section-43bh-45-day-msme-payment-rule.html); [ITAT Online](https://itatonline.org/digest/articles/43bh-explained-briefly/)
- **Recovery route [LAW/PROCESS]:** MSME Samadhaan, the MSE Facilitation Council, is the delayed-payment recovery route. — [Bhatt & Joshi Associates](https://bhattandjoshiassociates.com/option-4-msme-samadhaan-delayed-payments-to-micro-and-small-enterprises-under-micro-small-and-medium-enterprise-development-msmed-act-2006)

### Inferences
- **Age every unpaid released invoice from its own due date [DESIGN CHOICE consistent with CONVENTION].** FirsThing already keys CON-13's clock off the invoice due date.
- **Use buckets** Not yet due / 1–15 / 16–30 / 31–60 / 61–90 / 90+.
  - The extra 1–15 split matters because FirsThing's suspension clock and its own payment rating start at 2–7 days late.
  - Standard reporting can still roll these up to 1–30.
- **Count TDS as settlement,** as the app already does: received + TDS ≥ total. Otherwise every TDS-deducting society shows a perpetual small "unpaid" residue and pollutes the 90+ bucket.
- **Show "invoice exceeds 45 days from issue/acceptance" as a separate legal-risk marker, not a colour [DESIGN CHOICE].** It is only meaningful if FirsThing holds Udyam micro/small registration and the buyer is covered. Whether a society that is not a business counts as a "buyer" under MSMED is a legal question for counsel.
- **Show DSO only as a trend line next to the bucket bar,** never alone.

### Gaps
- No authoritative source was found on typical B2B credit terms for Indian energy-services or RWA contracts. Net 15 or net 30 is plausible but unsourced.
- The TDS sections likely applicable to these invoices (194C or 194J) and their rates were not researched.
- India Code's primary text of MSMED s.15–16 was not fetched directly.
- Whether a cooperative housing society or RWA counts as a "buyer" under MSMED / s.43B(h) was not settled.

## 3. SLAs for alerts: time-to-acknowledge / time-to-resolve for an offline IoT device; escalation tiers

### Takeaway
Two clocks are standard:
- **Detection.** Offline is declared only after **2–3× the expected reporting interval** with no data, never on one missed beat.
- **Response.** Acknowledge, then resolve, with escalation if unacknowledged within a timeout.

In incident tools, acknowledging stops escalation but does not resolve. Severity-tiered alarms (Major, then Critical as an outage persists) are the norm. All timeout numbers are design choices.

### Cited Findings
- **Detection threshold [VENDOR GUIDANCE]:**
  - Set the offline timeout above 2× the heartbeat interval. — [Schneider Electric community](https://community.se.com/t5/Building-Automation-Knowledge/Offline-monitoring-of-a-Zigbee-device-in-EBO/ta-p/385960)
  - Treat a device as offline after three missed intervals (a TTL of 3× the interval). — [OneUptime, Redis heartbeat](https://oneuptime.com/blog/post/2026-03-31-redis-iot-device-heartbeat-monitoring/view)
  - Alibaba IoT declares offline at 1.5× the heartbeat plus the check wait. It warns that abnormal disconnects (power loss) are detected late, so use the message timestamp for when the change actually happened. — [Alibaba Cloud IoT device status FAQ](https://www.alibabacloud.com/help/en/iot/support/faq-about-device-status)
  - Changing the heartbeat interval requires adjusting the alert delay. — [VMware SD-WAN operator guide](https://docs.vmware.com/en/VMware-SD-WAN/3.3/vmware-sd-wan-operator-guide/GUID-D22AC001-DF63-45FD-99F0-8ED45940E697.html)
- **Tiered alarm [VENDOR PATTERN]:** ThingsBoard's offline alarm raises *Major* after several minutes of silence, escalates to *Critical* if the outage continues, and clears on reconnect. — [ThingsBoard device-offline alarm](https://thingsboard.io/iot-hub/alarm-rules/device-offline-alarm/)
- **PagerDuty [VENDOR DEFINITION]:**
  - The escalation timeout is the time a responder has before the incident moves to the next rule.
  - Acknowledging stops escalation and pauses notifications but does **not** resolve.
  - A re-trigger resumes the policy.

  — [PagerDuty: escalation policy basics](https://support.pagerduty.com/v1/docs/escalation-policies)
- **Escalation timeouts by severity [THIRD-PARTY EXAMPLES, not PagerDuty defaults]:** about 5 min critical, 10–15 min high, 30 min medium, 1–2 h low; a 30-minute default per rule (unverified). — [OneUptime, alert escalation paths](https://oneuptime.com/blog/post/2026-01-30-alert-escalation-paths/view); [Pulsetic glossary](https://pulsetic.com/glossary/escalation-policy/)
- **Alert fatigue signs:**
  - Alert volume rising without a rise in real incidents;
  - more false positives and duplicates;
  - slower acknowledgement;
  - more manual silencing.

  — [Rootly, alert fatigue](https://rootly.com/alert-management/alert-fatigue.md)
  - The opt-out rate is the clearest fatigue signal. — [Courier](https://www.courier.com/blog/what-is-alert-fatigue)

### Inferences
- **Map to FirsThing's existing mechanics.** The meter poll is hourly, and "offline" is already declared after **two consecutive** failed polls (PROJECT_CONTEXT, meter module 2026-08-28). That matches the 2× interval guidance [DESIGN CHOICE already made]. `offlineSince` is stamped once, which is the right basis for "down for X".
- **Proposed lateness for a meter alert [DESIGN CHOICE]:**
  - **Acknowledge SLA:** 4 business hours. These are lighting meters, not life-safety; nobody is paged at night.
  - **Resolve SLA:**
    - meter offline: 48 h, then field visit;
    - out-of-range or above the physical ceiling: 24 h;
    - savings below the agreed band: by the next billing run, because it acts on a monthly figure. The band alert already re-arms after a 24 h cool-off.
- **Escalation tiers:** owner, then operations lead, then founders.
  - Founders see an alert only once it breaches resolve, or once it threatens a bill (offline days inside a month about to be billed).
  - This is the main anti-fatigue lever: the founders' view should list *breaches*, not *alerts*.
- **Keep "acknowledged" distinct from "resolved"** on the dashboard. The app already does this for meter alerts. An acknowledged-but-unresolved item past its resolve SLA is still red.

### Gaps
- No Indian or utility standard for smart-meter communication-failure response was found. DERC's burnt-meter timelines (6 h / 3 h restoration, 3-day replacement) are the closest regulatory analogue, but they concern supply, not telemetry.
- PagerDuty's own default timeout values were not confirmed from primary docs.

## 4. Project / stage-gate lateness: planned vs actual, "stuck in stage longer than X", PM-tool conventions, pilots tracked against plan

### Takeaway
- **Plan-based items.** Tools compute lateness as **current or forecast date minus baseline date**: MS Project's Finish Variance is calculated, positive means late, and it is counted in workdays.
- **Items with no plan date.** CRMs use an **idle timer per stage**: Pipedrive's "rotting in N days", configured per stage and reset by activity.
- **RAG thresholds** are organisation-defined. A typical published example is Green within 5% of plan, Amber 5–15% behind, Red over 15% behind *with no approved recovery plan*. Thresholds should be fixed in advance and not edited to avoid red.

### Cited Findings
- **MS Project Finish Variance [VENDOR DEFINITION]:** Finish − Baseline Finish, calculated; 0 until the dates differ. Positive means later than planned. Shown in the Variance table and the Tracking Gantt. — [Microsoft Support: Finish Variance fields](https://support.microsoft.com/id-ID/project/finish-variance-fields)
  - Counted in workdays, and project-level slip is read on the summary task. — [Microsoft Tech Community](https://techcommunity.microsoft.com/discussions/project/how-to-calculate-the-total-delay-on-the-programme/3868982)
  - Filters can highlight tasks finishing after baseline, and older docs check StartVariance > 0 for late *starts*. — [techno-pm](https://techno-pm.com/2015/02/highlight-track-tasks-msproject.html); [Microsoft Learn StartVariance](https://learn.microsoft.com/en-us/previous-versions/office/developer/office-2003/aa208123(v=office.11))
- **Pipedrive rotting [VENDOR DEFINITION]:**
  - A per-stage "Rotting in (days)" setting marks a deal rotten, with a red tile, when it hasn't been updated for that long.
  - Activities done, notes, files and some emails reset the timer.
  - **A scheduled future activity does not prevent rotting.**

  — [Pipedrive: The Rotting Feature](https://support.pipedrive.com/en/article/the-rotting-feature)
- **RAG thresholds [EXAMPLES, not a standard]:**
  - Schedule: Green ≤5% behind plan, Amber 5–15% behind, Red >15% behind with no approved recovery plan. Thresholds should stay fixed unless changed through formal change control, because moving them to avoid Red is a governance failure. — [Institute of Project Management](https://instituteprojectmanagement.com/blog/rag-status-in-project-management/)
  - Time-based alternative: Amber for a slip within about one week, Red beyond it. Budget: Green ≤5%, Amber 5–10%, Red above. — [Replicon](https://www.replicon.com/?p=163862)
  - Green = on track, Amber = needs attention, Red = escalate now. — [Scaler](https://www.scaler.com/topics/rag-status/)
  - Context matters: the same 5% means something different under a statutory deadline. — [Institute of Project Management](https://instituteprojectmanagement.com/blog/rag-status-in-project-management/)

### Inferences
**Two lateness families** [DESIGN CHOICE]:
- **Plan-date items** — installation days, scheduled meetings, booked replacement day, demo period end, contract and billing start: "late" means the planned date has passed with no actual date recorded. Lateness = today − planned, in **calendar days** (or workdays, if chosen) — pick one and state it.
- **No-plan-date items** — stage dwell, e.g. a lead stuck in survey_pending: Pipedrive-style "stuck in stage longer than N days", with N set per stage. The clock resets on a *real state change*, not on a note. Pipedrive's lesson is that a far-future scheduled activity must not hide staleness.

**Demo/pilot timing** — derived from the project's own CON-19 windows [DESIGN CHOICE grounded in internal spec]:

| Stage | Expected duration | Amber | Red |
| --- | --- | --- | --- |
| Meter install → pre-window opens | next day | — | — |
| Pre-install baseline window (5 valid days) | ~5 days | > 7 days | > 10 days, or an open anomaly older than 48 h |
| Replacement scheduled → replaced | planned day | planned day passed | planned day + 2 days |
| Post-install window | ~5 days | same as pre-install window | same as pre-install window |
| Benchmark review (FEAT-015) | — | — | already overdue at 24 h (existing rule) |

**Gate passes:**
- Submitted → provisional after 30 min (ADR-006, existing).
- Overdue only if no submission by the stage it gates.

**Installation days (CON-21) — the society approves each day within a window.** The window is an existing hard rule, so lateness here is binary and red; no amber is needed.
- **Late:** a missed approval deadline.
- **Lateness of the project overall:** count of planned days past date without a batch, plus days with an open dispute.

**RAG rule template** for every item type [DESIGN CHOICE]:
- **Green:** not yet due.
- **Amber:** due within the warning window (e.g. 20–25% of the SLA remaining, or due today/tomorrow), *or* past due but inside a grace period.
- **Red:** past due beyond grace, *or* any hard-rule breach (legal limit, contractual deadline, money at risk). Red also requires that no recovery plan or date has been recorded, per the IPM definition.
- Thresholds are written down once and versioned.

### Gaps
- No primary Asana or Jira Software documentation was collected on "overdue" display (both show past due dates in red text).
- No construction-scheduling source was collected beyond MS Project.
- No published standard was found for pilot/trial duration slippage in energy M&V. IPMVP fixes baseline and reporting periods but does not define lateness.

## 5. Display: SLA timers, "due in / overdue by", aging buckets, RAG definitions, avoiding alert fatigue, owner + next action

### Takeaway
Mature tools converge on a few display patterns:
- one signed timer per clock — remaining time positive, breached shown negative or as "overdue by" (JSM);
- tags for breach type (Freshdesk "response due" vs "overdue");
- pre-breach *reminders* separate from post-breach *escalations*;
- a colour that marks exceptions, not every item.

NN/g distinguishes passive **indicators** (dynamic status cues on an item) from **notifications** (system events, some requiring action). On a dashboard, lateness is an indicator and belongs on the row; only breaches needing a decision justify a notification.

### Cited Findings
- **JSM:** breached time is shown as a negative number. — [Atlassian: How teams see SLAs](https://confluence.atlassian.com/servicemanagementserver0416/how-teams-see-slas-1062241751.html)
- **Freshdesk:** breach tags "response due" and "overdue" show in the queue list; reminders fire before the due time and escalations after. — [Freshdesk SLA reminders](https://support.freshdesk.com/solution/articles/224638-setting-up-sla-reminders)
- **Zendesk:** a breach automation knows *a* target breached but not which one, so separate per-target automations are needed. — [eesel.ai on Zendesk breach automations (third-party)](https://www.eesel.ai/blog/zendesk-sla-breach-automations-and-alerts)
- **NN/g:**
  - Indicators are "visual cues intended to attract users' attention to a particular piece of content or UI element that is dynamic in nature".
  - Notifications report system events.
  - The choice depends on type, urgency and whether action is required.

  — [NN/g: Indicators, Validations, and Notifications](https://nngroup.com/articles/indicators-validations-notifications) (full article not fetchable here; definitions from search excerpt)
  - Notifications split into action-required and passive informational. — [UMass design system](https://design.umassp.edu/node/111)
  - Use alerts sparingly and show one at a time. — [UCLA design system](https://designsystem.brand.ucla.edu/build/v2.6.0/docs/components/alerts.html)
- **Pipedrive** shades only the stale deal tile red, not the whole pipeline. — [Pipedrive rotting](https://support.pipedrive.com/en/article/the-rotting-feature)
- **Alert-fatigue indicators** (volume without real incidents, duplicates, slower acknowledgement) argue for de-duplication and severity gating. — [Rootly](https://rootly.com/alert-management/alert-fatigue.md)

### Inferences
**One row grammar for every heterogeneous item** [DESIGN CHOICE]:
- type icon and **word**;
- what it is (society, item);
- the **clock in words**: "Due in 3 h", "Overdue by 4 days", "Day 9 of 5 — stuck", "61–90 days past due";
- RAG chip with a **word**, not colour alone;
- **owner** (a named person, never a team);
- **next action** as a verb plus a link to the screen where it happens.
- Sort by severity, then by how far past due.

**Clock rules:**
- One clock per row. A ticket with both response and resolution clocks shows the *tighter unmet* one, with the other on hover or drill-down.
- Breached clocks say "overdue by X", not a negative number. Founders are not agents; the negative-number convention is JSM's, for trained agents.

**Founders' view should be exceptions-only:**
- the "not on time" list = Red, plus Amber items that are money/legal;
- counts by type in a summary strip ("3 payments overdue · 1 meter down 3 days · 2 installation days unapproved");
- everything else stays one click away.

This avoids the badge-that-never-clears problem the project already hit with the inspection reminder (15 → 1 collapse, 2026-09-20).

**Grouping and stability:**
- **Collapse repeats.** One row per society per item type when there are many, e.g. "Ace City: 3 invoices overdue, oldest 72 days" rather than three rows. This follows the project's own collapse rule.
- **Aging buckets for money** display as a stacked bar (Not due / 1–30 / 31–60 / 61–90 / 90+) with ₹ and count, plus a DSO trend line, never DSO alone.
- **Freeze thresholds in code with a written table.** Each type's warning window, grace and red rule live in one module, as the repo does for other rules. RAG is then computed, never typed. Per IPM, thresholds are not edited to make items go green.

### Gaps
- The full NN/g article could not be fetched, so its placement and persistence recommendations are unconfirmed.
- No empirical source was found on how many items a founder dashboard should show before fatigue sets in.
