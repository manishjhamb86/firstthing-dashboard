# Visualising a hierarchical, branching lifecycle timeline (society → service line → deal → demo)

Scope note: research was capped at ~15 tool calls. The academic core (Brehmer et al. 2017, LifeLines, the 2019 alignment study, EventLines 2025) was read from the primary PDFs/pages. Product findings come from vendor docs/help centres (2025–2026 where dated). Salesforce, loan origination, insurance-claim and legal-case products were **not** researched (see Gaps).

## 1. What visual forms exist for branching/parallel timelines, and their readability trade-offs?

### Takeaway
The research frames this as a choice on three axes: representation, scale and layout (Brehmer et al.). A **linear representation** gives the most accurate judgments. A **faceted layout** (one row or lane per branch) is the form built for comparing parallel tracks and spotting coinciding events. A **sequential scale** (evenly spaced steps with the dates as labels) shows order only, not durations. For this data, the strongest candidates are:
- a collapsible tree-table or indented vertical timeline, sequential scale with dates as labels, for "step by step with its date";
- plus a faceted chronological lane view (Gantt-with-hierarchy) for "what overlaps / what is out of order".

### Cited Findings
- **The design space.** Brehmer, Lee, Bach, Riche and Munzner surveyed 263 timelines. They define 14 design choices on three dimensions:
  - representation: linear, radial, grid, spiral, arbitrary;
  - scale: chronological, relative, logarithmic, sequential, sequential + interim duration;
  - layout: unified, faceted, segmented, faceted + segmented.

  20 combinations are "viable", and 253 of the 263 items (96%) fit one of them. Published in IEEE TVCG, 2017 (older, but the canonical source). — [Brehmer et al. preprint](https://timelinesrevisited.github.io/preprint.pdf); [project site](https://timelinesrevisited.github.io/)
- **Linear is the most accurate representation.** "A linear representation will promote a more accurate perceptual judgment [27], but it may lack the aesthetic appeal of radial, spiral, or arbitrary representations." — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **Chronological scale.** It is used by 56% of surveyed items (148/263). It "can be used to present the distance between events, as well as event duration, with respect to absolute points in time." — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **Sequential scale.** Distances between events "do not correspond to chronological distances; events are often equally spaced… chronological distances and durations are not directly encoded." It is "appropriate for communicating solely the order of events." — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **Sequential + interim duration.** This hybrid "is particularly effective for presenting timelines with large chronological extents and a non-uniform distribution of events." A faithful chronological scale leaves "large swaths of the timeline… empty." — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
  - Caveat: the authors note that their interim-duration implementation (a bar chart beside the timeline) has "no such common baseline in faceted or segmented" layouts. So it does not generalise to multiple branches. — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **Faceted layout.** It is "partitioned according to some categorical attribute, effectively resulting in multiple timelines… this layout prompts the audience to compare these timelines." Linear + chronological + faceted is listed for "compare chronology, duration of events between facets; present synchronicities (coinciding events)", with the perceptual task "bar length and position comparisons". — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **Relative scale.** It aligns each timeline to a baseline event at time zero, for "the comparison of multiple timelines… with respect to a common baseline event". It is "particularly appropriate when combined with a faceted layout", e.g. aligning patients to admission. — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **Most prevalent design.** The most common design in the survey (80 instances) is linear chronological faceted by category. — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **LifeLines (Plaisant et al., CHI 1996 / 1998; older, foundational).** A one-screen overview in which each facet (medical condition, legal case) is its own timeline, and discrete events are icons. Line colour and thickness show relationships and significance; rescaling and filters focus the view. The authors claim it "reduce[s] the chances of missing information, facilitate[s] spotting anomalies and trends." — [LifeLines 1996 paper](https://www.cs.umd.edu/~ben/papers/Plaisant1996LifeLines.pdf); [HCIL project page](https://www.cs.umd.edu/projects/hcil/lifelines/)
- **LifeLines2** adds three operators across many records: align (to a sentinel event), rank and filter. — [LifeLines2 page](http://www.cs.umd.edu/hcil/lifelines2/); [HCIL tech report](http://www.cs.umd.edu/hcil/trs/2012-06/2012-06.pdf)
- **Process-mining variant view (Fluxicon Disco).** A variant is "a specific sequence of activities… one path from the beginning to the very end", with loops unfolded. The top 5 variants often cover about 50% of cases. This view summarises many cases as a list of step sequences rather than drawing each case's dates. — [Fluxicon blog (2012, older)](https://fluxicon.com/blog/2012/11/how-to-understand-the-variants-in-your-process/); [Disco Cases view](https://fluxicon.com/book/read/casesview/)
- **Celonis Variant Explorer.** It shows each end-to-end variant with its activities, frequency and throughput time. It can filter cases by throughput time between two selected activities. — [Celonis docs](https://docs.celonis.com/en/ve-tpt-filtering.html); [Celonis blog](https://www.celonis.com/blog/celonis-ems-process-explorer-and-variant-explore-whats-the-difference)
- **EventLines (Wong & Elmqvist, arXiv, July 2025).** It gives equal spacing between adjacent events, a time compression for bursty event data. Axis glyphs (coils, stipples, thickness, transparency) signal the non-linear scale. In a crowdsourced study, "Coils w/ Numbers, Stipples and Rectangles" performed best among the six glyphs. **It was not compared against a plain linear chronological timeline.** — [EventLines arXiv](https://arxiv.org/html/2507.17320)

### Inferences
- **The data mixes two tasks.**
  - "Read each branch step by step with its date" is an **order** task. A sequential scale fits it: an indented vertical list with a date on every step.
  - "Spot anything out of order across branches, see overlap" is a **synchronicity** task. It needs a **shared chronological axis with one lane per branch**, which is Brehmer's linear-chronological-faceted form.

  No single form in the literature does both well, which argues for two views, or a list with a secondary lane strip.
- **Out-of-order detection within one branch** is easiest in the sequential list if each step's date is compared with the previous one and a violation is flagged inline. On a chronological lane chart, a backwards step shows as a mark left of its predecessor, which is visible but easy to miss among many lanes.
- **Git-graph and subway-map forms** encode fork and merge topology, which this data lacks: branches never merge back. They add visual cost without that payoff. Git-graph style is best kept to showing *where* a demo forks from its deal.
- **Relative-scale alignment** (e.g. each demo aligned to its meter-install day) would suit comparing demos with each other. The Zhang et al. evidence below cautions that alignment hurts duration judgments.

### Gaps
- No subway/metro-map timeline source was found or read, so its trade-offs here are unsourced.
- Brehmer et al. is a design space built from a corpus survey, not a controlled readability experiment. Its accuracy claim rests on the cited Cleveland & McGill ranking.

## 2. Which real products use similar forms?

### Takeaway
Mainstream work-management tools cap hierarchy on the timeline at 1–2 visible levels (Asana, basic Jira) or restrict the timeline to the top-level object (Linear). Deeper nesting is pushed into list or tree views or paid "advanced" plans. Git clients use lanes per branch with folding. Process-mining tools use variant lists, not per-case timelines.

### Cited Findings
- **Jira basic timeline.** It shows epics and their children. "Show inline hierarchy" indents children beneath parents, a two-level view. Deeper, custom hierarchies need Advanced Roadmaps (Plans, Premium). "Start hierarchy from" picks the top level shown. — [Atlassian: timeline view settings](https://support.atlassian.com/jira-software-cloud/docs/customize-your-roadmaps-view-settings/); [Atlassian: custom hierarchy levels](https://support.atlassian.com/jira-software-cloud/docs/configure-custom-hierarchy-levels-in-advanced-roadmaps/); [community thread](https://community.atlassian.com/forums/Jira-questions/Project-Timeline-View-Hierarchy-Level-2/qaq-p/2485563)
- **Jira Plans filtering.** "Show full hierarchy" keeps the children of filtered items visible even when they don't match. — [Atlassian: show full hierarchy](https://support.atlassian.com/jira-software-cloud/docs/show-full-hierarchy-while-filtering-issues-on-your-timeline/)
- **Asana Timeline.** Subtasks expand with an arrow beside the parent bar, and a subtask count is shown. "Only the first level of subtasks will be displayed." Dependencies are drawn as connectors. — [Asana Help: timeline](https://help.asana.com/s/article/timeline?language=en_US)
- **Linear Timeline.** It is for projects only: "Individual issues cannot be viewed on the timeline". Project milestones show as stages, with zoom at week, month, quarter or year. — [Linear Docs: Timeline](https://linear.app/docs/timeline); [Linear Docs: Project milestones](https://linear.app/docs/project-milestones)
- **GitKraken / GitLens commit graph.**
  - Branch lanes can be **folded** to collapse inactive branches.
  - A branch can be **pinned to the left**.
  - Lane colours are perceptually uniform.
  - Divergence points are drawn explicitly.

  — [GitKraken Desktop 11.10 blog](https://gitkraken.com/blog/gitkraken-desktop-11-10-from-top-requests-to-todays-release); [GitLens Commit Graph help](https://help.gitkraken.com/gitlens/gl-commit-graph/); [GitKraken commit graph feature page](https://gitkraken.com/features/commit-graph)
- **Clinical record timelines (LifeLines)** use one row per facet (condition), with expandable facets. — [HCIL LifeLines](https://www.cs.umd.edu/projects/hcil/lifelines/)
- **Process mining (Disco, Celonis)**: see Q1. Variants are rows of step sequences with frequency and throughput time.

### Inferences
- The industry pattern for three or more hierarchy levels is: **a tree or table on the left defines the structure; the time axis on the right shows only the currently expanded rows.** Tools that tried to show everything on the timeline limited visible depth instead.
- The society → line → deal → demo depth (4 levels, with steps as a 5th) is beyond what Asana or basic Jira show inline. A collapsible tree-table with date columns or step lists is the precedent-backed way to reach that depth.

### Gaps
- Salesforce (Path, related lists, activity timeline), Monday.com timeline, loan-origination systems, insurance-claim lifecycles and legal case-management timelines were not researched for lack of tool budget. Nothing is claimed about them.
- NN/g has no specific article on hierarchical timelines; none was found in the search.

## 3. How do products handle many branches, deep nesting, collapse/expand, fork points, and shared axis vs per-branch lists?

### Takeaway
The recurring mechanisms are:
- indent children under the parent;
- collapse by default, with chevrons;
- remember expansion state;
- keep matched items' ancestors and children visible when filtering;
- fold or pin lanes in branch graphs;
- limit depth rather than draw everything.

### Cited Findings
- **Tree-view design-system guidance.**
  - Always show an expanded/collapsed indicator, a chevron or plus/minus. — [Carbon: tree view](https://carbondesignsystem.com/components/tree-view/usage/); [Adobe Spectrum: tree view](https://spectrum.adobe.com/page/tree-view/)
  - Draw nesting-level indicator lines. — [Primer TreeView guidelines](https://primer.style/product/components/tree-view/guidelines/)
  - When a parent collapses, persist the expanded state of the nodes below it. — [Primer](https://primer.style/product/components/tree-view/guidelines/)
  - Reduce levels where parent nodes carry nothing of their own. — [Primer](https://primer.style/product/components/tree-view/guidelines/)
  - If the hierarchy can run deeper than the layout, use adjustable panels or rails. — [Primer](https://primer.style/product/components/tree-view/guidelines/)
- **Jira "show full hierarchy"** keeps context visible while filtering. — [Atlassian](https://support.atlassian.com/jira-software-cloud/docs/show-full-hierarchy-while-filtering-issues-on-your-timeline/)
- **Lane folding and pinning** in GitKraken handle many branches. — [GitKraken 11.10](https://gitkraken.com/blog/gitkraken-desktop-11-10-from-top-requests-to-todays-release)
- **Asana** limits the timeline to one subtask level. — [Asana Help](https://help.asana.com/s/article/timeline?language=en_US)
- **Variant grouping.** Process-mining tools cope with many parallel cases by grouping identical step sequences. — [Fluxicon](https://fluxicon.com/book/read/casesview/)
- **Evidence on alignment across many rows.** Zhang, Di Bartolomeo, Sheng, Jimison and Dunne (IEEE VIS short paper, 2019, older) ran an MTurk study (n = 62 after filtering). They compared no alignment, single-event alignment and dual-event alignment:
  - Dual alignment was best for counting intermediate events between two sentinels: 71% correct vs 18% for no or single alignment.
  - **No alignment was best for judging the duration between two events**: 88% correct vs 36% for dual-stretch, 55 s vs 101 s, and 2% vs 8% error.
  - Precursor and aftereffect tasks showed no significant difference.
  - "Differences between approaches were most pronounced with more rows of data."

  It reports the original LifeLines2 study found alignment made users about 65% faster with 20 records, but not with 5. — [Zhang et al. arXiv 1908.07316](https://arxiv.org/pdf/1908.07316)

### Inferences
- **Fork points.** Show each deal's or demo's start as a small connector from the parent's rail, in the git-graph style, placed at the fork date. The literature offers no stronger idiom. The GitKraken precedent is "divergence points immediately visible".
- **Many deals.** Default to collapsed deals, with a one-line summary per deal: current step, last date, and a warning flag if a step is out of order. Expand one to show its steps. Provide an "only branches with a problem" filter that keeps ancestors visible, the Jira "full hierarchy" behaviour.
- **Shared axis vs per-branch lists.**
  - Per-branch lists (sequential scale) scale to depth and to phones.
  - A shared axis is needed only for overlap questions, and it should keep true dates and not align branches if durations matter (per Zhang et al.).
  - Aligning demos to their meter-install day is worth offering only as an option for comparing demos with each other.

### Gaps
- No product documentation was found that shows 4+ hierarchy levels on a single timeline canvas. The absence is itself suggestive, but it was not exhaustively checked.

## 4. Which forms work at narrow/mobile width?

### Takeaway
Horizontal date axes (Gantt, swimlanes, git graphs) need width in proportion to the time span and the number of lanes, and degrade on phones. Indented vertical lists and tree-tables with dates as text reflow naturally. Sourced evidence here is thin and mostly vendor-level.

### Cited Findings
- **Linear representation and aspect ratio.** Brehmer et al. flag the linear sequential timeline's "wide aspect ratio" as a constraint. They say a set of alternative designs helps "a storyteller who faces constraints in terms of… the aspect ratio of a timeline view, or whether the audience is permitted to navigate a timeline via panning or zooming." — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **Gantt vendors.** They offer a "compact mode" for phones and tablets that switches from the full desktop format, and say that "simplifying user interfaces on mobile devices is usually recommended". These are vendor claims, not research. — [DlhSoft/Ganttis on Medium](https://medium.com/ganttis/gantt-charts-on-small-screens-6e441155771d); [Highcharts Gantt responsive API](https://api.highcharts.com/gantt/responsive); [Zoho Projects mobile Gantt help](https://help.zoho.com/portal/en/kb/projects/zoho-projects-mobile-app/android/projects/articles/gantt-chart)
- **Rails and panels for deep trees.** Tree-view guidance recommends adjustable panels or rails when the hierarchy runs deeper than the available space. — [Primer](https://primer.style/product/components/tree-view/guidelines/)

### Inferences
- **On phones:**
  - Use the indented vertical timeline: one rail per level, and a step's date on its own line.
  - Cap visible indentation at about 2 levels. Deeper levels become breadcrumb headers ("Lighting › Deal B › Demo 2") rather than further indents, since each indent costs width.
- **Swimlane or Gantt view:**
  - Make it desktop-only.
  - Or render it on phones as a horizontally scrollable strip with the branch labels pinned. That is readable but poor for cross-branch overlap judgments.
- **Git-graph lanes** fall apart on narrow widths once there are more than a few parallel branches (8 deals × up to 3 demos), because each lane needs its own column.

### Gaps
- No NN/g or academic study specifically on mobile hierarchical or branching timelines was found. The mobile recommendations above are inferences, not findings.

## 5. What does UX and visualisation research say people read accurately for sequence and duration?

### Takeaway
Position along a common linear axis is the most accurately read encoding (Brehmer, citing Cleveland & McGill). Sequential spacing communicates order but not duration. Aligning rows to a sentinel event helps some tasks but significantly hurts duration judgments between events.

### Cited Findings
- **Linear and chronological encodings.** A linear representation promotes more accurate perceptual judgment than radial, spiral or arbitrary ones. Chronological scales support "bar length and position" judgments of duration. — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **Sequential scales** encode order only: "chronological distances and durations are not directly encoded." — [Brehmer et al.](https://timelinesrevisited.github.io/preprint.pdf)
- **Alignment evidence** (MTurk; Zhang et al., 2019) — [Zhang et al.](https://arxiv.org/pdf/1908.07316):
  - No alignment beat dual-stretch alignment for interval duration: 88% vs 36% correct.
  - Dual alignment beat no or single alignment for identifying intermediate events: 71% vs 18%.
  - Effects grow with the number of rows.
- **LifeLines.** Its authors claim the faceted one-screen overview reduces missed information and aids spotting anomalies. This is a design claim from the original papers, with limited controlled evaluation reported in the sources read. — [Plaisant et al. 1996](https://www.cs.umd.edu/~ben/papers/Plaisant1996LifeLines.pdf)
- **Compressed time scales** (EventLines 2025) are designed for bursty data. Their effectiveness relative to plain linear timelines is **untested**. — [EventLines](https://arxiv.org/html/2507.17320)

### Inferences
- **Sequential list view.** A per-branch step list with dates as labels is accurate for order, since each step is explicitly after the previous one. It does not show durations. For durations, show the interval as text ("12 days after meeting") rather than relying on spacing, or use a chronological lane view.
- **Swimlane view.** Keep real dates on a shared axis and do not align the lanes, so durations and overlaps are read correctly. Offer "align to demo start" only as an optional comparison mode.
- **Out-of-order detection** should not rely on visual inspection alone at this branch count. The literature supports visual overviews for "spotting anomalies", but a computed flag on the offending step is more reliable. This is an inference; no study was found comparing flagged versus unflagged anomaly detection in timelines.

### Gaps
- No NN/g article on timelines or hierarchical timelines was located in the searches made.
- No study was found that directly compares indented tree timelines, swimlanes and git-graph layouts for hierarchical branching data. That comparison is not in the sources gathered.
