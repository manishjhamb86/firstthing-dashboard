# Test & Quality Plan
**Product:** FirsThing Platform · **Phase:** 9 (skill's Phase 12 — Test & Quality Plan) · **Status:** Approved (2026-08-14, after a full review pass — see `docs/README.md`)
**Last updated:** 2026-08-13 · **Mode:** Ecosystem

> **Numbering:** this is *this blueprint's* Phase 9. It follows the skill's
> `references/phase-12-test-plan.md` template. See `00-intake.md` §11 for the offset between this
> project's phase numbers and the skill's reference filenames.

> **Inputs re-read before drafting:** `docs/product/03-features.md` (the 210 R0 acceptance
> criteria this plan traces), `docs/engineering/09-architecture.md` (§1 NFRs, §4 contracts, §11
> risks), `docs/engineering/11-development-plan.md` (§3 milestones, §6 CI, §8 Definition of Done),
> `00-intake.md` §4 (invariants).

---

## 1. Quality objectives

Cost-of-failure sets the rigor budget (question bank Q1). For this product, a bug reaching
production isn't cosmetic-only in the common case — it's usually a number a society is billed
against, or a person left waiting on a physical site. That shapes every choice below.

| Objective | Target | Rationale |
|-----------|--------|-----------|
| Every R0 acceptance criterion has a named test at the cheapest level that can verify it | 210/210 (100%) | This document's own traceability matrix (§3) — a plan that lists testing types without connecting them to ACs proves nothing, per the method's own framing |
| Every NFR from `09-architecture.md` §1 has a measurement method and a pass threshold | 15/15 | NFRs without a verification method are aspirations, not requirements |
| Every invariant from `00-intake.md` §4 has an automated gate, not a manual check | 7/9 automated (2 are process/legal, see §7) | INV-02/03's direct link to what a society is billed makes a manual-only check an unacceptable residual risk |
| No R0 milestone (`11-development-plan.md` §3) is marked done while its release gate fails | 8/8 milestones gated | Phase 11's Definition of Done already requires this; this plan is what makes it checkable, not just stated |
| Financial-record write paths (`MeterReading`, `Benchmark`, `MonthlyCalculation`, `Invoice`, `SavingsReport`, `Payment`) carry 100% test coverage at unit + integration level | 100% on these 6 tables specifically, not a blanket repo-wide number | A blanket coverage percentage hides exactly the tables where a gap matters most; naming them explicitly is more honest than a repo-wide target that could be hit by testing everything *except* these |
| R1–R3's 343 acceptance criteria are explicitly deferred, not silently untested | 0% now, tracked and planned | Matches this whole blueprint's repeated discipline of scoping rigor to the near-term release rather than pretending completeness it doesn't have (§3's "Uncovered acceptance criteria") |

**A blanket repo-wide coverage percentage is deliberately not this document's headline number** —
it would reward padding easy modules with tests while a genuinely under-tested billing path hides
inside an average that looks fine. The traceability matrix (§3) is the real measure, per the
method's own stated framing.

---

## 2. Test levels in scope

| Level | In scope? | Rationale | Tooling | Where it runs |
|-------|-----------|-----------|---------|---------------|
| Unit | Yes | Deterministic, pure-function logic — CON-11's extrapolation formula, CON-10's rescale math, CON-22's proration, CON-01c's streak evaluation — is exactly what unit tests verify cheaply and fast | Vitest (or Jest — decide at MS-01, not a Phase 9 concern) | Every commit |
| Integration | Yes, the dominant level for this system | Most of R0's behavior (185 of 210 ACs, §3) is "does the right thing happen against a real Postgres, under a real session" — component-in-isolation unit tests structurally can't verify GATE-03/04's server-side enforcement | Vitest + a real (test-schema) Postgres via Prisma, not mocked | Every commit or merge |
| Contract | Yes | The 12 cross-surface contracts (`09-architecture.md` §4) are internal-but-real boundaries (SUR-01 ↔ SUR-02) with their own idempotency/versioning semantics — worth testing as contracts, not just as components that happen to call each other | A schema-validation test per Route Handler payload shape (§5) | Every commit touching either side |
| End-to-end | Yes, narrowly | One anchor flow per R0 milestone (§3's 7 `+ e2e` rows) proves the milestone's demoable outcome for real, through the actual UI — deliberately **not** applied to all 210 ACs, per the method's own warning that over-applying e2e produces slow, flaky suites | Playwright, driving system Chrome (the pattern already proven and documented in `PROJECT_CONTEXT.md`'s Validation History) | Merge to `blueprint`, and before every milestone close |
| Non-functional | Yes | 15 numeric NFRs exist specifically to be measured (§6) | Ad hoc scripts against a seeded 200-society fixture for scale NFRs (NFR-11/14); manual timing for the rest at this team's scale | Pre-release, and whenever a component named in an NFR's "Applies to" column changes materially |
| Hardware/device in the loop | **Not in scope** | This is a web/mobile-web product with no firmware or device dependency — the nearest analogue (field devices, ASSUM-27) is "an Android phone in a browser," covered by manual/exploratory testing, not a hardware rig | — | — |
| Manual / exploratory | Yes, narrowly | 4 ACs are genuinely human-judgment calls (§3 — photo/label legibility, report defensibility) that no automated assertion can meaningfully replace | A person, per §4's TC template | Pre-release, once per milestone |
| Acceptance / UAT | Yes | §11 — R0 has exactly one real user population (the pilot society's committee) to validate against, which makes UAT unusually concrete for this release | The pilot society itself | Release candidate, before production cutover |

---

## 3. Traceability matrix

**210 of 210 R0 acceptance criteria are covered below — the near-term release this document
governs.** R1–R3's 343 acceptance criteria are **not** covered yet; see "Uncovered acceptance
criteria" below for why and when.

**Level-assignment rule, applied mechanically for consistency rather than judged row by row:** a
`happy`/`edge` acceptance criterion belonging to a feature under CAP-02 (benchmark commissioning)
or CAP-04 (billing calculation) — deterministic arithmetic with no I/O — is **unit**. A `permission`
type is always **integration**, since GATE-03/04's enforcement is a real Prisma query under a real
session, not mockable meaningfully at unit level. Everything else defaults to **integration**. Four
ACs are **manual** — genuine human-judgment calls (photo/label legibility per ASSUM-26, a report's
defensibility to a real committee) that no assertion meaningfully automates. Seven ACs — one per R0
milestone (`11-development-plan.md` §3), chosen as the AC that most directly represents that
milestone's demoable outcome — additionally get an **end-to-end** test (`+e2e` in the Level
column), proving the milestone's story through the real UI on top of its own base-level coverage.

