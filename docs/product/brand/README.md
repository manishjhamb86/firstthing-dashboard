# Brand identity assets

Source-of-truth SVGs for the mark chosen in `../05a-theme-system.md` §3.11. Self-contained files —
each hardcodes real hex values rather than referencing the app's CSS custom properties, since a
standalone `.svg` loaded via `<img>` or exported to `.ico`/PNG doesn't inherit the host page's
tokens.

| File | Use |
|---|---|
| `logomark.svg` | Standalone icon — `#2E9E68` tile, white FT, lime dot. Doubles as the favicon/app-icon source; already confirmed legible at 16px. |
| `logomark-mono.svg` | Single-ink fallback — no tile, `#16624A`, one colour. For print, watermark, or any ground the full-colour tile doesn't clear 3:1 against. |
| `wordmark-lockup-light.svg` | Icon + "FirsThing" for light/Slate working-surface grounds. |
| `wordmark-lockup-dark.svg` | Icon + "FirsThing" for the dark navigation chrome — only the text colour changes; the icon tile already contrasts on both. |

**Tile colour is `#2E9E68`, deliberately not the theme system's `--accent` token** (`#16624A`
light / `#45D18E` dark). The user's first reaction to the mark was that its background didn't
"gel" — likely because the artifact had rendered in dark mode, where `--accent` is the much
brighter `#45D18E`. Measured white-text contrast for four candidates rather than guessing: the
bright mint the user was drawn to only cleared **1.95:1** (the rest of this design system holds
4.5:1 everywhere), so `#2E9E68` was picked instead — **3.38:1**, brighter than the original without
failing legibility. The lime dot's own contrast against this tile is a weak 2.25:1; a dark outline
was tried and shown, and the user asked for it removed, explicitly accepting the reduced
visibility rather than adding the extra stroke — worth knowing if this needs revisiting later.
`logomark-mono.svg` stayed on the deeper `#16624A` on purpose: it's judged against white paper, not
the app tile, where the deeper green holds 7.29:1 against `#2E9E68`'s 3.38:1, and nobody asked for
it to change.

**All four files share one derived geometry, not four hand-eyeballed ones.** `logomark.svg` and
`logomark-mono.svg` originally placed the dot at a different relative depth into the T's tick than
the wordmark lockups did — caught by the user comparing the four side by side, not by this process.
Fixed by treating the wordmark lockup's layout as canonical (every stroke position, the tick
length, the dot's radius and position, expressed as a fraction of the tile) and scaling that same
fraction to each file's own tile size, rather than redrawing coordinates per file by eye.

## Why this mark

Explored as three genuinely different directions, not variations on the existing production logo
(a circuit-board "FT" badge the user explicitly asked not to be used as a starting point):

- **A · The Reading** — chosen. An FT ligature (F's bar carries into T's crossbar, one continuous
  stroke) with T's stem extending into a single lime dot — reusing the design system's own rule
  that lime marks a verified value. Originally framed inside a full circular instrument ring;
  dropped after comparing both at 16px, since the ring added detail without adding legibility at
  the size the mark is actually seen most.
- **B · The Checked FT** — an FT ligature whose shared bar lifts into a checkmark instead of ending
  flat.
- **C · The Line That Rises** — F small/low and T large/high, joined by one rising stroke, so the
  initials themselves read as a trend line.

Full rationale for each, rendered at hero size, in the app's actual dark chrome, and at real
browser-tab size: `https://claude.ai/code/artifact/db3752ba-d4a7-4fef-91f0-4b4f4a97e307`.

## Not done yet

- Multi-resolution `.ico` / PNG exports and platform app-icon sizes (iOS/Android safe-area
  padding) — these SVGs are the source those get generated from, not a replacement for doing it.
- A wordmark-only lockup (no icon) for contexts too narrow for the full lockup.
- The savings-report PDF's print treatment and `CAP-22` email templates — a harder colour/contrast
  ceiling than screen; see `05a-theme-system.md` §3.12.
