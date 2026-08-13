# FirsThing Platform — Blueprint
**Mode:** Ecosystem · **Status:** Phases 0–7 approved, Phases 6 (Prioritization), 8 (Dev Plan), 9 (Test Plan) drafted and built-upon but not yet formally approved · **Last updated:** 2026-08-14

## What this is

FirsThing sells verified utility savings (lighting + pump automation, common-area circuits) to
Indian residential societies (RWAs) on a revenue-share model — the core mechanic (CON-11) is a
per-circuit, per-light-type benchmark measured once and extrapolated monthly against real meter
readings, billed as a share of the savings it proves. These documents are the complete, greenfield
blueprint for the rebuild: business framing and constraints, personas and flows, every priority-1
screen specified and mocked, the prioritized backlog, the system architecture, an 8-milestone
development plan, and a full test & quality plan — everything needed to start building without the
conversation that produced it.

**This is a greenfield rebuild, not a migration.** The prior application is preserved read-only in
`archive/` (see `archive/README.md` and this repo's `PROJECT_CONTEXT.md`); nothing in it is live,
and none of these documents describe it. There is currently no `src/` on the `blueprint` branch —
MS-01 in the development plan is a genuine from-scratch scaffold.

## Read in this order

| # | Document | Status | Covers |
|---|----------|--------|--------|
| 0 | [Intake & Framing](product/00-intake.md) | Approved | Scope, constraints, invariants, assumption register |
| 1 | [Vision & Strategy](product/01-vision-strategy.md) | Approved | Problem, goals, metrics, non-goals |
| 2 | [Users & Research](product/02-users-research.md) | Approved | Personas, jobs to be done, evidence |
| 3 | [Feature Definition](product/03-features.md) | Approved | Capabilities, 108 features, 553 acceptance criteria |
| 4 | [Flows & System Map](product/04-flows-system-map.md) | Approved | Journeys, domain model, cross-surface contracts |
| 5 | [Theme System](product/05a-theme-system.md) | Approved | Identity, palette, type, components, tokens (DIR-02 Console) |
| 5 | [Screens](product/05-screens/README.md) | Approved | Index + inventory + nav map + screen↔feature matrix — 6 surface files hold the 51 priority-1 screen specs |
| — | [Brand assets](product/brand/README.md) | Approved | FT monogram logomark, wordmark lockups |
| 6 | [Prioritization](product/08-prioritization.md) | Draft | RICE scores, dependency graph, MVP definition, 4 release slices, cut list, R0 stories |
| 7 | [Architecture](engineering/09-architecture.md) | Approved | 12 components, 15 NFRs, 12 cross-surface contracts, ~40-model schema design |
| — | [ADRs](engineering/adr/) | Accepted (10/10) | 10 architecture decision records, ADR-001 through ADR-010 |
| 8 | [Development Plan](engineering/11-development-plan.md) | Draft | 8 R0 milestones (MS-01..08), sequence, DoD, risk register |
| 9 | [Test & Quality Plan](engineering/12-test-plan.md) | Draft | Test levels, full R0 traceability matrix, contract tests, release gates |

**Machine-readable backlog:** [`backlog.yaml`](../docs/backlog.yaml) — 108 features, 553 acceptance
criteria, 116 R0 stories, 111 screens (51 specified), 8 milestones, 4 gates. Validator:
`python3 ~/.claude/skills/product-blueprint/scripts/validate_blueprint.py docs/backlog.yaml --check-coverage`
currently reports **16 errors / 263 warnings**, all one documented/accepted class each (see
"Current state" below) — not an unreviewed failure.
**Design artifacts:** [`product/brand/`](product/brand/) (logomark, wordmark) and
[`product/mockups/`](product/mockups/) (6 build scripts, one per surface — deal, monthly, ops,
portal, field, cross-cutting — rendering the hi-fi HTML decks against the approved theme tokens).
**Numbering note:** this blueprint's own phase numbers (0–9, used throughout every document header
and in this index) are canonical per the skill's phase map, but several document *filenames* carry
the skill reference directory's numbering instead (`09-architecture.md` is this blueprint's Phase
7; `11-development-plan.md` is Phase 8; `12-test-plan.md` is Phase 9) — a drift flagged and
explained in each affected document's own header and in `00-intake.md` §11. Read the phase number
in the **Status:** line of each document, not the filename, when the two disagree.

## Start here if you're…

- **building the first thing:** MS-01 in [the development plan](engineering/11-development-plan.md)
  §3 — there is no `src/` yet, so this is Next.js init, the Prisma schema, NextAuth v5, and a
  staged deploy, before any feature work
