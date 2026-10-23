# Concrete, Sourced Categorical Tag/Label Palettes

## Key Question 1: GitHub's own default label colours and Primer's Label component tokens

### Takeaway
GitHub's own documentation lists the **names** of its ~10 default labels but never publishes fixed hex values for them, and GitHub's own official OpenAPI spec shows *inconsistent* example hex values for the same label across different example repos — there is no single canonical "GitHub default label colour" table to borrow. However, GitHub's own **Primer** design system (the real, open-source, shipped code behind GitHub's current Label UI) does publish a genuine, concrete, dual-theme categorical palette: 19 named hues, each with a background step and a foreground step resolved separately for light and dark mode, and **no border at all** (labels rely on bg/fg contrast only). This is the single best "real, shipped, tested" categorical tag palette found in this research, with full verified hex values below.

### Cited Findings
- GitHub's own docs page lists the default labels created in every new repository as: `accessibility`, `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix` — with **no colour column at all** — [GitHub Docs: Managing labels (raw source)](https://raw.githubusercontent.com/github/docs/main/content/issues/using-labels-and-milestones-to-track-work/managing-labels.md)
- A live, unmodified query of `github/docs`' own repository (via `GET /repos/github/docs/labels`) shows these *current, real* colours for some of the same default-named labels: `accessibility` = `#033d8b`, `bug` = `#fa4549`, `duplicate` = `#d0d7de`, `good first issue` = `#6fdd8b`, `help wanted` = `#80407e`, `invalid` = `#cf222e`, `wontfix` = `#ffffff` — [GitHub REST API, `api.github.com/repos/github/docs/labels`](https://api.github.com/repos/github/docs/labels)
- GitHub's own official, machine-readable REST API description (`github/rest-api-description`, the canonical OpenAPI spec GitHub itself maintains) contains **multiple, mutually inconsistent** example values for the same default label name: `bug` appears as `#f29513` in one canonical example (`octocat/Hello-World`), as `#ee0701` in another example (`octocat/linguist`), and as `#c5def5` in the live, currently-stored data on `octocat/Hello-World`; `enhancement` appears as `#a2eeef` in one example and `#84b6eb` in another — [`github/rest-api-description` OpenAPI spec](https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json); confirmed live via [`api.github.com/repos/octocat/Hello-World/labels`](https://api.github.com/repos/octocat/Hello-World/labels)
- GitHub's **Primer** product-site documentation for the Label component lists these colour variants: `default`, `primary`, `secondary`, `accent`, `success`, `attention`, `severe`, `danger`, `done`, `sponsors` — but the product docs page itself gives no hex/token values — [primer.style/product/components/label](https://primer.style/product/components/label)
- The actual Primer **primitives** source code (`primer/primitives`, GitHub's real, open-source design-token repo that compiles into Primer's shipped CSS variables) defines Label component tokens for **19 named hues** — `green`, `red`, `blue`, `purple`, `orange`, `pink`, `yellow`, `teal`, `indigo`, `lime`, `coral`, `brown`, `gray`, `cyan`, `olive`, `plum`, `auburn`, `lemon`, `pine` — each with a `bgColor` (rest/hover/active, using base-scale steps `0`/`1`/`2`), an `fgColor` (rest/hover/active, using steps `6`/`7`/`8`), and a `borderColor` that is hard-set to `{base.color.transparent}` for every hue in both light and dark — [`primer/primitives` — `src/tokens/component/label.json5`](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/component/label.json5)
- The same token reference (e.g. `{base.display.color.green.0}`) is used for both the light and dark theme — the *base* colour scale itself is theme-resolved into different concrete hex values per theme file, not the component token — [`src/tokens/base/color/light/display-light.json5`](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/color/light/display-light.json5) and [`src/tokens/base/color/dark/display-dark.json5`](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/color/dark/display-dark.json5)

**Resolved, concrete Primer Label hex values** (background = step 0, foreground/text = step 6, border = transparent in all cases), fetched and resolved directly from the two files above:

