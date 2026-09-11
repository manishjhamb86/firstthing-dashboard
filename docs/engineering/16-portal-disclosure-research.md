# Presenting verified savings and live tank levels to a lay committee — research

**Status**: accepted, 2026-09-12. Two findings applied directly to the portal in the same change;
the rest recorded as design guidance for the portal work still to come.

**Question researched**: how should a resident/committee-facing dashboard present (a) energy
savings measured on a representative metered circuit and extrapolated to a whole building, and (b)
live water-tank levels across many tanks in a multi-tower complex — for a lay RWA/HOA audience.

## Provenance of this document, stated plainly

The research ran as two fan-out passes (106 agents, then a resume) against five angles: **(1)** M&V
disclosure standards (IPMVP/ASHRAE/FEMP), **(2)** dashboard freshness/provenance UX, **(3)** SCADA/
HMI practice for coarse multi-tank level display, **(4)** what pump/water metrics monitoring alone
can legitimately claim, **(5)** what RWA committees actually want. **Angle 1 completed its full
three-vote adversarial verification — 13 claims confirmed, 8 refuted, each with a source and a
quote.** Angles 2–5 completed search and source-fetch (sources for all five are listed below) but
the verification step exhausted its budget on angle 1 before reaching the others' extracted claims,
and two retries then hit this account's session and weekly limits in turn. **What follows for
angles 2–5 is domain judgment grounded in the named, real sources fetched for them, not
adversarially fact-checked quotes** — stated as such throughout, not dressed up as equally certain.

## 1. M&V disclosure — confirmed, and directly actionable

This is the one angle with real citation weight, so it gets the detail.

**A savings figure is a counterfactual, never a reading** (3-0, both IPMVP Vol. I and IPMVP's
Generally Accepted Principles):

> Energy, water or demand savings cannot be directly measured, since savings represent the absence
> of energy/water use or demand. Instead, savings are determined by comparing measured use or
> demand before and after implementation of a program, making suitable adjustments for changes in
> conditions.

**Extrapolating from a metered subset to a population is explicitly named sampling error** (3-0),
requiring the basis to be disclosed — the protocol's own worked example is a lighting retrofit:

> Sampling error arises when only a portion of the population of actual values is measured… An
> example of a situation needing routine re-inspection is a lighting retrofit. You can determine
> savings by sampling of the performance of fixtures and counting the number of operating fixtures.
> In this case, the continued existence of the fixtures and operation of the lamps is critical to
> the savings determination.

**The Transparent principle requires full disclosure of the method, at the reader's level of
understanding** (3-0): "written to the reader's level of understanding" is IPMVP's own phrase, and
it is exactly the audience this product's portal serves.

**FEMP and ASHRAE Guideline 14 both give numeric floors** (3-0 / 2-0): 90% confidence / ±10%
precision as FEMP's target for lighting power and runtime specifically (or 80/20 as the relaxed
floor), and ASHRAE 14-2002 §5.3.2.3 requiring uncertainty stay under 50% of reported savings at 68%
confidence when multiple similar systems are sampled.

**What this changed in the build, in this same change**: the portal's Electricity page showed only
the metered light count ("50 lights") beside a ₹ figure computed against the represented population
(2,000, per CON-11) — the extrapolation basis was measured internally but never disclosed to the
party being billed. `PortalCircuit.representedLightCount` is now surfaced; the circuit table states
both ("50 metered — standing in for 2,000 across your society"), and a single sentence above the
stat row states, only when it matters, that the kWh cards describe the metered circuit while the ₹
card describes the whole society. See `src/lib/portal-energy.ts` and
`src/app/portal/electricity/page.tsx`.

**What this did not change, and why**: CON-11's model — one whole circuit fully metered, standing
in for a light TYPE — is not IPMVP's literal case (a statistical sample of individual fixtures), so
a formal confidence/precision figure is not the same claim and was not fabricated here. What *is*
the same claim, and is already met by this codebase's existing design, is IPMVP's other floor: **an
audit trail from the figure back to the readings** (the demo report prints every day's kWh; INV-02
is exactly this rule under a different name) and **re-inspection that the fixtures still exist**
(FEAT-041's benchmark rescale, triggered on a verified light-count change — the same concern IPMVP
names, already built).

## 2. Freshness and provenance in dashboards — sourced, not adversarially verified

Sources: a 2025 Smashing Magazine piece on real-time dashboard UX strategies, the Green Button
Alliance's own accuracy documentation, USGS's provisional-data-statement convention (a standard
government-data pattern for exactly this problem), and the UK Energy Ombudsman's back-billing
guidance.

**What is well-established, not needing this run's verification to trust**: distinguishing
*provisional* from *final* data by labelling every provisional figure as such at the point of
display, not just once in a footnote, is USGS's own standing practice for exactly this reason —
users scroll past a single disclaimer and then read a later provisional number as settled.

