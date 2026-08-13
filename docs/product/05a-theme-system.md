# Theme & Visual System
**Product:** FirsThing Platform · **Phase:** 5 — Screens (theme gate) · **Status:** Approved — DIR-02 Console, built out and accessibility-verified
**Last updated:** 2026-08-13 · **Mode:** Ecosystem

> **2026-08-13 — a third theme.** Light · **Slate** · Dark, with **Light the default** on every
> surface regardless of the OS preference. Slate darkens only the navigation shell and leaves the
> working surface on the light palette. See §3.1 (the chrome/content token split it required) and
> §3.2b (the theme itself, measured).

> Companion to `05-screens/README.md`. That file's §0 gate is now **open** — the system below is settled,
> so the per-screen loop can run research, mockup, verification and blueprint, not just
> specification.
>
> **Numbering:** the method content for this document is the skill's
> `references/phase-06-branding.md`. See `05-screens/README.md`'s header note and `00-intake.md` §11.

---

## 1. Brand direction

Settled with the user on 2026-08-12, before any pixels.

**Character — warm professional.**

| | |
|---|---|
| **Is** | Credible · warm · unfussy |
| **Is not** | Clinical · flashy · corporate |
| **References** | Linear (calm density — a lot of information without noise) · Stripe Dashboard (financial credibility; someone is being billed money here and must believe the number) |
| **Anti-references** | Generic SaaS-purple dashboards · consumer-fintech playfulness · enterprise-grey utility software |
| **Continuity** | Keeps the warm off-white ground and deep green already shipped in `src/app/globals.css`'s `firsthing` palette, rather than discarding the existing identity |

**Themes:** light **and** dark, both first-class, driven by **semantic tokens** (`--surface`,
`--border`, `--text-muted`, `--status-warning`) rather than the current system's 43 cryptic
literals (`--m1`, `--card3`, `--ac`). Chosen so a token's *meaning* survives a palette change and
so dark mode is a token remap, not a second stylesheet.

**Why this character, grounded in the product.** The two audiences pull in opposite directions and
the system has to serve both: an RWA committee reading a savings report needs to *trust* the
number (credibility, restraint, no marketing gloss), while a FirsThing ops person closing 40
societies' months in a 17-day window needs *density and speed* (scanning, status at a glance).
"Warm" is what keeps the first audience from feeling audited and the second from feeling like
they're in a billing terminal.

---

## 2. Directions explored

Three directions were rendered — not described — against the **same** screen and the **same**
data, per the method's rule that nobody can evaluate a hex code but anyone can evaluate a screen
fragment.

**Test screen:** SCR-090, per-circuit compliance for July 2026. Chosen deliberately as the hardest
real case in the product: four metered circuits where one has breached its tolerance band for a
second consecutive month (CON-01c) and flipped to `actual-metered` while its three siblings stay
fixed — so a single view has to carry a KPI strip, a dense table, mixed-basis fee lines, tabular
figures, and three states of status coding at once. A direction that cannot hold this screen
cannot hold the other 108.

**Rendered comparison:** https://claude.ai/code/artifact/3c1e047c-e42b-4dc7-b8a2-a903c9343f81
(light/dark switch applies to all three samples simultaneously, so they are judged like-for-like).

| | DIR-01 **Ledger** | DIR-02 **Console** | DIR-03 **Statement** |
|---|---|---|---|
| Idea | Surface-led | Elevation-led | Type-led |
| Grouping device | Hairline rules | Raised cards | Whitespace + type |
| Status coding | Tinted pill + dot | Tinted pill + dot, used liberally | Coloured label, no fill |
| Figures | Tabular sans | Monospaced | Large tabular sans |
| Radius | 5px | 9px | 0 |
| Light ground / surface | `#F2F1EB` / `#FFFFFF` | `#ECEFEC` / `#FFFFFF` | `#FBFAF6` / none |
| Dark ground / surface | `#141715` / `#1C201D` | `#0F1311` / `#171C19` | `#0D0F0D` / none |
| Primary (light / dark) | `#1B7A54` / `#3ECB84` | `#16624A` / `#45D18E` | `#14603F` / `#54CE92` |
| Signal accent | `#C7EF4F` lime | `#B8E23F` lime | none — status only |
| Strongest on | Billing, compliance, contracts | Ops home, triage, arrears, field | Savings report, portal, contract view |
| Weakest on | Deep hierarchy (survey flow) | Society-facing screens | Scan-for-problems screens |
| Reuses shipped palette | Substantially | Partly | Little |