| Feature | AC | Test case | Level | Automated? | Milestone | Status |
|---------|----|-----------|-------|-----------|-----------|--------|
| FEAT-001 | AC-1 | TC-001-1 | integration | yes | MS-03 | planned |
| FEAT-001 | AC-2 | TC-001-2 | integration | yes | MS-03 | planned |
| FEAT-001 | AC-3 | TC-001-3 | integration | yes | MS-03 | planned |
| FEAT-001 | AC-4 | TC-001-4 | integration | yes | MS-03 | planned |
| FEAT-001 | AC-5 | TC-001-5 | integration | yes | MS-03 | planned |
| FEAT-002 | AC-1 | TC-002-1 | integration | yes | MS-03 | planned |
| FEAT-002 | AC-2 | TC-002-2 | integration | yes | MS-03 | planned |
| FEAT-002 | AC-3 | TC-002-3 | integration | yes | MS-03 | planned |
| FEAT-002 | AC-4 | TC-002-4 | integration | yes | MS-03 | planned |
| FEAT-002 | AC-5 | TC-002-5 | integration | yes | MS-03 | planned |
| FEAT-006 | AC-1 | TC-006-1 | manual | no | MS-03 | planned |
| FEAT-006 | AC-2 | TC-006-2 | integration | yes | MS-03 | planned |
| FEAT-006 | AC-3 | TC-006-3 | integration | yes | MS-03 | planned |
| FEAT-006 | AC-4 | TC-006-4 | integration | yes | MS-03 | planned |
| FEAT-006 | AC-5 | TC-006-5 | integration | yes | MS-03 | planned |
| FEAT-006 | AC-6 | TC-006-6 | integration | yes | MS-03 | planned |
| FEAT-007 | AC-1 | TC-007-1, TC-007-1-E2E | integration + e2e | yes | MS-03 | planned |
| FEAT-007 | AC-2 | TC-007-2 | integration | yes | MS-03 | planned |
| FEAT-007 | AC-3 | TC-007-3 | integration | yes | MS-03 | planned |
| FEAT-007 | AC-4 | TC-007-4 | integration | yes | MS-03 | planned |
| FEAT-007 | AC-5 | TC-007-5 | integration | yes | MS-03 | planned |
| FEAT-011 | AC-1 | TC-011-1 | unit | yes | MS-04 | planned |
| FEAT-011 | AC-2 | TC-011-2 | integration | yes | MS-04 | planned |
| FEAT-011 | AC-3 | TC-011-3 | integration | yes | MS-04 | planned |
| FEAT-011 | AC-4 | TC-011-4 | integration | yes | MS-04 | planned |
| FEAT-011 | AC-5 | TC-011-5 | unit | yes | MS-04 | planned |
| FEAT-012 | AC-1 | TC-012-1 | unit | yes | MS-04 | planned |
| FEAT-012 | AC-2 | TC-012-2 | integration | yes | MS-04 | planned |
| FEAT-012 | AC-3 | TC-012-3 | integration | yes | MS-04 | planned |
| FEAT-012 | AC-4 | TC-012-4 | integration | yes | MS-04 | planned |
| FEAT-012 | AC-5 | TC-012-5 | unit | yes | MS-04 | planned |
| FEAT-013 | AC-1 | TC-013-1 | manual | no | MS-04 | planned |
| FEAT-013 | AC-2 | TC-013-2 | integration | yes | MS-04 | planned |
| FEAT-013 | AC-3 | TC-013-3 | integration | yes | MS-04 | planned |
| FEAT-013 | AC-4 | TC-013-4 | integration | yes | MS-04 | planned |
| FEAT-013 | AC-5 | TC-013-5 | unit | yes | MS-04 | planned |
| FEAT-014 | AC-1 | TC-014-1, TC-014-1-E2E | unit + e2e | yes | MS-04 | planned |
| FEAT-014 | AC-2 | TC-014-2 | integration | yes | MS-04 | planned |
| FEAT-014 | AC-3 | TC-014-3 | integration | yes | MS-04 | planned |
| FEAT-014 | AC-4 | TC-014-4 | integration | yes | MS-04 | planned |
| FEAT-014 | AC-5 | TC-014-5 | unit | yes | MS-04 | planned |
| FEAT-020 | AC-1 | TC-020-1 | manual | no | MS-05 | planned |
| FEAT-020 | AC-2 | TC-020-2 | integration | yes | MS-05 | planned |
| FEAT-020 | AC-3 | TC-020-3 | integration | yes | MS-05 | planned |
| FEAT-020 | AC-4 | TC-020-4 | integration | yes | MS-05 | planned |
| FEAT-020 | AC-5 | TC-020-5 | integration | yes | MS-05 | planned |
| FEAT-024 | AC-1 | TC-024-1 | integration | yes | MS-05 | planned |
| FEAT-024 | AC-2 | TC-024-2 | integration | yes | MS-05 | planned |
| FEAT-024 | AC-3 | TC-024-3 | integration | yes | MS-05 | planned |
| FEAT-024 | AC-4 | TC-024-4 | integration | yes | MS-05 | planned |
| FEAT-024 | AC-5 | TC-024-5 | integration | yes | MS-05 | planned |
| FEAT-026 | AC-1 | TC-026-1 | integration | yes | MS-05 | planned |
| FEAT-026 | AC-2 | TC-026-2 | integration | yes | MS-05 | planned |
| FEAT-026 | AC-3 | TC-026-3 | integration | yes | MS-05 | planned |
| FEAT-026 | AC-4 | TC-026-4 | integration | yes | MS-05 | planned |
| FEAT-026 | AC-5 | TC-026-5 | integration | yes | MS-05 | planned |
| FEAT-027 | AC-1 | TC-027-1 | integration | yes | MS-05 | planned |
| FEAT-027 | AC-2 | TC-027-2 | integration | yes | MS-05 | planned |
| FEAT-027 | AC-3 | TC-027-3 | integration | yes | MS-05 | planned |
| FEAT-027 | AC-4 | TC-027-4 | integration | yes | MS-05 | planned |
| FEAT-027 | AC-5 | TC-027-5 | integration | yes | MS-05 | planned |
| FEAT-028 | AC-1 | TC-028-1, TC-028-1-E2E | integration + e2e | yes | MS-05 | planned |
| FEAT-028 | AC-2 | TC-028-2 | integration | yes | MS-05 | planned |
| FEAT-028 | AC-3 | TC-028-3 | integration | yes | MS-05 | planned |
| FEAT-028 | AC-4 | TC-028-4 | integration | yes | MS-05 | planned |
| FEAT-028 | AC-5 | TC-028-5 | integration | yes | MS-05 | planned |
| FEAT-029 | AC-1 | TC-029-1 | integration | yes | MS-05 | planned |
| FEAT-029 | AC-2 | TC-029-2 | integration | yes | MS-05 | planned |
| FEAT-029 | AC-3 | TC-029-3 | integration | yes | MS-05 | planned |
| FEAT-029 | AC-4 | TC-029-4 | integration | yes | MS-05 | planned |
| FEAT-029 | AC-5 | TC-029-5 | integration | yes | MS-05 | planned |
| FEAT-033 | AC-1 | TC-033-1 | integration | yes | MS-06 | planned |
| FEAT-033 | AC-2 | TC-033-2 | integration | yes | MS-06 | planned |
| FEAT-033 | AC-3 | TC-033-3 | integration | yes | MS-06 | planned |
| FEAT-033 | AC-4 | TC-033-4 | integration | yes | MS-06 | planned |
| FEAT-033 | AC-5 | TC-033-5 | integration | yes | MS-06 | planned |
| FEAT-034 | AC-1 | TC-034-1 | manual | no | MS-06 | planned |
| FEAT-034 | AC-2 | TC-034-2 | integration | yes | MS-06 | planned |
| FEAT-034 | AC-3 | TC-034-3 | integration | yes | MS-06 | planned |
| FEAT-034 | AC-4 | TC-034-4 | integration | yes | MS-06 | planned |
| FEAT-034 | AC-5 | TC-034-5 | integration | yes | MS-06 | planned |
| FEAT-035 | AC-1 | TC-035-1 | integration | yes | MS-06 | planned |
| FEAT-035 | AC-2 | TC-035-2 | integration | yes | MS-06 | planned |
| FEAT-035 | AC-3 | TC-035-3 | integration | yes | MS-06 | planned |
| FEAT-035 | AC-4 | TC-035-4 | integration | yes | MS-06 | planned |
| FEAT-035 | AC-5 | TC-035-5 | integration | yes | MS-06 | planned |
| FEAT-036 | AC-1 | TC-036-1 | integration | yes | MS-06 | planned |
| FEAT-036 | AC-2 | TC-036-2 | integration | yes | MS-06 | planned |
| FEAT-036 | AC-3 | TC-036-3 | integration | yes | MS-06 | planned |
| FEAT-036 | AC-4 | TC-036-4 | integration | yes | MS-06 | planned |
| FEAT-036 | AC-5 | TC-036-5 | integration | yes | MS-06 | planned |
| FEAT-037 | AC-1 | TC-037-1, TC-037-1-E2E | integration + e2e | yes | MS-06 | planned |
| FEAT-037 | AC-2 | TC-037-2 | integration | yes | MS-06 | planned |
| FEAT-037 | AC-3 | TC-037-3 | integration | yes | MS-06 | planned |
| FEAT-037 | AC-4 | TC-037-4 | integration | yes | MS-06 | planned |
| FEAT-037 | AC-5 | TC-037-5 | integration | yes | MS-06 | planned |
| FEAT-039 | AC-1 | TC-039-1 | integration | yes | MS-04 | planned |
| FEAT-039 | AC-2 | TC-039-2 | integration | yes | MS-04 | planned |
| FEAT-039 | AC-3 | TC-039-3 | integration | yes | MS-04 | planned |
| FEAT-039 | AC-4 | TC-039-4 | integration | yes | MS-04 | planned |
| FEAT-039 | AC-5 | TC-039-5 | integration | yes | MS-04 | planned |
| FEAT-040 | AC-1 | TC-040-1 | integration | yes | MS-04 | planned |
| FEAT-040 | AC-2 | TC-040-2 | integration | yes | MS-04 | planned |
| FEAT-040 | AC-3 | TC-040-3 | integration | yes | MS-04 | planned |
| FEAT-040 | AC-4 | TC-040-4 | integration | yes | MS-04 | planned |
| FEAT-040 | AC-5 | TC-040-5 | integration | yes | MS-04 | planned |
| FEAT-041 | AC-1 | TC-041-1 | unit | yes | MS-04 | planned |
| FEAT-041 | AC-2 | TC-041-2 | integration | yes | MS-04 | planned |
| FEAT-041 | AC-3 | TC-041-3 | integration | yes | MS-04 | planned |
| FEAT-041 | AC-4 | TC-041-4 | integration | yes | MS-04 | planned |
| FEAT-041 | AC-5 | TC-041-5 | unit | yes | MS-04 | planned |
| FEAT-043 | AC-1 | TC-043-1 | integration | yes | MS-07 | planned |
| FEAT-043 | AC-2 | TC-043-2 | integration | yes | MS-07 | planned |
| FEAT-043 | AC-3 | TC-043-3 | integration | yes | MS-07 | planned |
| FEAT-043 | AC-4 | TC-043-4 | integration | yes | MS-07 | planned |
| FEAT-043 | AC-5 | TC-043-5 | integration | yes | MS-07 | planned |
| FEAT-044 | AC-1 | TC-044-1 | integration | yes | MS-07 | planned |
| FEAT-044 | AC-2 | TC-044-2 | integration | yes | MS-07 | planned |
| FEAT-044 | AC-3 | TC-044-3 | integration | yes | MS-07 | planned |
| FEAT-044 | AC-4 | TC-044-4 | integration | yes | MS-07 | planned |
| FEAT-044 | AC-5 | TC-044-5 | integration | yes | MS-07 | planned |
| FEAT-045 | AC-1 | TC-045-1 | integration | yes | MS-07 | planned |
| FEAT-045 | AC-2 | TC-045-2 | integration | yes | MS-07 | planned |
| FEAT-045 | AC-3 | TC-045-3 | integration | yes | MS-07 | planned |
| FEAT-045 | AC-4 | TC-045-4 | integration | yes | MS-07 | planned |
| FEAT-045 | AC-5 | TC-045-5 | integration | yes | MS-07 | planned |
| FEAT-046 | AC-1 | TC-046-1 | integration | yes | MS-07 | planned |
| FEAT-046 | AC-2 | TC-046-2 | integration | yes | MS-07 | planned |
| FEAT-046 | AC-3 | TC-046-3 | integration | yes | MS-07 | planned |
| FEAT-046 | AC-4 | TC-046-4 | integration | yes | MS-07 | planned |
| FEAT-046 | AC-5 | TC-046-5 | integration | yes | MS-07 | planned |
| FEAT-047 | AC-1 | TC-047-1, TC-047-1-E2E | integration + e2e | yes | MS-07 | planned |
| FEAT-047 | AC-2 | TC-047-2 | integration | yes | MS-07 | planned |
| FEAT-047 | AC-3 | TC-047-3 | integration | yes | MS-07 | planned |
| FEAT-047 | AC-4 | TC-047-4 | integration | yes | MS-07 | planned |
| FEAT-047 | AC-5 | TC-047-5 | integration | yes | MS-07 | planned |
| FEAT-048 | AC-1 | TC-048-1 | unit | yes | MS-08 | planned |
| FEAT-048 | AC-2 | TC-048-2 | integration | yes | MS-08 | planned |
| FEAT-048 | AC-3 | TC-048-3 | integration | yes | MS-08 | planned |
| FEAT-048 | AC-4 | TC-048-4 | integration | yes | MS-08 | planned |
| FEAT-048 | AC-5 | TC-048-5 | unit | yes | MS-08 | planned |
| FEAT-049 | AC-1 | TC-049-1 | unit | yes | MS-08 | planned |
| FEAT-049 | AC-2 | TC-049-2 | integration | yes | MS-08 | planned |
| FEAT-049 | AC-3 | TC-049-3 | integration | yes | MS-08 | planned |
| FEAT-049 | AC-4 | TC-049-4 | integration | yes | MS-08 | planned |
| FEAT-049 | AC-5 | TC-049-5 | unit | yes | MS-08 | planned |
| FEAT-050 | AC-1 | TC-050-1 | unit | yes | MS-08 | planned |
| FEAT-050 | AC-2 | TC-050-2 | integration | yes | MS-08 | planned |
| FEAT-050 | AC-3 | TC-050-3 | integration | yes | MS-08 | planned |
| FEAT-050 | AC-4 | TC-050-4 | integration | yes | MS-08 | planned |
| FEAT-050 | AC-5 | TC-050-5 | unit | yes | MS-08 | planned |
| FEAT-051 | AC-1 | TC-051-1 | unit | yes | MS-08 | planned |
| FEAT-051 | AC-2 | TC-051-2 | integration | yes | MS-08 | planned |
| FEAT-051 | AC-3 | TC-051-3 | integration | yes | MS-08 | planned |
| FEAT-051 | AC-4 | TC-051-4 | integration | yes | MS-08 | planned |
| FEAT-051 | AC-5 | TC-051-5 | unit | yes | MS-08 | planned |
| FEAT-053 | AC-1 | TC-053-1 | unit | yes | MS-08 | planned |
| FEAT-053 | AC-2 | TC-053-2 | integration | yes | MS-08 | planned |
| FEAT-053 | AC-3 | TC-053-3 | integration | yes | MS-08 | planned |
| FEAT-053 | AC-4 | TC-053-4 | integration | yes | MS-08 | planned |
| FEAT-053 | AC-5 | TC-053-5 | unit | yes | MS-08 | planned |
| FEAT-054 | AC-1 | TC-054-1 | unit | yes | MS-08 | planned |
| FEAT-054 | AC-2 | TC-054-2 | integration | yes | MS-08 | planned |
| FEAT-054 | AC-3 | TC-054-3 | integration | yes | MS-08 | planned |
| FEAT-054 | AC-4 | TC-054-4 | integration | yes | MS-08 | planned |
| FEAT-054 | AC-5 | TC-054-5 | unit | yes | MS-08 | planned |
| FEAT-055 | AC-1 | TC-055-1 | integration | yes | MS-08 | planned |
| FEAT-055 | AC-2 | TC-055-2 | integration | yes | MS-08 | planned |
| FEAT-055 | AC-3 | TC-055-3 | integration | yes | MS-08 | planned |
| FEAT-055 | AC-4 | TC-055-4 | integration | yes | MS-08 | planned |
| FEAT-055 | AC-5 | TC-055-5 | integration | yes | MS-08 | planned |
| FEAT-059 | AC-1 | TC-059-1 | integration | yes | MS-08 | planned |
| FEAT-059 | AC-2 | TC-059-2 | integration | yes | MS-08 | planned |
| FEAT-059 | AC-3 | TC-059-3 | integration | yes | MS-08 | planned |
| FEAT-059 | AC-4 | TC-059-4 | integration | yes | MS-08 | planned |
| FEAT-059 | AC-5 | TC-059-5 | integration | yes | MS-08 | planned |
| FEAT-060 | AC-1 | TC-060-1, TC-060-1-E2E | integration + e2e | yes | MS-08 | planned |
| FEAT-060 | AC-2 | TC-060-2 | integration | yes | MS-08 | planned |
| FEAT-060 | AC-3 | TC-060-3 | integration | yes | MS-08 | planned |
| FEAT-060 | AC-4 | TC-060-4 | integration | yes | MS-08 | planned |
| FEAT-060 | AC-5 | TC-060-5 | integration | yes | MS-08 | planned |
| FEAT-062 | AC-1 | TC-062-1 | integration | yes | MS-05 | planned |
| FEAT-062 | AC-2 | TC-062-2 | integration | yes | MS-05 | planned |
| FEAT-062 | AC-3 | TC-062-3 | integration | yes | MS-05 | planned |
| FEAT-062 | AC-4 | TC-062-4 | integration | yes | MS-05 | planned |
| FEAT-062 | AC-5 | TC-062-5 | integration | yes | MS-05 | planned |
| FEAT-085 | AC-1 | TC-085-1 | integration | yes | MS-02 | planned |
| FEAT-085 | AC-2 | TC-085-2 | integration | yes | MS-02 | planned |
| FEAT-085 | AC-3 | TC-085-3 | integration | yes | MS-02 | planned |
| FEAT-085 | AC-4 | TC-085-4 | integration | yes | MS-02 | planned |
| FEAT-085 | AC-5 | TC-085-5 | integration | yes | MS-02 | planned |
| FEAT-086 | AC-1 | TC-086-1 | integration | yes | MS-02 | planned |
| FEAT-086 | AC-2 | TC-086-2 | integration | yes | MS-02 | planned |
| FEAT-086 | AC-3 | TC-086-3 | integration | yes | MS-02 | planned |
| FEAT-086 | AC-4 | TC-086-4 | integration | yes | MS-02 | planned |
| FEAT-086 | AC-5 | TC-086-5 | integration | yes | MS-02 | planned |
| FEAT-087 | AC-1 | TC-087-1 | integration | yes | MS-08 | planned |
| FEAT-087 | AC-2 | TC-087-2 | integration | yes | MS-08 | planned |
| FEAT-087 | AC-3 | TC-087-3 | integration | yes | MS-08 | planned |
| FEAT-087 | AC-4 | TC-087-4 | integration | yes | MS-08 | planned |
| FEAT-087 | AC-5 | TC-087-5 | integration | yes | MS-08 | planned |
| FEAT-108 | AC-1 | TC-108-1, TC-108-1-E2E | integration + e2e | yes | MS-02 | planned |
| FEAT-108 | AC-2 | TC-108-2 | integration | yes | MS-02 | planned |
| FEAT-108 | AC-3 | TC-108-3 | integration | yes | MS-02 | planned |
| FEAT-108 | AC-4 | TC-108-4 | integration | yes | MS-02 | planned |
| FEAT-108 | AC-5 | TC-108-5 | integration | yes | MS-02 | planned |
| FEAT-108 | AC-6 | TC-108-6 | integration | yes | MS-02 | planned |
| FEAT-108 | AC-7 | TC-108-7 | integration | yes | MS-02 | planned |
| FEAT-108 | AC-8 | TC-108-8 | integration | yes | MS-02 | planned |
| FEAT-108 | AC-9 | TC-108-9 | integration | yes | MS-02 | planned |

