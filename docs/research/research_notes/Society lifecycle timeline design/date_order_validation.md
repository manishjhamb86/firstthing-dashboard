# Date-order validation in a multi-step process: detecting and displaying out-of-sequence dates

Scope: (a) how to define and check ordering rules between dated steps, including parallel branches that must still respect a parent step; (b) how to present violations and warnings in a timeline UI so a reviewer sees "every date is in serial flow" at a glance without noise. Written for an internal admin web app (the FirsThing deal/society lifecycle).

## How do process-mining tools and the event-log-quality literature flag out-of-order or implausible timestamps, and what categories of timestamp problems are recognised?

### Takeaway
The literature treats out-of-order dates as a *data-quality* problem with named causes, not just a rule failure. Suriadi et al. (2017) name three timestamp patterns among 11 log imperfections: form-based event capture, inadvertent time travel and unanchored event. Fischer et al. extend this into 15 measurable timestamp metrics, including future entry, missing timestamp, precision, infrequent event ordering and duplicates. Commercial conformance checkers such as Celonis report order violations as named "X is followed by Y" deviations, with how often each occurs and what it costs.

### Cited Findings
- **Suriadi et al.** "Event log imperfection patterns for process mining", *Information Systems* 64 (2017) 132–150, defines 11 patterns: form-based event capture, inadvertent time travel, unanchored event, scattered event, elusive case, scattered case, collateral events, polluted label, distorted label, synonymous labels and homonymous label. — [Suriadi et al. tech report / paper PDF](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf); [QUT ePrints record](https://eprints.qut.edu.au/97670/)
- **Form-based event capture.** Data entered through an electronic form gets the timestamp of the "Save" click. The real times (e.g. when a sample was taken) are "flattened into one timestamp", and when the form is edited later all fields may be re-stamped with the update time. — [Suriadi et al. 2017](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf)
  - This is the exact risk of a backdated record typed in after the fact: the entry time masquerades as the event time.
- **Inadvertent time travel.** An erroneous timestamp arises from the "proximity" of right and wrong values. Examples are events just after midnight recorded with the previous day's date, or a slip onto an adjacent key.
  - **Detection:** given activities a1 and a2 with "a strict temporal ordering property such that a1 should always occur before a2", find the cases that violate it.
  - **Remedy:** needs knowledge of "the minimum restrictions applicable to the ordering of all activities". Violating timestamps can then be fixed by proximity corrections, e.g. ±1 day, or swapping adjacent-key digits.
  - — [Suriadi et al. 2017](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf); [search summary of the same](http://www.workflowpatterns.com/patterns/logimperfection/)
- **Unanchored event.** Timestamps are recorded in a format different from what the tool expects: day-month vs month-day, ":" vs "." separators, or timezone encoding.
  - The authors' hospital example imported 1 Sep, 2 Sep and 12 Nov 2013 as 9 Jan, 9 Feb and 11 Dec with no parse error. Only 14 Nov (day > 12) came in correctly.
  - "no warnings were issued by the database during data import."
  - — [Suriadi et al. 2017](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf)
- **Scattered event.** Real event times are hidden in other fields. In the authors' example, a procedure ordered 18/09 was entered through a form on 21/09, and the form recorded that it actually ran on 20/09 10:48–10:59. That is three distinct dates for one step: ordered, occurred, entered. — [Suriadi et al. 2017](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf)
- **Collateral events.** Several events refer to one real step, recorded within seconds or minutes of each other by different systems. — [Suriadi et al. 2017](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf)
- **Fischer, Goel, Andrews, van Dun, Wynn, Röglinger**, "Enhancing Event Log Quality: Detecting and Quantifying Timestamp Imperfections", define 15 timestamp-quality metrics along two axes. The four quality dimensions are accuracy, completeness, consistency and uniqueness. The four abstraction levels are event, activity, trace and log. The metrics:
  - M1 Infrequent Event Ordering (which covers inadvertent time travel)
  - M2 Overlapping Events per Resource
  - M3 **Future Entry**
  - M4 Precision (granularity of the recorded time)
  - M5–M7 Missing Trace / Activity / Event
  - M8 **Missing Timestamp**
  - M9, M11, M12 Mixed Granularity (log, traces, activities)
  - M10 Format
  - M13–M15 Duplicates

  Each metric is scored 0–1, and the approach was implemented as a ProM prototype. — [Fischer et al. PDF](https://www.fim-rc.de/Paperbibliothek/Veroeffentlicht/1060/wi-1060.pdf)
- **Fischer et al. make three further points** — [Fischer et al.](https://www.fim-rc.de/Paperbibliothek/Veroeffentlicht/1060/wi-1060.pdf)
  - A trace's ordering "should respect timestamps", i.e. for i ≤ j, time(e_i) ≤ time(e_j).
  - **Mixed granularity** causes false reordering. Their example is admission recorded at 10:23:12 and the doctor's examination at hour precision, 10:00:00, so the examination appears to come first.
  - Precision is scored by how fine the recorded unit is. A manual entry is typically coarse.
- **Celonis's conformance checker:**
  - The `CONFORMANCE` operator matches cases against a Petri net and flags violating activities. One violation type is "X is followed by Y", a transition not allowed by the model.
  - The UI lists distinct violations with the share of cases affected. Percentages can exceed 100% in total because one case can have several violations.
  - It compares KPIs, e.g. throughput time, for cases with and without each violation.
  - — [Celonis Conformance Checker docs](https://docs.celonis.com/en/analysis---conformance-checker.html); [Celonis PQL CONFORMANCE](https://docs.celonis.com/en/conformance.html)
- **Celonis community report:** parallel arcs in the process model can produce spurious conformance violations. Modelling concurrency correctly matters for parallel branches. — [Celonis community thread](https://community.celonis.com/process-analysis-5/conformance-checker-analysis-problems-with-parallel-arcs-4869)

### Inferences
- For the society/deal timeline, the three Suriadi timestamp patterns map directly onto real risks:
  - **Form-based capture:** a date defaulted to "today" when a record was typed up later.
  - **Inadvertent time travel:** mistyped day or month; midnight roll-over.
  - **Unanchored event:** DD/MM vs MM/DD ambiguity.
- The Suriadi remedy says the minimum ordering restrictions must be written down explicitly before they can be checked. That argues for one declared rule table, e.g. "meter install ≥ survey visit", checked by a single pure function. It argues against scattered per-action checks.
- The Fischer taxonomy gives a ready vocabulary of distinct issue classes a UI can separate: missing, future, out-of-order, low precision/estimated, and duplicate.
- Celonis's "violation list with case counts" is the process-mining analogue of an error summary. It supports a top-of-page count ("3 dates out of order") with drill-down.

### Gaps
- I did not verify how Fluxicon Disco or SAP Signavio Process Intelligence surface timestamp-order problems. I found no primary documentation for either within the research budget.
- The Fischer et al. venue and year could not be confirmed from the fetched PDF text. It appears to be a 2020-era BPM-community paper, but that is unverified.
- The Fischer PDF's per-metric detection details beyond precision are hosted at a shortened link (bit.ly/33hz4SM) that I did not fetch.

## How do rules/validation frameworks express precedence constraints ("A on or after B", "A within N days of B"), and how should parallel branches under a parent be handled?

### Takeaway
Declarative process modelling (Declare, and its timed/multi-perspective extensions) is the established vocabulary for this:
- **precedence** — B only if A before;
- **response** — A eventually followed by B;
- **chain/alternate** variants;
- **metric bounds** — within N time units.

Allen's interval algebra gives the 13 exhaustive relations between intervals, used when a step spans a period rather than a single date.

### Cited Findings
- A Declare model is a set of templates, "reusable behavioral pattern[s]", instantiated over activities.
  - **Precedence:** "B should occur only if A has occurred before".
  - **Alternate response/precedence** forbid repetition between the pair.
  - **Chain response/precedence** require A and B to be adjacent.
  - — [Direct Encoding of Declare Constraints in ASP (arXiv 2412.10152)](https://arxiv.org/pdf/2412.10152); [Response/Precedence/Succession figure](https://www.researchgate.net/figure/Response-Precedence-and-Succession-constraints_fig4_297575906)
- **Timed Declare** extends Declare with quantitative time restrictions. It is grounded in Metric Temporal Logic on finite traces (MTLf) and can express "A within N days of B". — [Aligning Metric Temporal Constraints and Event Logs via Numeric Planning (Springer)](https://link.springer.com/chapter/10.1007/978-3-032-02867-9_4); [arXiv 2607.16738](https://arxiv.org/pdf/2607.16738)
- **MP-Declare** (multi-perspective) adds data-aware and temporal conditions evaluated over activation and target events. This allows constraints that combine control flow, payload attributes and timing. — [Conformance Checking Based on Multi-Perspective Declarative Process Models (arXiv 1503.04957)](https://arxiv.org/pdf/1503.04957)
- **Allen (1983)**, "Maintaining Knowledge About Temporal Intervals", *CACM*, defines 13 base relations between intervals X and Y: precedes/preceded-by, meets/met-by, overlaps/overlapped-by, starts/started-by, during/contains, finishes/finished-by, equal. They are exhaustive because each endpoint of X can sit before, at the start of, within, at the end of, or after Y. — [Wikipedia: Allen's interval algebra](https://en.wikipedia.org/wiki/Allen%27s_interval_algebra)

### Inferences
- A practical rule record for an admin app:
  - `{ later: stepB.date, earlier: stepA.date, op: ">=" | ">" , maxGapDays?: N, severity: "error"|"warning", message }`.
  - This is Declare *precedence* (plus Timed-Declare bounds) restricted to pairs of dated fields rather than full traces.
  - The distinction between strict (>) and on-or-after (>=) should be explicit per rule, since same-day steps are common.
- **Parallel branches:**
  - Model each branch step's rule against its **parent** (the step both branches depend on), not against its sibling. Two siblings then carry no ordering relation between them, which is Allen's "overlap" being acceptable, and neither is falsely flagged. This mirrors the Celonis parallel-arc pitfall.
  - The branch's join step should carry "≥ max(branch dates)".
  - In this repo, KYC is the canonical parallel track under the deal.
- **Interval-shaped steps** (a demo pre-period, a contract term, a monitoring window) are better expressed with Allen relations. Examples:
  - "pre period *precedes* replacement day";
  - "monitoring *during* contract term".
- Checking each pair once with the full rule set **after** a proposed change was applied is the correct semantics. Checking one edit at a time can deadlock when two dates must move together. This repo hit exactly that deadlock with installation and certificate dates.

### Gaps
- No commercial business-rules-engine documentation (Drools, DMN/FEEL) was consulted. DMN FEEL has date comparison and duration functions, but I did not source that here.
- I found no source specifically on UI treatment of parallel-branch ordering. The parent-anchoring recommendation is an inference.

## How should violations and warnings be presented (severity, placement, both dates + rule, link to fix, summary counts, filter-to-problems)?

### Takeaway
Design systems converge on a two-layer pattern, plus a three-to-four-level severity scale:
1. **A summary at the top** that counts and links each problem. GOV.UK calls it "There is a problem"; it always appears, even for one error, and each entry links to the field.
2. **An inline message at the offending item**, with identical wording.

Errors block or demand action; warnings allow proceeding; info explains. NN/g adds several requirements:
- keep the message close to its source;
- use redundant, not colour-only, indicators;
- scale the treatment to the impact;
- write precise wording with a constructive fix;
- don't flag prematurely.

### Cited Findings
- **GOV.UK Design System, error summary** — [GOV.UK Error summary](https://design-system.service.gov.uk/components/error-summary); [GOV.UK Error message](https://design-system.service.gov.uk/components/error-message/)
  - "Always show an error summary when there is a validation error, even if there's only one."
  - Heading "There is a problem".
  - It sits at the top of the main content and receives keyboard focus.
  - It links to each field with an error; for a date input, "link to the first field that contains an error".
  - Summary messages must be worded exactly as the inline messages. Show both the summary and the per-field message.
  - Prefix "Error: " to the page title.
- **Carbon Design System** — [Carbon Notification usage](https://carbondesignsystem.com/components/notification/usage/); [Carbon notification pattern](https://carbondesignsystem.com/patterns/notification-pattern/); [Carbon web components source](https://github.com/carbon-design-system/carbon-web-components/blob/main/src/components/notification/inline-notification.ts) (content via search summary; direct fetch returned no content)
  - Four notification states: error, warning, informational, success.
  - Inline notifications "are nondisruptive and confined to a specific area in the UI". They persist until dismissed or until the issue is resolved.
  - They use a status colour and an icon.
  - Error and warning use `role="alert"`; success and info use `aria-live="polite"`.
- **PatternFly** — [PatternFly Helper text](https://www.patternfly.org/components/helper-text/); [PatternFly Form control guidelines](https://www.patternfly.org/components/forms/form-control/design-guidelines/); [patternfly-react issue #4547](https://github.com/patternfly/patternfly-react/issues/4547)
  - Form controls and helper text support error, warning, success and default status, used "in real time".
  - Errors are for invalid input and replace the helper text.
  - The warning state was added as a distinct status.
- **NN/g "Error-Message Guidelines"** (May 14, 2023) — [NN/g Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/); [NN/g 10 Design Guidelines for Reporting Errors in Forms](https://www.nngroup.com/articles/errors-forms-design-guidelines/)
  - "Display the error message close to the error's source".
  - Use redundant indicators, not colour alone.
  - Differentiate by impact.
  - Avoid premature display.
  - Use human-readable, precise descriptions, not "An error occurred".
  - Offer constructive advice, not just the problem.
  - Avoid blame words like "invalid"/"incorrect".
  - Preserve the user's input.
  - Reduce correction effort by suggesting fixes.

### Inferences
- **Top of the timeline:** a summary bar such as "2 dates out of order · 1 in the future · 3 not recorded". Each count is a link or filter to the offending step, following the GOV.UK summary plus Celonis-style counts.
  - When zero problems exist, show an explicit positive state, e.g. "All 14 dates are in order". That is the "at a glance" reassurance the reviewer wants. Absence of warnings alone is ambiguous.
- **At each step:** an inline message that names **both** dates and the rule, e.g. "Meter installed 04-11-2025 is before the site survey visit 07-11-2025 — the meter must go in on or after the survey." It links to the control that corrects whichever date is likelier wrong. Same wording in the summary and inline, per GOV.UK.
- **Severity mapping.** Keep the neutral kinds visually quieter than true errors so the timeline isn't noisy, per NN/g's impact-based design:
  - **Error:** a hard precedence break, such as billing start before the agreement, or an approval before its work.
  - **Warning:** implausible but possible — a gap over N days, or two steps on the same day where one normally takes longer.
  - **Info:** estimated or inferred dates.
- **A "Show only problems" filter** turns a long lifecycle into a short worklist. This is analogous to Celonis's per-violation drill-down (inference; no design-system source mandates this specific filter).
- **Don't flag prematurely.** A step not yet reached is "not yet", not "missing". Only flag missing when a later step already has a date, which implies the earlier one happened.

### Gaps
- The Atlassian Design System's guidance (section messages / inline messages) was not fetched within the tool budget.
- No design-system source specifically addresses timeline/stepper validation, as opposed to form-field validation. Applying form patterns to a timeline is an inference.

## How to distinguish missing vs out-of-order vs future vs inferred/estimated dates?

### Takeaway
These are separate data-quality dimensions in the literature, so they should be separate, differently worded states in the UI:
- **completeness:** missing timestamp / missing event;
- **accuracy:** future entry, infrequent ordering;
- **precision:** coarse or estimated timestamps.

### Cited Findings
- Fischer et al. assign M8 Missing Timestamp and M5–M7 missing trace/activity/event to **completeness**. M3 Future Entry, M1 Infrequent Event Ordering and M4 Precision go to **accuracy**. M9–M12 Mixed Granularity and Format go to **consistency**. — [Fischer et al.](https://www.fim-rc.de/Paperbibliothek/Veroeffentlicht/1060/wi-1060.pdf)
- Precision (M4) is measured by the finest unit recorded. Manual entries are typically coarse, and coarse timestamps mixed with fine ones produce false reorderings. — [Fischer et al.](https://www.fim-rc.de/Paperbibliothek/Veroeffentlicht/1060/wi-1060.pdf)
- Suriadi's "scattered event" shows that one step can carry an entry time, a real occurrence time and a related order time, which must be told apart. — [Suriadi et al. 2017](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf)

### Inferences
Suggested distinct states, each with its own icon and wording:
- **Not recorded.** Neutral; becomes a warning only if a later step is dated.
- **Out of order.** An error, naming the other date and the rule.
- **In the future.** Error for completed-fact steps; fine for scheduled ones. The "scheduled" vs "happened" type of the step decides which.
- **Estimated / inferred.** Info, a dotted outline or "≈"; e.g. a start inferred from the earliest reading. This project already uses the wording "Start taken from its earliest reading".
- **Same-day ties** should be judged with the rule's own operator (≥ vs >). A day-precision date should never be compared at time-of-day precision against a timestamp, which would trigger the mixed-granularity false reorder. Compare at the coarser precision.

### Gaps
- No source prescribes specific visual encodings (dotted outline, "≈") for estimated dates. This is a design inference.

## How to handle backdated records typed in after the fact (event date vs entry date)?

### Takeaway
Store two times per dated fact — **actual/valid time** (when it happened) and **record/transaction time** (when the system learned it). This is bitemporal modelling. Validate ordering on actual time only, and show record time as provenance so a backdated entry is visibly "entered later" rather than suspicious.

### Cited Findings
- Fowler's bitemporal history treats time as two dimensions: "actual time: the time something happened" and "record time, the time we knew about it".
  - His payroll example: a raise with actual date Feb 15, learned (record date) Mar 15, after a payroll already ran Feb 25.
  - — [Martin Fowler, Bitemporal History (via Goodreads mirror of the blog post)](https://www.goodreads.com/author_blog_posts/21166503-bitemporal-history?tab=book); [martinfowler.com 2021 tag listing](https://martinfowler.com/tags/2021.html)
- The time an event occurred and the time it was recorded "are very different things, even if they often seem to mirror one another". — [JUXT: Bitemporality: More Than a Design Pattern](https://www.juxt.pro/blog/bitemporality-more-than-a-design-pattern/)
- Suriadi's form-based capture pattern is precisely the failure of conflating these: form save-time replaces event time, and re-saves restamp unchanged fields. — [Suriadi et al. 2017](http://www.workflowpatterns.com/documentation/documents/ELP-17-01.pdf)

### Inferences
- Every step date should carry `occurredOn` (typed, validated for order) plus `recordedAt/recordedBy` (machine-stamped).
- A correction should keep the old value, as this repo already does with its change log. The timeline can then show "Corrected 27-09-2026 by X (was 26-09-2026)".
- A large gap between occurred and recorded is **not** an ordering error. It can be shown as neutral info ("entered 3 months later") to explain why defaulted dates were suspicious.
- Defaulting a date input to "today" is the main source of form-based capture errors for backdated deals. Prefer requiring an explicit date, or defaulting to a date derived from the related earlier step.
- The ordering check should run on actual time. Record time is only used for "entry after" provenance and audit.

### Gaps
- martinfowler.com's canonical "Bitemporal History" page was not fetched directly; the claim is taken from a mirror and search summaries.
- No source was found on UI presentation conventions for bitemporal provenance in admin timelines.