**Common to all three, not up for selection:** colour is never the only carrier of status — every
state has a text label, and DIR-01/02 add a shape (dot) as well, so the coding survives
colour-vision deficiency and greyscale printing. This matters more than usual here because a
savings report is a document an RWA may print and circulate.

**Decision (2026-08-12, user's choice): DIR-02 Console.** Chosen over Ledger and Statement on
density and state-signalling — the back office is where the product is actually operated, and the
month-close window is the constraint the whole business runs against. Its known weakness
(society-facing screens) is addressed in §3.6 with a density modifier rather than a second theme.

---

## 3. The system

**Rendered reference:** https://claude.ai/code/artifact/62b6293c-592f-4a49-ac8d-e6892a7a5583 —
tokens, scales, every component in every state, the proof screen, and a live contrast table that
recomputes from the tokens as rendered in whichever theme is being viewed.

### 3.1 Token principle

Tokens are named for their **job**, not their value. `--field-border`, not `--m1`. Dark mode
redefines the token list and nothing else — no component ever names a literal colour, and no
colour is ever defined only inside a media query or `[data-theme]` block. This is the specific
failure mode the existing 43-literal system has (see §4), and it's what makes a screen author able
to pick the right token from the name alone.

Two line tokens exist deliberately: `--border` for decorative separators (exempt from WCAG 1.4.11)
and `--field-border` for anything bounding a **control**, which must clear 3:1. Collapsing them
into one token is what produces either invisible input fields or heavy-looking tables.

**Chrome is separable from content** (added 2026-08-13, user's call, and the reason a third theme
is possible at all). The navigation shell — sidebar, brand, nav items, nav counts, and on SUR-02
the phone's own header bar — reads a parallel `--chrome-*` set rather than `--surface`/`--text`.
In Light and Dark these resolve to exactly the surface values they replaced, so neither theme
changes by a pixel. What the split buys is the ability to darken the shell without touching the
working surface, which is precisely what Slate is.

### 3.2 Palette

```css
/* light — the base */
--ground:#ECEFEC; --surface:#FFFFFF; --surface-sunken:#F5F7F4; --surface-raised:#FFFFFF;
--surface-hover:#F3F5F2; --surface-active:#EAEEE9;
--border:#DDE2DC; --border-subtle:#E9EDE8; --field-border:#828B82;
--text:#151A17; --text-muted:#586058; --text-subtle:#636C63; --text-on-accent:#FFFFFF;
--accent:#16624A; --accent-hover:#0F4E3A; --accent-subtle:#E3F0E9; --accent-line:#BFDCCE;
--signal:#B8E23F; --signal-ink:#151A17;
--ok-bg:#DFF0E4;  --ok-fg:#12583E;  --ok-line:#BEDFC9;
--warn-bg:#FBEED4; --warn-fg:#7E5A08; --warn-line:#F0DCA9;
--bad-bg:#FBE4DE;  --bad-fg:#9E3F2C;  --bad-line:#F2C9BF;
--info-bg:#DEEAF4; --info-fg:#1F5477; --info-line:#BED6E8;
--neu-bg:#E8EBE7;  --neu-fg:#4C544C;  --neu-line:#D6DBD4;

/* dark — redefines the same list, nothing else */
--ground:#0F1311; --surface:#171C19; --surface-sunken:#131816; --surface-raised:#1E2420;
--surface-hover:#1C221E; --surface-active:#222925;
--border:#242B26; --border-subtle:#1D231F; --field-border:#68756D;
--text:#E8ECE7; --text-muted:#96A096; --text-subtle:#8A938A; --text-on-accent:#0B0F0C;
--accent:#45D18E; --accent-hover:#5EDDA0; --accent-subtle:#16281F; --accent-line:#20402F;
--ok-bg:#132A1F;  --ok-fg:#68DCA4;  --ok-line:#1E4030;
--warn-bg:#2B2214; --warn-fg:#DDB25C; --warn-line:#45351C;
--bad-bg:#2E1B16;  --bad-fg:#E59683;  --bad-line:#482A22;
--info-bg:#16232E; --info-fg:#7FB6DC; --info-line:#24384A;
--neu-bg:#1C221E;  --neu-fg:#9AA39A;  --neu-line:#2A312C;
```

**Chrome tokens**, defined per theme alongside the list above. In Light and Dark they duplicate the
surface values they replaced; only Slate diverges.

```css
/* light */
--chrome:#FFFFFF; --chrome-hover:#F3F5F2; --chrome-active:#E3F0E9; --chrome-border:#DDE2DC;
--chrome-text:#151A17; --chrome-muted:#586058; --chrome-subtle:#636C63;
--chrome-accent:#16624A; --chrome-accent-ink:#FFFFFF;

/* dark */
--chrome:#171C19; --chrome-hover:#1C221E; --chrome-active:#16281F; --chrome-border:#242B26;
--chrome-text:#E8ECE7; --chrome-muted:#96A096; --chrome-subtle:#8A938A;
--chrome-accent:#45D18E; --chrome-accent-ink:#0B0F0C;

/* slate — the only tokens Slate defines. Content is the light palette, untouched. */
--chrome:#26322D; --chrome-hover:#2F3C36; --chrome-active:#38473F; --chrome-border:#38473F;
--chrome-text:#ECF1EB; --chrome-muted:#AEBAB1; --chrome-subtle:#9DAAA0;
--chrome-accent:#C6E85E; --chrome-accent-ink:#151A17;
```

Three values changed from the DIR-02 sample after measurement, all real failures caught by
computing rather than eyeballing.

`--field-border` was introduced as a separate, much darker token (`#828B82` light / `#68756D`
dark) because the sample's `--border` at ~1.3:1 is fine for a table rule and nowhere near enough
for an input boundary.

`--text-subtle` was corrected **twice**, and the second correction is the one that matters. It
first went `#858E85` → `#7C857C` against a **3:1** floor — which was the wrong floor. 3:1 is the
large-text and non-text threshold; every consumer of this token is small text (`.lbl` 11px,
caption 11.5px, table `th` 10.5px, nav group label 10px), so it owes **4.5:1**, and `#7C857C`
cleared none of its four light backgrounds (3.82 / 3.54 / 3.29 / 3.17). Dark `#6B746B` failed the
same way (3.56 / 3.71 / 3.87 / 3.34). Corrected to **`#636C63` light / `#8A938A` dark**, solved as
the *lightest* light value and *darkest* dark value that clear 4.5:1 on every surface the token
can land on — including `--surface-raised` and `--surface-active`, which a first pass missed and
a rendered audit caught. Picking the extreme rather than a comfortable value is deliberate: it
preserves the three-step hierarchy `--text` → `--text-muted` → `--text-subtle`, which a simple
"make it darker" fix inverts. Worst case is now 4.53:1 light and 4.69:1 dark, against
`--text-muted`'s 5.41 / 5.50. `--chrome-subtle` carries the same values in Light and Dark; Slate's
own `#9DAAA0` on `#26322D` already cleared at 5.51:1 and is unchanged.

The lesson generalises: **record the floor a token was verified against, not just that it was
verified.** The first check was arithmetically correct and still shipped failing text, because
the threshold was wrong for the type sizes involved.

**The lime is a fill, never a text or line colour**, and appears at most once per screen — it
marks verified saving, the one number a society cares about.

### 3.2b Three themes, Light by default

Decided 2026-08-13 on the user's instruction, against a reference screenshot of the shipped
admin app. Three themes ship, and **Light is the default regardless of the operating system's
preference** — a system-dark machine still opens on Light, and the switch is explicit.

| Theme | Chrome | Content | Where it is used |
|---|---|---|---|
| **Light** | white | light | Default everywhere, all surfaces |
| **Slate** | dark slate `#26322D` | **light, unchanged** | SUR-01 back office and the SUR-02 phone header. The working surface is byte-identical to Light |
| **Dark** | dark | dark | All surfaces. Remains the SUR-02 default between 18:00 and 06:00 device time (§0.8 of `05-screens/05-field.md`) |

**Slate is not a half-measure between the other two, and that is the point.** It changes exactly
one thing: the navigation shell darkens and everything a person actually reads or edits stays on
the light palette. A card, a table, a chart and a status chip render identically in Light and in
Slate, which means Slate costs nothing to support — there is no third set of content values to
maintain, no third contrast audit for semantic colour, and no screen that can look right in Light
and wrong in Slate. It is a preference about the chrome, expressed as a preference about the
chrome.

Slate reuses the lime as its chrome accent, lifted to `#C6E85E` so it clears 4.5:1 on the active
nav pill. This is the one place the lime is allowed to be a text colour rather than a fill (§3.2's
rule), because on a dark shell it is the only accent that reads, and the "once per screen" limit
is about the *content* area where the lime marks verified saving — the nav is not competing with
that.

**Measured on `#26322D`**, not asserted:

| Pair | Ratio | Floor | |
|---|---|---|---|
| `--chrome-text` — brand, 13.5px | 11.64:1 | 4.5 | pass |
| `--chrome-muted` — nav item, 12.5px | 6.63:1 | 4.5 | pass |
| `--chrome-subtle` — nav group label, 10px | 5.51:1 | 4.5 | pass |
| `--chrome-accent` on `--chrome-active` — active nav | 7.05:1 | 4.5 | pass |
| `--chrome-muted` on `--chrome-hover` | 5.74:1 | 4.5 | pass |

`--chrome-border` and `--chrome-active` sit at 1.36:1 against the shell and are **exempt** under
the same rule that exempts `--border` (§3.1): both are decorative surfaces, and the active nav
state is carried by colour *and* weight *and* the lime, never by the pill alone. The first
candidate palette failed here — `--chrome-subtle` at `#8A968C` measured 4.33:1 on every shell
colour tried, which is exactly the kind of near-miss that survives eyeballing.

**The one honest limitation:** on SUR-02 the only chrome is the phone's header bar, so Slate is a
much smaller change there than on the back office. It is not a no-op — the header darkens — but a
field worker choosing Slate should not expect the transformation they would see on a desk.


### 3.3 Type

System faces in two roles. No webfont: the artifact CSP blocks font CDNs, self-hosting costs a
render-blocking download on a tool opened forty times a day, and the native stack gives real
optical sizing on every platform in scope.

| Role | Stack | Used for |
|---|---|---|
| UI | `ui-sans-serif, -apple-system, "Segoe UI", Roboto, …` | all language |
| Data | `ui-monospace, SFMono-Regular, Menlo, …` | every figure a person compares down a column |

Scale: display 28/1.15/−.02 · h1 22/1.2/−.018 · h2 18/1.25/−.014 · h3 15/1.35/−.008 ·
body 13.5/1.5 · small 12.5/1.45 · label 11/1.35 uppercase .07em 650 · data mono 13 tabular.

### 3.4 Space, shape, elevation, motion

- **Space** — 4px base, steps 4/8/12/16/24/32/48 only.
- **Radius** — `--r-sm` 5 (fields, small controls) · `--r-md` 9 (cards, buttons — the direction's
  signature) · `--r-lg` 12 (modals, app frame) · `--r-pill`.
- **Elevation** — `e1` cards · `e2` popovers and toasts · `e3` modals. Elevation is what makes this
  Console rather than Ledger, so it is spent on layers and never on decoration.
- **Motion** — one easing, `cubic-bezier(.2,0,0,1)`; 120ms hover, 180ms tab/toggle/dropdown, 260ms
  modal/drawer. **Nothing animates on data arrival** — a number that slides into place is a number
  someone will misread. All disabled under `prefers-reduced-motion`.

### 3.5 Icons

`lucide-react`, already a dependency of this codebase (confirmed in `PROJECT_CONTEXT.md`) — no
second icon library. 16px in dense tables and nav, 18px in headers, 1.75 stroke rather than the
default 2 so a forty-row table doesn't read as noise. An icon never appears without a text label
except in a control carrying an `aria-label`.

### 3.6 Density: Console and Portal

DIR-02's honest weakness is that a raised, chip-dense console is the wrong register for an RWA
committee. That is a **density and restraint** problem, not a palette problem, so it is solved with
a modifier rather than a second theme. `.roomy` overrides four variables — row height 36→48px,
body 13.5→15px, padding 9/12→14/16, and figures drop from mono back to tabular sans. Same tokens,
same components, different posture. It also carries the SUR-02 field surface, where the 48px row
plus 14px padding is what clears the 44×44 touch target.

The copy shifts with the density too: "Out of band" is ops language, "Being reviewed" is what the
society needs. Same tone token, different words.

### 3.7 Components covered

Buttons (primary/secondary/ghost/danger × default/hover/focus/disabled/loading) · text fields
(default/focus/error/read-only/disabled) with label, hint and error · checkbox · toggle · status
chip in five tones · notification count · banners in four tones · table (sticky head, hover,
selected row, risk accent, footer total) · card and KPI tile · tabs · breadcrumb · bulk-action bar
· filter chips · pagination · modal · toast · empty state · loading skeleton · file dropzone
(idle/over) · meter bar · sidebar nav with counts.

### 3.8 Proof: SCR-082

Proved on **SCR-082, month-close readiness** (Flow 09, FEAT-047 + FEAT-100, priority 1) —
deliberately the densest screen in the product: forty societies, a seventeen-day window, one
question of which can be billed today. Three things only surfaced under that load and are now part
of the system:

1. A status chip alone cannot answer "which rows are stopping me closing" across forty rows. A 3px
   **row-level risk accent** carries that; the chip became the detail rather than the signal.
2. Absent figures render as a right-aligned em-dash in `--text-subtle`, **never `0`** — a zero in a
   savings column is a claim, not a gap.
3. The table footer carries a real portfolio total, because the number an ops lead is accountable
   for is the portfolio one, not any row.

### 3.9 Accessibility — verified, not asserted

Every ratio computed from the tokens (script and full output in the session record; the rendered
reference recomputes them live in-page). Ratios are additionally re-measured **as rendered** —
walking every element of every mockup screen in all three themes, resolving each one's actual
background through its ancestors and applying the size rule per element — because a token that
passes on paper can still land on a surface nobody checked it against. That audit is what caught
the `--text-subtle` failure recorded in §3.2, and the row below is its corrected result.

| Check | Requirement | Result |
|---|---|---|
| Body text on all surfaces | 4.5:1 | 14.45–17.62:1 ✅ |
| Secondary text on all surfaces | 4.5:1 | 5.61–6.92:1 ✅ |
| Subtle text — labels, captions, `th` | 4.5:1 | 4.53–5.90:1 ✅ |
| Control borders on all surfaces | 3:1 | 3.04–3.88:1 ✅ |
| Focus ring vs control and ground | 3:1 | 6.29–9.60:1 ✅ |
| Text on accent, default and hover | 4.5:1 | 7.29–11.33:1 ✅ |
| Status chip fg on own bg (all five) | 4.5:1 | 5.39–8.97:1 ✅ |
| Ink on signal lime | 4.5:1 | 11.74:1 ✅ |
| Colour never the sole signal | — | label + shape (dot/triangle/square) on every tone; rows add a left accent ✅ |
| Touch targets on SUR-02 | 44×44 | `.roomy` 48px row + 14px padding ✅ |
| Focus visibility | every interactive element | one global `:focus-visible`, 2px accent, 2px offset ✅ |
| Reduced motion | honour OS setting | all transitions and animations disabled ✅ |

`--border` at ~1.3:1 is **not** a failure — WCAG 1.4.11 exempts decorative separators. That
exemption is exactly why the token set splits `--border` from `--field-border`; anything bounding a
control uses the latter.

### 3.10 Charts (added 2026-08-12, when SCR-081 and SCR-110 reached for it)

Added to the system rather than invented per screen, per the method's rule that a screen never
builds what the system lacks. Two parts.

**Semantic roles** — reuse the status tones only where the meaning genuinely *is* that status:

| Token | Job |
|---|---|
| `--chart-ref` | Benchmark / target line. Dashed, neutral ink — a reference is authoritative, not a series. |
| `--chart-band` / `--chart-band-edge` | Tolerance band fill and edge. |
| `--chart-excluded` | Hatch for excluded or missing periods. |
| `--chart-grid` | Gridlines — decorative, exempt from 3:1. |
| `--chart-axis` | Tick labels. |
| `--bad-fg` | Out-of-band points — a breach *is* the danger state, so it reuses the tone. |

**Series palette** — six categorical hues for comparing circuits, chosen to avoid the accent green
and the danger red so a series is never mistaken for a status:

```css
/* light */ --chart-s1:#17558F; --chart-s2:#A9670C; --chart-s3:#7B5EA7;
            --chart-s4:#2E8B8B; --chart-s5:#C4587C; --chart-s6:#7E8F42;
            --chart-grid:#E9EDE8; --chart-axis:#636C63; --chart-ref:#151A17;
            --chart-band:rgba(22,98,74,.10); --chart-band-edge:#BFDCCE; --chart-excluded:#636C63;
/* dark  */ --chart-s1:#6BB6E8; --chart-s2:#E8A94A; --chart-s3:#B49AE0;
            --chart-s4:#5CC5C5; --chart-s5:#E58AA8; --chart-s6:#A8BC6E;
            --chart-grid:#1D231F; --chart-axis:#8A938A; --chart-ref:#E8ECE7;
            --chart-band:rgba(69,209,142,.13); --chart-band-edge:#20402F; --chart-excluded:#8A938A;
```

All six clear 3:1 against both grounds in both themes (measured: light 3.07–7.69, dark 7.01–9.14).
An earlier `--chart-s2` at `#C77A11` failed at 2.91 on the light ground and was darkened.

**Rules, because the palette alone is not sufficient:**

- **Colour never distinguishes a series on its own.** At six categories the hues cannot also be
  separated by luminance — `s4` and `s5` sit 0.007 apart and are indistinguishable in greyscale. So
  every series carries a **dash pattern** and a **direct label at the line's end**; the legend is a
  convenience, never the only key. A savings report gets printed and handed round a committee.
- **Excluded days are hatched and gapped, never zero and never interpolated** — the line breaks.
  A direct rendering of FLOW-09 step 7.
- **Six series maximum**, then a labelled "other". A society has at most five typed circuits
  (CON-16), so six is a real ceiling.
- **No pie charts** (every quantity here is a comparison or a time series), **no dual axes**,
  y-axis from zero for consumption; a deviation chart may crop and says so on the axis.
- **Every chart has a text equivalent** — a full `aria-label` describing shape and finding, and the
  same facts available as figures on the same screen. The chart is the fast path, never the only one.

The reference renders the SCR-110 deviation chart in full: raw daily readings against a benchmark
line and ±10% band, three excluded days hatched, out-of-band days marked.

### 3.11 Not yet covered

- **The savings-report PDF** — print, not screen; needs its own paper treatment.
- **CAP-22 email templates** — a far harsher CSS ceiling than anything here.

Neither blocks the priority-1 screen run.

---

## 4. Relationship to the existing codebase

The app today ships a 5-theme system (`firsthing`, `slideegg`, `slideteam`, `grafana`, `windora`)
in `src/app/globals.css`, 43 custom properties each, applied across the shell primitives and all
7 admin screens (see `PROJECT_CONTEXT.md`). Two facts about it shaped the direction work:

1. **The token names carry no meaning** (`--m1`, `--card3`, `--ac`, `--lime`), so a screen author
   cannot tell from the code which token is correct for a given job, and dark variants were
   authored per-theme rather than derived.
2. **Five themes is a maintenance surface with no product requirement behind it** — nothing in
   Phases 0–4 asks for user-selectable skins. `00-intake.md` §11 already accepted that this
   exploration may invalidate parts of the existing reskin.

Neither is a reason to discard the *identity* — the warm ground and deep green are kept in all
three directions. The migration cost is a real input to the §2 decision, which is why "reuses
shipped palette" is a row in the comparison rather than a footnote.
