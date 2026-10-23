# Premium dashboard colour-coding patterns

A note on source quality before the findings: official, primary design-system documentation was
reachable for Adobe Spectrum (partially — the data-viz foundations page didn't load category
guidance, but a cached/secondary description of the same guidance was corroborated across two
searches), IBM Carbon, Shopify Polaris, GitHub Primer, and GitHub's own label docs. For Stripe,
Linear, Vercel, Notion, Figma, Attio, Height, Ashby, Arc/The Browser Company, Raycast and Ramp, no
official design-system blog post or documentation page with *stated* colour rationale was found in
this pass — only third-party reverse-engineered "design system teardown" sites (open-design.ai,
webdesignhot.com, styles.refero.design, kombai.com, Tessl skill files) and a handful of press
interviews. Those are flagged as **low confidence** throughout and should be treated as "what it
looks like," not "why they built it that way." Several of them also directly contradict each other
on the same product's hex values, which is reported explicitly where it happened.

## How do well-regarded products actually use colour to distinguish categories/sections on a dense data screen?

### Takeaway
The one pattern with real primary-source backing (GitHub Primer, official) is that colour in
mature B2B systems is organized by **semantic role** (accent/success/attention/danger/done, etc.)
rather than by arbitrary category, and categorical/sectional distinction is treated as a separate,
secondary concern layered on top of — never a replacement for — icon, label text, and layout.
Everything about *specific* mechanisms (left borders, icon tints, badge pills) in named products
like Stripe/Linear/Vercel/Notion is sourced only from unofficial teardowns and should be read as
observational, not design-rationale-backed.