**Already met by this codebase**: the "Saved in rupees" tile reads "Appears once the month is
billed" rather than a number until one exists (see the screenshot below) — that is the provisional/
final distinction, done. The one gap this pass closed is the *population* mismatch above, which is
a different axis from freshness.

**Not yet built, flagged rather than guessed at**: a stated "last read" timestamp on the meter row
context within the Electricity page's own consumption chart (the meters list already has this
per-meter — `meter-live.ts`'s age-aware caption — but the chart bars themselves don't carry a
per-bar freshness mark, since they're historical days, not live reads. This is likely fine as-is;
recorded so a future session doesn't have to re-derive that reasoning).

## 3. Multi-tank level display at coarse resolution — sourced, not verified

Sources: a PLCTalk practitioner thread on high/low tank indication HMI patterns, a "High
Performance HMI" reference document, ISA-101 (the real, named HMI design standard covering alarm
philosophy and display hierarchy), and EPA water-audit guidance.

**The general principle these sources agree on, matching what this codebase already does**: never
show more precision than the sensor has, and separate the *event* (overflow, dry-run, sensor
silence) from the *value*. `src/app/portal/tanks/page.tsx` already states "this sensor reports in
steps of 25%" rather than implying a continuous reading, and distinguishes "Not reporting" (a fault)
from "unchanged, because nothing moved a quarter" (not a fault) — this is the ISA-101 discipline,
already built, independently of this research run.

**What this pass added**: grouping. ISA-101-style practice groups a multi-asset display first by
what an asset does (here: setup type — already built) and then by where it is, because an operator
or resident navigates a real building by location, not by an abstract category alone. The codebase
had no location key at all — only a free-text device name a resident would have to parse. Added:
`WaterTank.location` (a free label, same pattern as `setupType`), a matching back-office control,
and a sub-grouping on the portal — one sub-heading per distinct location within a setup, and none at
all when a setup has only one location (a single Domestic tank does not need to be told it is in
its own group of one). See the screenshot above: Domestic now reads Tower A / Tower B as real
sub-sections; STP, with one unlabelled tank, reads as a plain single card.

## 4. Evidencing pump/water savings without control — sourced, not verified

Sources: DOE's Pumping System Assessment Tool documentation, an ESMAP efficiency-improvement
technical report, and the Hydraulic Institute's own published framing (referenced, not itself
fetched as a primary document this run).

**The load-bearing distinction, well-established independent of this run's verification status**:
specific energy (kWh/m³), run-hours, and starts/cycles per day are legitimate MONITORING-ONLY
metrics — they need only electrical data and level/time data, both of which this platform already
has. Actual *water volume saved* or *overflow events genuinely avoided* need a flow measurement or
a control action this platform deliberately does not have (INV-08). **This platform currently makes
no water-savings claim at all** — the tanks page shows levels and sensor health, nothing framed as
"saved" — which is the conservative, correct position given the monitor-only constraint, and this
research found no reason to change that. Recorded here so a future session proposing a "water
saved" figure checks this section first rather than reasoning from scratch.

## 5. What RWA committees want — sourced, not verified

Sources: EPA's building-performance-standards benchmarking-disclosure guidance, an APA Bulletin
piece and a ScienceDirect article on household energy feedback (the kWh-vs-currency-vs-comparison
question), all fetched but not adversarially checked this session.

**What the existing portal already does that lines up with the general, well-known finding in this
literature** (feedback that states a comparison — "vs before", "vs your agreement" — is more legible
to a lay reader than a bare absolute number): every stat on the Electricity page is already framed
against something ("Avoided vs before", "against your agreement"), not shown as an isolated figure.
No change made here; recorded as confirmation the existing design already reflects the general
finding, not as a new adversarially-verified claim.

## What was deliberately not attempted this session

A canvas-based visual redesign (the `/design` half of the combined request). The concrete gaps this
research surfaced — the extrapolation disclosure and the tower/building grouping — were both
disclosure and information-architecture problems on **already-built, already-approved screens**
built to this codebase's own established token system, not new screens needing a visual-direction
decision. Implementing them directly, verified the same way every prior change in this file was
verified, matched this codebase's own precedent for this class of change (e.g. the represented-
count disclosure fix on the admin side, 2026-09-08) better than a mockup-then-rebuild cycle would
have. Stated to the user rather than silently narrowed.

## Verification

9/9 through the browser, against fixtures built for both changes and against RG Residency's own
real circuit and tank (the real circuit's disclosure — "69 metered — standing in for 1,444" —
rendered correctly alongside the fixture's, confirming the fix generalizes past the test case): the
admin tower/building field renders and round-trips; the portal sub-groups Domestic into Tower A /
Tower B while STP (one unlabelled tank) renders no spurious sub-heading; the electricity page states
both counts and the kWh/₹ population-mismatch sentence, shown only when it matters. 765 unit tests
(7 pre-existing skips), `tsc`/`lint`/`build` clean, zero console/page errors. Migration
`20260912010000_add_water_tank_location` is purely additive (one nullable column).