- **a coding agent:** `backlog.yaml` for what to build (every feature, AC, story, and now every
  AC's test case); [Architecture](engineering/09-architecture.md) §4–§5 for the contracts and
  schema; [Test Plan](engineering/12-test-plan.md) for the definition of correct
- **deciding whether to fund/continue this:** [Vision & Strategy](product/01-vision-strategy.md)
  and [Prioritization](product/08-prioritization.md) §5 (the MVP definition)
- **joining the team:** [Users & Research](product/02-users-research.md),
  [Flows & System Map](product/04-flows-system-map.md), and
  [Screens](product/05-screens/README.md) §4 (the navigation map)
- **designing or building the UI:** [Theme System](product/05a-theme-system.md) for the rules and
  tokens, [Screens](product/05-screens/README.md) for every spec and its mockup

## Current state

- **Phases complete (drafted):** 0–9, all ten, plus this handoff index. **Formally approved by the
  user:** 0, 1, 2, 3, 4, 5 (screens + theme), 7 (architecture, including two decisions the user
  resolved directly — production hosting via ADR-009, and `Contract.tolerancePct`'s per-contract
  scope). **Drafted and built upon under this session's standing "continue unless a real decision
  needs surfacing" instruction, but never given an explicit approval checkpoint of their own:** 6
  (prioritization), 8 (development plan), 9 (test plan). This is a real, honest gap, not an
  oversight buried here — see "Next action" below.
- **Open assumptions:** 8 genuinely open (`ASSUM-15,16,17,18,20,24,28,29` — see
  `00-intake.md` §9), plus 4 accepted working assumptions awaiting real-world validation
  (`ASSUM-22,23,26,27`). The single highest-stakes one is **ASSUM-24** — the vendor meter API's
  usability is entirely unverified, which is why FEAT-104/105/106 are built behind a
  provider-agnostic interface (ADR-010) and scheduled off R0's critical path as SPIKE-01.
- **Open questions:** 0 — all 10 of `00-intake.md` §10's open questions were resolved on
  2026-08-10 and kept for traceability, not deleted.
- **Known documentation debt, found and partly fixed while assembling this index:**
  `product/05-screens/README.md`'s status line and its own file-index table had gone stale (still
  described the per-screen loop as in-progress at 29/51, and pointed at two filenames — including a
  `07-headless.md` that was never created — that no longer matched the directory) despite the
  underlying work having finished; both are corrected as of this index. `08-prioritization.md`
  never picked up the explicit "User approval: granted/pending" line the later phase documents
  use — left as Draft here rather than silently upgraded, per the rule that a status gets *reported*
  as still-Draft, not rewritten to Approved without an actual approval having happened.
- **Validator baseline:** 16 errors / 263 warnings on `backlog.yaml --check-coverage`. All expected:
  15 of the errors are pre-existing screen/inventory gaps each documented in their owning phase
  (see `08-prioritization.md` §11 and `05-screens/README.md` §2/§6); the 16th is "343 acceptance
  criteria have no test cases" — R1–R3's ACs, deliberately out of scope for `12-test-plan.md` until
  R1 is milestone-decomposed (same document, §3).
- **Next action:** get the user's explicit approval on Phases 6, 8, and 9 (or a specific correction
  to any of them) — everything downstream (the milestone plan, the test plan, and any code written
  against MS-01) currently rests on prioritization and planning decisions that were never
  individually signed off, only proceeded on by default. After that: begin MS-01.

## Conventions

| Prefix | Meaning | Example |
|--------|---------|---------|
| `GOAL-##` | Business or product goal | `GOAL-07` |
| `PER-##` | Persona | `PER-05` |
| `JTBD-##` | Job to be done | `JTBD-01` |
| `CON-##` | Constraint | `CON-11` |
| `INV-##` | Invariant | `INV-02` |
| `ASSUM-##` | Assumption | `ASSUM-24` |
| `OQ-##` | Open question (intake phase) | `OQ-09` |
| `CAP-##` | Capability (a group of features) | `CAP-04` |
| `FEAT-###` | Feature | `FEAT-048` |
| `FLOW-##` | User flow | `FLOW-09` |
| `SCR-###` | Screen, page, view, or endpoint | `SCR-084` |
| `HL-##` | Headless unit (no interface, still specified) | `HL-05` |
| `SUR-##` | Surface (back office vs. field vs. portal grouping) | `SUR-02` |
| `CMP-##` | Shared UI component | `CMP-17` |
| `XS-##` / `CONTRACT-##` | Cross-surface contract | `XS-04` / `CONTRACT-04` |
| `NFR-##` | Non-functional requirement | `NFR-05` |
| `ADR-###` | Architecture decision record | `ADR-009` |
| `COMP-##` | Architecture component | `COMP-11` |
| `MS-##` | Milestone | `MS-04` |
| `RISK-##` / `PLAN-RISK-##` | Risk | `RISK-02`, `PLAN-RISK-03` |
| `TC-###` | Test case | `TC-048-1` |
| `SPIKE-##` | Technical or research spike | `SPIKE-01` |
| `R0`–`R3` | Release slice | `R0` |