| Hue | Light bg (step 0) | Light fg (step 6) | Dark bg (step 0) | Dark fg (step 6) |
|---|---|---|---|---|
| green | `#caf7ca` | `#2b6e3f` | `#122117` | `#41b445` |
| red | `#ffe2e0` | `#c50d28` | `#3c0614` | `#f27d83` |
| blue | `#d1f0ff` | `#005fcc` | `#001a47` | `#4da0ff` |
| purple | `#f1e5ff` | `#783ae4` | `#211047` | `#b687f7` |
| orange | `#ffe7d1` | `#a24610` | `#311708` | `#ed8326` |
| pink | `#ffe5f1` | `#b12f79` | `#2d1524` | `#e57bb2` |
| yellow | `#ffec9e` | `#805900` | `#2e1a00` | `#d3910d` |
| teal | `#c7f5ef` | `#106e75` | `#041f25` | `#1cb0ab` |
| indigo | `#e5e9ff` | `#494edf` | `#1b183f` | `#9899ec` |
| lime | `#e3f2b5` | `#476c28` | `#141f0f` | `#7dae37` |
| coral | `#ffe5db` | `#ba2e12` | `#351008` | `#f7794b` |
| brown | `#eeeae2` | `#755f43` | `#241c14` | `#b69a6d` |
| gray | `#e8ecf2` | `#5c6570` | `#1c1c1c` | `#92a1b5` |
| cyan | `#bdf4ff` | `#006a80` | `#001f29` | `#07ace4` |
| olive | `#f0f0ad` | `#56682c` | `#171e0b` | `#a2a626` |
| plum | `#f8e5ff` | `#961edc` | `#2a0e3f` | `#d07ef7` |
| auburn | `#f2e9e9` | `#8a5551` | `#271817` | `#bf9592` |
| lemon | `#f7eea1` | `#786002` | `#291d00` | `#ba9b12` |
| pine | `#bff8db` | `#156f4b` | `#082119` | `#1bb673` |

Source: directly fetched and parsed from `primer/primitives` on 2026-10-23 — [component token file](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/component/label.json5), [light base scale](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/color/light/display-light.json5), [dark base scale](https://raw.githubusercontent.com/primer/primitives/main/src/tokens/base/color/dark/display-dark.json5).

### Inferences
- Primer's design explicitly chooses **no border** for its label/tag chips — contrast is carried entirely by the bg/fg pair, which simplifies the "triple" the brief asked for down to a pair (a developer wanting a border can simply add a subtle neutral one, or omit it per Primer's own precedent).
- A genuinely well-separated, dual-theme-ready 5-6 colour subset for "Payments / Meters / Installations / Complaints / Demos" could be lifted directly from this table — e.g. `blue`, `green`/`pine`, `orange`/`coral`, `red`/`pink`, `purple`/`plum` — since these are already verified legible pairs in both themes, shipped in GitHub's own production UI.
- GitHub's *repo-level issue label* defaults are not a reliable "design system" reference at all — they're just starting suggestions a maintainer is expected to edit, and GitHub's own official examples don't even agree with each other. Primer's Label component (not the repo-label feature) is the real, intentional categorical palette to borrow from.

### Gaps
- Could not verify a single, universally-cited, GitHub-documented "the 10/15 default label hex codes" table — no such official, internally-consistent table appears to exist; third-party blog posts repeating specific hex codes (e.g. `d73a4a`/`a2eeef`/`7057ff`) could not be traced back to an authoritative GitHub source and are not reported as fact here.

---

## Key Question 2: Does Tailwind's own documentation (or Tailwind-built component libraries) recommend specific colour families/shades for badges/tags/status pills?

### Takeaway
Tailwind CSS's own official documentation gives **no explicit guidance whatsoever** for badges, tags, pills, or status UI — it never uses those words on its colour-reference page and shows no colour-family recommendation for labeling. shadcn/ui's official Badge docs likewise ship only semantic/structural variants (`default`, `secondary`, `destructive`, `outline`), not a categorical hue palette. The closest real, concrete, dual-theme, sourced badge palette built on Tailwind is **Tremor**'s open-source Badge component, which does publish exact Tailwind utility classes per colour, per theme — reported in full below, with the caveat that Tremor's 5 variants are semantic (default/neutral/success/error/warning), not purely categorical tags.