### Cited Findings
- GitHub Primer's official colour-system docs state semantic colours are "typically used to
  communicate status, action, or emphasis," and map specific roles: `accent` for links/selected/
  active/focus plus neutral information, `success` for primary buttons and positive messaging,
  `attention` for warnings/active processes, `danger` for danger buttons/errors, and dedicated
  `open`/`closed`/`done` roles for task/PR/workflow states — a role-based model, not a free
  per-category palette. — [Primer color overview](https://primer.style/foundations/color/overview)
- Primer explicitly says muted (desaturated) backgrounds draw attention "to a specific piece of
  content" with subtle emphasis, implying restraint is the default and stronger "emphasis" colour
  variants are reserved for cases that need it more. — [Primer color overview](https://primer.style/foundations/color/overview)
- Primer's component-level colour tokens ("limited" vs. "functional tokens are preferred") signal
  that the system discourages inventing new one-off colours per feature/category; functional/
  semantic tokens are the default path. — [Primer color overview](https://primer.style/foundations/color/overview)
- Primer's own labelling package (`primer-labels`) distinguishes three *purposes* for colour-tagged
  elements: Labels (metadata), States (status), and Counters (item counts) — i.e. even within one
  system, "a coloured tag" is subdivided by what job it's doing, not used as one generic category
  marker. — [primer-labels npm](https://www.npmjs.com/package/primer-labels)
- *(Low confidence, unofficial teardown)* Stripe's dashboard is described as using a single violet
  brand accent for links/active/selected states, with separate green/brown/red semantic colours for
  success/warning/danger — i.e. one accent + a small fixed semantic set, not a wide categorical
  palette. — [Stripe style reference](https://open-design.ai/pt-br/plugins/design-system-stripe/), [Stripe DESIGN.md](https://design.hagicode.com/designs/stripe/DESIGN.md)
- *(Low confidence, unofficial teardown, single source, unverified)* Linear is described as "almost
  entirely grayscale, with one brand accent" (indigo-violet), the accent "reserved for calls to
  action, active states, and brand elements," with a small green/emerald pair used only for
  status/completion pill badges. — [Linear design teardown](https://open-design.ai/plugins/design-system-linear-app/)
- *(Low confidence, unofficial teardowns, hex values conflict between sources)* Vercel is described
  as a near-white/near-black neutral base with one saturated blue accent (~#0070f3) for links/focus,
  plus a small separate set of pipeline-stage colours (red/pink/blue for ship/preview/develop
  stages) that are tied to a specific workflow concept, not a general-purpose category palette. —
  [Vercel design teardown](https://cdn.jsdelivr.net/npm/oh-my-opencode@4.18.2/dist/skills/frontend/references/design/vercel.md), [webdesignhot Vercel](https://www.webdesignhot.com/api/design-md/vercel/claude.md)
- *(Low confidence, unofficial teardown)* Vercel-style dashboards are described as using pill-shaped
  status badges with tinted backgrounds, and borders built from a single-pixel inset shadow rather
  than a visible border line — a detail about *how* restraint is executed technically, not why. —
  [Vercel design teardown](https://cdn.jsdelivr.net/npm/oh-my-opencode@4.18.2/dist/skills/frontend/references/design/vercel.md)
- *(Low confidence, unofficial teardowns)* Notion-style systems are described as using very thin
  (1px), low-opacity gray borders by default, with colour reserved for "CTA fills, emoji-icon
  accents, badge highlights, and decorative card borders" — i.e. colour as a deliberate, sparse
  accent against an otherwise neutral hairline-bordered surface, with a playful multi-hue "sticker"
  palette (sky/purple/pink/orange) available for decorative use but a single blue reserved for
  primary actions. — [Notion design teardown](https://design.hagicode.com/designs/notion/), [Tessl Notion skill](https://tessl.io/registry/skills/github/ihlamury/design-skills/notion-ui-skills)
- *(Low confidence, unofficial teardown)* A left coloured border/accent on a card or stat tile is
  described across several component-library sources as a common pattern for signalling either
  category (a fixed brand/category colour) or trend/direction (green border = positive trend, red
  = negative) on dense dashboard rows — e.g. a shadcn "stats card" component uses the left border
  colour to match trend direction specifically so a reader can scan a column of cards quickly. —
  [shadcnblocks stats-card10](https://www.shadcnblocks.com/block/stats-card10)
- *(Low confidence, one design-system doc, not from the suggested source list but directly on point)*
  Appian's SAIL design system explicitly offers a card "accent" property with named semantic presets
  (Standard, Accent, Positive, Warn, Negative) alongside a free-hex option, treating the left/accent
  border as a first-class semantic (not arbitrary-category) colour slot. — [Appian SAIL card layout docs](https://docs.appian.com/suite/help/26.7/sail/ux-card-layout.html)
- A blog post (secondary, practitioner) argues that modern SaaS products including Stripe and
  Linear have broadly moved from drop-shadow card elevation toward 1px hairline borders as the
  structural device, with colour reserved separately for meaning — consistent with, but not
  independent confirmation of, the teardown claims above. — [Webflow card shadows blog](https://www.pravinkumar.co/blog/webflow-card-shadows-replaced-with-borders-2026)
- Shopify's official Polaris guidance states explicitly that status colours (error/success/warning)
  "should be paired with icons or labels" — colour is never the sole channel distinguishing a
  category/status, a stated accessibility rationale (colour-blind merchants). — [Shopify Polaris visual design](https://shopify.dev/docs/apps/design/visual-design)
- A widely cited pattern across several badge/pill component docs (MiHCM design system, a 21st.dev
  component, PatternFly forum) is a **light tint background + a darker shade of the same hue for
  text**, always paired with a text label, never colour alone — e.g. green-100 background with
  green-800 text. — [MiHCM badge accessibility](https://designsystem.mihcm.com/components/badge/accessibility), [GitHub badges/shields issue #4661](https://github.com/badges/shields/issues/4661)

### Inferences
- The one consistent, reasonably-confirmed thread across both the official sources (Primer,
  Polaris) and the lower-confidence teardowns (Stripe, Linear, Vercel, Notion) is: **premium
  products reserve colour almost entirely for semantic/status meaning (success, danger, "in
  progress," brand action) and lean on icon shape, label text, typography weight, and spacing to
  do the work of distinguishing unrelated *categories/sections* of a dashboard** — rather than
  assigning each business domain its own saturated hue. Where a category genuinely does get its
  own colour (Vercel's pipeline stages, a left-border accent), it tends to be a small, closed,
  named set (e.g. 3–5 pipeline stages) rather than an open-ended per-domain palette.
- A left-border/accent-stripe on a card or row, paired with an icon and a text label, is the most
  concretely-documented mechanism (Appian, shadcn pattern libraries) for a per-row/per-card colour
  signal that still reads as restrained, because the coloured area is thin and the fill/background
  stays neutral.

### Gaps
- No official design-system documentation or named-designer statement was found for Stripe, Linear,
  Vercel, Notion, Figma, Attio, Height, Ashby, Arc/The Browser Company, Raycast or Superhuman that
  directly states *why* they chose their specific category/section colour mechanism (border vs.
  icon tint vs. background tint vs. typography-only). Everything above for those products is
  inferred from unofficial reverse-engineering sites, which disagree with each other on exact hex
  values in at least three cases (Stripe's accent, Ramp's accent, Attio's accent).
- No source was found describing Figma's, Superhuman's, Ashby's, Height's, or Raycast's dashboard
  colour approach at all (official or unofficial) within the search budget for this pass.

## When these products DO colour-code, what is the actual saturation/lightness/restraint pattern?

### Takeaway
Across every credible source found — official (Primer, Carbon, Polaris) and well-reasoned secondary
(Refactoring UI summaries, badge-accessibility docs) — the pattern is consistent and explicit: a
light, desaturated tint for the fill/background, with a darker, more saturated shade of the *same*
hue reserved for text or an icon, and full-saturation fills reserved for small, high-emphasis
elements (primary buttons, focus rings) rather than category labels.

### Cited Findings
- The badge/pill consensus (MiHCM, 21st.dev, a GitHub Shields issue) is explicitly: light tint
  background, dark/saturated text of the same hue family, contrast checked (MiHCM states a 4.5:1
  target against the background in both light and dark themes) — restraint on the fill, saturation
  reserved for the text. — [MiHCM badge accessibility](https://designsystem.mihcm.com/components/badge/accessibility)
- A GitHub Shields issue states plainly that light badge backgrounds need "dark and saturated"
  text, because a saturated *background* with light text is "extremely hard to read" at small
  sizes — a concrete stated reason for the tint/text split rather than a bold fill. — [shields #4661](https://github.com/badges/shields/issues/4661)
- A Wikimedia Phabricator accessibility bug (white text on light-grey badge failing WCAG) is a
  concrete documented failure case of *not* following the tint-background/dark-text pattern. —
  [Phabricator T112510](https://phabricator.wikimedia.org/T112510)
- Refactoring UI's summarized guidance (secondary paraphrase, book itself not directly accessed):
  design in grayscale first, add colour last and sparingly; pure grays should carry a slight hue
  tint rather than being perfectly neutral; a colour scale should run many steps (50–900) from
  near-white to near-black, with saturation shifting across the scale (lower saturation at the
  light end, higher at the dark end) rather than one flat saturated hue repeated at every lightness
  step. — [Refactoring UI summary via Smithery](https://smithery.ai/skills/wondelai/refactoring-ui)
- IBM Carbon's official guidance: the data-visualization categorical palette is explicitly "a
  curated subset of the IBM Design Language palette, designed to maximize accessibility and visual
  harmony" — i.e. not the full brand palette, a deliberately narrowed, harmonized subset — and the
  broader system philosophy is "deliberate hits of color... combined with rich neutrals for a
  balanced, cohesive experience." — [Carbon data-viz color palettes](https://carbondesignsystem.com/data-visualization/color-palettes/)
- Adobe's Spectrum categorical data-viz palette is capped at 6 colours and is stated to be
  specifically "optimized so that users with color vision deficiencies can distinguish its
  colours" — restraint tied explicitly to an accessibility rationale, not just taste. — [Spectrum categorical palette, via secondary summary](https://jschwabish.substack.com/p/why-are-six-colors-common-in-color)
- Shopify Polaris's colour system is built in the HSLuv colour space specifically "to generate
  themes that meet WCAG 2.1 compliant contrast ratios" — a stated technical reason (perceptually
  uniform colour space) for why its palette behaves consistently across lightness/saturation steps.
  — [Shopify visual design docs](https://shopify.dev/docs/apps/design/visual-design)
- *(Low confidence, practitioner blog, no citation given for the specific claim)* A UX Design
  Collective piece argues for "one dominant colour for most of a site," with other colours used
  sparingly, so colours "don't overwhelm users." — [UX Design Collective](https://uxdesign.cc/fundamentals-of-color-in-interface-design-ui-8127149f13e6)
- *(Low confidence, individual designer's personal blog, stated as his own heuristic rather than
  research)* Jake Worth states his own working principle: "no color is better than the wrong
  color," applying colour "sparingly, at the very end" after a layout is settled in grayscale. —
  [Jake Worth](https://jakeworth.com/posts/no-color-is-better-than-the-wrong-color/)

### Inferences
- There is a clear, multiply-corroborated **tint-for-fill / saturation-for-text-or-icon** split:
  every credible badge/label source converges on light desaturated backgrounds with a darker,
  more-saturated same-hue foreground, rather than bold saturated fills used as category markers.
  This is the single most concrete, reusable rule found in this research, and it generalizes
  naturally to card accents (tint the card surface or icon chip lightly; let the small accent —
  border stripe, icon glyph, or status word — carry the saturation).
  - Applied to a real example: a soft blue-tinted icon chip (`bg-blue-50` / `bg-blue-500/10`) with a
    solid blue icon glyph inside it reads as the same pattern scaled up from a text badge to a card
    header — the restrained background, concentrated saturation only where the eye should land.
- Full-saturation, solid-fill colour appears to be reserved, across every source, for things that
  are rare on screen and demand action (primary CTA buttons, focus rings, the one brand accent) —
  never for a repeated category marker that appears many times per screen (which is exactly the
  "Payments/Tickets/Installations/Meters/Demos" card-and-row use case in the objective).

### Gaps
- No source gave exact numeric saturation/lightness values (e.g. specific HSL ranges) as an explicit
  cross-product rule; the pattern above is qualitative and corroborated by convergence across
  sources rather than by one authoritative numeric spec.
- The original Refactoring UI book text was not directly retrievable in this pass; findings here
  rely on a third-party AI "skill" summary of the book, which could have compressed or slightly
  altered the authors' exact wording.

## Are there well-known products that explicitly DON'T colour-code sections, relying on typography/spacing/layout alone — and what's the stated rationale?

### Takeaway
No source found in this pass documents a premium product explicitly and formally rejecting
colour-coding by name with a stated design rationale; what *was* found is a consistent secondary
pattern — "almost monochrome, one single accent" — describing Linear and several B2B SaaS
marketing/dashboard teardowns (Plain, WorkOS), and several individual designers' *stated personal
principles* (not institutional design-system docs) arguing for colour restraint as the default,
with colour-coding of categories as something to avoid or minimize rather than embrace.

### Cited Findings
- *(Low confidence, single unofficial teardown source, not independently corroborated)* Linear's
  colour system is described as "almost entirely grayscale," with the one indigo-violet accent
  "kept scarce" and reserved only for CTAs/active states/brand elements — i.e. category/section
  distinction, where it exists at all, is implied to rely on layout, icon, and typography rather
  than a spread of hues. — [Linear design teardown](https://open-design.ai/plugins/design-system-linear-app/)
- *(Low confidence, unofficial teardown, two B2B products described similarly)* "Plain" and
  "WorkOS" are both described, in unofficial design-token comparison write-ups, as "single-accent
  confidence on a neutral canvas" with hairline-border restraint — the implication (not a stated
  quote from either company) is that visual hierarchy comes from spacing/borders/weight, with one
  accent colour used only for emphasis rather than categorisation. — [WorkOS teardown](https://www.webdesignhot.com/design.md/workos/)
- *(Low confidence, individual designer's personal stated principle, not an institutional
  design-system document)* Jake Worth frames his personal rule explicitly as a design principle
  that's "crept into" his programming: colour is the exception, not the default tool for
  distinction — the implied alternative tools being structure/spacing/weight, though he does not
  name specific "categories" use cases. — [Jake Worth](https://jakeworth.com/posts/no-color-is-better-than-the-wrong-color/)
- *(Low confidence, secondary practitioner summary, no company named)* A UX Design Collective
  piece's advice — build around one dominant colour for most of a surface — is presented as general
  practice advice, not attributed to any specific premium product's documented decision.
  — [UX Design Collective](https://uxdesign.cc/fundamentals-of-color-in-interface-design-ui-8127149f13e6)

### Inferences
- The pattern that recurs — "one accent colour, otherwise grayscale/neutral, hierarchy from
  typography and spacing" — looks like it may be the *de facto* norm among the premium-feeling
  products named in the brief (Linear in particular), but this is an inference built on low-
  confidence, single-source, unofficial teardowns, not a documented institutional stance.
  Practically, this suggests: a dashboard does not need a distinct hue per business domain to read
  as organized — type weight, icon shape, and spacing can carry that job, with colour reserved for
  status/urgency inside each domain (e.g. "overdue" in red, regardless of which card it's in).

### Gaps
- No primary source (official blog post, design-system doc, or on-record interview quote) was found
  in which a named company or designer explicitly states "we chose not to colour-code sections, and
  here's why" for any of the products in the suggested list. This is a genuine gap, not an omission
  — it was actively searched for (Linear/Karri Saarinen interview search returned a Sequoia profile
  about taste and Finnish design culture generally, with nothing on colour specifically).
- It's possible such a statement exists in a podcast, a Linear changelog post, or a conference talk
  not indexed by the searches run in this pass; worth a follow-up search specifically on Linear's
  own blog/changelog archive and on podcast transcript aggregators if higher confidence is needed.

## What specific, named failure mode turns a "colour-coded dashboard" into something that reads as cheap/garish/amateurish?

### Takeaway
No source used the literal phrase "icon bubbles," but multiple credible, named critics — most
authoritatively Stephen Few (author of *Information Dashboard Design*) — explicitly name and
explain several concrete failure patterns: colour used decoratively rather than meaningfully
("gratuitous" colour), inconsistent colour-to-meaning mapping across a screen, mismatched
legend/label colours, and visual effects (gradients, transparency, background images) that add
salience without adding information. Separately, "too many simultaneous hues" is named explicitly
as a "confetti party" (Datawrapper) or a dashboard that "looks lit like the Christmas tree"
(FusionCharts).

### Cited Findings
- Stephen Few, reviewing a real enterprise dashboard, says it shows "no understanding whatsoever
  of effective dashboard design," and names the specific defects: the legend's colour swatches
  don't match their own labels ("the red box is labeled 'Green'"); red/yellow/green used to mean
  bad/borderline/good, which fails for colour-blind viewers (he cites roughly 10% of men, 1% of
  women); the same colours (red, blue) meaning different things in different charts on the same
  screen, which trains viewers to falsely infer a shared meaning; transparency and gradient fills
  on bars adding visual salience with no informational payoff, and distracting background images
  that make the data itself harder to read. — [Perceptual Edge, Stephen Few](https://www.perceptualedge.com/blog/?p=154)
- Few's explicit design rationale, stated directly: colour should encode meaning, not decorate; if
  there's no meaningful distinction to make, use one colour, because multiple colours make a
  viewer look for a relationship that may not exist; a colour's meaning should stay consistent
  everywhere it appears on one screen; labels and their colour swatches must match exactly. —
  [Perceptual Edge, Stephen Few](https://www.perceptualedge.com/blog/?p=154)
- Datawrapper names the specific failure mode of a many-categories chart as a "confetti party"
  look — visually cluttered and hard to read, including for colour-blind readers — and gives it a
  rough trigger point of charts with "twelve, or fifteen" categories. — [Datawrapper, 10 ways to use fewer colors](https://www.datawrapper.de/blog/10-ways-to-use-fewer-colors-in-your-data-visualizations)
- A FusionCharts guide (secondary source) names the equivalent failure as a dashboard that "looks
  lit like the Christmas tree," where "the colours that matter are drowned out," and recommends no
  more than three colours. — [FusionCharts blog, via search summary](https://www.fusioncharts.com/blog/wp-json/wp/v2/posts/16628)
- Stacey Barr (performance-reporting consultant, not from the suggested source list but directly
  relevant and citable) gives a named, concrete rule: "set a colour palette of only 3 to 5 colours
  – including black and grey," framed explicitly around avoiding the distraction of "a bunch of
  different shades." — [Stacey Barr](https://www.staceybarr.com/?p=5010)
- A secondary summary of Stephen Few's broader "13 dashboard mistakes" places "misusing or
  overusing colour" as one of the named, numbered mistakes, grouped with "cluttering the display
  with useless decoration" — i.e. Few treats decorative/overused colour as the *same class* of
  mistake as visual clutter in general, not a separate concern. — [The Data School summary of Few's mistakes](https://www.thedataschool.co.uk/anh-vu/are-you-making-these-13-dashboard-design-mistakes-part-2)
- Adobe Spectrum's stated (though uncited, per the Substack analysis) claim: categorical colours
  "become more difficult to comprehend starting at 6 colours, and extremely difficult to
  understand at 12" — naming a specific perceptual breakdown point, even without a research
  citation attached. — [via jschwabish Substack analysis](https://jschwabish.substack.com/p/why-are-six-colors-common-in-color)
- A Reddit/forum review (anecdotal, low authority) of a colourful dashboard scored it 5/10
  specifically criticizing a "poor" colour scheme where metric tiles "blended into the background,"
  cited by a secondary summary as representative of the "colourful cards read as cheap" complaint
  — included for completeness but is not an authoritative or named-critic source. — [search summary, enterprise dashboard critique]

### Inferences
- The failure mode the brief calls "icon bubbles" — a colourful, tinted, rounded icon chip repeated
  identically across many unrelated cards — isn't named verbatim by any source found, but Few's
  *underlying* rule directly predicts why it would fail: if every card gets a different-coloured
  icon bubble with no consistent meaning behind which colour maps to which domain (or if the same
  colour is reused for an unrelated domain elsewhere on the same screen), it is exactly the
  "colour used decoratively, with inconsistent or absent meaning" failure Few names explicitly.
  The safe version — per Primer's role-based model and the badge-pill tint/text-saturation pattern
  above — is a *consistent*, small, semantically-anchored colour per domain (not decorative, not
  arbitrary), kept to a light tint, never a bold saturated fill repeated as wallpaper.
- The common thread across every named critique (Few, Datawrapper, FusionCharts, Barr) is that the
  failure isn't "using colour to categorize" per se — it's (a) too many simultaneous hues
  competing, (b) a colour's meaning not staying consistent across the screen, and (c) colour used
  where it adds visual noise but no information (gradients, transparency, decorative tints with no
  semantic tie).

### Gaps
- No design-critique source was found that uses the literal term "icon bubbles" to name this
  failure mode. This looks like a term from design-practitioner vernacular (possibly Twitter/X
  discourse) rather than a documented, citable source; it was actively searched for and not found
  within this pass's budget.
- No source from the original suggested list (Refactoring UI, UX Collective, Smashing Magazine,
  NN/g) was found explicitly naming and illustrating this exact "colourful icon chip per card"
  pattern as a failure; the closest and most authoritative is Stephen Few's "gratuitous colour"
  critique of a different but structurally similar failure (colour without consistent meaning).

## Concretely, how many simultaneous "categorical" colours do these premium products cap at, and is there a stated reason?

### Takeaway
There is no single agreed number, but every credible numeric source converges on a range of
roughly **3 to 8**, trending toward the low end (3–6) for anything meant to be read quickly rather
than analyzed carefully, with most sources citing perceptual/working-memory limits as the reason
— though several sources explicitly flag that the most commonly repeated number (six) is a
convention rather than a hard, well-cited scientific rule.

### Cited Findings
- Adobe Spectrum's official categorical palette for data visualization is capped at **6** colours,
  with the stated guidance to use fewer than 6 where possible, and an explicit claim that
  comprehension gets "more difficult starting at 6... extremely difficult... at 12." — [via jschwabish Substack, citing Spectrum](https://jschwabish.substack.com/p/why-are-six-colors-common-in-color)
- IBM Carbon's data-visualization categorical sequence defaults to **14** colours (applied in a
  fixed, perceptually-tuned order so adjacent entries contrast well), but offers single-hue
  alternative palettes when the category count is known and small in advance — i.e. Carbon doesn't
  state a hard cap, but structures its larger palette so that *neighbouring* colours stay
  distinguishable, and explicitly recommends narrowing to fewer colours when the use case allows
  it. — [Carbon data-viz color palettes, official](https://carbondesignsystem.com/data-visualization/color-palettes/)
- Jon Schwabish's analysis of "why six is common" surveys the research directly: Miller's classic
  "magic number 7" (working memory holds roughly 5–7 objects) is the most commonly cited
  explanation; Maureen Stone (a named, credentialed colour researcher) suggested **5 to 7**
  distinct/memorable colours as a practical range; colours that visually "pop out" immediately may
  be limited to around **9**; Tseng et al.'s study found scatterplots get harder to read starting
  around **6** categories, but viewers could still judge group means accurately with up to about
  **10**; Tamara Munzner (a named visualization researcher) suggests **6 to 12** as a rule of
  thumb, while noting that text, gridlines, and background colours effectively eat into that
  budget. — [jschwabish Substack](https://jschwabish.substack.com/p/why-are-six-colors-common-in-color)
- The same analysis explicitly cautions that the oft-repeated "6 to 8 colours" ceiling (cited by
  "The Node" and a 2010 Nature piece) is "based on experience rather than hard rules," and that
  Adobe's own 6/12 claim carries no citation. — [jschwabish Substack](https://jschwabish.substack.com/p/why-are-six-colors-common-in-color)
- Stacey Barr's independent, named rule of thumb: **3 to 5** colours total, including black and
  grey, for a performance dashboard. — [Stacey Barr](https://www.staceybarr.com/?p=5010)
- FusionCharts' (secondary, unnamed-author) guidance: no more than **3** colours before a dashboard
  starts to "look lit like the Christmas tree." — [FusionCharts blog, via summary](https://www.fusioncharts.com/blog/wp-json/wp/v2/posts/16628)
- Datawrapper's practical advice is not a fixed number but a threshold test: charts with roughly
  **12–15** categories are specifically called out as the "confetti party" failure case, and for
  *secondary* visual encodings beyond colour (shapes, patterns, dashes) it recommends capping at
  **3 to 4**. — [Datawrapper](https://www.datawrapper.de/blog/10-ways-to-use-fewer-colors-in-your-data-visualizations)

### Inferences
- For a dashboard screen meant to be scanned quickly (the objective's "Payments / Tickets /
  Installations / Meters / Demos" use case — five domains), five sits comfortably inside every
  credible numeric range found (3–5 per Barr/FusionCharts, 5–7 per Miller/Stone, 6 per
  Spectrum/Carbon's "fewer is better" guidance) and would only start to strain comprehension if a
  sixth or seventh domain were added later without redesigning the scheme.
  - Concretely for that exact example: assign each of the five domains (Payments, Support tickets,
    Installations, Meters/hardware alerts, Demos/pilots) one fixed hue, keep that hue identical
    everywhere it appears (card header, icon tint, row accent, badge) so meaning never drifts
    across the screen (directly satisfying Few's consistency rule above), and reserve a sixth,
    neutral/gray treatment for "no domain"/system-wide rows rather than inventing a sixth hue.
- The genuinely well-cited, named-researcher consensus (Stone's 5–7, Miller's ~7, Munzner's 6–12)
  places the safe ceiling for *quick, confident* recognition at the low end of that band — around
  5 to 7 — rather than at Carbon's full 14-colour sequence, which is designed for exhaustive data
  visualization (charts with many series) rather than for a glanceable operational dashboard.

### Gaps
- No source gave a number specific to *dashboards with repeated colour across cards, icons, badges,
  and table rows simultaneously* (as opposed to a single chart's categorical legend) — the research
  base here is almost entirely from data-visualization/charting contexts, not from card-based
  SaaS-dashboard information architecture specifically. The inference above (extending chart-legend
  colour-count research to a multi-surface dashboard) is reasonable but not directly evidenced.
- No source stated a number specific to Stripe, Linear, Vercel, Notion, or any of the other named
  premium products' own dashboards; the "how many colours" guidance above comes entirely from
  data-visualization design systems (Spectrum, Carbon) and independent dashboard-design critics
  (Few, Barr, Datawrapper), not from the specific companies the objective named.
