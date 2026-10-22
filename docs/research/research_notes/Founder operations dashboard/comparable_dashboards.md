# How comparable products design an owner's "command center" dashboard

Method note: WebFetch could not reach any of the vendor domains in this session. Fetches to nngroup.com, chargebee.com, geckoboard.com, help.getjobber.com and others failed with DNS errors, and the proxy rejected patternfly.org. All findings below therefore come from search-engine summaries of the cited pages, not from reading the full pages. Every finding is attributed to the page it summarises. Where a summary was secondhand, or mixed vendor marketing with documented behaviour, that is flagged inline. A writer should treat exact wording as approximate.

## 1. How do field-service and ops platforms structure the home/overview dashboard, and what goes first?

### Takeaway
Small-business field-service tools lead with an action list rather than charts. Jobber's Home opens on an admin to-do list of items that need attention, plus today's appointments. Payment and performance tools lead with a "today / current balance" snapshot that can be filtered by date. Fleet-monitoring tools lead with "which sites need attention", sortable and filterable.

### Cited Findings
- **Jobber (mobile Home):** Home features a map of the day's appointments and, for admin users, "a to-do list of the tasks that require your attention" — [Jobber help: Home in the Jobber app](https://help.getjobber.com/en/articles/home-in-the-jobber-app/)
- **Jobber (older dashboard):** "Recommended actions" flag overdue scheduled items, unassigned visits, and requests needing review. Invoicing prompts appear only at volume thresholds: "5+ jobs in 'Requires Invoicing' status" and "5+ invoices draft status". This is documented behaviour, but the help articles come from different versions — [Jobber help: What is the dashboard?](https://help.getjobber.com/es/articles/dashboard/)
- **Jobber web Home, business performance section:** lists the "top three overdue clients with overdue balances, including how much each owes and how much is late (in red)", with a link to the full client balance summary. Today's appointments can be grouped by visit or by employee, and overdue appointments are flagged in the daily totals — [Jobber help (Home)](https://help.getjobber.com/es/articles/home/); [Jobber help center article](https://help.getjobber.com/hc/en-us/articles/23846836592023)
- **ServiceTitan:** the top section of the dashboard is a snapshot of the day's metrics: revenue trends, sales, booking and conversion rates. It defaults to the current day across all business units, with date and business-unit filters. An info icon on each module lists KPI definitions and how each is calculated — [ServiceTitan: Dashboard business metrics](https://help.servicetitan.com/roofing/docs/dashboard-business-metrics); [ServiceTitan: Dashboards home](https://help.servicetitan.com/v1/docs/dashboards-home)
- **ServiceTitan custom dashboards:** a KPI module holds up to six KPIs from one report template, and visualisation modules chart them — [ServiceTitan: Custom dashboards](https://help.servicetitan.com/commercial/docs/custom-dashboards-home)
- **Razorpay Home, top to bottom:**
  - system-wide alerts at the top of the page;
  - current balance;
  - a payment overview (collected, refunds, orders for a date range);
  - a "Last Settlement" widget with amount and status;
  - quick-action shortcuts (Transactions, Settlements, Payment Links, Reports);
  - a "Key Updates" area for announcements and action items;
  - success/failure charts grouped daily, weekly or monthly.

  Region-specific labels vary — [Razorpay docs: Razorpay Home](https://razorpay.com/docs/payments/dashboard/razorpay-home); [Razorpay docs: Dashboard home](https://razorpay.com/docs/payments/dashboard/home)
- **Enphase Enlighten Manager (installer fleet):** "Manage multiple systems and prioritize maintenance needs with the dynamic sorting and filtering capabilities". Maintenance issues can be viewed on graphs or maps. Named system statuses include "Production Issue" and "Envoy Not Reporting", and Groups are used to manage the fleet. The source is mostly a marketing feature sheet plus support index pages — [Enlighten feature sheet (PDF)](https://www.solarelectricsupply.com/media/sparsh/product_attachment/custom/upload/Enlighten_feature_sheet.pdf); [Enphase support: Enlighten Manager FAQs](https://www4.enphase.com/en-uk/support/solar-professionals/enlighten-manager?page=1)
- **Enphase homeowner app:** a single "system status indicator provides quick confirmation that all is well". When something is wrong, it pinpoints the source of the problem — [Enphase MyEnlighten](https://www.solarelectricsupply.com/enphase-myenlighten) (reseller page, marketing)
- **SolarEdge monitoring:** "Quickly identify sites that require your immediate attention, with automated system alerts". A single fleet view drills down to site and module level. This is marketing copy; no documented severity field was found — [SolarEdge monitoring](https://solaredge.maglr.com/solaredge-software-suite/monitoring)
- **Solar Insure** (a third-party aggregator of SolarEdge and Enphase alerts) uses "a three-tiered system that classifies the severity" of alerts, and its Monitoring tab shows "a prioritized table with statuses for your entire fleet" — [Solar Insure](https://solarinsure.com/how-to-review-monitoring-data-with-solar-insure)

### Inferences
- **Two archetypes.**
  - *Action-first*, for the owner of a small operation: Jobber's to-do list plus today's schedule.
  - *Snapshot-first*, for a metrics reader: ServiceTitan's day KPIs and Razorpay's balance.

  A two-founder company that wants "what is not on time" matches the action-first archetype. It suggests an attention list at the top, then today's meetings, then compact status tiles per domain.
- **Fleet monitoring (meters).** The consistent pattern is a single health indicator ("all well" or not), then a prioritised list of the sites that need attention, then drill-down to the site.

### Gaps
- No full-page screenshots or layout descriptions were readable for ServiceTitan, Zoho FSM, Salesforce Field Service home, or Monday.com, because the fetches failed.
- Schneider EcoStruxure and Grafana operational boards were not researched in depth. Only Grafana's own best-practice summary was reached (see Q5).

## 2. How do products show late / overdue / SLA-breaching items across object types?

### Takeaway
Three recurring mechanisms:
1. a **count ribbon** of status buckets (Freshdesk: Unresolved / Overdue / Due today / …);
2. a **countdown column sorted ascending**, so the next item to breach is at the top (Zendesk SLA column; Salesforce "In Jeopardy");
3. an **inline warning glyph with the broken rule named on hover** (Salesforce Gantt).

No product found merges several object types into one exceptions queue on a home screen. Jobber's admin to-do list comes closest: it mixes requests, visits and invoices.

### Cited Findings
- **Freshdesk:** the top of the dashboard shows a "Ticket summary ribbon" with counts for Unresolved, Overdue, Due today, Open, On hold and Unassigned. The "Unresolved tickets" widget shows counts per group and splits them by status under "View details". On Sprout/Blossom plans, overdue ticket details cannot be viewed — [Freshdesk: Checking recent helpdesk activity](https://support.freshdesk.com/support/solutions/articles/37556-checking-recent-helpdesk-activity)
- **Freshdesk iOS widget** (community post, 2020, may be outdated): a home-screen widget counts overdue, on hold, unresolved, due today, open and unassigned tickets — [Freshworks community: iOS badges](https://community.freshworks.com/ideas/ios-badges-16991)
- **Zendesk views:**
  - the SLA column is a countdown to the next target;
  - ordering the view by SLA, ascending, puts the tickets closest to breaching at the top;
  - a breached target shows a negative value in red (e.g. "-15m");
  - the "Next SLA breach" filter only catches tickets approaching breach, not ones already breached.

  This comes from a third-party guide, not Zendesk docs, so verify it — [eesel: Zendesk view SLA columns](https://www.eesel.ai/blog/zendesk-view-sla-column); [eesel: sort by breach](https://www.eesel.ai/blog/zendesk-sla-view-column-sort-by-breach)
- **Geckoboard's Zendesk SLA example dashboard** pairs:
  - a "Nearing SLA breach" table showing the next breach time as a relative countdown;
  - a number tile, "Active breached", for tickets currently in breach

  — [Geckoboard: Zendesk SLA & backlog dashboard](https://www.geckoboard.com/dashboard-examples/itsm/zendesk-sla-backlog-dashboard/)
- **Salesforce Field Service dispatcher console:**
  - an "In Jeopardy" filter on the appointment list finds appointments "in danger of missing their due dates", and the Trailhead scenario makes it the dispatcher's "first priority";
  - rule violations show as "a small yellow triangle" on the Gantt, and hovering names the rule broken;
  - Reschedule can be done from that popover.

  No help page defining the jeopardy calculation was found — [Trailhead: Manage service appointments](https://trailhead.salesforce.com/content/learn/modules/field-service-dispatcher-console-for-dispatchers/manage-service-appointments); [Trailhead: Modify appointments in the Gantt](https://trailhead.salesforce.com/content/learn/modules/scheduling-console-basics/modify-appointments-in-the-gantt)
- **Asana "My Tasks":**
  - when grouped by due date, the "Past due" group starts collapsed, and users complain this hides overdue work;
  - workarounds are sorting by due date or using rules to move overdue tasks into a section;
  - the Daily Summary email does not include overdue tasks.

  Source: user forum, not docs — [Asana forum: Past due collapsed](https://forum.asana.com/t/my-tasks-list-when-sorted-by-due-date-has-past-due-collapsed-as-default-would-prefer-it-expanded/453160); [Asana forum: overdue in Daily Summary](https://forum.asana.com/t/include-overdue-tasks-in-daily-summary/47709)
- **Exception reporting in a public-sector performance dashboard (NHS trust):**
  - the dashboard works as an alert mechanism, with red/amber/green indicators;
  - each domain has a one-page drill-down;
  - non-green items get separate exception reports

  — [Whittington Health board dashboard (PDF)](https://whittington.nhs.uk/document.ashx?id=1209)
- **BMC operations dashboard:** a gauge in a problem state links to a view of every exception element in that area, each shown against its thresholds. It shows current exceptions alongside green metrics that are nearing their thresholds — [BMC: Consolidated exception and dashboard analysis](https://docs.bmc.com/docs/opsmdb2131/consolidated-exception-and-dashboard-analysis-1082081355.html)

### Inferences
- **The Asana complaint is a direct warning:** never collapse or hide the overdue group by default. Overdue belongs first and expanded.
- **"Breached" and "about to breach" are different questions,** and Zendesk's own filter answers only one of them. The Geckoboard and BMC pattern shows both: a count of items already late, and a short list sorted by time-to-breach, including items nearing their thresholds.
- **A cross-object "Not on time" queue** (payments, meters, installations, tickets, demos, meetings) has no exact precedent among these products. It is a synthesis of Jobber's mixed to-do list and Freshdesk's count ribbon. Each row would need its object type, how late it is, an owner, and a link to the item.

### Gaps
- No documentation was found for Linear's Inbox or "My issues", Monday.com's home, or HubSpot's home showing cross-object overdue aggregation; the searches returned nothing usable.
- No source gives a standard aging-bucket scheme for tickets, comparable to receivables buckets.

## 3. Payments: how do receivables dashboards show collections?

### Takeaway
The common pattern is a **two-figure headline (Current vs Overdue)**, where each figure links to an aging report. The aging report uses buckets measured from the due date, and a per-customer list shows each customer's outstanding balance with links to the invoices. Payment processors (Razorpay) show collected, balance and settlement figures instead. DSO appears in AR glossaries more than on home widgets.

### Cited Findings
- **Zoho Invoice dashboard:**
  - the "Total Receivables" section shows **Current** (not yet past due) and **Overdue** (past due);
  - clicking either number opens the Aging Details report.

  This is directly relevant, since FirsThing already uses Zoho Invoice — [Zoho Invoice help: Dashboard](https://www.zoho.com/de-de/invoice/help/dashboard/index.html); [Zoho Invoice help: Receivable reports](https://www.zoho.com/invoice/help/reports/receivable.html)
- **Zoho AR Aging Summary:**
  - the default intervals are **Current, 1–15, 16–30, 31–45, >45 days**, and the number of intervals is configurable;
  - each customer's total outstanding is shown;
  - clicking a balance or invoice count for an interval lists those transactions

  — [Zoho Invoice help: Receivable reports](https://www.zoho.com/invoice/help/reports/receivable.html)
- **Chargebee Receivables:**
  - dashboard charts show the net overdue amount as a percentage for assigned customers, and net overdue broken down by aging bucket;
  - the customer details page has an aging view and a metrics bar (outstanding, overdue, unutilised credits);
  - aging is measured from each invoice's due date to the reporting date;
  - the docs call 61+ day buckets a warning sign and suggest concentrating collection effort on the buckets holding the most money

  — [Chargebee: Receivables dashboard](https://chargebee.com/docs/receivables/dashboard.html); [Chargebee: Customer details](https://www.chargebee.com/docs/receivables/customers/customer-details)
- **Chargebee glossary:** DSO "measures the average number of days it takes to collect payments, indicating cash flow health and collection efficiency". Related metrics are 90+ AR % and average due days. No native DSO chart was found in the dashboard docs — [Chargebee: Receivables glossary](https://chargebee.com/docs/receivables/glossary.html)
- **Definite** (a third-party vendor) claims Chargebee "does not give you a governed AR view". This is vendor marketing — [Definite: Chargebee AR dashboard](https://www.definite.app/dashboards/chargebee-accounts-receivable)
- **Jobber Home:** the top three overdue clients, with the amount owed and the late portion in red, linking to the full client balance summary — [Jobber help (Home)](https://help.getjobber.com/es/articles/home/)
- **Razorpay:** a current balance, collected and refund totals for a date range, and a Last Settlement widget with its status — [Razorpay docs: Razorpay Home](https://razorpay.com/docs/payments/dashboard/razorpay-home)

### Inferences
- **Headline.** For a small AR book, the strongest proven pattern is: received this month, then outstanding = current + overdue, then an overdue aging bar, then the top three to five overdue customers by amount, each linking to its invoices. This combines Zoho's dashboard, Chargebee's aging chart and Jobber's top-overdue list.
- **Buckets.** FirsThing's invoices are monthly with short terms. Zoho's 1–15 / 16–30 / 31–45 / >45 buckets fit a monthly billing cycle better than 0–30 / 31–60 / 60+. The latter is the conventional scheme, but no source above set it as a rule.
- **DSO** is meaningful only with enough invoice volume. Across around 15 billing societies it is probably less useful than counting how many invoices are overdue, and by how much. This is my inference, not sourced.

### Gaps
- No primary source was reached for Stripe's home dashboard.
- No authoritative standard for bucket boundaries was found. The conventional 30/60/90 is common practice but uncited here.

## 4. Meetings, ticket summaries, installation pipeline status and pilot/demo tracking

### Takeaway
- **Meetings:** "today's appointments", grouped by person, sits on the home screen (Jobber).
- **Tickets:** status-count tiles plus per-group counts (Freshdesk).
- **Pipeline:** stage counts; "stuck in stage" is a known gap in HubSpot that people fill with timestamps.
- **Pilots/demos:** no product-documented pattern was found.

### Cited Findings
- **Jobber Home (meetings):** shows the day's appointments (visits, assessments, tasks), groupable by visit or employee, with overdue appointments flagged in the daily totals — [Jobber help (Home)](https://help.getjobber.com/es/articles/home/)
- **Freshdesk (tickets):** status ribbon counts and per-group unresolved counts (see Q2). "Today's trends" compares today's incoming volume with the same time yesterday — [Freshdesk: Checking recent helpdesk activity](https://support.freshdesk.com/support/solutions/articles/37556-checking-recent-helpdesk-activity)
- **HubSpot, time in stage:**
  - "Time in stage" has values only for deals that have left the stage; "time between" reports do not tell how long a deal has been in its current stage;
  - the workaround is a stage-timestamp property plus a workflow;
  - one user calls it "not real time".

  Source: user community, may have changed — [HubSpot Ideas: Time in deal stage](https://community.hubspot.com/t5/HubSpot-Ideas/Time-in-Deal-Stage/idi-p/277082/page/5); [HubSpot community: Time in current deal stage](https://community.hubspot.com/t5/Dashboards-Reporting/Time-in-current-deal-stage/m-p/296432/highlight/true)
- **A third-party KPI card** defines "Deals stuck in stage (30d)" as open deals with no stage progression in 30+ days — [VortexIQ: deals stuck in stage 30d](https://docs.vortexiq.ai/nerve-centre/kpi-cards/hubspot/deals-stuck-in-stage-30d)
- **ServiceTitan's** association editions organise KPI dashboards by Maintenance, Service, Sales and Install — in effect, one section per business line — [ServiceTitan: Service Roundtable edition](https://help.servicetitan.com/docs/guide-to-the-service-roundtable-edition)

### Inferences
- **"Stuck"** needs a stored "entered current stage at" date per item. Products that lack one (HubSpot) are criticised for it. FirsThing's deal-progress and step-date records could supply this for installations and demos ("days in current step" against an expected duration).
- **Demos/pilots** behave like a short pipeline with a hard time box. A reasonable tile is: counts per step (meter installed → pre-period → replacement → post-period → report shared), plus a list of demos past their expected step duration. This is inferred; there is no product precedent.

### Gaps
- No pilot or trial tracking pattern was found in any field-service or CRM product doc.
- No agenda-widget guidance from a design authority was found.

## 5. Authoritative design guidance

### Takeaway
- **Few:** one screen, monitored at a glance, with context or comparison on every number and highlighting reserved for what matters.
- **NN/g:** distinguishes operational (time-sensitive) dashboards from analytical ones, and favours preattentive encodings: length, position, and colour used sparingly.
- **PatternFly:** one metric (or tight group) per card, and tables, not cards, for dense repeated content.
- **Grafana:** organise by symptoms (RED); alert on the symptom dashboards.
- **GOV.UK:** every module should map to a decision or action.

### Cited Findings
- **Few's definition:** a dashboard is a "visual display of the most important information needed to achieve one or more objectives which fits entirely on a single computer screen so it can be monitored at a glance". Viewers should not have to scroll or switch screens, because short-term memory holds only a few chunks. This is from secondary summaries of *Information Dashboard Design* — [UXmatters book review](https://uxmatters.com/mt/archives/2007/04/book-review-information-dashboard-design.php); [The Data School summary](https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/)
- **Few's 13 mistakes** include: exceeding a single screen, inadequate context, excessive detail or precision, a deficient measure, meaningless variety, poor arrangement, ineffective highlighting of what matters, decoration, and misused colour. Again from secondary summaries — [The Data School](https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes/); [Few, "Why Most Dashboards Fail" (PDF)](https://blogs.ischool.berkeley.edu/i247s13/files/2013/02/WhyMostDashboardsFail.pdf) (not readable in this session)
- **NN/g:**
  - dashboards are "collections of data visualizations, presented in a single-page view that imparts at-a-glance information on which users can act quickly";
  - the car dashboard is the model;
  - operational dashboards support time-sensitive tasks, analytical dashboards support analysis with less time pressure;
  - visualisations should exploit preattentive processing, with length and 2D position for quantities

  Snippet-level only — [NN/g: Dashboards: Making Charts and Graphs Easier to Understand](https://www.nngroup.com/articles/dashboards-preattentive/); [NN/g video: Data visualizations for dashboards](https://www.nngroup.com/videos/data-visualizations-dashboards/)
- **PatternFly (Red Hat):**
  - "each card should be designed to convey a single metric or a group of closely related metrics";
  - "never use a card to show a dense amount of repetitive, related content. Use a data list or table view instead"

  — [PatternFly: Dashboard design guidelines](https://patternfly.org/patterns/dashboard/design-guidelines); [PatternFly: Card guidelines](https://patternfly.org/2022.07/components/card/design-guidelines)
- **Material-derived guidance** (quoted by the Queensland government design system): a card should display a small amount of information at a glance, usually no more than 2–3 lines of text. Google's own page was not reached — [QLD design system: Card](https://www.designsystem.qld.gov.au/components/card/tabs/overview)
- **Grafana best practices:**
  - the RED method (Rate, Errors, Duration) suits services, and "a well-designed RED dashboard is a proxy for user experience";
  - alert on RED (symptoms), with USE dashboards for causes;
  - avoid sprawl with template variables;
  - order rows to follow the flow of data

  — [Grafana docs: Dashboard best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/); [AWS Managed Grafana: Best practices](https://docs.aws.amazon.com/grafana/latest/userguide/v10-dash-bestpractices.html)
- **GDS performance platform (2012):** "each module has a clear purpose; a decision or an action that we can take depending on what is shown" — [GDS blog: Performance platform beta](https://gds.blog.gov.uk/2012/10/23/performance-platform-beta/)
- **CFO.com on management by exception:** dashboards extend it by letting decision-makers move from a number straight to the underlying data, and alerts are one of the most popular features — [CFO.com: Gauging success](https://www.cfo.com/news/gauging-success/678077/)
- **Infor:** clicking a drillable graph opens the matching records, filtered as on the dashboard — [Infor docs](https://docs.infor.com/irc/10.3.x/en-us/ircuserlib/ircolh/tsm1723888909539.html)

### Inferences
- **Synthesis for FirsThing's founders:**
  - one screen at desktop width;
  - an exceptions ("Not on time") list first and never collapsed;
  - then today's meetings;
  - then one compact card per domain (payments, meters, installations, tickets, demos), each with a single headline count plus a comparison;
  - every card and every number links to the filtered list behind it (Zoho, Infor, BMC);
  - lists of many rows are tables, not card grids (PatternFly).
- **Colour.** Following Few and NN/g, colour only the exceptions (red or amber for late or breaching); do not colour healthy figures green. This matches the repo's existing rule (a 2026-08-21 audit) that a green number carries no information the absence of amber does not already carry.
- **Grafana's "symptoms first" maps onto meters.** Show "meters not reporting" and "circuits below band" (the symptoms) on the founder view. Leave causes (the hourly detail) to the meter page.

### Gaps
- No authoritative number for "maximum widgets" was found. Few's constraint is one screen, not a count.
- Mobile layout guidance for dashboards from NN/g or GOV.UK was not found in these searches. PatternFly and Material card guidance implies stacking single-metric cards.
- On refresh cadence (real-time vs snapshot), the only signal was NN/g's operational-vs-analytical distinction. No source gives refresh-interval guidance. Showing data freshness ("as of …") is unsourced here, though the repo already follows that convention.