### Cited Findings
- Tailwind's official colour documentation page (`tailwindcss.com/docs/colors`) gives no guidance on colours for badges, tags, pills, or status elements; the closest thing is an incidental decorative icon-chip example using `bg-pink-100`/`border-pink-300`/`stroke-pink-700` (light) and `dark:bg-pink-400/10`/`dark:border-pink-300/10`/`dark:stroke-pink-500` (dark) in a notification-card example — not presented as a labeling pattern — [tailwindcss.com/docs/colors](https://tailwindcss.com/docs/colors)
- shadcn/ui's official Badge component documentation lists only `default`, `secondary`, `destructive`, and `outline` as its variant prop values — no colour-named categorical variants ship by default; the docs note you can add custom background/dark-mode classes yourself, but give no recommended palette — [ui.shadcn.com/docs/components/badge](https://ui.shadcn.com/docs/components/badge)
- **Tremor** (an open-source React + Tailwind UI library) ships a Badge component with five documented variants, each with explicit light-mode and dark-mode Tailwind utility classes for background, text, and ring (border):

  | Variant (hue) | Light bg | Light text | Light ring | Dark bg | Dark text | Dark ring |
  |---|---|---|---|---|---|---|
  | default (blue) | `bg-blue-50` | `text-blue-900` | `ring-blue-500/30` | `dark:bg-blue-400/10` | `dark:text-blue-400` | `dark:ring-blue-400/30` |
  | neutral (gray) | `bg-gray-50` | `text-gray-900` | `ring-gray-500/30` | `dark:bg-gray-400/10` | `dark:text-gray-400` | `dark:ring-gray-400/20` |
  | success (emerald) | `bg-emerald-50` | `text-emerald-900` | `ring-emerald-600/30` | `dark:bg-emerald-400/10` | `dark:text-emerald-400` | `dark:ring-emerald-400/20` |
  | error (red) | `bg-red-50` | `text-red-900` | `ring-red-600/20` | `dark:bg-red-400/10` | `dark:text-red-400` | `dark:ring-red-400/20` |
  | warning (yellow) | `bg-yellow-50` | `text-yellow-900` | `ring-yellow-600/30` | `dark:bg-yellow-400/10` | `dark:text-yellow-500` | `dark:ring-yellow-400/20` |

  — [tremor.so/docs/ui/badge](https://tremor.so/docs/ui/badge)
- A widely repeated *community* convention (tutorials/third-party component files, not an official Tailwind recommendation) pairs a light tint background with a darker text shade from the same family for a pill badge — e.g. `bg-blue-100 text-blue-800`, stepping in dark mode to `dark:bg-blue-900 dark:text-blue-200` — this is a recognisable pattern across many Tailwind tutorials, but it is explicitly **not** sourced to Tailwind's own docs — [tailkits.com component examples](https://tailkits.com/components/categories/badge/)

### Inferences
- Tremor's step choice is informative even though its variants are semantic rather than categorical: it uses the `-50`/`-900` pair in light mode and the translucent `-400/10` + `-400` text pair in dark mode — a reusable *shade-pairing formula* (very light tinted bg + very dark saturated text in light mode; low-opacity bg + mid-brightness text in dark mode) that a developer could apply to any 5-6 Tailwind hue families chosen for category labels (not just semantic ones).
- Since Tailwind itself stays silent on this, a developer is free to pick any well-separated hue family (e.g. `blue`, `violet`, `amber`, `rose`, `teal`) and apply the Tremor-style light/dark shade formula above — there is no "wrong" Tailwind-sanctioned family to avoid.

### Gaps
- Could not find an official Tailwind UI (the paid, first-party component library) badge/pill example to compare — that site was not checked via a working fetch in this pass and may contain Tailwind's own closest-to-official recommendation; flagged as unverified rather than guessed.

---

## Key Question 3: Radix Colors' recommended steps for coloured UI elements, and its full list of named hues

### Takeaway
Radix Colors' own documentation gives an explicit, numbered recommendation for exactly this "coloured UI element" (badge/tag/pill) use case: **step 3** for the resting background, **step 6** (non-interactive) or **step 7** (interactive) for the border, and **step 11** (low-contrast) or **step 12** (high-contrast) for text — each step already computed per-hue for both light and dark themes, with a documented APCA contrast guarantee. Radix ships 34 named scales total (6 greys + 28 hues), of which this research resolved concrete, verified hex values for a well-separated 10-hue subset across both themes, listed in full below.

### Cited Findings
- Radix's "Understanding the scale" doc states the step-by-step intended use: steps 1–2 = app/subtle backgrounds; **step 3 = "UI element background" for normal states**; step 4 = hovered UI element background; step 5 = active/selected UI element background; **step 6 = "subtle borders on components which are not interactive"**; **step 7 = "UI element border and focus rings"** on interactive components; step 8 = hovered UI element border/stronger focus rings; steps 9–10 = solid backgrounds (step 9 resting, step 10 hover), most step-9 colours are designed for white foreground text on top; **step 11 = "designed for low-contrast text"**; **step 12 = "designed for high-contrast text"** — and steps 11/12 are documented as contrast-guaranteed (APCA Lc 60 and Lc 90 respectively) against a step-2 background from the same scale — [radix-ui.com/colors/docs/palette-composition/understanding-the-scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
- Radix Colors' own colour listing page enumerates **34 total named scales**: 6 grey scales — `Gray`, `Mauve`, `Slate`, `Sage`, `Olive`, `Sand` — and 28 colour scales — `Tomato`, `Red`, `Ruby`, `Crimson`, `Pink`, `Plum`, `Purple`, `Violet`, `Iris`, `Indigo`, `Blue`, `Cyan`, `Teal`, `Jade`, `Green`, `Grass`, `Bronze`, `Gold`, `Brown`, `Orange`, `Amber`, `Yellow`, `Lime`, `Mint`, `Sky` (plus `Black`/`White` as overlay scales, not counted as hues) — [radix-ui.com/colors](https://www.radix-ui.com/colors)
- The official `radix-ui/colors` GitHub repository's source files (`src/light.ts` for the light theme, `src/dark.ts` for the dark theme — each hue exported as a flat 12-step object, e.g. `export const blue = { blue1: "#fbfdff", ..., blue12: "#113264" }` for light and `export const blueDark = { blue1: "#0d1520", ..., blue12: "#c2e6ff" }` for dark) were fetched directly and resolved — [radix-ui/colors `src/light.ts`](https://raw.githubusercontent.com/radix-ui/colors/main/src/light.ts), [`src/dark.ts`](https://raw.githubusercontent.com/radix-ui/colors/main/src/dark.ts)

**Resolved, concrete Radix hex values** for the badge-relevant steps (bg = step 3, non-interactive border = step 6, interactive border = step 7, solid-bg alt = step 9, low-contrast text = step 11, high-contrast text = step 12), for a well-separated 10-hue subset, both themes:

| Hue | L3 (bg) | L6 (border) | L7 (border-interactive) | L9 (solid) | L11 (text) | L12 (text-strong) |
|---|---|---|---|---|---|---|
| blue | `#e6f4fe` | `#acd8fc` | `#8ec8f6` | `#0090ff` | `#0d74ce` | `#113264` |
| green | `#e6f6eb` | `#adddc0` | `#8eceaa` | `#30a46c` | `#218358` | `#193b2d` |
| amber | `#fff7c2` | `#f3d673` | `#e9c162` | `#ffc53d` | `#ab6400` | `#4f3422` |
| purple | `#f7edfe` | `#e0c4f4` | `#d1afec` | `#8e4ec6` | `#8145b5` | `#402060` |
| pink | `#fee9f5` | `#efbfdd` | `#e7acd0` | `#d6409f` | `#c2298a` | `#651249` |
| red | `#feebec` | `#fdbdbe` | `#f4a9aa` | `#e5484d` | `#ce2c31` | `#641723` |
| gray | `#f0f0f0` | `#d9d9d9` | `#cecece` | `#8d8d8d` | `#646464` | `#202020` |
| teal | `#e0f8f3` | `#a1ded2` | `#83cdc1` | `#12a594` | `#008573` | `#0d3d38` |
| orange | `#ffefd6` | `#ffc182` | `#f5ae73` | `#f76b15` | `#cc4e00` | `#582d1d` |
| indigo | `#edf2fe` | `#c1d0ff` | `#abbdf9` | `#3e63dd` | `#3a5bc7` | `#1f2d5c` |

| Hue | D3 (bg) | D6 (border) | D7 (border-interactive) | D9 (solid) | D11 (text) | D12 (text-strong) |
|---|---|---|---|---|---|---|
| blue | `#0d2847` | `#104d87` | `#205d9e` | `#0090ff` | `#70b8ff` | `#c2e6ff` |
| green | `#132d21` | `#20573e` | `#28684a` | `#30a46c` | `#3dd68c` | `#b1f1cb` |
| amber | `#302008` | `#5c3d05` | `#714f19` | `#ffc53d` | `#ffca16` | `#ffe7b3` |
| purple | `#301c3b` | `#54346b` | `#664282` | `#8e4ec6` | `#d19dff` | `#ecd9fa` |
| pink | `#37172f` | `#692955` | `#833869` | `#d6409f` | `#ff8dcc` | `#fdd1ea` |
| red | `#3b1219` | `#72232d` | `#8c333a` | `#e5484d` | `#ff9592` | `#ffd1d9` |
| gray | `#222222` | `#3a3a3a` | `#484848` | `#6e6e6e` | `#b4b4b4` | `#eeeeee` |
| teal | `#0d2d2a` | `#145750` | `#1c6961` | `#12a594` | `#0bd8b6` | `#adf0dd` |
| orange | `#331e0b` | `#66350c` | `#7e451d` | `#f76b15` | `#ffa057` | `#ffe0c2` |
| indigo | `#182449` | `#304384` | `#3a4f97` | `#3e63dd` | `#9eb1ff` | `#d6e1ff` |

Source: directly fetched and parsed from `radix-ui/colors` on 2026-10-23 — [light.ts](https://raw.githubusercontent.com/radix-ui/colors/main/src/light.ts), [dark.ts](https://raw.githubusercontent.com/radix-ui/colors/main/src/dark.ts).

### Inferences
- For a 5-category tagging need, `blue`, `green`, `amber`, `purple`/`pink`, and `orange`/`red` from this table are already Radix-documented, APCA-contrast-guaranteed, dual-theme pairs — this is a fully "borrow-ready" set with no additional accessibility verification needed, since Radix's own docs state the contrast guarantee explicitly (for text at step 11/12 against a step-2 background of the same scale).
- Radix's step-3/step-11 pairing is architecturally the same *shape* as Primer's step-0/step-6 pairing and Tremor's `-50`/`-900` (light) + `-400/10`/`-400` (dark) pairing — three independent, real systems converge on "very light tinted background + a notably darker/saturated foreground text colour from the same hue family," which is strong independent confirmation of the right formula shape for a badge, even though the exact numbers differ per system.

### Gaps
- None of Radix's own docs use the word "badge" or "tag" explicitly when describing step 3/6/7/11/12 — the step-role documentation is for "coloured UI elements" generically; the badge-specific mapping above is a direct, reasonable application of that documented role list, not a literal Radix example screenshot of a badge component. Flagged as inference, not verbatim Radix guidance.

---

## Key Question 4: Does Notion, Linear, or Height publish a verifiable list of named tag/label colours with hex values?

### Takeaway
**Notion's** developer API documents a fixed, named enum of exactly 10 colour values for `select`/`multi_select` properties, but publishes **no hex values at all** — only the names. **Linear's** API exposes `color` as a plain string field (set arbitrarily by whoever creates the label via Linear's own colour picker), not a documented fixed named enum with published hex — so there is no verifiable "Linear's official label palette" to report. **Height** could not be verified from any reachable primary source in this research pass.

### Cited Findings
- Notion's official API reference documents the `select` and `multi_select` property object's `color` field as one of exactly these 10 named values: `default`, `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red` — and the documentation gives **only these names, no hex or other numeric colour representation** — [developers.notion.com/reference/property-object](https://developers.notion.com/reference/property-object)
- Notion's API changelog separately documents a *different*, larger set of names for **block** colours (not select-property colours): `default`, `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`, plus a `_background` variant of each (e.g. `gray_background`) — [developers.notion.com/changelog/block-colors-are-now-supported-in-the-api](https://developers.notion.com/changelog/block-colors-are-now-supported-in-the-api.md)
- Linear's documented GraphQL schema exposes `color` on label-related types (`IssueLabel`, team labels, the `issueLabelCreate` mutation input) as a plain field holding an arbitrary colour string set by the label's creator — third-party integration code shows example values like `"#FF0000"` — there is no evidence of a fixed, Linear-documented named-colour enum analogous to Notion's; this was corroborated only through third-party API-consumer code and documentation excerpts, not Linear's own primary schema reference page directly — [Dedalus Labs Linear MCP server source](https://glama.ai/mcp/servers/@dedalus-labs/linear-mcp/blob/611557905eef866d94cb9140a7864378ab01dcf1/src/tools/labels.py)

### Inferences
- Notion's choice to document names only (never hex) strongly implies the actual rendered colour is an internal implementation detail Notion reserves the right to change — a developer cannot safely hard-code "Notion's green is `#xxxxxx`" from any official source; only the category name is a stable contract.
- Linear's model (free-form hex chosen via its own colour picker UI, not a fixed enum) means Linear is not a useful source for "here is Linear's official shipped palette" — it is architecturally more like "pick any hex you like" than a curated categorical system.

### Gaps
- Could not verify Linear's `color` field type or any documented named-colour enum directly against Linear's own official API reference pages (`developers.linear.app`) — the web search results returned only third-party aggregators, SDK wrappers, and MCP server code, never a primary Linear documentation page with the field's type/description rendered. This should be treated as **unverified** rather than confirmed.
- Could not find or verify any Height (height.app) developer documentation, API reference, or credible sourced design-system teardown describing specific named tag colours or hex values in this research pass — no reliable source was found, so this is reported as a genuine gap rather than a guess.
- Could not verify any specific hex values for Notion's rendered select-option colours (e.g. "Notion's `blue` select tag is `#xxxxxx`") from any primary Notion source — only third-party, unofficial colour-reference sites (e.g. `matthiasfrank.de/en/notion-colors`) surfaced in search, and this task's constraints require treating those as unverifiable rather than authoritative; none were fetched or reported as fact.

---

## Overall Recommendation Material (for the report writer)

Three real, independently-sourced systems were fully verified with concrete dual-theme hex, giving three directly comparable candidate palettes for 5 well-separated categorical labels:

- **Primer (GitHub)**: pick 5 of the 19 hues, e.g. `blue`, `green`, `orange`, `red`/`pink`, `purple` — ships with zero border, pure bg/fg contrast, already battle-tested in GitHub's production UI across both themes.
- **Radix Colors**: pick 5 of the 10 resolved hues (or any of the other 24 named scales not resolved here, using the same step-3/step-11/step-12 formula), with Radix's own documented APCA contrast guarantee behind the text step.
- **Tremor/Tailwind formula**: apply the `-50/-900` (light) + `-400/10 / -400` (dark) shade-pairing formula to any 5 chosen Tailwind hue families (Tailwind itself endorses no specific families, so the choice is free) — this is the only one of the three that is a literal Tailwind-class recipe rather than hex values, useful if the target codebase is already Tailwind-based.

All three independently converge on the same underlying formula shape: a very light/desaturated background paired with a markedly darker, more saturated foreground, re-balanced (lighter text, darker/more-opaque background) for dark mode — which is the pattern to replicate even when picking entirely different hue numbers than those listed above.