**Uncovered acceptance criteria: 343, all in R1–R3, all by explicit plan, not oversight.** Consistent
with this whole blueprint's discipline of scoping rigor to the near-term release (Phase 5 specified
only priority-1 screens; Phase 8 milestone-decomposed only R0) — this document does the same for
test planning. **Plan:** re-run this phase's method against R1's feature set once R0 completes and
R1 is milestone-decomposed (`11-development-plan.md` §1's "Next" roadmap entry), at which point R1's
~106 sessions of feature work get the same AC-by-AC treatment R0 just received. Validator command:
`python3 scripts/validate_blueprint.py docs/backlog.yaml --check-coverage` reports the real number
(210/553, 37% system-wide) rather than a false 100% — deliberately not hidden.

---

## 4. Test cases

Nine detailed cases: the seven milestone-anchor end-to-end tests, plus two unit-level cases for the
two most consequence-bearing pieces of deterministic logic in the system. Everything else is fully
specified at the matrix level (§3) — writing step-by-step detail for all 210 would be exactly the
"hundred fully-written test cases nobody reads" the method warns against.

### TC-108-1-E2E — Office-bearer accepts an offer (MS-02 anchor)
- **Verifies:** FEAT-108 AC-1 · **Level:** e2e · **Automated:** yes
- **Preconditions:** a society with an active `office-bearer` account and a `committee` account exist; an offer is in `shared` state
- **Steps:** log in as the `committee` account, open the offer, attempt accept → expect refusal naming who can act (FEAT-108 AC-2, tested implicitly); log in as `office-bearer`, open the same offer, accept
- **Expected result:** the offer moves to `accepted`, and the record shows the `office-bearer` account and the authority held at that moment (FEAT-108 AC-9's `capturedAt` requirement)
- **Test data:** two portal accounts on one seeded society, one offer fixture

### TC-007-1-E2E — Eligible circuit selected per light type (MS-03 anchor)
- **Verifies:** FEAT-007 AC-1 · **Level:** e2e · **Automated:** yes
- **Preconditions:** a confirmed survey with a lighting inventory covering ≥2 distinct light types
- **Steps:** for each light type, select a circuit meeting CON-16 (≥50 lights, no shared appliances, WiFi/LAN 20–40m, fixtures ≤15ft, not on a driveway/ramp); submit the checklist
- **Expected result:** each circuit is marked `eligible` and `pending-confirmation`, carrying its own `lightType`
- **Test data:** a synthetic survey fixture with basement + staircase light types

### TC-014-1-E2E — Benchmark computed within CON-20's range (MS-04 anchor)
- **Verifies:** FEAT-014 AC-1 · **Level:** e2e · **Automated:** yes
- **Preconditions:** a circuit with 5 valid baseline days and 5 valid post-install days recorded
- **Steps:** run the benchmark computation for the circuit
- **Expected result:** `Circuit.benchmarkSavingsPct` is written as the **exact** measured figure (not rounded), and the circuit moves to `benchmark-confirmed`; a result outside 60–80% instead flags for next-morning review (FEAT-015) — test both branches
- **Test data:** two fixtures — one producing 68% (in range), one producing 45% (out of range)

### TC-028-1-E2E — Offer acceptance advances the pipeline (MS-05 anchor)
- **Verifies:** FEAT-028 AC-1 · **Level:** e2e · **Automated:** yes
- **Preconditions:** an issued offer against a pipeline in `offered` stage
- **Steps:** office-bearer accepts
- **Expected result:** offer → `accepted`; pipeline → `agreed`
- **Test data:** shares the TC-108-1-E2E fixture

### TC-037-1-E2E — Completion certificate starts prorated billing (MS-06 anchor)
- **Verifies:** FEAT-037 AC-1 · **Level:** e2e · **Automated:** yes
- **Preconditions:** every installation batch approved, no open blockers
- **Steps:** sign the completion certificate with a recorded date mid-month
- **Expected result:** pipeline → `active-billing`; billing scheduled to start the **day after** the certificate date; the first month's proration (FEAT-051) reflects actual remaining days, not a full month
- **Test data:** a certificate dated on the 18th of a 30-day month — expect 12 billable days

### TC-047-1-E2E — A monthly figure traces to its raw file (MS-07 anchor)
- **Verifies:** FEAT-047 AC-1 · **Level:** e2e · **Automated:** yes
- **Preconditions:** a circuit's month is fully ingested and marked ready
- **Steps:** from the monthly figure, follow the provenance chain
- **Expected result:** the chain reaches the daily readings, the upload that produced them, and the original raw file byte-for-byte (INV-02, GATE-01) — this is the single most direct test of INV-02 in the whole suite
- **Test data:** one real (or realistic synthetic) vendor CSV, per `11-development-plan.md` §9's external dependency

### TC-060-1-E2E — Society sees its released month in the portal (MS-08 anchor — R0's own exit condition)
- **Verifies:** FEAT-060 AC-1 · **Level:** e2e · **Automated:** yes
- **Preconditions:** a month has completed calculation, passed the accountant release gate (FEAT-054), and an invoice is linked (FEAT-053)
- **Steps:** log in as a society portal account, open the portal home
- **Expected result:** that month's savings report and invoice are both present, every figure in the report links back to its provenance (INV-02), and the overdue clock (FEAT-087) has started
- **Test data:** the full MS-01–MS-08 walk's end state — this test case is, deliberately, R0's exit condition itself made executable

### TC-048-1 — Per-circuit extrapolation and fee formula (CON-11)
- **Verifies:** FEAT-048 AC-1 · **Level:** unit · **Automated:** yes
- **Preconditions:** none — pure function
- **Steps:** call the calculation function with a fixture: metered light count 40, represented light count 200, metered units 100, benchmark 68%, unit rate ₹8, revenue share 58% society / 42% FirsThing
- **Expected result:** extrapolated consumption = 500 (200÷40×100); savings units = 340 (500×68%); savings ₹ = 2,720; FirsThing's fee = 1,142.40 (2,720×42%) — every figure asserted exactly, not approximately, since this is the formula a real bill is computed from. **The split direction itself is worth asserting, not just its arithmetic** — `05-screens/README.md` §6 records a real prior defect where a mockup deck had this exact split inverted (58% FirsThing / 42% society) in nine places; a unit test that only checks the number without checking which party it belongs to would not have caught that class of bug
- **Test data:** the fixture above, plus a second fixture with two light types to assert the society total is the **sum** of independent per-type extrapolations, never one circuit scaled across the whole society (the specific bug CON-11's correction exists to prevent)

### TC-087-3 — Suspension never fires on stale payment data
- **Verifies:** FEAT-087 AC-3 · **Level:** integration · **Automated:** yes
- **Preconditions:** an invoice at the end of its 5-day warning countdown with no extension granted
- **Steps:** (a) set `Payment.confirmedAsOf` to today, run the suspension job — expect it fires; (b) set `Payment.confirmedAsOf` to yesterday, run the same job — expect it holds and prompts ops instead
- **Expected result:** case (a) suspends with a full timeline recorded; case (b) does **not** suspend — this is CON-13's safety rule and the architecture doc's own words for why it matters: "the exact failure the safety rule exists to prevent" would be a suspension against a society that has already paid
- **Test data:** two invoice fixtures identical except for `Payment.confirmedAsOf`

---

## 5. Contract tests

The 12 cross-surface contracts specified in `09-architecture.md` §4. Since SUR-01 and SUR-02 are
one deployment (ADR-001/002), "producer" and "consumer" tests both live in this repo, not across a
service boundary — the contract test's job is to catch a payload-shape or error-semantics drift
between the Route Handler and the client code that calls it, which unit tests on either side alone
would miss.

| Contract | Producer test | Consumer test | Breaking-change detection |
|----------|--------------|---------------|--------------------------|
| CONTRACT-01 (visit assignment) | Route Handler returns the documented shape for a valid assignment | Field client correctly renders an assignment and handles a `409` (suspended society) | Schema-validate the Route Handler's response against a stored JSON Schema per contract; CI fails on drift |
| CONTRACT-02 (visit response) | Server rejects a reschedule inside the 24h lockout using the server clock, not a client-supplied one | Client sends a device-clock-skewed request and gets the correct server-side rejection anyway | Same schema-validation pattern |
| CONTRACT-03 (survey capture) | Each section commits independently; a malformed section is rejected without failing siblings | Client's per-section outbox retries only the failed section | Per-section schema version tag (§4's "high" versioning need) — CI asserts an old tag is either interpretable or explicitly rejected, never silently mis-mapped |
| CONTRACT-04/05 (gate pass submit/approve) | Submission blocks correctly; the sweep job resolves an unapproved submission to `provisional` within NFR-06's 60-second tolerance of the 30-minute mark | Client treats `provisional` identically to `approved` for the "may leave" decision | Timing test against the sweep job's own schedule, not just the state transition |
| CONTRACT-06 (daily batch) | Two participants' rows for the same area are never summed or merged, only marked `contested` | Client blocks day submission while any area is contested | Explicit test asserting summation never happens — this is CON-44's core guarantee, worth its own dedicated negative test |
| CONTRACT-07 (batch approval/dispute) | A late approval (< 3h before next start) is accepted but flagged, evaluated against `reviewedAt` not view-time | Client surfaces the flag correctly | Timing-boundary test at exactly 3h and just under |
| CONTRACT-08 (ticket assignment) | SLA deadline is carried down correctly | Client displays it; doesn't own the clock | Contract shape only — the clock itself is tested via COMP-11's job tests |
| CONTRACT-09 (inspection/ticket results) | `capturedAt` (device time) is what SLA calculations use, never sync time | Client always sends `capturedAt` even when syncing hours later | Test with a deliberately delayed sync — assert the SLA calculation uses the original capture time |
| CONTRACT-10 (suspension state) | Correct `suspended`/`asOf` returned | Client flags a stale cached value as stale in the UI, never silently treats it as current | Test the client's offline-fallback path explicitly, not just the online path |
| CONTRACT-11 (circuit registry) | Read-mostly reference data returned correctly | Client tolerates staleness per its documented "best-effort refresh" | Low priority — staleness is explicitly tolerable |
| CONTRACT-12 (notification events) | Every `eventCode` call site references a catalogued event | A lint-time (not runtime) check fails the build on an unregistered event | Static analysis, not a runtime test — matches §4's own note that this is "the real enforcement," not a test case per se |

---

## 6. Non-functional testing

All 15 NFRs from `09-architecture.md` §1. Test method chosen per NFR's own nature — most of R0's
NFRs are correctness-under-load-bearing-timing rather than classic performance/scale (that's mostly
R1+ territory, since R0 walks one deal, not 200 societies).

| NFR | Target | Test method | Tool | Pass threshold | Frequency |
|-----|--------|------------|------|----------------|-----------|
| NFR-01 (back-office availability) | 99.5% monthly | Uptime probe | External free-tier monitor | 99.5% rolling 30-day | Continuous, from first staging deploy |
| NFR-02 (portal availability) | 99% monthly | Same probe, portal route | Same | 99% rolling 30-day | Continuous |
| NFR-03 (financial durability) | RPO ≤15min, RTO ≤4h | Actual restore-and-verify drill | `pg_dump`/WAL restore against a scratch instance | Full restore completes within 4h, data loss window ≤15min | Quarterly, once production carries real data |
| NFR-04 (provenance completeness) | 100% of writes to the 6 financial tables carry provenance | Code-path test asserting no write bypasses the field set | Vitest, part of the standard suite | 0 bypassing write paths found | Every commit |
| NFR-05 (tenancy isolation) | 0 cross-society leaks | Automated probe hitting every Server Action/Route Handler with a foreign `societyId` | Vitest integration suite | 0 successful cross-tenant reads/writes | Every commit — this is the suite named throughout §3/§4 |
| NFR-06 (gate-pass timing) | Resolves to `provisional` within 60s of the 30-min mark | TC-CONTRACT-04-05 (§5) | Vitest with a mocked clock | 60s tolerance | Every commit touching the job runner |
| NFR-07 (SLA escalation accuracy) | Within 5min of deadline | Timing test against the sweep job | Vitest, mocked clock | 5min tolerance | Every commit touching COMP-11 |
| NFR-08 (suspension correctness) | 0 suspensions on stale payment data | TC-087-3 (§4) | Vitest | 0 violations, ever — any violation is P1 | Every commit |
| NFR-09 (field offline durability) | 0 loss across app close/restart, ≤7 days | IndexedDB persistence test | Playwright with simulated offline + reload | 0 data loss in test scenario | Before MS-03 ships (first field-client milestone) |
| NFR-10 (notification timeliness) | Send within 5min; bounce halts clock within 1h | Not exercised until R2 (notification group is R2-scheduled) | — | — | Deferred to R2's own test plan |
| NFR-11 (portfolio scale) | 200 societies, 800 meters, <1,000 concurrent | Load test against a seeded 200-society fixture | k6 or similar, run manually | Meets §6/§14 latency targets under load | Before GOAL-07 is declared reached — not an R0 gate |
| NFR-12 (field media throughput) | 40-photo upload over 3G-equivalent | Manual field test (ASSUM-26's own stated validation plan) | Real device, throttled network | Upload completes within one field session | Before MS-03/06 ship |
| NFR-13 (session boundaries) | Field 7-day, portal 90-day, admin 24h idle | Config review + expiry test | Vitest | Sessions expire at configured boundary, not before/after | MS-01/02 |
| NFR-14 (dashboard/chart latency) | p95 ≤2s / ≤1.5s | Not exercised until CAP-08 (portfolio dashboard) ships — R1, not R0 | — | — | Deferred to R1's own test plan |
| NFR-15 (no in-app tax computation) | 0 tax-rate constants in the codebase | Code review gate (grep for GST/tax-rate literals) | Manual, part of PR review | 0 matches | Every PR touching billing code |

**Two NFRs (NFR-10, NFR-14) are honestly deferred, not silently skipped** — both target components
(CAP-22 notifications, CAP-08 dashboard) aren't in R0's scope at all (`08-prioritization.md` §5.4),
so testing them now would be testing code that doesn't exist yet.

---

## 7. Invariant gates

Automated checks that block the pipeline. `00-intake.md` §4's nine invariants; two (INV-08 monitor-
only pump control, INV-04 explicit-period-selection) have no R0-relevant write path yet and are
noted as such rather than force-fit a gate onto code that isn't built.

| Invariant | Gate | Runs at | Blocks | Failure action |
|-----------|------|---------|--------|-----------------|
| INV-01 (no accidental admin) | Test asserting `Role` enum has no `admin` value and `AdminUser` is the only path to admin session | every build | merge | Fail build; this is a schema-level assertion, cheapest possible gate |
| INV-02 (savings traceability) | NFR-04's provenance-completeness test + TC-047-1-E2E | every build (unit) / every merge (e2e) | merge / release | Fail build on unit gate; block release on e2e gate |
| INV-03 (invoices never edited) | Test asserting no `UPDATE` statement targets a `released` `MonthlyCalculation`/`Invoice`/`SavingsReport` row — a static-analysis-style check on the query layer, not just a runtime assertion | every build | merge | Fail build |
| INV-05 (tenancy) | NFR-05's cross-society probe suite | every build | merge | Fail build; this is the single most safety-critical automated gate in the whole plan |
| INV-06 (loading/empty/error/degraded states) | Not automated for R0 — covered by manual/exploratory testing per screen (§1, §9) since it's a UI-completeness property more suited to review than assertion at this stage | pre-release | release | Manual sign-off, tracked per screen, not blocking every commit |
| INV-07 (rescale events are distinct, timestamped) | TC-041 (matrix, §3) — asserts a rescale writes a `BenchmarkRescaleEvent`, never conflated with a `DeviationReview` | every build | merge | Fail build |
| INV-09 (anomaly detection runs every month) | TC-045/046 (matrix) — asserts no month reaches `ready` state with unresolved anomalies or below CON-12's 20-day floor without explicit override | every build | merge | Fail build |
| INV-04 (explicit period selection) | No R0 write path touches this yet (document-period selection is R1+ document types) — noted, not gated | — | — | Revisit when the relevant feature ships |
| INV-08 (monitor-only pump hardware) | No R0 write path touches pump actuation at all (correctly — INV-08 forbids it existing) — the gate *is* the absence of an actuation endpoint, verified by code review that no such Route Handler exists, not a runtime test | every build (structural) | merge | Code review catches an actuation endpoint's mere existence as the violation, not its behavior |

---

## 8. Test environments & data

| Environment | Purpose | Data source | Refresh | Access | Constraints |
|-------------|---------|------------|---------|--------|-------------|
| Local dev | Unit + integration tests | Seeded fixtures (`prisma/seed.ts`-equivalent, rebuilt for the new schema) | On demand | Developer machine | None |
| CI (per-commit) | Unit + integration + contract tests | Fresh Postgres per run (containerized) | Every run | CI runner only | Must complete fast enough to not bottleneck the commit loop — target under 5 minutes for the full suite at R0's size |
| Staging | E2E, NFR, manual/exploratory, UAT | Seeded fixtures + real pilot-society data once UAT begins | Per milestone deploy | Yugesh, and the pilot society for UAT | Mirrors production shape per `11-development-plan.md` §6 |
| Production | Live | Real customer data | N/A | Restricted | No test data ever written here — a real, standing rule this plan should not need to restate but does, given the legacy Supabase project's RLS-off incident (`PROJECT_CONTEXT.md`) is a reminder of what happens when a boundary like this isn't actually enforced |

**Test data strategy:** fixture-based for unit/integration (deterministic, hand-built per test
case, per §4's examples), a seeded 200-society synthetic fixture for NFR-11's load testing (built
once, reused, not regenerated per run), and — where possible — a real (or realistic synthetic)
vendor CSV for MS-07's ingest tests, per `11-development-plan.md` §9's flagged external dependency.
No production data is ever copied into a test environment; the "Ecosystem mode" scale (200
societies, real committee PII) makes that a real privacy exposure, not just a hygiene preference.

**Simulators & rigs:** none needed — no hardware dependency (§2). The nearest analogue, a real
Android phone on a throttled connection for NFR-09/12, is a manual test procedure, not a simulator,
and its known fidelity gap is that a lab-throttled connection isn't identical to a real basement's
signal — worth remembering if a field-reported bug never reproduces in the lab test.

---

## 9. Release gates

Aligned to `11-development-plan.md` §3's 8 milestones — a milestone cannot be "done" (per its own
Definition of Done) while its gate fails.

| Gate | Milestone / release | Criteria | Owner | Waivable? |
|------|--------------------|----------|-------|-----------|
| Unit + integration green | every merge | 100% pass | CI | no |
| Invariant gates (§7) | every merge | 100% pass on the 7 automated gates | CI | no |
| Contract tests (§5) | every merge touching a contract | 100% pass | CI | no |
| Milestone e2e anchor | MS-02 through MS-08 | The milestone's own `+e2e` test (§4) passes | Yugesh | no |
| NFR verification | before production cutover | All R0-relevant NFRs (NFR-01–09, 11–13, 15; NFR-10/14 excluded, §6) met or waived in writing | Yugesh | with a written reason, recorded in this doc's next revision |
| Manual/exploratory pass | before production cutover | All 4 manual ACs (§3) reviewed and accepted | Yugesh | no |
| UAT | R0 release candidate | The pilot society's committee completes FLOW-16 (portal check) unaided and confirms the invoice/report are legible and correct | Pilot society | no — this is the actual point of R0 |

---

## 10. Defect management

| Severity | Definition | Response time | Blocks release? |
|----------|-----------|---------------|-----------------|
| S1 | Data loss, an invariant violation (§7), a security/tenancy breach, or a suspension firing on stale data | Immediate — stop and fix before continuing any other work | yes |
| S2 | A milestone's core flow broken with no workaround | Same session | yes |
| S3 | Degraded, workaround exists (e.g. a manual step covers a missing automation) | Next milestone | no |
| S4 | Cosmetic | Backlog | no |

**Triage process:** solo owner — every defect is triaged by Yugesh at discovery, since there's no
separate triage meeting to convene. The severity table above is what makes that triage consistent
across sessions rather than ad hoc.

**Flaky test policy:** quarantine immediately (mark `skip` with a linked issue), fix within the
same milestone the flake was found in — never retry-until-green, which the method correctly names
as training the practice to ignore failures. At this team's size, a flaky test is disproportionately
expensive (there's no one else to absorb the "just rerun it" tax), which is an argument for the
strict policy, not against it.

---

## 11. UAT plan

| Flow | Persona | Participants | Success criteria | Method |
|------|---------|-------------|------------------|--------|
| FLOW-16 (committee's monthly portal check) | PER-05 (society committee) | The pilot society's office-bearer and at least one committee member | Both log in unaided, find the savings report and invoice, and state in their own words that the number is defensible (JTBD-06) — the qualitative bar `09-architecture.md`'s own design-system decisions were built around | Guided but not scripted session, observed by Yugesh, on staging against real (not synthetic) figures for that society |
| FLOW-01→FLOW-10 (the whole R0 walk) | PER-01 (ops, i.e. Yugesh in this role) | Yugesh | The entire deal completes with zero manual arithmetic and zero step requiring a workaround outside the product | This is effectively R0's exit condition itself, walked end to end as the final acceptance step before production cutover |

**Why R0's UAT is this narrow:** R0 has exactly one real external user population (one pilot
society) and one internal operator (the product owner). A broader UAT program (multiple societies,
multiple ops staff) becomes meaningful at R1, which is explicitly about running the loop for a
second and third society — this plan doesn't invent UAT breadth R0's own scope doesn't support yet.

---

## 12. Out of scope for testing

| Area | Why | Accepted risk | Revisit at |
|------|-----|--------------|------------|
| R1–R3's 343 acceptance criteria | Not yet milestone-decomposed (`11-development-plan.md` §1) | None — these features aren't built yet either | When R1 is milestone-decomposed |
| NFR-10 (notification timeliness), NFR-14 (dashboard latency) | Target components (CAP-22, CAP-08) are R1/R2-scheduled, not R0 | None — nothing to test yet | R2 (NFR-10), R1 (NFR-14) |
| Hardware/device-in-the-loop testing | No hardware dependency in this product (§2) | None | If a future phase adds device telemetry (ASSUM-13's named future phase) |
| Load/scale testing beyond NFR-11's 200-society fixture | R0 operates one society; scale risk is real but not R0's risk | Accepted per `09-architecture.md` NFR-11's own note that this is a pre-GOAL-07 gate, not an R0 one | Before GOAL-07 (200 societies) is declared reached |
| Vendor meter API testing (FEAT-104/105/106) | Spike-gated on SPIKE-01, not built (§8 of `08-prioritization.md`) | None — code doesn't exist | If SPIKE-01 returns positive and the feature is scheduled |
| Penetration testing / formal security audit | Team size and current stage don't support a formal external audit yet; the threat model (`09-architecture.md` §6) is the interim control | Accepted, revisit before scaling past the pilot society, alongside SPIKE-02's DPDP review | Before R1, alongside SPIKE-02 |

---

## 13. Backlog enrichment

`docs/backlog.yaml` updated in the same change as this document:
- Every R0 acceptance criterion (210 of 210) now carries its `tests:` array — a real `TC-` id
  (and, for the 7 milestone anchors, an additional `-E2E` id) instead of an empty list.
- Validator re-run with `--check-coverage`: **210/553 AC test coverage (37% system-wide, 100% of
  R0)** — one new, expected error class ("343 acceptance criteria have no test cases") joins the
  existing 15, all R1–R3, all explained in §3's "Uncovered acceptance criteria." **16 errors / 263
  warnings** is this document's baseline going forward, same documented/accepted discipline as
  every prior phase.

---

## Exit criteria check

- Traceability matrix covers every AC in the near-term release (R0: 210/210), and lists the R1–R3
  gap explicitly with a plan — §3.
- Every R0-relevant NFR has a verification method and pass threshold; the two that aren't (NFR-10,
  NFR-14) are named and dated for when they will be — §6.
- Every invariant has an automated gate, except two with no R0 write path yet, explicitly noted
  rather than force-fit — §7.
- Release gates align with `11-development-plan.md`'s milestone exit criteria — §9, one row per
  milestone-relevant gate.
- Defect severity definitions agreed — §10.
- `docs/backlog.yaml` passes `--check-coverage` in the sense that matters: 100% of the near-term
  release is covered, and the gap is a documented, expected state, not a validator failure nobody
  looked at — §13.
- **User approval: granted 2026-08-14**, after a full review pass across the whole blueprint. One
  real defect surfaced and fixed by that review: TC-048-1 (§4) had the CON-11 revenue-share split
  inverted — computing FirsThing's fee at 58% (the society's share) instead of 42% — the exact
  same class of error `05-screens/README.md` §6 already caught once in a mockup deck. Corrected to
  1,142.40 (2,720×42%), with a note added on why the split *direction* is worth asserting on its
  own, not just the arithmetic.
