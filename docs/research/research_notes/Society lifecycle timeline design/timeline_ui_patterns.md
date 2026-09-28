# Timeline UI patterns for a record's step-by-step history (B2B / back-office)

Scope: how design systems and ops/CRM tools show "what was done when" for one record, applied to a
society's lifecycle (lead → meeting → survey → demo → offer → agreement → installation → billing).
Research done 2026-09-28, 17 tool calls. Several primary pages (SLDS Activity Timeline, Carbon usage
page, Polaris timeline, GOV.UK task-list pattern page) redirected, returned 410, or truncated; where
that happened it is stated, and the finding is taken from the nearest primary source available.

## 1. How design systems specify timeline and step components

### Takeaway
Design systems split this into two different components. A **stepper/path** (Carbon Progress
indicator, PatternFly Progress stepper, Atlassian Progress tracker, SLDS Path) shows a fixed
sequence of stages with states. A **timeline** (Ant Design, MUI Lab, Primer, SLDS Activity Timeline)
shows dated events of any number. A lifecycle view for a record like a society usually needs both:
the stepper answers "where is it now", the timeline answers "what happened when".

### Cited Findings
**Ant Design Timeline (v6):**
- `mode` is `start` (the default: nodes on the left), `alternate` (nodes distributed left and
  right) or `end`. — [Ant Design Timeline](https://ant.design/components/timeline)
- The old `pending` / `pendingDot` props are deprecated. A pending item is now `item.loading`, and
  `icon` replaces `dot`. — [Ant Design Timeline](https://ant.design/components/timeline)
- Other props:
  - `color` per item (preset or custom);
  - per-item `placement` (`start`/`end`);
  - `orientation` (`vertical` by default, or `horizontal`);
  - `reverse`;
  - `title` with `titleSpan` ("the distance to the center of the dot", default 12);
  - `variant` `filled`/`outlined` (v6.0.0+).

  — [Ant Design Timeline](https://ant.design/components/timeline)
- When to use: "a series of information needs to be ordered by time (ascending or descending)".
  — [Ant Design Timeline](https://ant.design/components/timeline)

**MUI Timeline:**
- It lives in `@mui/lab`, which is experimental. Its parts are `Timeline`, `TimelineItem`,
  `TimelineSeparator`, `TimelineDot`, `TimelineConnector`, `TimelineContent` and
  `TimelineOppositeContent`. — [MUI Timeline](https://mui.com/material-ui/react-timeline/)
- `TimelineOppositeContent` is the slot for secondary content, typically timestamps ("09:30 am"),
  shown on the side of the axis opposite the content. — [MUI Timeline](https://mui.com/material-ui/react-timeline/)
- `position` takes center (the default), `left`, `alternate` or `reverse`. Dots take palette colours
  and an outlined variant. A left-aligned layout with no opposite content gives a simple one-sided
  timeline. — [MUI Timeline](https://mui.com/material-ui/react-timeline/)
- The docs carry no explicit accessibility or use-case guidance. — [MUI Timeline](https://mui.com/material-ui/react-timeline/)

**Primer (GitHub's design system) Timeline:**
- The component currently uses non-semantic `<div>`s, and its own docs say that "replacing them with
  a semantic list would allow screen readers to announce how many items are in the timeline and
  where each begins and ends." — [Primer Timeline accessibility](https://primer.style/product/components/timeline/accessibility/)
- Icons used as badges "should include a text alternative when they convey essential information
  about the message type" (via `aria-label`). — [Primer Timeline accessibility](https://primer.style/product/components/timeline/accessibility/)
- `Timeline.Break` is "for decorative purposes only". The meaning of a break must be stated in a
  `Timeline.Item`. — [Primer Timeline accessibility](https://primer.style/product/components/timeline/accessibility/)
- Text needs 4.5:1 contrast. The connecting line may be lower contrast because it is decorative.
  Content advice: "Avoid overloading a single item with too much information; break long
  descriptions into manageable chunks." — [Primer Timeline accessibility](https://primer.style/product/components/timeline/accessibility/)

**IBM Carbon Progress indicator:**
- Seven states: completed, current, not started, error, disabled, hover and focus.
- "When possible, arrange the progress indicator vertically for easier reading."
- Its purpose is dividing a task into sub-tasks to keep the user on track.
- ArrowUp/ArrowDown move focus when it is vertical.

  — [Carbon Progress indicator usage](https://carbondesignsystem.com/components/progress-indicator/usage/)
  (taken from the search-result extract; a direct fetch of the page came back truncated).
- No Carbon timeline or activity-feed component was found.

**PatternFly Progress stepper:**
- Horizontal or vertical. Vertical "work[s] well in split-view pages or popovers"; horizontal suits
  inline use in cards and tables.
- Variants: basic, with descriptions, compact (for tables and tight areas), custom icons, and help
  popovers.
- States: completed/success, current, failure, warning and pending.
- Text is left-aligned or centred.

  — [PatternFly progress stepper design guidelines](https://www.patternfly.org/components/progress-stepper/design-guidelines)
- Wording rules:
  - Active steps use present participles ("Installing cluster").
  - Failures use a specific past tense ("Could not validate account credentials").
  - Completed steps use the past tense ("Cluster installed").

  — [PatternFly](https://www.patternfly.org/components/progress-stepper/design-guidelines)
- A stepper shows linear progress on one page, where a wizard moves the user between screens.
  Accessibility: an ordered list, `aria-current` on the active step, and `aria-label`.
  — [PatternFly](https://www.patternfly.org/components/progress-stepper/design-guidelines)

**Atlassian Progress tracker:**
- It "displays the steps and progress through a journey". Stages carry `current`, `visited` or
  `disabled` plus `percentageComplete`.
- Labels should be short: one line, 1–2 words.

  — [Atlassian Progress tracker](https://atlassian.design/components/progress-tracker); [Atlaskit package](https://atlaskit.atlassian.com/packages/design-system/progress-tracker)
  (the details are from a search extract, not a full fetch).

**Salesforce Lightning Path:**
- Path is "a process component [that] communicates to the user the progress of a particular
  process".
- Stage classes: `slds-is-complete`, `slds-is-current`, `slds-is-incomplete`, plus terminal
  `slds-is-lost` and `slds-is-won`.
- An expandable coaching/guidance panel sits under the path (`slds-path__guidance`, with a coach
  title and edit).

  — [SLDS Path (v1)](https://v1.lightningdesignsystem.com/components/path/)
- On narrow widths the path scrolls horizontally (`slds-path__scroller`, `slds-has-overflow`, scroll
  controls), with region sizes for 565–1280px and 360–564px containers.
  — [SLDS Path (v1)](https://v1.lightningdesignsystem.com/components/path/)

**GOV.UK Task list component:**
- Completed tasks show as plain black sentence-case text; incomplete ones as coloured (blue) tags,
  so users can "scan the page and spot incomplete tasks".
- "The use of uppercase in task statuses makes them harder to read."
- Several lists on one page each get "a short heading that clearly explains the grouping."

  — [GOV.UK Task list component](https://design-system.service.gov.uk/components/task-list/)
- Not for services that need "a specific order", and not "as a way of showing users their answers"
  (use a Summary list for that). The whole row is the link. — [GOV.UK Task list](https://design-system.service.gov.uk/components/task-list/)
- The separate task-list *pattern* page returned HTTP 410, so the "Cannot start yet" status wording
  was not confirmed from source.

### Inferences
- For a fixed-stage lifecycle, the SLDS Path model (complete / current / incomplete, plus a terminal
  lost/won) maps directly: a closed-lost or terminated society is a terminal state, not "incomplete".
- Put the date in a consistent, predictable place: MUI's opposite-content slot (a left date rail) or
  Ant's `title`. Alternate (zig-zag) layouts are offered by Ant and MUI, but no source recommends them
  for dense admin reading, and they cost width. A left-aligned single rail suits a narrow admin
  column and phone widths.
- PatternFly's tense rule gives a ready wording convention: done = past tense, current = "-ing",
  failed = a specific past tense.

### Gaps
- No Carbon or Atlassian component specifically for activity or history timelines was found; both
  offer only steppers.
- The Polaris order-page timeline has no public pattern doc: the legacy URL 301s to shopify.dev, and
  GitHub issues show only feature requests ([#298](https://github.com/Shopify/polaris/issues/298),
  [#2914](https://github.com/Shopify/polaris/issues/2914)).
- The SLDS Activity Timeline component page could not be fetched (redirect loop).
- NHS guidance was not researched (out of budget).

## 2. How CRMs and ops tools show a record's lifecycle

### Takeaway
CRMs pair a stage bar with an activity feed. The feed separates **upcoming/overdue** from **past**,
groups the past by month, and offers type filters, expand/collapse-all and pinning. No full primary
source was obtained for the lifecycle UIs of Stripe, GitHub, Linear, Jira, Pipedrive or Zendesk.

### Cited Findings
**Salesforce Activity Timeline:**
- In Lightning Experience it replaces the Open Activities and Activity History related lists.
  — [Salesforce Help: Activity Timeline](https://help.salesforce.com/s/articleView?id=sf.activity_timeline_parent.htm&language=en_US&type=5)
- An "Upcoming & Overdue" section sits separately above the past activities. Each part can have its
  own sort order, and filters narrow what is shown.
  — [Sorting options for upcoming and overdue](https://help.salesforce.com/s/articleView?id=sf.activitytimeline_sorting_future_activities.htm&language=en_US&type=5); [release note](https://help.salesforce.com/s/articleView?id=release-notes.rn_sales_productivity_timeline_sort_upcoming_overdue.htm&language=en_US&release=234&type=5)
- The toolbar has Show Filters, Expand All / Collapse All and Refresh. Past items are shown in
  monthly sections.
  — [Weflow summary](https://www.weflow.ai/blog/salesforce-activity-timeline) (secondary source)

**HubSpot record timeline:**
- A "Filter by" control shows or hides activity types. Collapse/Expand works on one item or on all.
  — [HubSpot KB: filter activities](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline?src=leap)
- An activity can be pinned to the top of the record's timeline. — [HubSpot KB: pin an activity](https://knowledge.hubspot.com/records/pin-an-activity-on-a-record)
- Users have asked HubSpot for a collapsible activity section and a date filter.
  — [HubSpot Ideas](https://community.hubspot.com/t5/HubSpot-Ideas/Collapsable-Activity-Section-amp-Date-Filter/idi-p/326494)
  (evidence that long feeds hurt).

**Stripe:**
- Stripe creates an Event object when a resource's state changes. For an invoice these include
  finalised (draft → open), payment succeeded or paid out-of-band, and payment requiring action.
  — [Stripe invoice status transitions](https://docs.stripe.com/invoicing/integration/workflow-transitions); [Events API](https://docs.stripe.com/api/events)
- In the Dashboard, events older than 30 days show only a summary, and live-mode events are
  available for 13 months. — [Stripe support: event retention](https://support.stripe.com/questions/stripe-event-retention-period)
- The docs fetched do not describe the Dashboard's visual timeline layout.

### Inferences
- The Salesforce and HubSpot pattern for a society record would be:
  - the stage path on top;
  - under it, "Upcoming & overdue" — booked visits, unpaid invoices, pending approvals;
  - then past events grouped by month, with type filters (deal, installation, billing, documents)
    and collapse-all.
- Stripe's model of events emitted on state change supports building the timeline from
  state-transition rows that already exist, rather than keeping a separate log.

### Gaps
- GitHub PR timeline, Linear issue history, Jira history, Pipedrive deal history and Zendesk ticket
  events were not researched from primary sources within the tool budget. Their visual conventions
  (inline "X changed status from A to B · 3 days ago" rows, condensed grey events) are known only
  from memory and are not cited here.

## 3. Date presentation (absolute vs relative, placement, elapsed time, not-yet-reached steps)

### Takeaway
Use absolute dates for records people come back to. Relative time helps only for recent items, is
best as a secondary label or tooltip, and should switch to absolute after a threshold. Future,
current, failed and terminal steps each get their own state, marked in more than colour.

### Cited Findings
- "Use absolute timestamps when users can go back and make use of past content"; use relative ones
  for fast-moving activity.
- A hybrid is recommended in three ways:
  - absolute with the relative in parentheses;
  - relative until a threshold, then absolute ("When a post is older than 4 weeks, it'll display the
    published date and time");
  - relative with the absolute date in a tooltip, given a dotted underline.
- Prefer written month names over ambiguous numerics.

  — [UX Movement](https://uxmovement.com/content/absolute-vs-relative-timestamps-when-to-use-which/)
- Relative timestamps take "a little bit of mental processing to work out when eight months ago
  actually was." — [Technically Product](https://www.technicallyproduct.co.uk/usability/relative-versus-absolute-timestamps/)
- For dates on the opposite side of the axis, see the MUI `TimelineOppositeContent` finding in
  section 1. — [MUI](https://mui.com/material-ui/react-timeline/)
- Step states found:
  - Carbon: completed, current, not started, error, disabled;
  - PatternFly: success, current, pending, warning, failure;
  - SLDS Path: complete, current, incomplete, won, lost;
  - Ant Design: a loading item for the step in progress.

  — sources in section 1.

### Inferences
- For a society lifecycle spanning months or years, the primary label should be an absolute date.
  Relative time ("3 days ago") helps only for the current or upcoming step.
- Elapsed time between steps ("+12 days after survey"): **no source found that specifies it**; see
  Gaps. It can be computed from absolute dates and shown as a secondary gap label on the connector.
- Show steps not yet reached in the stepper ("not started"/"incomplete"), not as empty timeline
  events. Skipped steps (e.g. a demo skipped) need their own labelled state. None of the systems
  above names "skipped"; Carbon's "disabled" and PatternFly's "pending" are the closest.

### Gaps
- No NN/g primary article on timestamps was found; the search returned only secondary UX sites.
- No design-system guidance on "elapsed time between steps" or a "skipped" state was found.

## 4. Density, scanability, long timelines, print/export

### Takeaway
The recurring tools are filtering by type, expand/collapse-all, grouping by month, pinning the
important item, separating upcoming from past, and short labels. There is no primary guidance on
100+ events or on printing timelines.

### Cited Findings
- Salesforce: expand/collapse all, filters, monthly sections, and a separate upcoming/overdue
  section. — [Salesforce Help](https://help.salesforce.com/s/articleView?id=sf.activity_timeline_parent.htm&language=en_US&type=5); [Weflow](https://www.weflow.ai/blog/salesforce-activity-timeline)
- HubSpot: type filter, per-item and all-item collapse, pin to top. — [HubSpot KB](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline?src=leap); [pin](https://knowledge.hubspot.com/records/pin-an-activity-on-a-record)
- Stripe summarises events older than 30 days in the Dashboard rather than showing them in full
  (progressive detail by age). — [Stripe support](https://support.stripe.com/questions/stripe-event-retention-period)
- PatternFly offers a "compact" stepper for tables and tight spaces, and help popovers "when space
  is limited". — [PatternFly](https://www.patternfly.org/components/progress-stepper/design-guidelines)
- Atlassian: stage labels of 1–2 words on one line. — [Atlassian](https://atlassian.design/components/progress-tracker)
- GOV.UK: incomplete items get a visible tag while completed ones stay plain, so the eye finds the
  outstanding items. — [GOV.UK](https://design-system.service.gov.uk/components/task-list/)
- Primer: keep each item short. — [Primer](https://primer.style/product/components/timeline/accessibility/)

### Inferences
- Completed phases can collapse to a one-line summary ("Survey · done 12 Mar 2025") that expands to
  its events, keeping the current phase open. This matches the collapse-all pattern and GOV.UK's
  quiet treatment of "completed".

### Gaps
- No primary source was found for virtualisation/pagination of 100+ events, sticky date headers,
  or print/export layouts for timelines.

## 5. Accessibility

### Takeaway
Mark the timeline up as an ordered list with machine-readable `<time>` elements. Mark the current
step with `aria-current`. Give meaningful icons text alternatives. Never carry state by colour
alone.

### Cited Findings
- A semantic list lets screen readers announce the item count and where each item starts and ends.
  — [Primer](https://primer.style/product/components/timeline/accessibility/)
- PatternFly: ordered list, `aria-current` on the active step, and `aria-label`. — [PatternFly](https://www.patternfly.org/components/progress-stepper/design-guidelines)
- PrimeReact renders its Timeline as a semantic ordered list. — [PrimeReact Timeline](https://v9.primereact.org/timeline/)
- One design system's issue tracker asks for `ol`/`li` semantics plus a `time` element, because div
  markup leaves timestamps not machine-readable. — [brik-bds issue #1376](https://github.com/brikdesigns/brik-bds/issues/1376)
- Lists let screen readers announce entering and leaving a list, its type and its item count.
  — [Section508.gov](https://www.section508.gov/blog/accessibility-bytes/lists/)
- Icon badges need a text alternative. Text needs 4.5:1 contrast; decorative connectors are exempt.
  — [Primer](https://primer.style/product/components/timeline/accessibility/)
- GOV.UK marks status with text (a tag or plain word), not colour alone, and avoids uppercase.
  — [GOV.UK](https://design-system.service.gov.uk/components/task-list/)
- Carbon: a vertical indicator moves focus with ArrowUp/ArrowDown. — [Carbon](https://carbondesignsystem.com/components/progress-indicator/usage/)

### Inferences
- Each item should carry its state as words (e.g. "Done", "In progress", "Not started", "Skipped",
  "Closed – lost") beside any coloured dot, and dates in `<time datetime="…">`.

### Gaps
- No WAI-ARIA Authoring Practices pattern specific to timelines exists that I found. Guidance is
  per design system.

## 6. Mobile / narrow widths

### Takeaway
Vertical layouts are the documented answer for narrow spaces. Horizontal paths scroll with controls
(SLDS). Alternate/zig-zag layouts need two columns, and no source recommends them for small screens.

### Cited Findings
- Carbon prefers vertical "when possible … for easier reading". — [Carbon](https://carbondesignsystem.com/components/progress-indicator/usage/)
- PatternFly: vertical suits split views and popovers; compact suits tight spaces. — [PatternFly](https://www.patternfly.org/components/progress-stepper/design-guidelines)
- SLDS Path uses a horizontal scroller with overflow controls and has small-region (360–564px)
  sizing. — [SLDS Path](https://v1.lightningdesignsystem.com/components/path/)
- Ant Design `orientation` switches between vertical and horizontal, and `mode` between
  start/alternate/end. — [Ant Design](https://ant.design/components/timeline)

### Inferences
- On a phone, a single left rail with the date stacked above each item's text (rather than in an
  opposite column) avoids squeezing the content. This is an inference; no source states it.

### Gaps
- No primary source gives explicit breakpoint behaviour for vertical activity timelines.
