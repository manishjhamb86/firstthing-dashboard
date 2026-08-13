# Mockup sources

The six published prototype decks are generated from these files. `python3 build_<name>.py` writes
`<name>.html` next to it — a single self-contained file, no build step, no dependencies beyond
Python 3.

| Deck | Source | Screens | Published |
|---|---|---|---|
| Monthly loop | `build_monthly.py` | 12 | https://claude.ai/code/artifact/cec984c8-6007-4411-996f-3dcd3280e604 |
| Deal loop | `build_deal.py` | 12 | https://claude.ai/code/artifact/fc9984e2-3b78-4959-87ba-ac326f3862c6 |
| Field surface | `build_field.py` | 12 | https://claude.ai/code/artifact/74300664-e56c-4ae3-80ee-8a7e85c4edb5 |
| Society portal | `build_portal.py` | 7 | https://claude.ai/code/artifact/881a2e1e-e4c9-4ec0-96a9-a55916074e8e |
| Portfolio & dispatch | `build_ops.py` | 6 | https://claude.ai/code/artifact/c6a8aadb-4df9-407e-872a-e5c624bfb133 |
| Sign in & offline | `build_cross.py` | 2 | https://claude.ai/code/artifact/a356917a-9d95-4ecb-baeb-85905a13a5d3 |

51 screens — the whole priority-1 set.

## Why these are in the repo

**`_tokens.css` is the Console design system as working code**, not an illustration of it. It is the
implementation `05a-theme-system.md` describes, and it is what the rebuilt `src/` should start
from — the three themes, the chrome/content token split, the accessibility-verified `--text-subtle`
values, `--tone-fg`, the component layer. Re-deriving it from prose would lose the parts that were
settled by measurement rather than by judgement.

`_base.py` holds the deck shell, the icon set and the theme toggle with its persistence logic. The
`build_*.py` files hold the screen content — which is the closest thing to a visual acceptance
criterion the screen specs have, since a spec describes a screen and these show it.

## Rules that were learnt the hard way

Each of these came from a defect that eyeballing did not catch. They are in `05a-theme-system.md`
in full; repeated here because this is where the code is.

- **A deliberately-sized `<svg>` must be sized in CSS, not on the element.** The global
  `svg { width: 1.05em }` default beats an SVG's own `width` / `height` presentation attributes, so
  a chart declaring `width="700"` collapses to text size. See `.chartw svg` in `build_ops.py`.
- **A table wider than its column goes to full width, by rule.** Clipped tables appeared in three
  separate decks, each time inside a `minmax(330px, 1fr)` grid track, each time cutting the column a
  reader most needs — a fee, a reason, an approver. If a table needs more than ~585px, it does not
  belong in a two-up row.
- **Subtle text on a tinted surface takes that tone's own foreground** via the inherited
  `--tone-fg`, not a per-instance colour. `--text-subtle` fails AA on the light `bad` and `info`
  tints (4.47:1, 4.46:1) — close enough to pass inspection and still fail.
- **No `@media (prefers-color-scheme)` anywhere**, deliberately. A signed-in user's theme must not
  change by itself; the absence of that block is what guarantees it, rather than a rule someone has
  to remember.

## Verifying a change

The harness that checked these lives in the session scratchpad, not here, but it is three short
Playwright scripts and worth rebuilding if these are edited: render at 1440 / 1024 / 420 and assert
no sideways scroll and no clipped panel; walk every text node against its computed background for
WCAG AA in all three themes; and measure each table's natural width against its container. Every
defect listed above was found by one of those three, not by looking.
