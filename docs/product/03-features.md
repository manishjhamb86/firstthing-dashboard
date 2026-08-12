# Feature Definition
**Product:** FirsThing Platform · **Phase:** 3 — Feature Definition · **Status:** Approved
**Last updated:** 2026-08-12 (gate review: 12 open items resolved; FEAT-032/FEAT-052 rewritten after CON-24/CON-25 were corrected. **Post-gate audit sweep, same day:** CON-11's per-light-type metering and per-circuit tolerance bands applied across CAP-01/02/04/05; CAP-22 notifications added (FEAT-090..093); CAP-02's no-demo variant given its own brief (FEAT-094). **Phase 4 feedback, 2026-08-12:** the flow mapping in `04-flows-system-map.md` exposed 9 missing features, added here as FEAT-095..103) · **Mode:** Ecosystem

---

## 1. Capability map

Original 14 capabilities, plus 7 new ones and 3 refinements discovered from the full lead-to-cash
narrative (2026-08-10), plus CAP-22 (notifications) added by the post-gate audit. All 22 are
expanded into feature briefs (FEAT-001 … FEAT-103) in §3, walked through one capability at a time
in pipeline order per the skill's method.

**Numbering note:** FEAT-001..089 are grouped by capability in pipeline order. Everything from
FEAT-090 onward was added later and therefore sits at the end rather than inside its capability's
block — FEAT-090..093 (CAP-22) and FEAT-094 (CAP-02) came from the post-gate audit; FEAT-095..103
came from Phase 4's flow mapping, which is *expected* to expose missing features and did (nine,
almost all connective tissue between capabilities rather than gaps inside one). Renumbering the
existing briefs to preserve grouping would break every cross-reference here for no real gain.

| ID | Capability | Serves | Owner surface | Consumer surface(s) | Shared contract? | Status |
|----|-----------|--------|---------------|---------------------|-------------------|--------|
| CAP-15 | Sales lead & demo request (first meeting, proposal, demo agreement) | new — sales pipeline | SUR-01 | — | no | expanded (FEAT-001..004) |
| CAP-16 | Site survey & circuit selection (CON-16 demo-circuit criteria) **+ full society/equipment profile audit (CON-28, corrected 2026-08-10)** — society governance profile, whole-society lighting inventory by area, exhaustive per-unit pump-room equipment audit with photos, historical logbook capture. Much larger than originally scoped | new | SUR-02 (field officer) | SUR-01 (backend confirms; feeds CAP-06's cross-sell projection, CON-29) | yes | expanded (FEAT-005..010) |
| CAP-02 | Benchmark commissioning — **now much larger**: meter install + load validation (CON-17), gate pass (CON-18), 5+5-day anomaly-gated monitoring (CON-19), demo success threshold (CON-20, resolved — ASSUM-19 validated). **Two variants (Phase 3 gate, 2026-08-12):** the full demo commissioning above, and a **no-demo variant** for CON-25 deals — meter install + load validation only, with the first full post-install month becoming the reference consumption level instead of pre/post 5-day windows — **given its own brief FEAT-094 by the post-gate audit**, since the behaviour previously lived only inside FEAT-052, a *billing* feature. **Also widened by CON-11's correction:** commissioning now runs per light type, so a society has several circuits to commission, not one | JTBD-05 | SUR-02 | SUR-01 (ops sees result) | yes | expanded (FEAT-011..015, 094) |
| CAP-17 | Field visit scheduling & coordination (reusable: demo-install and full-install scheduling; accept/reschedule/24h-lockout/escalation pattern) | new | SUR-01 (backend coordinates) | SUR-02 (field team responds) | yes | expanded (FEAT-016..019) |
| CAP-18 | Demo savings report generation & query resolution (auto-generated after valid window, backend review/edit, share via WhatsApp/email, society views in-app) | new | SUR-01 | SUR-01 (customer portal) | no | expanded (FEAT-020..023) |
| CAP-19 | Document collection / KYC (GST doc, electricity bill — uploaded by society or entered by backend if received via call/WhatsApp) | new | SUR-01 | SUR-01 (customer portal upload) | no | expanded (FEAT-024..026) |
| CAP-20 | Offer & agreement lifecycle (offer generation from demo numbers, accept/counter/reject negotiation, print/notarize, field-executive delivery/pickup logistics, per-step follow-up & lead-health tracking — CON-23) | new | SUR-01 | SUR-01 (customer sees offer/status) | no | expanded (FEAT-027..032) |
| CAP-21 | Full installation execution & batch tracking (per-role dashboards, daily review gate CON-21, blockers, requirement changes, completion certificate) | new | SUR-01 + SUR-02 (shared live state) | both | yes | expanded (FEAT-033..038) |
| CAP-01 | Circuit & service-line data model (lighting + pumps built; solar/wastewater modeled-only) | GOAL-03 | SUR-01 | SUR-02 | yes | expanded (FEAT-039..042) |
| CAP-03 | Meter reading ingest & validation. **Extended 2026-08-12 (user):** two ingest paths, not one — the manual monthly CSV (CON-30) *plus* a scheduled vendor-API fetch with permission-gated on-demand refresh and three-way ingest-health alerting (CON-43, FEAT-104/105/106). **Confirmed 2026-08-10 (CON-30):** CSV downloaded directly from the meter vendor's app (per circuit, not per society), format varies by vendor, AI-assisted normalization (same pattern as Gemini invoice extraction) with clarifying questions on ambiguous shape, raw file + normalized readings both persisted. Plus missing-day handling (CON-12), upload-time anomaly detection (INV-09) | JTBD-01 | SUR-01 | — | no | expanded (FEAT-043..047) |
| CAP-04 | Billing & savings calculation engine (extrapolation, fixed-fee model, tolerance band, light-count rescale, partial-month proration CON-22). **Confirmed 2026-08-10 (CON-33):** savings calc runs automatically once data's validated; the formal invoice is generated in **Zoho** (external), aspirational API integration, manual upload fallback (existing `/admin/invoices` flow); savings report is native to the app; accountant review gate before sending | JTBD-01 | SUR-01 | SUR-01 (customer portal) | no | expanded (FEAT-048..054) |
| CAP-05 | Deviation review & billing decisions. **Confirmed 2026-08-10 (CON-31):** chart-first initial view → assign to inspector → inspector investigates/resolves → ops records root cause + decision → resolved-and-closed, or escalated to **management** for a benchmark/billing adjustment call if unresolved | JTBD-02 | SUR-01 | SUR-02 (inspector dispatched) | yes | expanded (FEAT-055..058) |
| CAP-06 | Invoice & savings report generation (recurring monthly — distinct from CAP-18's one-time demo report) + cross-sell projection (CON-29) | JTBD-01, JTBD-06 | SUR-01 | SUR-01 (customer portal) | no | expanded (FEAT-059..061) |
| CAP-07 | Contract & agreement management (terms, tolerance%, revenue-share%, exclusions, AMC, termination) | JTBD-06 | SUR-01 | SUR-01 (read-only committee view) | no | expanded (FEAT-062..065) |
| CAP-08 | Portfolio monitoring dashboard (GOAL-08, GOAL-05). **Confirmed 2026-08-10, two views:** (1) an ops home — priority task queue (status/priority/on-time-or-delayed/escalation level, aggregating tickets CON-27, deviation reviews, pipeline follow-ups CON-23) at top, then society list with status chips (on-track/approaching-tolerance/breached), drilling down society→circuit/module; (2) a separate business-wide analytics/stats view | GOAL-08, GOAL-05 | SUR-01 | — | no | expanded (FEAT-066..069) |
| CAP-09 | Ticketing (ops-triaged, inspector-assigned, SLA'd — CON-27). **Confirmed 2026-08-10:** tickets can originate directly from the society (either committee or manager — not just the manager per ASSUM-11's general split) — faulty/non-working equipment, spare stock exhausted before a scheduled visit, or any other issue needing an inspector — not only from an inspector's own findings | JTBD-07 | SUR-01 | SUR-02 (inspector's task list) | yes | expanded (FEAT-070..074) |
| CAP-10 | Spare-light/hardware inventory (inspector as system of record) | CON-08 | SUR-02 | SUR-01 (ops rollup) | yes | expanded (FEAT-075..077) |
| CAP-11 | Field inspection (recurring visits, fault logging — the Supabase cutover target) | JTBD-04 | SUR-02 | SUR-01 (inspection reports) | yes | expanded (FEAT-078..080) |
| CAP-12 | Customer support & communication log. **Confirmed 2026-08-10 (CON-32):** each new call/message logged as its own thread, follow-ups append to the same thread, open→close lifecycle with escalation to senior management on non-responsiveness from either side — likely shares its state-machine shape with CAP-09's ticketing, not a separate pattern | JTBD-03 | SUR-01 | — | no | expanded (FEAT-081..084) |
| CAP-13 | Society & account management (society/user CRUD, non-payment suspension CON-13) | — | SUR-01 | all internal roles | no | expanded (FEAT-085..087) |
| CAP-14 | Society-facing portal (committee + manager dashboards). **Confirmed 2026-08-10:** maximal visibility as a principle — cumulative savings, bill/payment status, active tickets, contract summary together, not a stripped-down view; ticket raising/tracking/resolution-timeliness available to either role | JTBD-06, JTBD-07 | SUR-01 | — | no | expanded (FEAT-088..089) |
| CAP-22 | **Notifications (added by the post-gate audit, 2026-08-12 — CON-39).** 21 feature briefs across this document say a party "is notified" with no capability owning the mechanism. One notification service: a typed event catalogue, templates, recipient resolution, and an auditable delivery log. **Email is the only wired channel at launch**; WhatsApp and in-app are named later additions | CON-39, and indirectly every capability that notifies | SUR-01 | SUR-01 (customer), SUR-02 | yes | expanded (FEAT-090..093) |

**Cross-cutting, not a numbered capability:** the gate-pass/field-document pattern (CON-18) — an
itemized list, physically signed, photographed, re-entered as a structured form, backend-approval-
gates-departure — recurs across CAP-02, CAP-21, and possibly CAP-20 (signed agreement handoffs).
Will be written up once in §5 (Cross-cutting requirements) rather than duplicated per capability.

## 2. Feature index

| ID | Feature | Capability | Persona | Serves | Surface | Size | Status |
|----|---------|-----------|---------|--------|---------|------|--------|
| FEAT-001 | Log a new lead | CAP-15 | PER-07 | JTBD-08 | SUR-01 | S | proposed |
| FEAT-002 | Create/edit a demo proposal | CAP-15 | PER-07 | JTBD-08 | SUR-01 | M | proposed |
| FEAT-003 | Backend-entered lead/proposal review & approval | CAP-15 | PER-07, PER-01 | JTBD-08 | SUR-01 | S | proposed |
| FEAT-004 | Lead pipeline list & status view | CAP-15 | PER-07, PER-01 | JTBD-08, GOAL-05 | SUR-01 | M | proposed |
| FEAT-005 | Society profile & governance capture | CAP-16 | PER-04 | GOAL-03 | SUR-02 | S | proposed |
| FEAT-006 | Whole-society lighting inventory by area | CAP-16 | PER-04 | GOAL-03, CON-29 | SUR-02 | S | proposed |
| FEAT-007 | Demo-circuit selection & eligibility checklist | CAP-16 | PER-04, PER-01 | JTBD-05, GOAL-06 | SUR-02 | M | proposed |
| FEAT-008 | Pump-room equipment audit | CAP-16 | PER-04 | CON-29, GOAL-03 | SUR-02 | L | proposed |
| FEAT-009 | Historical consumption logbook capture | CAP-16 | PER-04 | CON-29 | SUR-02 | S | proposed |
| FEAT-010 | Survey review & backend confirmation | CAP-16 | PER-01, PER-04 | GOAL-06 | SUR-01, SUR-02 | M | proposed |
| FEAT-011 | Meter installation & load validation | CAP-02 | PER-04, PER-01 | JTBD-05 | SUR-02 | M | proposed |
| FEAT-012 | Pre-install baseline monitoring window | CAP-02 | PER-04, PER-01 | JTBD-05 | SUR-02, SUR-01 | M | proposed |
| FEAT-013 | Light replacement / demo installation | CAP-02 | PER-04 | JTBD-05 | SUR-02 | S | proposed |
| FEAT-014 | Post-install monitoring window & benchmark computation | CAP-02 | PER-04, PER-01 | JTBD-05, GOAL-06 | SUR-02, SUR-01 | L | proposed |
| FEAT-015 | Out-of-range demo result review | CAP-02 | PER-01 | JTBD-05, GOAL-06 | SUR-01 | S | proposed |
| FEAT-016 | Schedule a field visit | CAP-17 | PER-01 | GOAL-05 | SUR-01 | M | proposed |
| FEAT-017 | Field-team visit response (accept / reschedule) | CAP-17 | PER-03, PER-04 | JTBD-04 | SUR-02 | M | proposed |
| FEAT-018 | Visit non-response & reschedule escalation | CAP-17 | PER-01 | GOAL-05 | SUR-01 | S | proposed |
| FEAT-019 | Field visit schedule & assignment view | CAP-17 | PER-01, PER-03, PER-04 | JTBD-04, GOAL-05 | SUR-01, SUR-02 | M | proposed |
| FEAT-020 | Auto-generate the demo savings report | CAP-18 | PER-01 | GOAL-06, JTBD-05 | SUR-01 | M | proposed |
| FEAT-021 | Demo report review & edit | CAP-18 | PER-01 | GOAL-06 | SUR-01 | M | proposed |
| FEAT-022 | Share the demo report & track delivery | CAP-18 | PER-01 | GOAL-01, JTBD-08 | SUR-01 | S | proposed |
| FEAT-023 | Society view of the demo report & query raising | CAP-18 | PER-05, PER-06 | JTBD-06 | SUR-01 (customer) | M | proposed |
| FEAT-024 | Request & track required KYC documents | CAP-19 | PER-01 | GOAL-05 | SUR-01 | S | proposed |
| FEAT-025 | Society-side document upload | CAP-19 | PER-05, PER-06 | JTBD-06 | SUR-01 (customer) | S | proposed |
| FEAT-026 | Backend document entry & verification | CAP-19 | PER-01 | GOAL-06 | SUR-01 | S | proposed |
| FEAT-027 | Generate an offer from demo numbers | CAP-20 | PER-01, PER-07 | JTBD-08, GOAL-06 | SUR-01 | M | proposed |
| FEAT-028 | Offer negotiation (accept / counter / reject) | CAP-20 | PER-07, PER-05 | JTBD-08 | SUR-01 | M | proposed |
| FEAT-029 | Agreement preparation, print & notarization | CAP-20 | PER-01 | JTBD-08 | SUR-01 | M | proposed |
| FEAT-030 | Field handoff tracking (physical document logistics) | CAP-20 | PER-01, PER-03, PER-04 | GOAL-05 | SUR-02, SUR-01 | M | proposed |
| FEAT-031 | Follow-up logging & lead-health signal | CAP-20 | PER-01, PER-07 | GOAL-05 | SUR-01 | M | proposed |
| FEAT-032 | Demo-skip exception | CAP-20 | PER-01 (management) | GOAL-03 | SUR-01 | S | proposed |
| FEAT-033 | Installation project setup & batch plan | CAP-21 | PER-01 | GOAL-05 | SUR-01 | M | proposed |
| FEAT-034 | Daily installation batch logging | CAP-21 | PER-04 | GOAL-05 | SUR-02 | M | proposed |
| FEAT-035 | Society daily review & approval gate | CAP-21 | PER-05, PER-06 | JTBD-06 | SUR-01 (customer) | L | proposed |
| FEAT-036 | Installation blockers & requirement changes | CAP-21 | PER-04, PER-01 | GOAL-05 | SUR-02, SUR-01 | M | proposed |
| FEAT-037 | Completion certificate & billing start | CAP-21 | PER-01, PER-05 | GOAL-01 | SUR-01 | M | proposed |
| FEAT-038 | Per-role installation progress dashboards | CAP-21 | PER-01, PER-04, PER-05 | GOAL-05, JTBD-06 | SUR-01, SUR-02 | M | proposed |
| FEAT-039 | Service-line registry & society enrollment | CAP-01 | PER-01 | GOAL-03, GOAL-07 | SUR-01 | M | proposed |
| FEAT-040 | Circuit registry & configuration | CAP-01 | PER-01, PER-04 | GOAL-03, GOAL-06 | SUR-01, SUR-02 | M | proposed |
| FEAT-041 | Light-count change & benchmark rescale | CAP-01 | PER-01 | GOAL-06 | SUR-01 | M | proposed |
| FEAT-042 | Pump asset model & monitor-only telemetry | CAP-01 | PER-01, PER-04 | GOAL-03 | SUR-01 | M | proposed |
| FEAT-043 | Meter CSV upload & AI-assisted normalization | CAP-03 | PER-01 | JTBD-01 | SUR-01 | L | proposed |
| FEAT-044 | Ingest clarification & mapping confirmation | CAP-03 | PER-01 | JTBD-01 | SUR-01 | M | proposed |
| FEAT-045 | Upload-time anomaly detection | CAP-03 | PER-01 | GOAL-01, INV-09 | SUR-01 | M | proposed |
| FEAT-046 | Reading aggregation & missing-day handling | CAP-03 | PER-01 | JTBD-01, GOAL-06 | SUR-01 | M | proposed |
| FEAT-047 | Reading history & raw-file archive | CAP-03 | PER-01 | GOAL-06 | SUR-01 | S | proposed |
| FEAT-048 | Monthly savings calculation run | CAP-04 | PER-01 | JTBD-01, GOAL-01 | SUR-01 | L | proposed |
| FEAT-049 | Tolerance-band compliance check | CAP-04 | PER-01 | GOAL-01, JTBD-02 | SUR-01 | M | proposed |
| FEAT-050 | Billing adjustment application | CAP-04 | PER-01 | GOAL-01, JTBD-02 | SUR-01 | M | proposed |
| FEAT-051 | Partial-month proration | CAP-04 | PER-01 | GOAL-01 | SUR-01 | S | proposed |
| FEAT-052 | Agreed-benchmark billing with first-month reference (demo-skip path) | CAP-04 | PER-01 | GOAL-01 | SUR-01 | M | proposed |
| FEAT-053 | Zoho invoice handoff & manual invoice upload | CAP-04 | PER-01 | JTBD-01 | SUR-01 | M | proposed |
| FEAT-054 | Accountant review & release gate | CAP-04 | PER-08 | GOAL-01, GOAL-06 | SUR-01 | M | proposed |
| FEAT-055 | Deviation chart & initial findings | CAP-05 | PER-01 | JTBD-02 | SUR-01 | M | proposed |
| FEAT-056 | Assign a deviation for field investigation | CAP-05 | PER-01, PER-03 | JTBD-02, JTBD-04 | SUR-01, SUR-02 | M | proposed |
| FEAT-057 | Root-cause classification & decision record | CAP-05 | PER-01 | JTBD-02, GOAL-06 | SUR-01 | M | proposed |
| FEAT-058 | Management escalation for unresolved deviations | CAP-05 | management | JTBD-02 | SUR-01 | M | proposed |
| FEAT-059 | Monthly savings report generation | CAP-06 | PER-01 | JTBD-01, JTBD-06, GOAL-06 | SUR-01 | L | proposed |
| FEAT-060 | Savings report delivery & society view | CAP-06 | PER-01, PER-05, PER-06 | JTBD-06 | SUR-01 | M | proposed |
| FEAT-061 | Cross-sell savings projection | CAP-06 | PER-07, PER-01 | JTBD-08, GOAL-02 | SUR-01 | M | proposed |
| FEAT-062 | Contract record & versioned terms | CAP-07 | PER-01 | GOAL-06, JTBD-01 | SUR-01 | L | proposed |
| FEAT-063 | Term end, ownership transfer & AMC | CAP-07 | PER-01 | JTBD-06 | SUR-01 | M | proposed |
| FEAT-064 | Contract amendments & termination | CAP-07 | PER-01 (management) | GOAL-06 | SUR-01 | M | proposed |
| FEAT-065 | Society read-only contract view | CAP-07 | PER-05, PER-06 | JTBD-06 | SUR-01 (customer) | S | proposed |
| FEAT-066 | Ops home priority task queue | CAP-08 | PER-01 | GOAL-05 | SUR-01 | L | proposed |
| FEAT-067 | Society status list & drill-down | CAP-08 | PER-01 | GOAL-08, GOAL-05 | SUR-01 | M | proposed |
| FEAT-068 | Per-circuit consumption-vs-benchmark monitoring | CAP-08 | PER-01 | GOAL-08, GOAL-06 | SUR-01 | L | proposed |
| FEAT-069 | Business analytics & portfolio stats | CAP-08 | management, PER-01 | GOAL-05, GOAL-07 | SUR-01 | M | proposed |
| FEAT-070 | Raise a ticket | CAP-09 | PER-05, PER-06, PER-03, PER-01 | JTBD-07 | SUR-01, SUR-02 | M | proposed |
| FEAT-071 | Ticket acknowledgement & triage | CAP-09 | PER-01, PER-02 | JTBD-07 | SUR-01 | M | proposed |
| FEAT-072 | Field resolution of a ticket | CAP-09 | PER-03 | JTBD-04, JTBD-07 | SUR-02 | M | proposed |
| FEAT-073 | Sub-task spin-off for unresolved tickets | CAP-09 | PER-01, PER-03 | JTBD-07 | SUR-01, SUR-02 | M | proposed |
| FEAT-074 | SLA tracking & management escalation | CAP-09 | PER-01, management | GOAL-05 | SUR-01 | M | proposed |
| FEAT-075 | Per-society spare stock ledger | CAP-10 | PER-03, PER-01 | CON-08, CON-15 | SUR-02, SUR-01 | M | proposed |
| FEAT-076 | Spare consumption & replenishment | CAP-10 | PER-03, PER-01 | JTBD-04 | SUR-02, SUR-01 | M | proposed |
| FEAT-077 | FirsThing-owned hardware asset register | CAP-10 | PER-01 | CON-08 | SUR-01 | M | proposed |
| FEAT-078 | Routine inspection checklist | CAP-11 | PER-03 | JTBD-04 | SUR-02 | L | proposed |
| FEAT-079 | Fault logging & ticket spin-off | CAP-11 | PER-03 | JTBD-04, JTBD-07 | SUR-02 | M | proposed |
| FEAT-080 | Inspection report & history | CAP-11 | PER-01, PER-05, PER-06 | JTBD-06, GOAL-05 | SUR-01 | M | proposed |
| FEAT-081 | Log a support thread | CAP-12 | PER-02 | JTBD-03 | SUR-01 | M | proposed |
| FEAT-082 | Thread follow-ups & resolution | CAP-12 | PER-02 | JTBD-03 | SUR-01 | M | proposed |
| FEAT-083 | Support thread escalation on non-response | CAP-12 | PER-02, management | JTBD-03 | SUR-01 | S | proposed |
| FEAT-084 | Society context view for support | CAP-12 | PER-02 | JTBD-03 | SUR-01 | M | proposed |
| FEAT-085 | Society record & lifecycle management | CAP-13 | PER-01 | GOAL-02 | SUR-01 | M | proposed |
| FEAT-086 | User accounts, roles & permissions | CAP-13 | PER-01 (management) | GOAL-02 | SUR-01 | M | proposed |
| FEAT-087 | Payment tracking & automatic suspension | CAP-13 | PER-01 | GOAL-01 | SUR-01 | L | proposed |
| FEAT-088 | Society portal home & savings view | CAP-14 | PER-05, PER-06 | JTBD-06 | SUR-01 (customer) | L | proposed |
| FEAT-089 | Society ticket raising & resolution tracking | CAP-14 | PER-05, PER-06 | JTBD-07 | SUR-01 (customer) | M | proposed |
| FEAT-090 | Notification event catalogue & templates | CAP-22 | PER-01 | CON-39 | SUR-01 | M | proposed |
| FEAT-091 | Email delivery & delivery log | CAP-22 | system | CON-39, GOAL-06 | SUR-01 | M | proposed |
| FEAT-092 | Recipient resolution & society contact directory | CAP-22 | PER-01 | CON-39 | SUR-01 | S | proposed |
| FEAT-093 | Notification history & manual resend | CAP-22 | PER-01, PER-02 | CON-39, JTBD-03 | SUR-01 | S | proposed |
| FEAT-094 | No-demo commissioning variant | CAP-02 | PER-04, PER-01 | JTBD-05 | SUR-02 | M | proposed |
| FEAT-095 | Deal outcome & re-engagement | CAP-20 | PER-07 | JTBD-08 | SUR-01 | S | proposed (Phase 4) |
| FEAT-096 | Site-access coordination | CAP-17 | PER-01, PER-03/04 | JTBD-04 | SUR-01, SUR-02 | S | proposed (Phase 4) |
| FEAT-097 | Provisional gate-pass release | CAP-02 | PER-04, PER-01 | CON-40 | SUR-02 | M | proposed (Phase 4) |
| FEAT-098 | Prospect-to-customer account conversion | CAP-13 | system, PER-01 | CON-34, GOAL-02 | SUR-01 | S | proposed (Phase 4) |
| FEAT-099 | Bulk multi-circuit reading upload | CAP-03 | PER-01 | JTBD-01, GOAL-07 | SUR-01 | M | proposed (Phase 4) |
| FEAT-100 | Month-close readiness board | CAP-04 | PER-01 | JTBD-01, GOAL-01 | SUR-01 | M | proposed (Phase 4) |
| FEAT-101 | Invoice-to-calculation reconciliation | CAP-04 | PER-01, PER-08 | GOAL-01, GOAL-06 | SUR-01 | S | proposed (Phase 4) |
| FEAT-102 | Billing dispute record & arrears visibility | CAP-13 | PER-05, PER-01 | CON-41 | SUR-01 | M | proposed (Phase 4) |
| FEAT-103 | Term-end hardware ownership transfer | CAP-07 | PER-01 | CON-15 | SUR-01 | M | proposed (Phase 4, v2 horizon) |
| FEAT-104 | Scheduled vendor API reading fetch | CAP-03 | system | JTBD-01 | — | L | proposed |
| FEAT-105 | On-demand reading refresh (permission-gated) | CAP-03 | PER-01 | JTBD-01 | SUR-01 | M | proposed |
| FEAT-106 | Ingest health monitoring & alerting | CAP-03 | PER-01 | GOAL-01, INV-09 | SUR-01 | M | proposed |

## 3. Feature briefs

### FEAT-001 — Log a new lead
- **Capability:** CAP-15 · **Persona:** PER-07 (Sales/BD), PER-01 (backend, on PER-07's behalf) · **Serves:** JTBD-08
- **Surface(s):** SUR-01 (web, admin — a Sales/BD-scoped view)
- **Problem:** Today a first meeting with a prospective society leaves no system record at all — status lives in someone's memory or a chat thread.
- **Description:** Sales/BD (or backend on their behalf) logs a new lead after a first meeting: society name/location, contact person, meeting date, notes, and which service line(s) (SVC-01..04) the conversation covered. This is the first event in that (society, service line)'s pipeline (CON-24) — creates the `Pipeline` record at its earliest stage.
- **Behavioral rules:** A society may not exist as a `Society` record yet at this point (pre-agreement) — this feature must support a lightweight/unconfirmed society reference, not require a full `Society` row (which CAP-13 governs). One `Pipeline` record is created per (prospective society, service line) — logging a lead for both Lighting and Pumps in the same meeting creates two Pipeline records, per CON-24. A record entered by backend (PER-01) on Sales/BD's behalf is created in a `draft` sub-state requiring PER-07 approval (FEAT-003) before it's authoritative.
- **Acceptance criteria:**
  - AC-1 (happy, self-logged): Given PER-07 is logged in, when they submit a new lead with society name, contact, meeting date, and service line, then a `Pipeline` record is created at stage `lead`, marked authoritative immediately (no approval needed for self-logged entries).
  - AC-2 (happy, backend-logged): Given PER-01 logs a lead on PER-07's behalf, when submitted, then the `Pipeline` record is created at stage `lead` in a `pending-approval` sub-state, and PER-07 is notified.
  - AC-3 (empty/first-run): Given no leads have ever been logged, when PER-07 opens the lead list, then an empty state explains how to log the first one.
  - AC-4 (failure): Given a required field (society name, service line) is missing, when the form is submitted, then it's rejected with a field-level error and no `Pipeline` record is created.
  - AC-5 (permission): Given a user without PER-07 or PER-01's role attempts to log a lead, then the action is unavailable/denied server-side, not just hidden in the UI.
- **Permissions:** PER-07 (full), PER-01 (create only, on-behalf, requires PER-07 approval to become authoritative).
- **Data touched:** Creates `Pipeline` (society ref, service line, stage=`lead`), `LeadMeetingNote`.
- **Triggers:** Manual, after a real first meeting.
- **Emits:** `LeadLogged` event.
- **Consumes:** none.
- **Depends on:** none (this is the pipeline's entry point).
- **Depended on by:** FEAT-002 (proposal), FEAT-004 (list view), ultimately CAP-16 (survey) once a demo is agreed.
- **Failure modes:** Duplicate lead for the same society+service line logged twice — not blocked automatically (a legitimate re-approach after an earlier lead went cold is valid), but the list view (FEAT-004) must surface prior leads for the same society prominently so it's not silently duplicated by accident.
- **Limits & scale:** Trivial volume (tens of leads/month at current scale, per 00-intake.md §7).
- **Minimum viable version:** Self-logged only, no backend-on-behalf/approval flow.
- **Complete version:** Adds backend-on-behalf logging + approval (FEAT-003).
- **Open questions / assumptions:** ASSUM-20 (PER-07's technical level/abandonment triggers unconfirmed) — low impact on this feature's spec.
- **Risks:** If backend ends up doing all the logging in practice (PER-07 solo, busy) and approvals are treated as a rubber stamp, the "self-logs ideally" goal (this phase, 2026-08-10) quietly fails — worth watching, not a build blocker.

### FEAT-002 — Create/edit a demo proposal
- **Capability:** CAP-15 · **Persona:** PER-07 · **Serves:** JTBD-08
- **Surface(s):** SUR-01
- **Problem:** After a lead is logged, there's no structured way to capture "we proposed a demo" or track whether the society agreed.
- **Description:** From an existing lead-stage `Pipeline` record, Sales/BD creates a proposal: a summary of what was pitched and a demo request outcome (agreed / declined / undecided). Agreement advances the `Pipeline` to stage `survey-pending`, handing off to CAP-16.
- **Behavioral rules:** A proposal cannot be created without an existing lead record (FEAT-001) for that (society, service line) pair. "Declined" closes the `Pipeline` (a terminal state, distinct from any later re-opened lead). Per CON-24 (corrected at the Phase 3 gate), the demo is the **only** stage that may be skipped, and only by management at the society's explicit request — that's a `Pipeline`-level flag this feature reads but does not set (FEAT-032). The survey is mandatory and always follows a proposal, skip or no skip.
- **Acceptance criteria:**
  - AC-1 (happy): Given a lead-stage `Pipeline` exists, when PER-07 records the proposal outcome as "agreed," then the `Pipeline` advances to `survey-pending` and CAP-16 can now be started against it.
  - AC-2 (empty/first-run): Given a lead has no proposal yet, when PER-07 opens it, then the proposal form is empty and clearly prompts for an outcome.
  - AC-3 (failure): Given the outcome is "declined," when saved, then the `Pipeline` is marked closed/lost with a reason field, and no further CAP-16+ action is possible against it without explicitly reopening as a new lead.
  - AC-4 (permission): Given a user other than PER-07 (or PER-01 acting on their behalf, per FEAT-001's pattern) attempts this, then denied server-side.
  - AC-5 (edge): Given the demo is marked skipped for this society (FEAT-032), when the proposal is marked "agreed," then the `Pipeline` still advances to `survey-pending` — the survey is never skipped (CON-24) — and it is the *post-survey* branch that differs, going to KYC/offer rather than to demo commissioning.
- **Permissions:** PER-07 (full), PER-01 (on-behalf, same approval pattern as FEAT-001).
- **Data touched:** Updates `Pipeline` (stage, proposal outcome, decline reason if applicable).
- **Triggers:** Manual, after the proposal conversation happens.
- **Emits:** `DemoAgreed` / `LeadClosed` events.
- **Consumes:** `LeadLogged` (must exist first).
- **Depends on:** FEAT-001.
- **Depended on by:** CAP-16 (site survey) always starts from `DemoAgreed` — including on the demo-skip path; CAP-20 (offer/agreement) follows the survey directly when the demo is skipped (CON-24/25).
- **Failure modes:** n/a beyond standard validation.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Binary agreed/declined, no undecided/nurture state.
- **Complete version:** Adds "undecided" with a follow-up reminder (mirrors CON-23's follow-up tracking pattern from later pipeline stages).
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-003 — Backend-entered lead/proposal review & approval
- **Capability:** CAP-15 · **Persona:** PER-07 · **Serves:** JTBD-08
- **Surface(s):** SUR-01
- **Problem:** Today, PER-01/backend can log on PER-07's behalf (confirmed this phase) — without a review step, "ideally self-logged" degrades silently into "backend logs everything, PER-07 never checks."
- **Description:** A queue of backend-entered lead/proposal records awaiting PER-07's approval. Approving makes the record authoritative; PER-07 can also edit before approving.
- **Behavioral rules:** The audit trail permanently retains **who entered** the record separately from **who approved** it, even though an approved record is operationally indistinguishable from a self-logged one — that separation is the entire point, since without it "ideally self-logged" degrades invisibly into "backend logs everything." Approval belongs to PER-07 alone and can never be self-served by the person who entered it, or the review step is theatre. A record awaiting approval is still a real lead: it counts in pipeline totals, flagged as unapproved, rather than being hidden until someone signs off — a review queue must not be a place leads go to disappear.
- **Acceptance criteria:**
  - AC-1 (happy): Given a backend-entered lead in `pending-approval`, when PER-07 approves it, then it becomes authoritative and is indistinguishable from a self-logged record going forward except in its audit trail (which always retains who actually entered it).
  - AC-2 (empty): Given no records are pending approval, when PER-07 opens the queue, then it shows a clear "all caught up" empty state, not a blank table.
  - AC-3 (failure/edit): Given PER-07 finds an error in a backend-entered record, when they edit and then approve, then the corrected version is what becomes authoritative, and the original backend entry is retained in the audit trail, not silently overwritten.
  - AC-4 (permission): Given a non-PER-07 user, then this queue and its approve action are not available to them.
  - AC-5 (edge): Given a lead has sat in `pending-approval` for an extended period, the record is still fully valid and actionable elsewhere in read form (e.g. visible in FEAT-004's list, marked "unapproved") — it is not hidden from view just because it isn't yet approved.
- **Permissions:** PER-07 only (approval action); PER-01 can view their own submitted entries' status.
- **Data touched:** Reads/updates `Pipeline` and `LeadMeetingNote` approval state.
- **Triggers:** Automatic queue population whenever PER-01 creates a record on PER-07's behalf (FEAT-001/002).
- **Emits:** `LeadApproved`.
- **Consumes:** creation events from FEAT-001/002.
- **Depends on:** FEAT-001, FEAT-002.
- **Depended on by:** none directly, but is what keeps CON-24's data trustworthy at its earliest stage.
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial at current lead volume.
- **Minimum viable version:** A flat list with approve/edit — no auto-reminders.
- **Complete version:** Reminders to PER-07 if items sit unapproved past some threshold (mirrors CON-27's SLA-reminder pattern).
- **Open questions / assumptions:** none blocking.
- **Risks:** see FEAT-001's risk — this feature is the mitigation, but only if actually used.

### FEAT-004 — Lead pipeline list & status view
- **Capability:** CAP-15 · **Persona:** PER-07, PER-01 · **Serves:** JTBD-08, GOAL-05
- **Surface(s):** SUR-01
- **Problem:** Without a list view, there is no way to answer "how many active leads do we have, and at what stage" — which is exactly the kind of visibility GOAL-05/CAP-08's ops home is meant to surface.
- **Description:** A filterable/sortable list of all `Pipeline` records still in pre-agreement stages (`lead`, `survey-pending` before CAP-16 takes over), with status, last-activity date, and owner. Feeds into CAP-08's aggregated priority queue as one more source alongside tickets and deviation reviews.
- **Behavioral rules:** Scoped to **pre-agreement** stages only — once a deal reaches CAP-16's survey it is owned by the full pipeline board, and the two views must not double-count the same deal. Since FEAT-095, `closed-lost` deals drop out of this list rather than accumulating forever, which is what makes "how many active leads do we have" answerable at all. All four of INV-06's list states apply (loading, empty, error, degraded), not just empty.
- **Acceptance criteria:**
  - AC-1 (happy): Given multiple leads exist across stages, when PER-07 opens the list, then it's sortable by stage/date and filterable by service line.
  - AC-2 (empty/first-run): Given no leads exist yet, then an `EmptyState` explains how to log the first one (links to FEAT-001).
  - AC-3 (failure/degraded): Given the underlying query fails, then a clear error state renders (per INV-06 — loading/empty/error/degraded required on every list surface), not a blank page.
  - AC-4 (permission): Given PER-01 (ops) views this list, they see all leads (read/manage on-behalf per FEAT-001-003's rules); a role with neither PER-07 nor PER-01 does not see this list at all.
  - AC-5 (edge): Given a lead has been sitting with no activity for a long period, it's visually flagged (a staleness indicator) rather than silently identical to an actively-progressing one.
- **Permissions:** PER-07 (full), PER-01 (full, on-behalf model).
- **Data touched:** Reads `Pipeline`, `LeadMeetingNote`.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** `LeadLogged`, `DemoAgreed`, `LeadClosed`, `LeadApproved` (for status display).
- **Depends on:** FEAT-001.
- **Depended on by:** CAP-08's portfolio/ops-home priority queue (aggregates this alongside CAP-09/CAP-05/CAP-20).
- **Failure modes:** none beyond standard list-surface failure handling (INV-06).
- **Limits & scale:** Trivial at current volume; revisit pagination if lead volume grows materially by 2-year scale target.
- **Minimum viable version:** Flat sortable list.
- **Complete version:** Staleness flagging + direct feed into CAP-08's aggregated queue.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-005 — Society profile & governance capture
- **Capability:** CAP-16 · **Persona:** PER-04 (Installer/Commissioning, field officer) · **Serves:** GOAL-03
- **Surface(s):** SUR-02 (field capture), SUR-01 (backend view)
- **Problem:** Today no structured record of a society's location, committee makeup, or election cycle exists before a deal is signed — sales/ops improvise per society from memory.
- **Description:** During the initial site visit, PER-04 captures society profile & governance data: location/coordinates, contact/committee member list with post, total RWA member count, and next RWA election date (CON-28a). This seeds the eventual `Society` record (CAP-13) before a formal account exists.
- **Behavioral rules:** Captured against the `Pipeline` record (CON-24) via a `SiteSurvey` sub-record, not a full `Society` row yet — CAP-13 later promotes this data into a real `Society` on agreement signing. Committee member list supports multiple entries with post (President/Secretary/Treasurer/etc.), uncapped. Election date is optional — not every society has one scheduled.
- **Acceptance criteria:**
  - AC-1 (happy): Given PER-04 is on-site with a `Pipeline` at survey stage, when they submit society profile fields (location, committee list, member count), then they're saved against that pipeline's `SiteSurvey`.
  - AC-2 (empty/first-run): Given a fresh survey, when opened, fields start blank with guided prompts rather than an unlabeled blank form — PER-04 is often filling this on a phone under time pressure.
  - AC-3 (failure/offline): Given inconsistent on-site connectivity (SUR-02, mobile web), when a submission fails, then entered data is retained locally and retried, not lost.
  - AC-4 (permission): Given a user without PER-04 or PER-01's role, the capture form is unavailable server-side.
  - AC-5 (edge): Given the RWA election date is unknown, the field can be left blank without blocking the rest of the survey.
- **Permissions:** PER-04 (create/edit), PER-01 (view, edit during backend confirmation — FEAT-010).
- **Data touched:** Creates/updates `SiteSurvey.societyProfile` (location, coordinates, committee members[], RWA member count, next election date).
- **Triggers:** Manual, during the initial site visit.
- **Emits:** `SocietyProfileCaptured`.
- **Consumes:** `DemoAgreed` (from CAP-15 FEAT-002) — survey starts once a demo is agreed, or via the demo-skip path (CON-24/25).
- **Depends on:** CAP-15 FEAT-002.
- **Depended on by:** FEAT-010 (survey confirmation); CAP-13's `Society` creation later reuses this data.
- **Failure modes:** Offline data loss if local retry isn't implemented — see AC-3.
- **Limits & scale:** Trivial — one per prospective society.
- **Minimum viable version:** Core fields only (location, committee list, member count) — no GPS coordinate capture.
- **Complete version:** Adds device-GPS coordinate pin and a richer committee-role taxonomy.
- **Open questions / assumptions:** none blocking.
- **Risks:** Low.

### FEAT-006 — Whole-society lighting inventory by area
- **Capability:** CAP-16 · **Persona:** PER-04 · **Serves:** GOAL-03, CON-29
- **Surface(s):** SUR-02
- **Problem:** Without a full lighting count by area, sales/ops can't scope a proposal beyond the single demo circuit, and CAP-06's cross-sell projection (CON-29) has no equipment baseline to work from.
- **Description:** PER-04 records the whole-society lighting count broken out by area — basement/stilt parking (counted separately when both exist), lift lobby, staircase, and other common-area categories — distinct from the single sample `Circuit` metered for the benchmark (CON-11).
- **Behavioral rules:** Basement and stilt parking are always two separate line items when both exist at a site, never merged (CON-28b). This is a count-only inventory (not per-fixture serialized assets) — distinct in kind from the pump equipment audit (FEAT-008), which is per-unit.
- **Acceptance criteria:**
  - AC-1 (happy): Given PER-04 is on-site, when they enter light counts per area, then a `LightingInventoryArea[]` list is saved against the `SiteSurvey`.
  - AC-2 (empty/first-run): Given no inventory yet, fields default to zero with an explicit prompt to add each area present at the site, not a silently-skippable total.
  - AC-3 (failure): Given a negative or non-numeric count is entered, rejected with a field-level error.
  - AC-4 (permission): Same as FEAT-005.
  - AC-5 (edge): Given a society has no basement or stilt parking at all, that line item is omitted rather than recorded as zero — the inventory reflects what actually exists, not a padded checklist.
- **Permissions:** PER-04 (create/edit), PER-01 (view/edit).
- **Data touched:** Creates `LightingInventoryArea[]` (area type, light count) under `SiteSurvey`.
- **Triggers:** Manual, same visit as FEAT-005/FEAT-007.
- **Emits:** `LightingInventoryCaptured`.
- **Consumes:** none beyond the Pipeline gate.
- **Depends on:** CAP-15 FEAT-002.
- **Depended on by:** CAP-06's cross-sell projection (CON-29) reads this for scoping; CAP-20 (offer generation) may reference total light count.
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial (tens of area rows per society; whole-society counts run higher than the 20-500/circuit metering envelope in 00-intake §7).
- **Minimum viable version:** Flat count per area, no photos.
- **Complete version:** Adds an optional reference photo per area, matching the pump audit's rigor (not required day one).
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-007 — Demo-circuit selection & eligibility checklist
- **Capability:** CAP-16 · **Persona:** PER-04, PER-01 · **Serves:** JTBD-05, GOAL-06
- **Surface(s):** SUR-02 (capture), SUR-01 (backend confirms)
- **Problem:** Without a recorded, checkable eligibility rationale, there's no audit trail for why a specific circuit was chosen as the demo/benchmark sample — a wrongly-chosen circuit produces a bad benchmark that's expensive to fix later (PER-04's own stated goal, per 02-users-research.md).
- **Description:** PER-04 selects a candidate circuit and records it against CON-16's eligibility checklist: ≥50 lights (or an explicit exception approval if lower), no non-installation appliances sharing the circuit, WiFi/LAN reachable within 20-40m, fixtures ≤15 feet high, not on a driveway/ramp. The circuit is then confirmed with both backend (PER-01) and the society before CAP-02 (benchmark commissioning) begins.
- **Behavioral rules:** A circuit below 50 lights cannot be confirmed without an explicit PER-01 exception-approval action recorded against it — not a checkbox PER-04 can self-tick. All five criteria must be recorded (pass/fail/n-a); an incomplete checklist blocks confirmation, it isn't optional documentation. Confirmation requires two independent acknowledgements: PER-01 (backend) and a society-side sign-off.
- **Acceptance criteria:**
  - AC-1 (happy): Given a circuit meeting all criteria, when PER-04 submits the checklist, then the circuit is marked `eligible` and enters `pending-confirmation`.
  - AC-2 (empty/first-run): Given no circuit selected yet, the survey step shows a clear prompt to pick one from the site, not a blank checklist with no context.
  - AC-3 (failure/exception): Given light count <50, when PER-04 attempts to confirm, then it's blocked until PER-01 records an explicit exception approval with a reason.
  - AC-4 (permission): Given a non-PER-04/PER-01 actor, denied server-side; only PER-01 can grant the light-count exception.
  - AC-5 (edge): Given a circuit fails a hard criterion (fixtures >15ft, on a driveway), when PER-04 flags it, then that circuit is marked ineligible and a different candidate must be selected — no exception path exists for these criteria, only the light-count minimum is exception-able (CON-16).
- **Permissions:** PER-04 (select, record checklist), PER-01 (confirm, grant light-count exception).
- **Data touched:** Creates `Circuit` (survey-stage, pre-benchmark) with `eligibilityChecklist` (5 criteria results, exception flag/reason).
- **Triggers:** Manual, during the survey visit.
- **Emits:** `CircuitSelected`, `CircuitConfirmed`.
- **Consumes:** shares the same `SiteSurvey` visit as FEAT-005/006/008/009 but has no hard data dependency on them.
- **Depends on:** CAP-15 FEAT-002.
- **Depended on by:** CAP-02 (Benchmark Commissioning) — metering cannot start until a `Circuit` is `confirmed` here.
- **Failure modes:** A circuit confirmed against a borderline/stale checklist item (e.g. marginal WiFi signal) surfaces later as CAP-02 install trouble — this checklist is a gate, not a physical-world guarantee.
- **Limits & scale:** Trivial — one confirmed circuit per (society, service line) survey.
- **Minimum viable version:** Checklist + PER-01 confirmation only, no society-side sign-off capture.
- **Complete version:** Adds the society-side confirmation/sign-off step.
- **Open questions / assumptions:** Exact mechanism for society-side confirmation (in-person signed vs. async) — resolve when CON-18's cross-cutting gate-pass pattern is written up in §5.
- **Risks:** If the exception-approval path gets used loosely under sales pressure, benchmark quality on small circuits could suffer — worth a later data-quality check, not a build blocker.

### FEAT-008 — Pump-room equipment audit
- **Capability:** CAP-16 · **Persona:** PER-04 · **Serves:** CON-29, GOAL-03
- **Surface(s):** SUR-02
- **Problem:** Pump automation proposals today have no structured equipment baseline — sales can't credibly quote projected pump savings without knowing what's actually installed, its condition, and whether it already works.
- **Description:** PER-04 conducts an exhaustive, per-unit audit of the pump room (CON-28c): pump type/HP/count; tower count and names; per-tower tank count/type/capacity; feed-pipe and common-outflow-pipe sizes; and for each of {flow meter, pressure switch/monitor, VFDs (count + arrangement: per-pump vs. shared), dedicated pump-room energy meter, per-tank float switch/level sensor, per-tank actuator valve}: installed (y/n), brand/make/model, working condition, and a photo.
- **Behavioral rules:** Each of the 6 named equipment categories is a per-unit entity, not a single yes/no for the whole room — e.g. 3 towers with float switches means 3 separate float-switch records, each with its own condition/photo. A photo is required for every "installed: yes" item (CON-28c) — an installed item without a photo is an incomplete audit, not a valid one. "Installed: no" items skip brand/model/condition/photo entirely.
- **Acceptance criteria:**
  - AC-1 (happy): Given PER-04 walks the pump room, when they record each equipment item with a photo, then a `PumpRoomEquipment[]` list is saved, one entity per physical unit.
  - AC-2 (empty/first-run): Given the audit hasn't started, the form is organized by the 6 categories with a clear "not yet recorded" state per category, not one giant blank form.
  - AC-3 (failure): Given an "installed: yes" item is submitted with no photo attached, rejected with an error naming the specific missing photo, not a generic validation failure.
  - AC-4 (permission): Same pattern as FEAT-005/007.
  - AC-5 (edge): Given a tower has zero tanks (unusual but possible), that tower is recorded with tank count = 0 rather than omitted — every named tower is accounted for.
- **Permissions:** PER-04 (create/edit, photo capture), PER-01 (view, backend confirmation).
- **Data touched:** Creates `PumpRoomEquipment[]` (category, unit index, installed y/n, brand, model, condition, photo URL), `Tower[]`/`Tank[]` sub-records.
- **Triggers:** Manual, during the survey visit.
- **Emits:** `PumpEquipmentAuditCaptured`.
- **Consumes:** none beyond the Pipeline/SiteSurvey gate.
- **Depends on:** CAP-15 FEAT-002.
- **Depended on by:** CAP-06's cross-sell projection (CON-29) reads this directly as one of its 3 inputs; a future pump-side benchmark commissioning (if separately modeled) would reference the same equipment baseline.
- **Failure modes:** Photo upload failure mid-audit on poor on-site connectivity — needs the same offline-retry handling flagged in FEAT-005's AC-3, since this is the most photo-heavy feature in the capability.
- **Limits & scale:** Per 00-intake §7 (1-20 pumps/society), equipment item counts stay in the tens per society — not a scale concern.
- **Minimum viable version:** Core 6 categories, installed/brand/model/condition/photo — VFD arrangement (per-pump vs. shared) as a plain text/enum field, no diagram.
- **Complete version:** Adds a structured pump-to-VFD mapping or simple diagram if the text/enum field proves ambiguous in practice.
- **Open questions / assumptions:** none blocking.
- **Risks:** This is the single largest data-entry burden in the whole survey — if it's not fast/guided enough on a phone, PER-04 may skip or shortcut it, silently degrading CON-29's projection quality. Worth field-testing the actual form flow, not just building to spec.

### FEAT-009 — Historical consumption logbook capture
- **Capability:** CAP-16 · **Persona:** PER-04 · **Serves:** CON-29
- **Surface(s):** SUR-02
- **Problem:** For societies where a live demo isn't practical, or a cross-sell projection is needed before any metering exists, there's no historical consumption baseline to anchor a projection against.
- **Description:** PER-04 photographs the pump room's manual consumption logbook, if the society keeps one — current month plus up to 12 months back (CON-28d) — as raw evidence for CON-29's cross-sell projection engine.
- **Behavioral rules:** Opt-out by data availability, not by choice — if no logbook exists, the feature records that fact explicitly ("logbook not maintained") rather than leaving a silent gap indistinguishable from "not yet captured." Photos are raw evidence only at this stage — no OCR/structured extraction is implied here (that would be a CON-30-style AI-normalization step, out of scope for this feature unless later pulled in).
- **Acceptance criteria:**
  - AC-1 (happy): Given a logbook exists, when PER-04 photographs each available month's page, then a `HistoricalLogbookPhoto[]` list (dated) is saved.
  - AC-2 (empty/no-logbook): Given no logbook is kept at the site, when PER-04 marks it as such, then the survey records "not maintained" rather than blocking or looking incomplete.
  - AC-3 (failure): Given a photo fails to upload, it's retried per the same offline pattern as FEAT-005/008.
  - AC-4 (permission): Same as other CAP-16 features.
  - AC-5 (edge): Given fewer than 12 months of history exist (e.g. a newly-formed society), the feature accepts however many months are available — 12 is a maximum look-back, not a required minimum.
- **Permissions:** PER-04 (capture), PER-01 (view).
- **Data touched:** Creates `HistoricalLogbookPhoto[]` (month, photo URL) or a `logbookNotMaintained` flag on `SiteSurvey`.
- **Triggers:** Manual, during the survey visit.
- **Emits:** `HistoricalLogbookCaptured`.
- **Consumes:** none.
- **Depends on:** CAP-15 FEAT-002.
- **Depended on by:** CAP-06's cross-sell projection (CON-29, input 3 of 3).
- **Failure modes:** Illegible/low-quality photos reduce projection accuracy but aren't a hard system failure — no OCR validation gate exists to catch this at capture time.
- **Limits & scale:** Trivial (up to 13 photos per society).
- **Minimum viable version:** Photo capture + not-maintained flag only.
- **Complete version:** Adds OCR/structured extraction later, reusing the CON-30 AI-normalization pattern, so the logbook data feeds the projection formula directly rather than serving as reference-only evidence.
- **Open questions / assumptions:** none blocking — deferred to CON-29's own eventual expansion under CAP-06.
- **Risks:** none significant at MVP scope.

### FEAT-010 — Survey review & backend confirmation
- **Capability:** CAP-16 · **Persona:** PER-01, PER-04 · **Serves:** GOAL-06
- **Surface(s):** SUR-01 (backend review), SUR-02 (field submission)
- **Problem:** A survey with 5 separate data-capture features (profile, lighting inventory, circuit checklist, pump audit, logbook) needs one clear "this is done and correct" gate before CAP-02's benchmark commissioning — real hardware install cost — begins.
- **Description:** Once PER-04 has completed the survey's component features, they submit the full `SiteSurvey` as complete. PER-01 reviews all captured data and either confirms it — advancing the `Pipeline` to CAP-02's full demo commissioning, or on the demo-skip path to CAP-02's no-demo variant (meter install only, then straight to CAP-19/CAP-20 per CON-24/25) — or sends it back with specific feedback for PER-04 to correct.
- **Behavioral rules:** Confirmation requires every component feature to be in a "complete" or explicitly-flagged state (e.g. FEAT-009's "not maintained" counts as complete; a genuinely empty pump audit does not). Sending back preserves all previously-entered data — PER-04 corrects/adds, never re-enters from scratch. This is the same "backend confirms" checkpoint named in the CAP-16 capability-map row.
- **Acceptance criteria:**
  - AC-1 (happy): Given all component features are complete, when PER-01 confirms, then `SiteSurvey.status = confirmed` and the `Pipeline` advances to its next configured stage.
  - AC-2 (empty/first-run): Given PER-04 hasn't submitted yet, PER-01's review queue simply doesn't list that survey.
  - AC-3 (failure/incomplete): Given PER-04 submits with a required component missing (e.g. no circuit confirmed per FEAT-007), submission is blocked with a clear list of what's missing, not silently accepted.
  - AC-4 (permission): Given a non-PER-01 user, the confirm/reject action is unavailable; given a non-PER-04 user, submission is unavailable.
  - AC-5 (edge): Given PER-01 sends the survey back for correction, when PER-04 resubmits, then the review history retains both the original and corrected submissions, not just the latest state.
- **Permissions:** PER-04 (submit), PER-01 (confirm/reject).
- **Data touched:** Reads all FEAT-005/006/007/008/009 data; writes `SiteSurvey.status`, review notes.
- **Triggers:** Manual, PER-04's "submit survey" action.
- **Emits:** `SurveyConfirmed`, `SurveySentBack`.
- **Consumes:** `SocietyProfileCaptured`, `LightingInventoryCaptured`, `CircuitConfirmed`, `PumpEquipmentAuditCaptured`, `HistoricalLogbookCaptured`.
- **Depends on:** FEAT-005 through FEAT-009.
- **Depended on by:** CAP-02 (benchmark commissioning start, in both its full and no-demo variants); CAP-19/CAP-20 directly on the demo-skip path (CON-24/25).
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial — one confirmation cycle per society survey, occasional back-and-forth.
- **Minimum viable version:** Single confirm/reject with free-text feedback.
- **Complete version:** Adds per-component pass/fail (not just whole-survey) so PER-04 knows exactly which of the 5 sections needs rework.
- **Open questions / assumptions:** none blocking.
- **Risks:** If PER-01 rubber-stamps confirmations under time pressure (same shape as FEAT-003's risk), the gate's value quietly erodes — worth watching in practice, not a build blocker.

### FEAT-011 — Meter installation & load validation
- **Capability:** CAP-02 · **Persona:** PER-04, PER-01 · **Serves:** JTBD-05
- **Surface(s):** SUR-02
- **Problem:** An install where the light count, wattage, or wiring was miscounted produces a wrong theoretical load from day one — without a validation step, the error isn't caught until the benchmark itself looks wrong, by which point it's expensive to unwind (PER-04's stated goal, 02-users-research.md).
- **Description:** PER-04 installs a smart meter on **each confirmed circuit** (FEAT-007) — one per distinct light type, per CON-11/CON-16, so a society commonly needs several — and validates each meter's displayed load against that circuit's theoretical load (light count × per-light wattage). Within ±10% (CON-17), install proceeds; outside that band, the discrepancy is flagged and PER-04 must recheck (miscounted lights, an extra device, wrong per-light wattage) before proceeding. Meter installation triggers the demo-installation instance of the cross-cutting gate-pass component (§5, CON-18) — an itemized equipment list signed, photographed, and backend-approved before PER-04 leaves.
- **Behavioral rules:** The ±10% band is a hard gate, evaluated per circuit — proceeding to the baseline monitoring window (FEAT-012) is blocked for that circuit until its load validation passes or PER-01 records an explicit override with a reason. A society's circuits are commissioned independently: one failing validation does not block the others, but the deal cannot reach billing until every registered circuit has passed. The gate-pass sign-off is a separate, sequential gate after load validation passes — both must complete before PER-04 can leave the site.
- **Acceptance criteria:**
  - AC-1 (happy): Given light count × wattage is within ±10% of the meter's displayed load, when PER-04 confirms, then the circuit moves to `meter-installed` and the gate-pass step opens.
  - AC-2 (empty/first-run): Given no reading taken yet, the validation screen prompts for both the theoretical inputs and the meter's live reading, not assuming either is pre-filled.
  - AC-3 (failure): Given the discrepancy exceeds ±10%, submission is blocked with the exact delta shown, and PER-04 must recheck inputs before resubmitting.
  - AC-4 (permission): Given a non-PER-04 actor, unavailable; only PER-01 can override a persistently failed validation.
  - AC-5 (edge): Given PER-01 overrides an out-of-band validation (e.g. a known meter-display quirk), the override and reason are recorded and visible on the circuit's record going forward — not silently accepted as if it had passed normally.
- **Permissions:** PER-04 (validate), PER-01 (override).
- **Data touched:** Creates/updates `Circuit.meterInstall` (theoretical load, meter reading, delta%, validation result, override reason if any).
- **Triggers:** Manual, after FEAT-007's circuit confirmation.
- **Emits:** `MeterInstalled`, `LoadValidationFailed`.
- **Consumes:** `CircuitConfirmed` (FEAT-007).
- **Depends on:** FEAT-007.
- **Depended on by:** FEAT-012 (baseline monitoring can't start until the meter is installed and validated); the gate-pass component (§5).
- **Failure modes:** A validation override used to paper over a genuine miscounting error would silently corrupt the benchmark input — this is why the override requires a recorded reason, but it remains a real risk if used carelessly.
- **Limits & scale:** Trivial — one meter install per circuit.
- **Minimum viable version:** Manual theoretical-load entry + manual meter reading entry, ±10% check.
- **Complete version:** Meter reading pulled automatically if/when a live meter API integration exists (not assumed today — CON-30's CSV-download pattern implies meters aren't API-integrated yet).
- **Open questions / assumptions:** none blocking.
- **Risks:** see failure modes.

### FEAT-012 — Pre-install baseline monitoring window
- **Capability:** CAP-02 · **Persona:** PER-04, PER-01 · **Serves:** JTBD-05
- **Surface(s):** SUR-02 (PER-04 monitors/investigates), SUR-01 (PER-01 sees status)
- **Problem:** The benchmark's accuracy depends entirely on a clean, uncontaminated baseline reading window — without a structured 5-valid-day tracker with anomaly handling, one bad baseline day could silently corrupt the whole contract-term benchmark.
- **Description:** After meter install (FEAT-011), the system tracks 5 consecutive valid calendar days of pre-install consumption readings (CON-19). The meter-install day itself is excluded from the window. If an anomaly is detected on any day, PER-04 investigates and fixes it, and the 5-valid-day count restarts from the midnight following the fix.
- **Behavioral rules:** A day only counts toward the 5 if it's a full, uncontaminated calendar day (00:00-24:00) with no flagged anomaly. The window-restart event is recorded (not silently reset) so there's an audit trail of how many attempts the baseline took (GOAL-06). This window purely observes existing/pre-swap lighting — no light replacement happens during this phase (that's FEAT-013, which follows).
- **Acceptance criteria:**
  - AC-1 (happy): Given 5 consecutive valid days pass with no anomaly, when the window completes, then `Circuit.preInstallBaseline` (average daily consumption) is computed and the circuit is ready for FEAT-013.
  - AC-2 (empty/first-run): Given the window has just started, day 1 of 5 shows clearly with no readings yet — not an ambiguous blank state.
  - AC-3 (failure/anomaly): Given an anomaly is flagged on day 3, when PER-04 investigates and records a fix, then the valid-day count resets to 0 starting the next midnight, and this restart event is logged.
  - AC-4 (permission): Given a non-PER-04/PER-01 actor, no ability to mark a day valid/invalid or trigger a restart.
  - AC-5 (edge): Given a day's readings are simply missing (not anomalous, just absent — an ingest gap), that day does not count toward the 5 either, but is distinguished in the record from an actively-flagged anomaly.
- **Permissions:** PER-04 (investigate/fix), PER-01 (view, override in edge cases).
- **Data touched:** Creates `MonitoringWindow` (type=baseline, day records with validity flags, restart events) on `Circuit`.
- **Triggers:** Automatic, once FEAT-011 completes.
- **Emits:** `BaselineWindowCompleted`, `BaselineWindowRestarted`.
- **Consumes:** `MeterInstalled` (FEAT-011); reads daily meter readings (from CAP-03's ingest, once built — a forward dependency worth flagging).
- **Depends on:** FEAT-011; indirectly CAP-03 (meter reading ingest) for the actual daily data.
- **Depended on by:** FEAT-013 (light replacement can only proceed once baseline is captured).
- **Failure modes:** A baseline window that never stabilizes (repeated anomalies) has no defined maximum-retry/escalation path yet.
- **Limits & scale:** Trivial per circuit; matters more in aggregate once CAP-08's portfolio view needs to show "N circuits mid-baseline."
- **Minimum viable version:** Manual anomaly flagging by PER-04, no automatic anomaly detection.
- **Complete version:** Automatic anomaly detection (shares INV-09's upload-time pattern from CON-30) flags candidate days for PER-04 to confirm, rather than relying on PER-04 to notice unprompted.
- **Open questions / assumptions:** No defined escalation path for a baseline window stuck in repeated restarts — worth resolving before build.
- **Risks:** A stuck baseline could quietly stall a whole install indefinitely without an escalation trigger.

### FEAT-013 — Light replacement / demo installation
- **Capability:** CAP-02 · **Persona:** PER-04 · **Serves:** JTBD-05
- **Surface(s):** SUR-02
- **Problem:** The physical light swap is the actual "install" moment the whole benchmark depends on — it needs to be a clean, dated event (not a fuzzy multi-day process) since CON-19 explicitly excludes this day from both monitoring windows.
- **Description:** PER-04 (or the society's own electricians under PER-04's guidance, per CON-14) replaces the circuit's lights on a single recorded calendar day. Completion triggers the demo-installation-completion instance of the cross-cutting gate-pass component (§5, CON-18).
- **Behavioral rules:** The replacement date is recorded exactly (not a range) since it's the pivot day excluded from both windows. This gate-pass sign-off is a separate instance from the meter-install one in FEAT-011 — per CON-18, gate-pass applies at each of the 3 named stages independently, not once for the whole commissioning process.
- **Acceptance criteria:**
  - AC-1 (happy): Given the baseline window (FEAT-012) is complete, when PER-04 records the replacement date and completes the gate-pass sign-off, then the circuit moves to `post-install-pending` and FEAT-014's window starts the next calendar day.
  - AC-2 (empty/first-run): Given replacement hasn't happened yet, the circuit clearly shows "awaiting installation" rather than an ambiguous mid-state.
  - AC-3 (failure): Given the gate-pass sign-off isn't completed, PER-04 cannot mark the circuit as installed — the departure-gating rule (CON-18) applies exactly as elsewhere.
  - AC-4 (permission): Given a non-PER-04 actor, unavailable.
  - AC-5 (edge): Given the replacement spans more than one calendar day in practice (e.g. a large circuit), only the day the last light was replaced counts as the excluded pivot day — explicit, not left to interpretation.
- **Permissions:** PER-04 (execute, sign off).
- **Data touched:** Updates `Circuit` (replacement date), creates a `GatePass` instance (shared component, §5).
- **Triggers:** Manual, once FEAT-012 completes.
- **Emits:** `LightsReplaced`.
- **Consumes:** `BaselineWindowCompleted`.
- **Depends on:** FEAT-012.
- **Depended on by:** FEAT-014 (post-install window).
- **Failure modes:** An ambiguous multi-day replacement without a clear single pivot date would corrupt CON-19's window-exclusion logic — AC-5 exists specifically to prevent this.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Date recording + gate-pass sign-off only.
- **Complete version:** n/a — already a complete, minimal event; no further scope anticipated.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant beyond AC-5's edge case.

### FEAT-014 — Post-install monitoring window & benchmark computation
- **Capability:** CAP-02 · **Persona:** PER-04, PER-01 · **Serves:** JTBD-05, GOAL-06
- **Surface(s):** SUR-02 (PER-04), SUR-01 (PER-01 sees result)
- **Problem:** This is the capability's actual output — the number that governs billing for the entire contract term (PER-04's stated goal) — so it needs the same rigor as the baseline window plus a correctly-applied success threshold.
- **Description:** Mirrors FEAT-012's mechanism for the post-install side: 5 consecutive valid calendar days (light-replacement day excluded, identical anomaly-reset). Once complete, the system computes % savings between the baseline and post-install averages (CON-10). If the result falls within the valid 60-80% range (CON-20), that exact measured percentage becomes `Circuit.benchmarkSavingsPct` — fixed for the contract term. Outside that range, the result routes to FEAT-015 for investigation instead of being written as the benchmark.
- **Behavioral rules:** The computed percentage is written verbatim (not rounded) when in-range — CON-20 is explicit that rounding to 60% is wrong. Writing `benchmarkSavingsPct` is the terminal, contract-defining action of this whole capability — once written, only a verified light-count-change event (CON-10) can trigger a rescale; it is never renegotiated.
- **Acceptance criteria:**
  - AC-1 (happy): Given 5 valid post-install days complete and the result is 68% (within 60-80%), when computed, then `Circuit.benchmarkSavingsPct = 68%` is written and the circuit moves to `benchmark-confirmed`.
  - AC-2 (empty/first-run): Given the post window has just started, day 1 of 5 shows clearly (same pattern as FEAT-012).
  - AC-3 (failure/anomaly): Identical restart mechanism to FEAT-012 — an anomaly resets the valid-day count from the following midnight.
  - AC-4 (permission): Given a non-PER-04/PER-01 actor, no visibility into triggering restarts; benchmark-writing is a system computation, not a manual entry, so no one can hand-edit the resulting percentage directly.
  - AC-5 (edge): Given the computed result is below 60% or above 80%, when the window completes, then no benchmark is written — the result instead routes to FEAT-015's next-morning investigation queue.
- **Permissions:** PER-04 (investigate/fix anomalies), PER-01 (view result, cannot manually edit the computed percentage).
- **Data touched:** Creates `MonitoringWindow` (type=post-install) on `Circuit`; writes `Circuit.benchmarkSavingsPct` on success.
- **Triggers:** Automatic, once FEAT-013 completes; the light-replacement day is excluded, window begins the next calendar day.
- **Emits:** `PostInstallWindowCompleted`, `BenchmarkConfirmed`, `DemoResultOutOfRange`.
- **Consumes:** `LightsReplaced` (FEAT-013), `Circuit.preInstallBaseline` (FEAT-012).
- **Depends on:** FEAT-013.
- **Depended on by:** FEAT-015 (out-of-range path); CAP-04 (billing engine) reads `benchmarkSavingsPct` as its core input; CAP-18 (demo savings report generation).
- **Failure modes:** Same stuck-window risk as FEAT-012 (no defined max-retry escalation) — worth resolving together.
- **Limits & scale:** Trivial per circuit.
- **Minimum viable version:** Manual anomaly flagging, automatic percentage computation and range check.
- **Complete version:** Automatic anomaly detection (same as FEAT-012).
- **Open questions / assumptions:** Same stuck-window escalation gap as FEAT-012.
- **Risks:** This is the single highest-stakes computation in the whole product (fixed for the entire contract term) — any bug in the averaging/rounding logic has an outsized, hard-to-reverse impact. Deserves specific test-plan attention in Phase 9.

### FEAT-015 — Out-of-range demo result review
- **Capability:** CAP-02 · **Persona:** PER-01 · **Serves:** JTBD-05, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** A demo result below 60% or implausibly above 80% is either a real problem (bad install, miscounted load) or a data artifact — CON-20 requires this be investigated, not silently accepted or silently discarded.
- **Description:** The next morning after a post-install window computes an out-of-range result (`DemoResultOutOfRange`, FEAT-014), PER-01 (backend/installation team) reviews the circuit: checks for install errors, re-validates load (may re-trigger FEAT-011-style checks), and decides whether to re-run the post-install window, correct an installation defect and restart, or escalate for a manual benchmark decision.
- **Behavioral rules:** An out-of-range result is never auto-converted into a benchmark, regardless of how close it is to 60% or 80% — CON-20's range is a hard boundary, not a soft guideline. This review must resolve to one of a small closed set of outcomes (re-run window, fix-and-restart, manual escalation) — not left in limbo indefinitely.
- **Acceptance criteria:**
  - AC-1 (happy): Given an out-of-range result lands in the queue, when PER-01 reviews it the next morning, then a resolution action is recorded and the circuit's window either restarts or a manual escalation is opened.
  - AC-2 (empty/first-run): Given no out-of-range results are pending, the queue shows a clear "none pending" state.
  - AC-3 (failure): Given PER-01 takes no action within a reasonable period, the item remains visibly flagged/overdue rather than silently aging out — mirrors CAP-09's SLA-flagging pattern.
  - AC-4 (permission): Given a non-PER-01 actor, this queue and its actions are unavailable.
  - AC-5 (edge): Given the same circuit produces a second out-of-range result after a restart, it's flagged more prominently (repeat failure) rather than treated identically to a first-time occurrence.
- **Permissions:** PER-01 (review, decide, escalate).
- **Data touched:** Reads `Circuit`/`MonitoringWindow`; writes a review decision record.
- **Triggers:** Automatic queue entry from `DemoResultOutOfRange` (FEAT-014).
- **Emits:** `DemoResultReviewed`, `ManualBenchmarkEscalated`.
- **Consumes:** `DemoResultOutOfRange`.
- **Depends on:** FEAT-014.
- **Depended on by:** none directly — a resolution path, not a further pipeline stage — though its outcome loops back into FEAT-012/013/014 (restart) or a separate management decision process (escalation, not otherwise specified).
- **Failure modes:** none beyond standard.
- **Limits & scale:** Rare by design (most demos should land in-range) — trivial volume.
- **Minimum viable version:** Manual review + restart/escalate actions, no automated diagnostic hints.
- **Complete version:** Surfaces likely-cause hints (e.g. "load validation was near the ±10% edge," cross-referenced from FEAT-011) to speed up PER-01's diagnosis.
- **Open questions / assumptions:** none blocking — the escalation path now resolves into FEAT-058/CON-37: management sets it, applying immediately if society-favourable and requiring a signed amendment if not.
- **Risks:** If this queue isn't checked every morning as intended, an out-of-range circuit could sit unresolved indefinitely, delaying the whole society's onboarding — an operational risk, not just a system one.

### FEAT-016 — Schedule a field visit
- **Capability:** CAP-17 · **Persona:** PER-01 · **Serves:** GOAL-05
- **Surface(s):** SUR-01
- **Problem:** Every field-touching stage in the pipeline (survey, meter install, demo install, full install) and every dispatched ticket needs a coordinated date and an assigned person — today this happens over phone/WhatsApp with no system record of who agreed to what, when.
- **Description:** PER-01 schedules a field visit against a source record (a `Pipeline` stage, a ticket per CAP-09, a deviation review per CAP-05, or a routine inspection per CAP-11): pick a visit type, a society, a proposed date/time, and assign field staff (PER-03 or PER-04). The assignee is notified and responds via FEAT-017. This is deliberately one reusable scheduling capability rather than a bespoke scheduler per stage.
- **Behavioral rules:** A visit always references exactly one source record — an unattached "floating" visit isn't allowed, so every visit is traceable to why it happened (GOAL-06's spirit applied to field work). Visit type determines which role can be assigned (a benchmark commissioning visit needs PER-04; a routine inspection needs PER-03). Scheduling a visit does not itself advance the source record's stage — the visit's *outcome* does.
- **Acceptance criteria:**
  - AC-1 (happy): Given a source record needing field work, when PER-01 schedules a visit with type, date, and assignee, then a `FieldVisit` is created in `proposed` state and the assignee is notified.
  - AC-2 (empty/first-run): Given no visits are scheduled yet for a society, its record shows a clear "no visits scheduled" state with a direct scheduling action, not a blank panel.
  - AC-3 (failure): Given a required field (society, type, date, assignee) is missing, submission is rejected with field-level errors and no `FieldVisit` is created.
  - AC-4 (permission): Given a non-PER-01 actor attempts to schedule, denied server-side; field staff can respond to visits (FEAT-017) but cannot create them.
  - AC-5 (edge): Given the assignee already has a visit scheduled for the same date at a different society, the conflict is surfaced as a warning at scheduling time — not silently allowed and not hard-blocked, since a two-site day is sometimes legitimate.
- **Permissions:** PER-01 (create/assign/cancel), PER-03/PER-04 (view own).
- **Data touched:** Creates `FieldVisit` (type, society, source record ref, proposed date/time, assignee, state).
- **Triggers:** Manual by PER-01; may be prompted by an upstream event (e.g. `SurveyConfirmed`, a CAP-09 ticket needing a visit, CON-27's 48h resolution clock).
- **Emits:** `VisitScheduled`.
- **Consumes:** events from CAP-16/CAP-02/CAP-05/CAP-09/CAP-11/CAP-21 as scheduling prompts.
- **Depends on:** the source-record capabilities exist first (nothing to attach a visit to otherwise).
- **Depended on by:** FEAT-017, FEAT-018, FEAT-019; CAP-02's field steps; CAP-09's 48h visit-resolution SLA (CON-27); CAP-21's install scheduling.
- **Failure modes:** A visit scheduled against the wrong source record would misroute its outcome — mitigated by requiring the reference at creation rather than allowing it to be attached later.
- **Limits & scale:** At the 2-year 200-society target with ~monthly inspection cadence (02-users-research.md), on the order of a few hundred visits/month — comfortably within a simple relational model, no scheduling-engine complexity needed.
- **Minimum viable version:** Manual date/assignee selection, no conflict detection or calendar view.
- **Complete version:** Adds assignee conflict warnings (AC-5) and availability awareness.
- **Open questions / assumptions:** none blocking.
- **Risks:** If scheduling stays partly on WhatsApp in practice, the system record becomes an incomplete shadow of reality — an adoption risk shared with several ops features here.

### FEAT-017 — Field-team visit response (accept / reschedule)
- **Capability:** CAP-17 · **Persona:** PER-03, PER-04 · **Serves:** JTBD-04
- **Surface(s):** SUR-02
- **Problem:** A scheduled visit no one has acknowledged is not actually scheduled — without a response step, ops has no way to distinguish "confirmed and happening" from "sent into the void."
- **Description:** The assigned field staff member sees their proposed visit on SUR-02 and either accepts it or requests a reschedule with a reason and an alternative date. Accepting locks the visit; a reschedule request routes back to PER-01. A visit cannot be rescheduled by field staff within 24 hours of its scheduled time (the 24h lockout) — that window requires PER-01 involvement, since a last-minute change usually means notifying the society too.
- **Behavioral rules:** The 24h lockout is on the *field-initiated* reschedule path only — PER-01 can still cancel or move a visit inside 24 hours (e.g. the society itself cancels). A reschedule request requires a reason; an accepted visit's state is what starts the visit's own execution flow on SUR-02 (the survey/commissioning/inspection features).
- **Acceptance criteria:**
  - AC-1 (happy): Given a `proposed` visit assigned to them, when the field staff member accepts, then the visit moves to `confirmed` and PER-01 sees the acknowledgement.
  - AC-2 (empty/first-run): Given no visits are assigned to them, their SUR-02 list shows a clear "nothing assigned" state rather than a blank screen — this is the field surface's home view.
  - AC-3 (failure/lockout): Given the visit is less than 24 hours away, when field staff attempt to reschedule, then the action is blocked with an explanation directing them to contact PER-01 — not silently hidden.
  - AC-4 (permission): Given a field staff member views a visit assigned to a different person, they cannot accept or reschedule it.
  - AC-5 (edge): Given a reschedule is requested, the visit returns to `proposed` with the requested alternative date attached — it does not auto-move to the requested date, since the society side must also be re-coordinated (PER-01's call).
- **Permissions:** PER-03/PER-04 (accept/reschedule own assigned visits only).
- **Data touched:** Updates `FieldVisit` (state, response timestamp, reschedule reason, requested alternative date).
- **Triggers:** `VisitScheduled` notification.
- **Emits:** `VisitAccepted`, `VisitRescheduleRequested`.
- **Consumes:** `VisitScheduled` (FEAT-016).
- **Depends on:** FEAT-016.
- **Depended on by:** FEAT-018 (escalation on non-response); every SUR-02 execution feature (CAP-16's survey capture, CAP-02's install steps, CAP-11's inspection) starts from a `confirmed` visit.
- **Failure modes:** Poor connectivity in the field (a known SUR-02 condition, 02-users-research.md PER-03) could delay a response and trip FEAT-018's escalation spuriously — worth a grace consideration in the escalation threshold rather than a strict timer.
- **Limits & scale:** Trivial per user.
- **Minimum viable version:** Accept/reschedule with reason, hard 24h lockout.
- **Complete version:** Adds push notification on assignment rather than relying on the field staff opening the app.
- **Open questions / assumptions:** ASSUM-16/ASSUM-17 (PER-03/PER-04 abandonment triggers unconfirmed) — relevant here since this is their primary interaction point, but not spec-blocking.
- **Risks:** If field staff habitually accept without reading, the acknowledgement signal loses meaning — a behavioral, not technical, risk.

### FEAT-018 — Visit non-response & reschedule escalation
- **Capability:** CAP-17 · **Persona:** PER-01 · **Serves:** GOAL-05
- **Problem:** An unanswered visit assignment or a repeatedly-rescheduled visit silently delays whatever pipeline stage or SLA depends on it (CON-27's 48h ticket-resolution clock is the sharpest case) — ops needs this surfaced, not discovered late.
- **Surface(s):** SUR-01
- **Description:** Visits that go unacknowledged past a threshold, or that accumulate repeated reschedule requests, are flagged in PER-01's queue and escalated to management if unresolved — the same escalation shape CON-27 defines for ticket SLAs, applied to scheduling.
- **Behavioral rules:** Escalation is a flag plus a management notification, never an automatic reassignment — who covers a visit is an operational judgment call, not something the system should decide. Repeated reschedules on the same visit escalate faster than a first one.
- **Acceptance criteria:**
  - AC-1 (happy): Given a visit sits unacknowledged past the threshold, when the threshold passes, then it appears flagged in PER-01's queue with elapsed time shown.
  - AC-2 (empty): Given nothing is overdue, the queue shows a clean "nothing needs attention" state.
  - AC-3 (failure/escalation): Given a flagged visit stays unresolved past the escalation window, then it escalates to management, matching CON-27's escalation pattern rather than inventing a second one.
  - AC-4 (permission): Given a non-PER-01/management actor, this queue is unavailable.
  - AC-5 (edge): Given a visit is rescheduled for the third time, it's flagged as a repeat-reschedule case distinctly from a simple non-response, since the operational cause (and fix) is different.
- **Permissions:** PER-01 (view/act), management (escalation recipient).
- **Data touched:** Reads `FieldVisit`; writes escalation records.
- **Triggers:** Time-based, evaluated against `FieldVisit` state and timestamps.
- **Emits:** `VisitOverdue`, `VisitEscalated`.
- **Consumes:** `VisitScheduled`, `VisitAccepted`, `VisitRescheduleRequested`.
- **Depends on:** FEAT-016, FEAT-017.
- **Depended on by:** CAP-08's ops-home priority queue aggregates these alongside tickets and deviation reviews.
- **Failure modes:** Threshold set too tight against real field connectivity produces noise and trains PER-01 to ignore the queue — see FEAT-017's failure mode.
- **Limits & scale:** Trivial.
- **Minimum viable version:** A simple overdue flag in the visit list, no separate escalation notification.
- **Complete version:** Full escalation notification to management, shared with CON-27's mechanism.
- **Open questions / assumptions:** none blocking — CON-35 seeds the visit-acknowledgement threshold at **24h**, configurable by management (XC-03).
- **Risks:** none significant beyond threshold tuning.

### FEAT-019 — Field visit schedule & assignment view
- **Capability:** CAP-17 · **Persona:** PER-01, PER-03, PER-04 · **Serves:** JTBD-04, GOAL-05
- **Surface(s):** SUR-01 (ops-wide view), SUR-02 (personal assigned view)
- **Problem:** Neither side currently has a single answer to "what field work is happening, where, and who's on it" — ops can't plan and field staff can't see their own day.
- **Description:** Two views over the same `FieldVisit` data: PER-01's cross-society schedule (filterable by date, society, type, assignee, state) and each field staff member's own assigned-visits list on SUR-02 — the latter is effectively their home screen, matching JTBD-04's "see what's assigned to me" job.
- **Behavioral rules:** The SUR-02 view is strictly scoped to the signed-in field staff member's own assignments (enforced server-side, not merely filtered client-side). Both views share one underlying model so ops and field never see divergent state.
- **Acceptance criteria:**
  - AC-1 (happy): Given visits exist across societies, when PER-01 opens the schedule, then it's filterable by date/society/type/assignee/state.
  - AC-2 (empty/first-run): Given no visits match the current filters, an `EmptyState` explains that rather than showing a bare table (INV-06).
  - AC-3 (failure/degraded): Given the query fails, an explicit error state renders — INV-06 requires loading/empty/error/degraded on every list surface.
  - AC-4 (permission): Given PER-03 opens their SUR-02 view, they see only their own assignments; a manipulated request for another person's visits is refused server-side.
  - AC-5 (edge): Given a field staff member has several visits on one day, they're ordered by scheduled time with travel-relevant detail (society, location) visible without opening each one — this view is used on a phone between sites.
- **Permissions:** PER-01 (all visits), PER-03/PER-04 (own only).
- **Data touched:** Reads `FieldVisit` and its source-record references.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** all CAP-17 events for state display.
- **Depends on:** FEAT-016.
- **Depended on by:** CAP-08's ops home (visit load as one input); the SUR-02 execution features are typically entered *from* this view.
- **Failure modes:** none beyond standard list-surface handling (INV-06).
- **Limits & scale:** A few hundred visits/month at 2-year scale — pagination/date-windowing is sufficient, no special indexing concerns.
- **Minimum viable version:** Flat filterable list on both surfaces.
- **Complete version:** Adds a calendar/day view for PER-01 and location/route context for field staff.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-020 — Auto-generate the demo savings report
- **Capability:** CAP-18 · **Persona:** PER-01 · **Serves:** GOAL-06, JTBD-05
- **Surface(s):** SUR-01
- **Problem:** The demo result is the single artefact that converts a prospect into a signed agreement — today it's built by hand from readings, which is slow and makes each report's provenance a matter of trust rather than record.
- **Description:** Once a post-install monitoring window completes with an in-range result (`BenchmarkConfirmed`, FEAT-014), the system automatically generates a demo savings report for that (society, service line): the pre-install baseline average, post-install average, measured savings %, the daily readings behind both windows, and the resulting projected savings extrapolated across the society's full light count (CON-11, using FEAT-006's inventory). This is a one-time report, distinct from CAP-06's recurring monthly savings report.
- **Behavioral rules:** Generation is automatic on `BenchmarkConfirmed` — PER-01 does not have to remember to run it. Every figure in the report must link back to the readings and windows that produced it (INV-02) — this is the report a society will argue with, so provenance is structural, not decorative. A report is never generated from an out-of-range result (FEAT-015's path) — an unconfirmed benchmark has nothing to report.
- **Acceptance criteria:**
  - AC-1 (happy): Given `BenchmarkConfirmed` fires for a circuit, when generation runs, then a draft demo report exists containing baseline average, post-install average, measured %, the underlying daily readings, and the whole-society extrapolation.
  - AC-2 (empty/first-run): Given a society has no demo report yet, its record shows "no demo report" rather than an empty document shell.
  - AC-3 (failure): Given generation fails (e.g. missing lighting inventory from FEAT-006, so extrapolation can't be computed), then PER-01 is alerted with the specific missing input named — not left with a silently absent report.
  - AC-4 (permission): Given a non-PER-01 internal actor, the draft report is not visible until shared (FEAT-022); a society never sees a draft.
  - AC-5 (edge): Given the circuit's benchmark is later rescaled by a verified light-count change (CON-10), the existing demo report is not silently rewritten — it stands as the record of what was measured at the time, and any regeneration is a new versioned report.
- **Permissions:** PER-01 (view draft), system (generate).
- **Data touched:** Creates `DemoSavingsReport` (linked circuit, both window averages, measured %, extrapolated projection, source reading refs).
- **Triggers:** Automatic on `BenchmarkConfirmed` (FEAT-014).
- **Emits:** `DemoReportGenerated`, `DemoReportGenerationFailed`.
- **Consumes:** `BenchmarkConfirmed`, `LightingInventoryCaptured` (FEAT-006, for extrapolation).
- **Depends on:** FEAT-014, FEAT-006.
- **Depended on by:** FEAT-021, FEAT-022, FEAT-023; CAP-20 (offer generation reads the demo numbers).
- **Failure modes:** Missing lighting inventory is the most likely generation blocker — AC-3 names it explicitly rather than failing generically.
- **Limits & scale:** One report per (society, service line) demo — trivial volume.
- **Minimum viable version:** In-app report with the core figures and reading provenance.
- **Complete version:** Adds a shareable rendered document/image, matching the real "Live Metering Report" artefact already in evidence (02-users-research.md).
- **Open questions / assumptions:** none blocking.
- **Risks:** The extrapolation step (CON-11) is where a demo report can most easily overstate savings if the light inventory is wrong — a data-quality dependency on FEAT-006, worth calling out in the Phase 9 test plan.

### FEAT-021 — Demo report review & edit
- **Capability:** CAP-18 · **Persona:** PER-01 · **Serves:** GOAL-06
- **Surface(s):** SUR-01
- **Problem:** An auto-generated report going straight to a prospective customer with no human check is a commercial risk — but unrestricted editing of a "measured" report would destroy the very traceability that makes it credible.
- **Description:** PER-01 reviews the generated draft and can edit its presentation layer — narrative/commentary, which figures are emphasised, cover details — before sharing. The measured figures themselves (baseline, post-install average, computed %) are not hand-editable; a wrong measured figure means the underlying data is wrong, which is FEAT-015/CAP-02's problem, not a text edit.
- **Behavioral rules:** A hard line between derived figures (locked) and presentation (editable) — this is what makes INV-02's traceability claim true rather than aspirational. Every edit is attributed and retained in the report's history.
- **Acceptance criteria:**
  - AC-1 (happy): Given a generated draft, when PER-01 edits its narrative and marks it ready, then the report moves to `ready-to-share` with edits attributed.
  - AC-2 (empty): Given no drafts await review, the review queue shows a clear caught-up state.
  - AC-3 (failure): Given PER-01 attempts to alter a measured figure, the field is not editable — with an inline explanation pointing to the underlying readings rather than a bare disabled input.
  - AC-4 (permission): Given a non-PER-01 actor, review/edit is unavailable.
  - AC-5 (edge): Given PER-01 believes a measured figure is genuinely wrong, they can send the circuit back for re-measurement (rejoining FEAT-015's review path) rather than editing the number — the only legitimate correction route.
- **Permissions:** PER-01 (review/edit presentation, send back for re-measurement).
- **Data touched:** Updates `DemoSavingsReport` (narrative fields, status, edit history).
- **Triggers:** `DemoReportGenerated`.
- **Emits:** `DemoReportReady`, `DemoReportSentBackForRemeasurement`.
- **Consumes:** `DemoReportGenerated`.
- **Depends on:** FEAT-020.
- **Depended on by:** FEAT-022 (only a `ready-to-share` report can be shared).
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Narrative editing + ready flag.
- **Complete version:** Adds edit history display and the send-back-for-re-measurement route (AC-5).
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant — the locked-figures rule is the main safeguard and it's structural.

### FEAT-022 — Share the demo report & track delivery
- **Capability:** CAP-18 · **Persona:** PER-01 · **Serves:** GOAL-01, JTBD-08
- **Surface(s):** SUR-01
- **Problem:** Reports are shared over WhatsApp and email today with no record of what was sent, to whom, or when — so "did they get the numbers?" is a question no one can answer from the system during a live negotiation.
- **Description:** PER-01 shares a `ready-to-share` demo report with the society's contacts (captured in FEAT-005) via WhatsApp and/or email, and the share event is recorded: recipient, channel, timestamp, and which report version. The society can also view it in-app (FEAT-023).
- **Behavioral rules:** Sharing locks the report version — a shared report becomes immutable, and any subsequent change produces a new version rather than silently altering what the customer already has (same principle as the app's existing invoice-immutability finding in PROJECT_CONTEXT.md). Share events append; re-sharing is recorded as a separate event, not an overwrite.
- **Acceptance criteria:**
  - AC-1 (happy): Given a `ready-to-share` report, when PER-01 shares it to a recipient over a channel, then a share event is recorded and the report version is locked.
  - AC-2 (empty): Given a report has never been shared, its share history shows "not yet shared" explicitly — relevant during a stalled deal (CON-23's lead-health signal).
  - AC-3 (failure): Given the email/WhatsApp send fails, the failure is recorded and surfaced to PER-01 — not recorded as a successful share.
  - AC-4 (permission): Given a non-PER-01 actor, sharing is unavailable.
  - AC-5 (edge): Given a report is edited after being shared, a new version is created and the previously-shared version remains retrievable exactly as the customer received it.
- **Permissions:** PER-01 (share).
- **Data touched:** Creates `DemoReportShare` events; sets `DemoSavingsReport` version lock.
- **Triggers:** Manual.
- **Emits:** `DemoReportShared`, `DemoReportShareFailed`.
- **Consumes:** `DemoReportReady`.
- **Depends on:** FEAT-021.
- **Depended on by:** FEAT-023; CAP-20 (an offer typically follows a shared report); CON-23's follow-up/lead-health tracking counts share-then-silence as a stall signal.
- **Failure modes:** WhatsApp delivery in particular may not be reliably confirmable depending on integration approach — "sent" and "delivered" should not be conflated in the record.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Record a manual share (PER-01 marks that they sent it), no direct integration.
- **Complete version:** Direct email/WhatsApp send from the app with delivery status where the channel supports it.
- **Open questions / assumptions:** Whether WhatsApp sending is a real integration or a manual out-of-app step with in-app logging — not yet decided; the MVP framing above deliberately assumes the manual path.
- **Risks:** Building a WhatsApp integration is materially more work than logging a manual share — worth an explicit Phase 6 prioritization decision rather than being assumed in.

### FEAT-023 — Society view of the demo report & query raising
- **Capability:** CAP-18 · **Persona:** PER-05 (Committee), PER-06 (Manager) · **Serves:** JTBD-06
- **Surface(s):** SUR-01 (customer portal)
- **Problem:** A prospective society reviewing a savings claim over WhatsApp has nowhere to ask a question against a specific figure — queries arrive as calls to whoever they know, disconnected from the report itself.
- **Description:** The society views the shared demo report in the portal and can raise a query against it. Queries are answered by PER-01/PER-02 and tracked to resolution, sharing the thread/lifecycle shape used by CAP-12's communication log rather than inventing a parallel mechanism.
- **Behavioral rules:** A society only ever sees shared, version-locked reports — never drafts or in-review versions. Query threads attach to the specific report version being questioned, so a later revision doesn't orphan the conversation. Access here predates a signed agreement, so portal access must work for a prospect, not only an active customer — a real constraint on CAP-13's account model.
- **Acceptance criteria:**
  - AC-1 (happy): Given a report has been shared with them, when the committee opens the portal, then they can view it with its figures and underlying reading summary (INV-02's traceability, made visible rather than merely stored).
  - AC-2 (empty/first-run): Given nothing has been shared yet, the portal shows a clear "no report available yet" state rather than an error or blank page.
  - AC-3 (failure/degraded): Given the report fails to load, an explicit error state renders (INV-06).
  - AC-4 (permission): Given a society user, they see only their own society's reports; drafts and other societies' reports are inaccessible server-side, not merely unlinked.
  - AC-5 (edge): Given a query is raised, then it's visible to PER-01/PER-02 with the report and figure context attached, and the society can see its status through to resolution — not a one-way message.
- **Permissions:** PER-05/PER-06 (view own society's shared reports, raise queries), PER-01/PER-02 (respond).
- **Data touched:** Reads `DemoSavingsReport` (shared versions only); creates query threads (shared model with CAP-12).
- **Triggers:** Page load; `DemoReportShared` makes a report visible.
- **Emits:** `DemoReportQueryRaised`.
- **Consumes:** `DemoReportShared`.
- **Depends on:** FEAT-022; CAP-13 (a prospect-stage portal account must exist).
- **Depended on by:** CAP-12 (query threads live in the communication log); CAP-20 (unresolved queries are a real blocker to offer acceptance).
- **Failure modes:** Where a prospect declines or doesn't use their portal account, this feature degrades gracefully to "report shared over WhatsApp" with queries logged through CAP-12 instead — the backend path (FEAT-026) is mandatory precisely so this is a graceful degradation rather than a gap.
- **Limits & scale:** Trivial.
- **Minimum viable version:** View-only shared report, queries handled out-of-band via CAP-12.
- **Complete version:** In-portal query raising attached to the specific report version.
- **Open questions / assumptions:** none blocking — CON-34 confirmed prospects get a limited portal account at survey/demo stage, scoped to exactly this report view, its query thread, and document upload.
- **Risks:** See failure modes — this feature's value depends entirely on the pre-agreement account question being answered yes.

### FEAT-024 — Request & track required KYC documents
- **Capability:** CAP-19 · **Persona:** PER-01 · **Serves:** GOAL-05
- **Surface(s):** SUR-01
- **Problem:** Document collection is a common stall point between a shared demo report and a signed agreement, and today there's no view of which society is missing which document — chasing happens from memory.
- **Description:** PER-01 sees, per pipeline, the checklist of documents required before an agreement can proceed (currently GST document and a recent electricity bill), each with its collection status, and can record follow-ups against outstanding items — feeding CON-23's per-step follow-up count and lead-health signal.
- **Behavioral rules:** The required-document set is a configurable list, not hardcoded to today's two items — additional document types are expected as service lines expand. A document's status is derived from whether an accepted file exists, not manually toggled, so the checklist can't drift from reality.
- **Acceptance criteria:**
  - AC-1 (happy): Given a pipeline has reached the document-collection stage, when PER-01 opens it, then each required document shows as outstanding/received/verified with the received date where applicable.
  - AC-2 (empty/first-run): Given nothing has been collected yet, all items show as outstanding with a clear request action, not an empty panel.
  - AC-3 (failure): Given PER-01 records a follow-up, the follow-up count for this pipeline step increments and is visible in the lead-health view (CON-23) — a follow-up that isn't counted is a silent failure of the signal.
  - AC-4 (permission): Given a non-PER-01 internal actor, the checklist is read-only.
  - AC-5 (edge): Given a document type is genuinely not applicable to a given society (e.g. no GST registration), PER-01 can mark it not-applicable with a reason rather than leaving it permanently outstanding and skewing the stall signal.
- **Permissions:** PER-01 (manage, follow up, mark not-applicable).
- **Data touched:** Reads/creates `RequiredDocument` checklist items against the `Pipeline`; writes follow-up records (shared with CON-23's counter).
- **Triggers:** Pipeline reaching the KYC stage.
- **Emits:** `DocumentRequested`, `DocumentFollowUpLogged`.
- **Consumes:** `DemoReportShared` (typical predecessor), or the demo-skip path (CON-24/25).
- **Depends on:** CAP-15's pipeline record (CON-24).
- **Depended on by:** CAP-20 (offer/agreement can't complete without required documents); CAP-08's ops home surfaces stalled document collection.
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Fixed two-document checklist with status.
- **Complete version:** Configurable document set per service line, plus follow-up counting and not-applicable handling.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-025 — Society-side document upload
- **Capability:** CAP-19 · **Persona:** PER-05, PER-06 · **Serves:** JTBD-06
- **Surface(s):** SUR-01 (customer portal)
- **Problem:** Documents arrive today by WhatsApp or email, meaning they live in someone's chat history rather than against the society's record.
- **Description:** The society uploads its required documents directly through the portal against the named checklist items from FEAT-024. Uploads land in the same S3-backed document storage the app already uses, following the established `Documents/{Society}/{YYYY-MM}/{DocType}/...` naming convention.
- **Behavioral rules:** Upload is offered as the preferred path but is never the only path — CON-19's own framing is explicit that documents received by call/WhatsApp are entered by backend instead (FEAT-026). A society upload sets the item to `received`, not `verified`; verification is PER-01's action.
- **Acceptance criteria:**
  - AC-1 (happy): Given an outstanding required document, when the society uploads a file, then the item moves to `received` and PER-01 is notified for verification.
  - AC-2 (empty/first-run): Given nothing outstanding, the portal shows no pending document requests rather than an empty uploader.
  - AC-3 (failure): Given an upload fails or the file type is unsupported, a clear error is shown and the item stays outstanding — never silently marked received.
  - AC-4 (permission): Given a society user, they can upload only against their own society's checklist items.
  - AC-5 (edge): Given a document is re-uploaded after being rejected in verification, the new file is added as a new version with the rejection reason retained in history, not overwriting the original.
- **Permissions:** PER-05/PER-06 (upload own society's documents).
- **Data touched:** Creates document records + S3 objects; updates `RequiredDocument` status.
- **Triggers:** Manual, prompted by FEAT-024's request.
- **Emits:** `DocumentUploaded`.
- **Consumes:** `DocumentRequested`.
- **Depends on:** FEAT-024; existing S3 upload infrastructure (already built — presigned PUT, per PROJECT_CONTEXT.md).
- **Depended on by:** FEAT-026 (verification).
- **Failure modes:** Same prospect-account dependency as FEAT-023 — a society without portal access pre-agreement simply uses the WhatsApp/backend path instead, which is why FEAT-026 is not optional.
- **Limits & scale:** Trivial (a handful of documents per society).
- **Minimum viable version:** Straightforward upload against a checklist item.
- **Complete version:** Adds versioning on re-upload after rejection (AC-5).
- **Open questions / assumptions:** none blocking — CON-34 confirmed a scoped prospect account exists; the backend-entry path (FEAT-026) remains mandatory regardless.
- **Risks:** Low — the backend path (FEAT-026) covers this feature's failure entirely.

### FEAT-026 — Backend document entry & verification
- **Capability:** CAP-19 · **Persona:** PER-01 · **Serves:** GOAL-06
- **Surface(s):** SUR-01
- **Problem:** Most documents will realistically arrive via WhatsApp or a phone call regardless of what the portal offers — without a first-class backend entry path, those documents never make it into the record.
- **Description:** PER-01 uploads a document received out-of-band against a society's checklist item, recording how it was received, and verifies documents (from either path) as acceptable or rejects them with a reason.
- **Behavioral rules:** Verification is the single gate that makes a checklist item complete, regardless of which path the file arrived by — so society-uploaded and backend-entered documents converge on one state machine rather than two. The received-via channel is recorded for provenance.
- **Acceptance criteria:**
  - AC-1 (happy): Given a document received over WhatsApp, when PER-01 uploads it against the checklist item and verifies it, then the item moves to `verified` with the channel recorded.
  - AC-2 (empty): Given nothing awaits verification, the queue shows a caught-up state.
  - AC-3 (failure/rejection): Given a document is illegible or wrong, when PER-01 rejects it with a reason, then the item returns to outstanding with the reason visible to the society (where portal access exists) and to whoever follows up.
  - AC-4 (permission): Given a non-PER-01 actor, verification is unavailable.
  - AC-5 (edge): Given the same document type is submitted twice through different paths (society upload plus a WhatsApp copy), PER-01 verifies one and the other is retained as a duplicate rather than either being silently discarded.
- **Permissions:** PER-01 (upload on behalf, verify, reject).
- **Data touched:** Creates document records; updates `RequiredDocument` status, verification result, rejection reason, received-via channel.
- **Triggers:** Manual, or `DocumentUploaded` for the verification half.
- **Emits:** `DocumentVerified`, `DocumentRejected`.
- **Consumes:** `DocumentUploaded`.
- **Depends on:** FEAT-024.
- **Depended on by:** CAP-20 — an agreement cannot be finalized with unverified required documents.
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Upload-on-behalf plus a binary verify/reject.
- **Complete version:** Adds channel provenance and duplicate handling.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-027 — Generate an offer from demo numbers
- **Capability:** CAP-20 · **Persona:** PER-01, PER-07 · **Serves:** JTBD-08, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** The commercial offer has to be arithmetically consistent with the demo report the society just received — built by hand, it can drift from the measured numbers, which is exactly the kind of inconsistency that stalls a deal.
- **Description:** An offer is generated for a (society, service line) from the confirmed demo numbers: the measured benchmark %, the whole-society extrapolation, the proposed revenue-share split (e.g. 58/42), the tolerance band (±5% or ±10% per CON-01a), the exclusion list (CON-01b), term length, and AMC terms. In the demo-skip path (CON-25) the offer instead carries the agreed fixed benchmark % (60-80% range, e.g. 65%) and is explicitly marked `benchmarkSource: negotiated-fixed` — metering and monitoring still apply (FEAT-052).
- **Behavioral rules:** The benchmark % in an offer is inherited from the demo report, never retyped — and where it's negotiated instead (CON-25), that provenance distinction is recorded on the offer itself, since it determines whether monthly billing reconciles against readings at all. Revenue-share split, tolerance band, and exclusions are per-deal terms, not global defaults hardcoded into the system (the real Ace Aspire contract confirms these vary).
- **Acceptance criteria:**
  - AC-1 (happy): Given a confirmed demo report, when PER-07 generates an offer, then the benchmark %, extrapolated savings, and derived monthly fee are pre-filled from the demo data and the commercial terms are editable.
  - AC-2 (empty/first-run): Given no offer exists for a pipeline, the stage shows a clear "no offer yet" state with a generate action.
  - AC-3 (failure): Given required commercial terms (revenue-share %, tolerance band, term) are left unset, the offer cannot be issued — these are the terms every downstream billing decision depends on.
  - AC-4 (permission): Given a non-PER-01/PER-07 actor, offer generation is unavailable.
  - AC-5 (edge): Given the demo-skip path (CON-25), when an offer is generated with a negotiated benchmark, then `benchmarkSource = negotiated-fixed` is set and the offer records that the savings **percentage** is agreement-derived while consumption is still metered and monitored against the first post-install month (FEAT-052) — INV-02's narrowed exception, made explicit on the document.
- **Permissions:** PER-01, PER-07 (generate/edit before issue).
- **Data touched:** Creates `Offer` (benchmark %, benchmarkSource, extrapolation, revenue-share split, tolerance band, exclusions, term, AMC terms).
- **Triggers:** Manual, typically after `DemoReportShared`.
- **Emits:** `OfferGenerated`.
- **Consumes:** `DemoReportGenerated`/`DemoReportShared`, or the CON-25 skip path.
- **Depends on:** FEAT-020 (demo numbers) or CON-25's negotiated path; FEAT-006 (lighting inventory, for extrapolation).
- **Depended on by:** FEAT-028, FEAT-029; CAP-07 (contract management inherits these terms); CAP-04 (billing engine reads tolerance band, revenue-share, exclusions).
- **Failure modes:** An offer issued with a wrong revenue-share or tolerance band propagates into the contract and every subsequent invoice — this is a high-consequence data-entry point, arguing for explicit confirmation before issue rather than a plain save.
- **Limits & scale:** Trivial volume; high per-record consequence.
- **Minimum viable version:** Offer with core commercial terms pre-filled from demo data.
- **Complete version:** Adds a rendered offer document, term templates, and an explicit pre-issue confirmation step.
- **Open questions / assumptions:** none blocking.
- **Risks:** See failure modes — the terms set here govern billing for the whole contract term.

### FEAT-028 — Offer negotiation (accept / counter / reject)
- **Capability:** CAP-20 · **Persona:** PER-07, PER-05 · **Serves:** JTBD-08
- **Surface(s):** SUR-01
- **Problem:** Negotiation happens over calls and messages today, so "what did we last offer them, and what did they ask for?" has no authoritative answer — a real problem when a deal takes weeks.
- **Description:** An issued offer can be accepted, countered (with the society's requested terms recorded), or rejected. A counter produces a new offer version rather than editing the issued one, so the full negotiation history is preserved. Acceptance advances the pipeline to agreement preparation (FEAT-029).
- **Behavioral rules:** Issued offers are immutable — every change is a new version (same immutability principle as demo reports and invoices elsewhere in this product). Rejection is terminal for that offer but not necessarily for the pipeline; the deal can be re-offered later, which is a new offer, not a reopened one.
- **Acceptance criteria:**
  - AC-1 (happy): Given an issued offer, when the society accepts, then the offer is marked accepted and the pipeline advances to agreement preparation.
  - AC-2 (empty): Given an offer has been issued but not responded to, its state clearly shows "awaiting response" with elapsed time — this is a primary stall signal for FEAT-031.
  - AC-3 (failure/rejection): Given the society rejects, the offer is marked rejected with a reason and the pipeline is flagged as stalled rather than silently closed — a rejected offer is often followed by a counter-proposal in practice.
  - AC-4 (permission): Given a non-PER-01/PER-07 actor, recording an outcome is unavailable.
  - AC-5 (edge): Given a counter is recorded, a new offer version is created carrying the requested terms, and the previous version remains retrievable exactly as issued.
- **Permissions:** PER-01, PER-07 (record outcomes on the society's behalf; the society itself does not accept in-app at MVP).
- **Data touched:** Updates `Offer` state; creates new `Offer` versions on counter.
- **Triggers:** Manual, as the negotiation happens.
- **Emits:** `OfferAccepted`, `OfferCountered`, `OfferRejected`.
- **Consumes:** `OfferGenerated`.
- **Depends on:** FEAT-027.
- **Depended on by:** FEAT-029; FEAT-031 (stall detection); CAP-07.
- **Failure modes:** If negotiation continues over WhatsApp without being recorded, the version history is incomplete and the stall signal misfires — the same adoption risk that runs through the ops features.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Backend-recorded accept/counter/reject with versioning.
- **Complete version:** Society-side in-portal acceptance (a real signature-equivalent action, which likely needs its own legal review — deliberately not assumed here).
- **Open questions / assumptions:** Whether in-portal acceptance is legally sufficient in this context is unresolved and deliberately out of MVP scope.
- **Risks:** none significant at MVP framing.

### FEAT-029 — Agreement preparation, print & notarization
- **Capability:** CAP-20 · **Persona:** PER-01 · **Serves:** JTBD-08
- **Surface(s):** SUR-01
- **Problem:** The signed agreement is the legal source of truth for every billing term, yet its production today is entirely off-system — meaning the terms the system bills against and the terms on paper are only informally connected.
- **Description:** On offer acceptance, the agreement is prepared from the accepted offer's terms, printed, notarized, and physically signed. The executed document is scanned back into the system and its terms are recorded as the authoritative contract (handing off to CAP-07). Physical delivery and pickup are tracked via FEAT-030.
- **Behavioral rules:** The recorded contract terms must be derived from the accepted offer version — not re-entered — so the paper document and the billing engine's inputs cannot silently diverge. The pipeline does not advance to installation until the executed agreement is uploaded and its terms confirmed.
- **Acceptance criteria:**
  - AC-1 (happy): Given an accepted offer, when PER-01 prepares the agreement, then a document carrying exactly the accepted terms is produced for printing.
  - AC-2 (empty/first-run): Given no agreement prepared yet, the stage shows what's outstanding (print / notarize / sign / upload) as discrete steps rather than one opaque status.
  - AC-3 (failure): Given the executed scan isn't uploaded, the pipeline cannot advance to installation — a hard gate, since installation commits FirsThing's own capital (CON: hardware ownership).
  - AC-4 (permission): Given a non-PER-01 actor, agreement preparation and term confirmation are unavailable.
  - AC-5 (edge): Given the physically-signed agreement differs from the accepted offer (a last-minute handwritten change, which does happen), PER-01 must record the deviation explicitly — the system takes the executed document as authoritative but requires the difference to be visible, not silently reconciled.
- **Permissions:** PER-01 (prepare, upload executed copy, confirm terms).
- **Data touched:** Creates the executed-agreement document record; writes authoritative contract terms (CAP-07's entity).
- **Triggers:** `OfferAccepted`.
- **Emits:** `AgreementExecuted`.
- **Consumes:** `OfferAccepted`.
- **Depends on:** FEAT-028; FEAT-026 (required documents verified).
- **Depended on by:** CAP-07 (contract record); CAP-21 (installation cannot start without an executed agreement); CAP-04 (billing terms).
- **Failure modes:** AC-5's handwritten-deviation case is the realistic one — without it, the system's terms and the legal document drift apart invisibly.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Upload the executed scan + manually confirm terms against the accepted offer.
- **Complete version:** Generated agreement document from a template, with deviation flagging.
- **Open questions / assumptions:** none blocking.
- **Risks:** Term drift between paper and system is the central risk here; AC-5 is its mitigation.

### FEAT-030 — Field handoff tracking (physical document logistics)
- **Capability:** CAP-20 · **Persona:** PER-01, PER-03, PER-04 · **Serves:** GOAL-05
- **Surface(s):** SUR-02 (field executive logs handoffs), SUR-01 (ops tracks)
- **Problem:** Agreements physically travel between FirsThing and the society by hand, and today a document sitting in someone's bag for a week is indistinguishable from one awaiting signature — CON-23 names this as a real, tracked step.
- **Description:** Each physical handoff of a document is logged as a discrete event: who handed over, who received, their contact, timestamp, and location (e.g. "maintenance office," "main gate"). Delivery and pickup are separate tracked events on the same document.
- **Behavioral rules:** This is a generic handoff event type, not agreement-specific — CON-23's pattern is reusable for any physical document movement, so it should not be modeled as a field on `Agreement`. Every handoff records both parties, not just the FirsThing side.
- **Acceptance criteria:**
  - AC-1 (happy): Given a field executive delivers the agreement, when they log the handoff with recipient, contact, and location, then the document's location state updates and ops sees it immediately.
  - AC-2 (empty/first-run): Given no handoffs yet, the document shows as "with FirsThing / not yet dispatched."
  - AC-3 (failure): Given a required handoff field (recipient, location) is missing, the log is rejected — a handoff without a named recipient defeats the purpose of tracking it.
  - AC-4 (permission): Given a field staff member, they can log handoffs for documents assigned to them; PER-01 can log on their behalf.
  - AC-5 (edge): Given a document is delivered and later picked up signed, both events are retained in sequence, so the round trip and its duration are visible — the pickup does not replace the delivery record.
- **Permissions:** PER-03/PER-04 (log handoffs), PER-01 (log on behalf, view all).
- **Data touched:** Creates `DocumentHandoff` events (document ref, direction, from/to party, contact, timestamp, location).
- **Triggers:** Manual, at each physical handoff.
- **Emits:** `DocumentHandedOff`.
- **Consumes:** `AgreementExecuted` and related document-lifecycle events.
- **Depends on:** FEAT-029 (something to hand off).
- **Depended on by:** FEAT-031 (a document stuck in transit is a stall signal); CAP-08's ops home.
- **Failure modes:** Low field adoption would make the record patchy; the mitigation is that this is a fast, few-field log rather than a form.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Manual handoff log with the five CON-23 fields.
- **Complete version:** Adds device-GPS location capture rather than a typed location label.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-031 — Follow-up logging & lead-health signal
- **Capability:** CAP-20 · **Persona:** PER-01, PER-07 · **Serves:** GOAL-05
- **Surface(s):** SUR-01
- **Problem:** Deals stall silently. Without counting follow-ups per pipeline step, no one can see which societies are stuck, at what step, and for how long — CON-23 defines exactly this as a real-time lead-health signal.
- **Description:** Every backend follow-up on a stalled pipeline step (chasing a document, an unanswered offer, an unreturned agreement) is logged individually against that step. The per-step follow-up count, aggregated per society, becomes a lead-health indicator visible across the whole pipeline view.
- **Behavioral rules:** Follow-ups attach to a specific pipeline *step*, not just the society — the whole value of the signal is knowing *where* a deal is stuck. Health is derived from follow-up count plus time-in-step; it is not a manually-set status field, which would defeat the point.
- **Acceptance criteria:**
  - AC-1 (happy): Given a stalled step, when PER-01 logs a follow-up with a note, then the step's follow-up count increments and the society's lead-health indicator updates.
  - AC-2 (empty): Given a healthy, actively-progressing pipeline, its health indicator reads clean rather than showing a meaningless zero-state metric.
  - AC-3 (failure/degraded): Given the pipeline list can't compute health (missing timestamps), it degrades to showing raw follow-up counts rather than rendering a wrong health state (INV-06's degraded requirement, applied to a derived metric).
  - AC-4 (permission): Given a non-PER-01/PER-07 actor, follow-up logging is unavailable.
  - AC-5 (edge): Given a step is stuck on the society's side versus FirsThing's side, the follow-up record distinguishes which — otherwise the signal can't tell "we're slow" from "they're slow," which are opposite operational problems.
- **Permissions:** PER-01, PER-07 (log, view).
- **Data touched:** Creates `PipelineFollowUp` records; derives lead-health on `Pipeline`.
- **Triggers:** Manual per follow-up; health recomputed on read.
- **Emits:** `FollowUpLogged`.
- **Consumes:** all CAP-15..21 stage events (for time-in-step).
- **Depends on:** CAP-15's `Pipeline` entity (CON-24).
- **Depended on by:** CAP-08's ops home priority queue; FEAT-004's staleness flagging shares this mechanism.
- **Failure modes:** Follow-ups made by phone but not logged undercount the signal, making a badly-stuck deal look merely quiet.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Follow-up count per step, displayed raw.
- **Complete version:** Derived health indicator combining count and time-in-step, with the blocked-side distinction (AC-5).
- **Open questions / assumptions:** The exact health thresholds aren't specified — deliberately deferred rather than invented here.
- **Risks:** A health metric no one trusts gets ignored; thresholds should be tuned against real pipeline data rather than set upfront.

### FEAT-032 — Demo-skip exception
- **Capability:** CAP-20 · **Persona:** PER-01 (management) · **Serves:** GOAL-03
- **Surface(s):** SUR-01
- **Problem:** A society sometimes asks to go straight to an agreement without a demo. That has real commercial consequences (CON-25), so it needs to be an explicit, attributed, auditable exception rather than an undocumented manual workaround.
- **Description:** Management marks a single pipeline's demo stage as skipped, with a recorded reason, approver, and date. **Corrected at the Phase 3 gate (2026-08-12):** this is the *only* skip the product supports. An earlier draft of this feature described a general per-stage configuration system; CON-24 was corrected to establish that **the survey is mandatory and nothing other than the demo may be skipped**.
- **Behavioral rules:** One named exception flag on the pipeline (`demoSkipped` + approver + reason + date), not a general stage-configuration model. **Metering still happens on a demo-skip deal** (CON-25) — the meter goes in on the survey day or later, never before the survey, so this skips the pre/post 5-day demo *windows* (CON-19/20), not metering and not ongoing monitoring. Skipping the demo forces `benchmarkSource: negotiated-fixed` on the resulting offer (FEAT-027 AC-5). Separately, CON-21's daily-installation-review gate is skippable **once per project** with backend approval — that is its own rule inside FEAT-035, not an instance of this mechanism.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society requests to skip the demo, when management records the skip with a reason, then the pipeline advances from survey directly toward KYC/offer, the skip is recorded with approver and timestamp, and CAP-02 switches to its no-demo commissioning variant (meter install → first post-install month becomes the reference).
  - AC-2 (empty/first-run): Given no skip is recorded, the pipeline follows the standard sequence with every stage active — which is the normal case.
  - AC-3 (failure): Given an attempt to skip the survey, or any stage other than the demo, the action does not exist — there is no mechanism to attempt it (CON-24). The survey is mandatory without exception.
  - AC-4 (permission): Given a non-management actor, recording a demo skip is unavailable; the general admin role is insufficient.
  - AC-5 (edge): Given the demo is skipped, then the offer is forced to `benchmarkSource = negotiated-fixed` (FEAT-027 AC-5) and billing follows FEAT-052 — a workflow shortcut that changes the commercial model, not just the step count.
- **Permissions:** Management-level only (a named permission, per XC-06).
- **Data touched:** Sets `Pipeline.demoSkipped` (approver, reason, date).
- **Triggers:** Manual, management decision, at the society's explicit request (CON-25).
- **Emits:** `DemoSkipped`.
- **Consumes:** none.
- **Depends on:** CAP-15's `Pipeline` entity (CON-24).
- **Depended on by:** FEAT-002 AC-5 (next-stage branching), FEAT-027 AC-5 (benchmark source), FEAT-052 (billing path), CAP-02's no-demo variant.
- **Failure modes:** Because the survey is mandatory and metering always happens, the earlier worry about ambiguous half-executed stage state largely disappears — a demo skip is decided before the demo starts, by definition.
- **Limits & scale:** Rare by design — CON-25 calls it exceptional.
- **Minimum viable version:** The flag with approver and reason.
- **Complete version:** Adds automatic propagation into the offer's `benchmarkSource` and CAP-02's variant selection.
- **Open questions / assumptions:** none blocking — resolved at the Phase 3 gate.
- **Risks:** If demo-skip becomes common rather than exceptional, the product's measured-savings positioning weakens (the same risk noted on FEAT-052) — worth watching as a business metric.

### FEAT-033 — Installation project setup & batch plan
- **Capability:** CAP-21 · **Persona:** PER-01 · **Serves:** GOAL-05
- **Surface(s):** SUR-01
- **Problem:** A full installation replaces hundreds to thousands of lights across a society over multiple days — without a planned batch structure, neither FirsThing nor the society can tell what's done, what's next, or whether the project is on track.
- **Description:** On agreement execution, PER-01 sets up the installation project: total scope (from FEAT-006's lighting inventory, adjusted to the agreement), the area/batch breakdown, planned daily batches, assigned installation staff, and the society's designated onlooker (the person who performs CON-21's daily review).
- **Behavioral rules:** The designated society onlooker must be named at setup — CON-21's daily gate is unenforceable without a specific person responsible for it. Scope comes from the surveyed inventory but is explicitly adjustable, since the agreement may cover a subset of areas.
- **Acceptance criteria:**
  - AC-1 (happy): Given an executed agreement, when PER-01 sets up the project with scope, batches, staff, and a named onlooker, then the installation project is created and day 1 can be scheduled (via CAP-17).
  - AC-2 (empty/first-run): Given no project set up yet, the pipeline's installation stage shows what setup is outstanding rather than an empty screen.
  - AC-3 (failure): Given no society onlooker is named, project setup cannot complete — the daily review gate depends on it.
  - AC-4 (permission): Given a non-PER-01 actor, setup is unavailable.
  - AC-5 (edge): Given the agreed scope differs from the surveyed inventory (e.g. the society excludes one tower), the difference is recorded rather than the inventory being edited — the survey remains a record of what exists, the project records what's contracted.
- **Permissions:** PER-01 (setup, edit).
- **Data touched:** Creates `InstallationProject` (scope, batches, assigned staff, society onlooker, planned schedule).
- **Triggers:** `AgreementExecuted` (FEAT-029).
- **Emits:** `InstallationProjectCreated`.
- **Consumes:** `AgreementExecuted`, `LightingInventoryCaptured`.
- **Depends on:** FEAT-029, FEAT-006.
- **Depended on by:** FEAT-034 through FEAT-038; CAP-17 (each installation day is a scheduled field visit).
- **Failure modes:** An under-scoped project plan surfaces later as unplanned extra days — handled through FEAT-036's requirement-change path rather than by re-planning from scratch.
- **Limits & scale:** Society scope can reach thousands of lights (00-intake.md §7 sets no cap on total society lights) — batches, not individual fixtures, are the tracking unit, which keeps this well within trivial data volumes.
- **Minimum viable version:** Scope + named onlooker + a simple batch list.
- **Complete version:** Adds planned-vs-actual scheduling and staff assignment per batch.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-034 — Daily installation batch logging
- **Capability:** CAP-21 · **Persona:** PER-04 · **Serves:** GOAL-05
- **Surface(s):** SUR-02
- **Problem:** CON-21's review gate requires a precise, same-day record of what was installed where — a vague "we did the B block today" can't be reviewed or disputed meaningfully.
- **Description:** At the end of each installation day, PER-04 logs the batch: area(s) covered, count installed, any fixtures skipped and why, and photo evidence. Submitting the batch opens the society's review window (FEAT-035).
- **Behavioral rules:** A batch must be submitted with enough locational specificity for the society's onlooker to physically verify it — area-level, not society-level. The submission timestamp starts CON-21's clock: the review must be completed at least 3 hours before the next day's work begins.
- **Acceptance criteria:**
  - AC-1 (happy): Given a day's work is finished, when PER-04 submits the batch with areas, counts, and photos, then the batch enters `awaiting-review` and the onlooker is notified.
  - AC-2 (empty/first-run): Given day 1 hasn't been logged, the project shows "no batches submitted yet."
  - AC-3 (failure): Given photo evidence is missing, the batch cannot be submitted — photos are what make the society's review and any dispute (FEAT-035) resolvable.
  - AC-4 (permission): Given a non-PER-04 actor, batch submission is unavailable.
  - AC-5 (edge): Given some fixtures in an area were skipped (inaccessible flat, damaged wiring), they're recorded as skipped with a reason and remain in the project's outstanding scope rather than silently reducing it.
- **Permissions:** PER-04 (submit), PER-01 (view, correct).
- **Data touched:** Creates `InstallationBatch` (day, areas, counts, skipped items + reasons, photos).
- **Triggers:** Manual, end of each installation day.
- **Emits:** `BatchSubmitted`.
- **Consumes:** `InstallationProjectCreated`.
- **Depends on:** FEAT-033.
- **Depended on by:** FEAT-035 (review gate), FEAT-037 (completion), FEAT-038 (progress views).
- **Failure modes:** Late-evening submission compresses the society's review window against CON-21's 3-hour rule — the timing relationship should be surfaced to PER-04 at submission, not discovered the next morning.
- **Limits & scale:** Tens of batches per project — trivial.
- **Minimum viable version:** Areas, counts, photos, submit.
- **Complete version:** Adds skipped-item tracking and a submission-time warning about the review window.
- **Open questions / assumptions:** none blocking.
- **Risks:** Photo-heavy submission over poor site connectivity — same offline concern as CAP-16's field capture.

### FEAT-035 — Society daily review & approval gate
- **Capability:** CAP-21 · **Persona:** PER-05, PER-06 (the designated onlooker) · **Serves:** JTBD-06
- **Surface(s):** SUR-01 (customer portal)
- **Problem:** CON-21 makes this a hard sequencing gate: the next day's installation cannot start until the previous day's batch is approved. This is the mechanism that keeps a large multi-day installation verifiable rather than a matter of trust after the fact.
- **Description:** The society's designated onlooker reviews each submitted batch and either approves it or disputes it with photo and location evidence. Approval must land at least 3 hours before the next day's work begins; without it, the next day cannot start. The gate is skippable once per project only, and only with explicit backend approval — a rule of its own under CON-21, separate from FEAT-032's demo-skip exception.
- **Behavioral rules:** No approval, no next day — this is enforced in the system, not merely reminded about. A dispute requires photo and location evidence, matching the evidentiary standard FirsThing's own batch submission is held to. The once-per-project skip is enforced as a hard count, not a soft warning.
- **Acceptance criteria:**
  - AC-1 (happy): Given a submitted batch, when the onlooker approves it more than 3 hours before the next day's start, then the next day's work is unblocked.
  - AC-2 (empty/first-run): Given no batch awaits review, the onlooker's view shows a clear caught-up state.
  - AC-3 (failure/blocked): Given the previous day's batch is unapproved within 3 hours of the next day's planned start, then the next day is blocked and both PER-01 and PER-04 are alerted — the block is visible before the crew arrives, not on arrival.
  - AC-4 (permission): Given a society user who is not the designated onlooker, they can view batches but not approve them; only the named onlooker's approval satisfies the gate.
  - AC-5 (edge): Given the gate is skipped with backend approval, then the skip is recorded against the project's once-only allowance and a second skip attempt is refused (CON-21) — a hard count, enforced here rather than by FEAT-032.
- **Permissions:** Designated society onlooker (approve/dispute), PER-01 (grant the once-per-project skip).
- **Data touched:** Updates `InstallationBatch` (review state, dispute evidence); records gate skips.
- **Triggers:** `BatchSubmitted`.
- **Emits:** `BatchApproved`, `BatchDisputed`, `NextDayBlocked`, `ReviewGateSkipped`.
- **Consumes:** `BatchSubmitted`.
- **Depends on:** FEAT-034; FEAT-033 (named onlooker).
- **Depended on by:** FEAT-034's next-day submission; FEAT-037 (completion requires all batches approved).
- **Failure modes:** An unresponsive or absent onlooker blocks the whole project — the once-per-project skip is the intended relief valve, but a society that goes silent for several days has no defined remedy beyond escalation. Worth resolving.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Approve/dispute with the hard next-day block.
- **Complete version:** Adds proactive reminders ahead of the 3-hour deadline and the skip-allowance tracking.
- **Open questions / assumptions:** No defined remedy for a persistently unresponsive onlooker beyond the single skip — flagged for resolution.
- **Risks:** This gate is the single biggest schedule risk in an installation project: it hands a society's volunteer the ability to stall FirsThing's crew daily. Real, and inherent to the design rather than a flaw in it — but worth the reminder mechanism in the complete version.

### FEAT-036 — Installation blockers & requirement changes
- **Capability:** CAP-21 · **Persona:** PER-04, PER-01 · **Serves:** GOAL-05
- **Surface(s):** SUR-02 (raise), SUR-01 (resolve)
- **Problem:** Installations hit real-world obstacles — inaccessible areas, wiring that needs work, a society changing what it wants mid-project. Handled off-system, these become verbal disputes about scope and delay.
- **Description:** PER-04 raises a blocker (something preventing planned work) or a requirement change (the society asking for something different from the agreed scope) from the field. PER-01 resolves it, and where a requirement change affects scope or cost, it's recorded against the project as a scope amendment rather than silently absorbed.
- **Behavioral rules:** Blockers and requirement changes are distinct: a blocker is FirsThing's problem to clear; a requirement change alters the contracted scope and may need commercial review. A requirement change that alters the light count has a direct downstream consequence — it may trigger CON-10's benchmark rescale — so it cannot be treated as a purely operational note.
- **Acceptance criteria:**
  - AC-1 (happy): Given an obstacle on site, when PER-04 raises a blocker with detail and photos, then PER-01 sees it immediately with the affected batch/area context.
  - AC-2 (empty): Given no open blockers, the project shows a clean state.
  - AC-3 (failure): Given a blocker remains unresolved past the planned batch date, it's flagged as schedule-impacting rather than sitting as an ordinary open item.
  - AC-4 (permission): Given a non-PER-04/PER-01 actor, raising and resolving are unavailable respectively.
  - AC-5 (edge): Given a requirement change alters the total light count, then the change is flagged as benchmark-affecting (CON-10) and cannot be closed as a routine operational note — it routes to whoever owns the contract terms.
- **Permissions:** PER-04 (raise), PER-01 (resolve, classify).
- **Data touched:** Creates `InstallationIssue` (type: blocker | requirement-change, detail, photos, affected scope, resolution).
- **Triggers:** Manual, from the field.
- **Emits:** `BlockerRaised`, `RequirementChangeRaised`, `IssueResolved`.
- **Consumes:** `InstallationProjectCreated`.
- **Depends on:** FEAT-033.
- **Depended on by:** FEAT-037 (open blockers prevent completion); CAP-07 (scope amendments); CAP-02/CAP-04 (light-count-driven benchmark rescale).
- **Failure modes:** A requirement change closed as a routine note while it actually changed the light count would silently invalidate the benchmark — AC-5 exists precisely to prevent this.
- **Limits & scale:** Trivial.
- **Minimum viable version:** A single issue type with detail and resolution.
- **Complete version:** The blocker/requirement-change distinction with benchmark-impact flagging.
- **Open questions / assumptions:** none blocking.
- **Risks:** See failure modes — the light-count linkage is easy to miss operationally.

### FEAT-037 — Completion certificate & billing start
- **Capability:** CAP-21 · **Persona:** PER-01, PER-05 · **Serves:** GOAL-01
- **Surface(s):** SUR-01
- **Problem:** CON-22 makes this moment financially precise: billing starts the day *after* the completion certificate is signed, with the first month pro-rated. An imprecise completion date directly produces a wrong first invoice.
- **Description:** Once all batches are approved and no blockers remain, a completion certificate is produced and signed by the society. Signing records the completion date, which triggers billing to begin the following day with the first month pro-rated for the remaining days in that calendar month.
- **Behavioral rules:** Completion requires every batch approved (FEAT-035) and no open blockers (FEAT-036) — it cannot be declared over an incomplete or disputed project. The signed date, not the upload date or the last batch date, is what drives CON-22's proration. Completion also triggers the full-installation instance of the gate-pass pattern (§5, CON-18).
- **Acceptance criteria:**
  - AC-1 (happy): Given all batches are approved and no blockers are open, when the completion certificate is signed and its date recorded, then the pipeline moves to `active-billing` and billing is scheduled to start the next day.
  - AC-2 (empty/first-run): Given the project isn't complete, the completion action shows exactly what's outstanding (unapproved batches, open blockers) rather than being merely disabled.
  - AC-3 (failure): Given an attempt to complete with an open blocker, it's refused with the blocking items listed.
  - AC-4 (permission): Given a non-PER-01 actor, recording completion is unavailable; the society's signature is captured as evidence, not as a system action they perform.
  - AC-5 (edge): Given completion falls mid-month, then the first invoice is pro-rated for the actual remaining days in that calendar month (CON-22) — not billed as a full month and not deferred to the following month.
- **Permissions:** PER-01 (record completion), society (sign, evidenced).
- **Data touched:** Creates the completion certificate record; updates `Pipeline` to `active-billing`; sets the billing start date on the contract.
- **Triggers:** Manual, once conditions are met.
- **Emits:** `InstallationCompleted`, `BillingStarted`.
- **Consumes:** `BatchApproved` (all), `IssueResolved`.
- **Depends on:** FEAT-035, FEAT-036.
- **Depended on by:** CAP-04 (billing engine's proration path); CAP-03 (ongoing meter ingest starts); CAP-11 (routine inspection cadence begins).
- **Failure modes:** A completion date recorded as the upload date rather than the signature date would shift the first invoice — AC-5 and the behavioral rule make the distinction explicit.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Certificate upload + completion date + billing start trigger.
- **Complete version:** Adds the precondition checklist display (AC-2) and gate-pass integration.
- **Open questions / assumptions:** none blocking.
- **Risks:** This is the handoff point from project work to recurring revenue — an error here is visible to the customer on their very first invoice.

### FEAT-038 — Per-role installation progress dashboards
- **Capability:** CAP-21 · **Persona:** PER-01, PER-04, PER-05 · **Serves:** GOAL-05, JTBD-06
- **Surface(s):** SUR-01 (ops + society), SUR-02 (field)
- **Problem:** A multi-day installation has three audiences with genuinely different questions — ops asks "are all projects on track," the field crew asks "what's my scope today," the society asks "how far along are you and what do I need to approve" — served today by phone calls.
- **Description:** Three role-scoped views over one `InstallationProject` model: ops sees all active projects with progress, blockers, and gate status; PER-04 sees today's batch scope and outstanding items; the society sees overall progress and its own pending approvals.
- **Behavioral rules:** One shared underlying state, three projections — the surfaces must never disagree about progress, which is the whole point of the shared-contract designation on this capability. The society's view exposes progress and its own approval obligations only, not internal staffing or blocker detail that isn't its concern.
- **Acceptance criteria:**
  - AC-1 (happy): Given active projects, when PER-01 opens the ops view, then each project shows completed/total scope, current gate state, and open blockers.
  - AC-2 (empty/first-run): Given no active installations, each view shows an appropriate empty state (INV-06).
  - AC-3 (failure/degraded): Given progress data can't be computed, the views degrade to showing raw batch records rather than a misleading progress figure.
  - AC-4 (permission): Given a society user, they see only their own project and only the fields intended for them; PER-04 sees only projects they're assigned to.
  - AC-5 (edge): Given a project is blocked by an unapproved batch, all three views show that consistently — the field crew is not left to discover the block on arrival (see FEAT-035 AC-3).
- **Permissions:** PER-01 (all projects), PER-04 (assigned), PER-05/PER-06 (own society, scoped fields).
- **Data touched:** Reads `InstallationProject`, `InstallationBatch`, `InstallationIssue`.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** all CAP-21 events.
- **Depends on:** FEAT-033 through FEAT-036.
- **Depended on by:** CAP-08's ops home (active installations as one input); CAP-14's society portal embeds the society projection.
- **Failure modes:** none beyond standard list-surface handling (INV-06).
- **Limits & scale:** Trivial.
- **Minimum viable version:** Ops view + society progress view.
- **Complete version:** Adds the field crew's own daily-scope view.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-039 — Service-line registry & society enrollment
- **Capability:** CAP-01 · **Persona:** PER-01 · **Serves:** GOAL-03, GOAL-07
- **Surface(s):** SUR-01
- **Problem:** The existing app is lighting-shaped (PROJECT_CONTEXT.md), yet water pumps are already in commercial delivery and solar/wastewater are coming — CON-03 requires accommodating them without a data-model rewrite each time.
- **Description:** A registry of service lines (SVC-01 Lighting, SVC-02 Water pumps, SVC-03 Solar generation, SVC-04 Wastewater) and the ability to enroll a society in one or more, each with its own independent state. This is the abstraction every pipeline, contract, and billing record keys against — a society is never "a lighting customer," it's a society with one or more service-line engagements.
- **Behavioral rules:** Solar (SVC-03) differs in kind — it measures *generation*, not avoided consumption — so the model must carry a metric shape per service line rather than assuming savings-against-baseline universally (CON-03, 00-intake.md §Service lines). Wastewater's (SVC-04) metric shape isn't defined yet, so the model must tolerate a service line with no defined metric rather than requiring one. Lighting and pumps are built; solar and wastewater are modeled only — the registry carries them, but no capability implements them in this blueprint.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society, when PER-01 enrolls it in a service line, then an independent engagement is created that can hold its own pipeline, contract, circuits, and billing without touching any other service line's state.
  - AC-2 (empty/first-run): Given a society with no enrollments, its record shows available service lines to enroll rather than assuming lighting.
  - AC-3 (failure): Given an attempt to enroll a society twice in the same service line, it's refused — one engagement per (society, service line), matching CON-24's pipeline keying exactly.
  - AC-4 (permission): Given a non-PER-01 actor, enrollment is unavailable.
  - AC-5 (edge): Given a modeled-only service line (SVC-03/04), it can be recorded against a society for planning purposes but exposes no operational capability — visible in the data model, deliberately inert in the product.
- **Permissions:** PER-01 (enroll, manage).
- **Data touched:** `ServiceLine` registry; `SocietyServiceEngagement` (society, service line, state).
- **Triggers:** Manual, typically at lead or agreement stage.
- **Emits:** `ServiceLineEnrolled`.
- **Consumes:** none.
- **Depends on:** CAP-13 (`Society` exists).
- **Depended on by:** essentially everything — CON-24's `Pipeline` keys on (society, service line); CAP-04's billing, CAP-07's contracts, and CAP-14's portal all scope by it.
- **Failure modes:** Modeling solar's generation metric as a special case of savings would reproduce exactly the lighting-shaped rigidity GOAL-03 exists to eliminate.
- **Limits & scale:** 4 service lines, 200 societies at the 2-year target — trivial.
- **Minimum viable version:** Lighting and pumps enrollable; solar/wastewater present in the enum only.
- **Complete version:** Per-service-line metric shape configuration, so a new service line is a configuration rather than a migration.
- **Open questions / assumptions:** SVC-04's metric shape is genuinely undefined (00-intake.md) — the model must not force a premature answer.
- **Risks:** This is the foundational abstraction for GOAL-03/GOAL-07; getting it lighting-flavoured again is the single most consequential modeling error available in this blueprint.

### FEAT-040 — Circuit registry & configuration
- **Capability:** CAP-01 · **Persona:** PER-01, PER-04 · **Serves:** GOAL-03, GOAL-06
- **Surface(s):** SUR-01 (manage), SUR-02 (field reference)
- **Problem:** The circuit — not the society — is the unit of metering, benchmarking, and verification (CON-10/CON-11), but the existing app has no first-class circuit model with that role.
- **Description:** A circuit record per metered unit: its society and service line, physical location/area, **light type / operating profile** (basement parking, stilt parking, lift lobby, staircase, external — CON-16), light count and per-light wattage, the **represented light count** of that same type across the society (the extrapolation base, CON-11), working hours (metadata only, per CON-10), its meter, its eligibility checklist (FEAT-007), its benchmark (FEAT-014), and its lifecycle state from surveyed through to actively billed.
- **Behavioral rules:** Working hours are metadata and never trigger a benchmark rescale (CON-10) — only a verified light-count change does (FEAT-041). A circuit's benchmark is written once by CAP-02 and is not hand-editable thereafter. Circuits belong to a service line, not directly to a society, so the same society can hold lighting circuits and pump-room metering independently. **One metered circuit per distinct light type** (CON-11 as corrected 2026-08-12): a society typically holds several, and each extrapolates only across the lights of its own type. `lightType` is therefore a billing-critical field, not a label — two circuits of the same type in one society is a data error worth flagging, since it makes the represented-count split ambiguous.
- **Acceptance criteria:**
  - AC-1 (happy): Given a confirmed survey, when a circuit is registered with its location, light count, wattage, and working hours, then it's available for meter installation (FEAT-011) and appears in the society's circuit list.
  - AC-2 (empty/first-run): Given a society with no circuits, its circuit view shows an empty state explaining that circuits are created through the survey flow, not ad hoc.
  - AC-3 (failure): Given a light count or wattage of zero or negative, registration is refused — these values feed CON-17's load validation and CON-11's extrapolation directly. Given a represented light count lower than the metered light count, registration is refused: the extrapolation factor would be below 1, which is never physically meaningful.
  - AC-4 (permission): Given a non-PER-01 actor, editing circuit configuration is unavailable; PER-04 reads it in the field.
  - AC-5 (edge): Given a circuit's working hours change, the value is updated and recorded as metadata with an effective date, and no benchmark rescale is triggered (CON-10) — if it causes an off-band month, that goes through CAP-05's normal deviation review instead.
- **Permissions:** PER-01 (create/edit), PER-04 (read, and write through the survey/commissioning flows).
- **Data touched:** `Circuit` (society, service line, location, light count, wattage, working hours, meter ref, benchmark, state).
- **Triggers:** Created through FEAT-007's survey confirmation; edited as needed.
- **Emits:** `CircuitRegistered`, `CircuitConfigUpdated`.
- **Consumes:** `CircuitConfirmed` (FEAT-007).
- **Depends on:** FEAT-039, FEAT-007.
- **Depended on by:** CAP-02 (benchmarking), CAP-03 (readings attach to a circuit), CAP-04 (extrapolation), CAP-08 (per-circuit portfolio view — GOAL-08 is explicitly per-circuit), CAP-11 (inspections).
- **Failure modes:** Treating the society as the metering unit anywhere downstream would break CON-11's extrapolation model — the per-circuit granularity has to hold end to end.
- **Limits & scale:** 20-500 lights per metered circuit; a handful of circuits per society (00-intake.md §7) — trivial record counts, but reading volume per circuit is where CAP-03's scale lives.
- **Minimum viable version:** Core configuration fields and lifecycle state.
- **Complete version:** Adds effective-dated configuration history (AC-5) rather than last-write-wins fields.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant beyond the granularity discipline noted above.

### FEAT-041 — Light-count change & benchmark rescale
- **Capability:** CAP-01 · **Persona:** PER-01 · **Serves:** GOAL-06
- **Surface(s):** SUR-01
- **Problem:** CON-10 defines the one legitimate way a fixed benchmark changes mid-term: a verified light-count change triggers a deterministic proportional rescale of the baseline. Without a first-class mechanism, this becomes a manual recalculation — precisely the kind of untraceable adjustment INV-02 exists to prevent.
- **Description:** When a circuit's verified light count changes, the old-consumption baseline is rescaled proportionally (e.g. 100 units ÷ 50 lights × 54 = 108) before future comparisons. The change is recorded as a dated event with its verification evidence, the prior and new counts, and the resulting rescaled baseline.
- **Behavioral rules:** This is deterministic math, not a renegotiation — the benchmark *percentage* is unchanged; what's rescaled is the baseline consumption it's compared against. The change requires verification (an inspection or installation record), not an unsupported edit. Rescales are effective-dated so historical months remain computed against the baseline that applied at the time (INV-02).
- **Acceptance criteria:**
  - AC-1 (happy): Given a verified light-count change from 50 to 54, when recorded, then the baseline rescales proportionally, the event is dated, and future months compare against the new baseline.
  - AC-2 (empty/first-run): Given a circuit has never had a count change, its history shows the original commissioned baseline only.
  - AC-3 (failure): Given a count change without supporting verification, the rescale is refused — an unverified count change is exactly the dispute scenario this guards against.
  - AC-4 (permission): Given a non-PER-01 actor, recording a rescale is unavailable.
  - AC-5 (edge): Given a rescale is recorded with an effective date in a month already invoiced, the prior invoice is not retroactively recomputed — the change applies forward, and the discrepancy (if any) is handled through CAP-05's review rather than silently restating history.
- **Permissions:** PER-01 (record, with verification evidence).
- **Data touched:** Creates `BenchmarkRescale` events on `Circuit`; updates the effective baseline.
- **Triggers:** Manual, on a verified count change (typically from an inspection, CAP-11, or an installation requirement change, FEAT-036).
- **Emits:** `BenchmarkRescaled`.
- **Consumes:** verified count-change evidence from CAP-11/CAP-21.
- **Depends on:** FEAT-040, FEAT-014 (an existing benchmark to rescale).
- **Depended on by:** CAP-04 (billing uses the effective-dated baseline), CAP-05 (deviation review must know a rescale occurred), CAP-08.
- **Failure modes:** A rescale applied without an effective date would silently change historical comparisons — AC-5 and the effective-dating rule are the guard.
- **Limits & scale:** Rare per circuit — trivial.
- **Minimum viable version:** Rescale with verification reference and effective date.
- **Complete version:** Adds automatic detection of count changes from inspection records rather than relying on PER-01 to notice.
- **Open questions / assumptions:** none blocking.
- **Risks:** This is the only sanctioned mid-term change to a billing input — if it's implemented loosely, it becomes a back door around the fixed-benchmark model.

### FEAT-042 — Pump asset model & monitor-only telemetry
- **Capability:** CAP-01 · **Persona:** PER-01, PER-04 · **Serves:** GOAL-03
- **Surface(s):** SUR-01
- **Problem:** Pumps are already in commercial delivery but have no data model in the app — and the equipment audit (FEAT-008) produces per-unit asset data with nowhere to live.
- **Description:** A per-unit asset model for pump-side hardware: pumps (type, HP), towers, tanks (type, capacity), and the six audited equipment categories (flow meter, pressure switch, VFDs, pump-room energy meter, float switches, actuator valves) with brand, model, condition, and ownership (FirsThing-owned vs. society-owned, since pump hardware ownership is only partial). Where sensor data exists, the platform reads it — and only reads it.
- **Behavioral rules:** **Monitor-only, absolutely (INV-08).** The model carries status and sensor readings but the product exposes no actuation whatsoever — no start/stop, no valve control, at any layer. This is a safety-relevant scope decision, not a phasing convenience, so it constrains the data model (no command entities) as well as the UI (no control affordances). Ownership is per-asset, not per-society, because pump hardware ownership is genuinely split.
- **Acceptance criteria:**
  - AC-1 (happy): Given FEAT-008's survey data, when it's promoted to assets, then each physical unit exists as its own record with brand, model, condition, ownership, and its survey photo retained.
  - AC-2 (empty/first-run): Given a society with no pump engagement, no pump assets exist and the view says so plainly.
  - AC-3 (failure): Given telemetry is unavailable for an asset that should report it, the asset shows a stale/no-data state rather than a last-known value presented as current (INV-06's degraded-state requirement applied to device data).
  - AC-4 (permission): Given any user of any role, no control action exists to attempt — INV-08 is enforced by absence, not by permission checks.
  - AC-5 (edge): Given a society-owned asset (not FirsThing's), it's still modeled and monitored, but is excluded from FirsThing's own hardware inventory and from any replacement obligation — ownership is a real field with real consequences, not a label.
- **Permissions:** PER-01 (manage assets), PER-04 (capture/update in the field).
- **Data touched:** `PumpAsset` records (type, brand, model, condition, ownership, photo), `Tower`/`Tank` records, read-only telemetry readings where available.
- **Triggers:** Promoted from FEAT-008's survey data; updated by inspections.
- **Emits:** `PumpAssetRegistered`.
- **Consumes:** `PumpEquipmentAuditCaptured` (FEAT-008).
- **Depends on:** FEAT-008, FEAT-039.
- **Depended on by:** CAP-06's cross-sell projection (CON-29), CAP-11 (inspections cover pump equipment), CAP-10 (FirsThing-owned assets only).
- **Failure modes:** Live pump telemetry is explicitly deferred (ASSUM-13) — so this model must be useful with manual/CSV data only, and must not assume a live feed exists.
- **Limits & scale:** 1-20 pumps per society, ≤10 per circuit (00-intake.md §7) — tens of assets per society, trivial.
- **Minimum viable version:** Asset registry with condition and ownership, populated from the survey; no telemetry at all.
- **Complete version:** Adds read-only telemetry display once live device data exists (ASSUM-13's later phase).
- **Open questions / assumptions:** ASSUM-13 — live telemetry is a named future phase, deliberately outside this blueprint.
- **Risks:** Any future move to actuation is a separate architectural and safety decision (INV-08, and 00-intake.md flags it for Phase 7) — this feature must not leave a half-built control path behind.

### FEAT-043 — Meter CSV upload & AI-assisted normalization
- **Capability:** CAP-03 · **Persona:** PER-01 · **Serves:** JTBD-01
- **Surface(s):** SUR-01
- **Problem:** Readings arrive as CSVs downloaded from each meter vendor's own app, one file per circuit, in formats that vary by vendor (CON-30, evidenced by a real export). A fixed parser would break on the first new vendor, and manual transcription is exactly the monthly toil JTBD-01 exists to eliminate.
- **Description:** PER-01 uploads a meter CSV against a specific society + circuit. An AI-assisted pipeline (the same pattern as the app's existing Gemini invoice extraction, not necessarily the same prompt/schema) analyzes the file's structure and normalizes it into the system's canonical reading shape — including aggregating sub-daily granularity (the sample vendor exports hourly `date,time,consumption/kWh`) up to daily. Both the raw file and the normalized readings are persisted.
- **Behavioral rules:** Raw and normalized are both stored, always (CON-30) — a bad AI interpretation must always be correctable against the original file, which is also what makes INV-02's traceability real at the ingest layer. Upload is per circuit, never per society, matching the metering unit (CON-11/FEAT-040). No file format is assumed; an unrecognized shape routes to FEAT-044's clarification flow rather than failing.
- **Acceptance criteria:**
  - AC-1 (happy): Given an hourly `date,time,consumption` CSV for a known circuit, when uploaded, then the AI normalizes it and daily totals are produced and stored alongside the raw file.
  - AC-2 (empty/first-run): Given a circuit has never had a reading uploaded, its readings view explains how to upload rather than showing an empty chart.
  - AC-3 (failure): Given the AI service is unavailable, the raw file is still stored and the upload is recorded as pending normalization — the readings are not lost because an external service was down (the same fallback shape as the existing invoice-extraction flow).
  - AC-4 (permission): Given a non-PER-01 actor, uploading readings is unavailable.
  - AC-5 (edge): Given the same period is uploaded twice for the same circuit, the duplicate is detected and PER-01 chooses to replace or discard — silent double-counting would corrupt the monthly total directly.
- **Permissions:** PER-01 (upload).
- **Data touched:** Creates a raw file record (S3) + `MeterReading` rows (circuit, date, consumption, source file ref).
- **Triggers:** Manual, monthly per circuit.
- **Emits:** `ReadingsUploaded`, `NormalizationFailed`.
- **Consumes:** none.
- **Depends on:** FEAT-040 (a circuit to attach readings to); the existing Gemini integration pattern.
- **Depended on by:** FEAT-044, FEAT-045, FEAT-046; CAP-02's monitoring windows read the same daily readings; CAP-04's billing depends entirely on this data.
- **Failure modes:** A mis-normalized file that *looks* plausible is the dangerous case — wrong units or a misread timezone would silently shift consumption. FEAT-045's anomaly detection and the retained raw file are the two mitigations.
- **Limits & scale:** One file per circuit per month; at 200 societies with a few circuits each, low hundreds of files/month with hourly rows (~720/file) — modest, but the largest data volume in the product.
- **Minimum viable version:** AI normalization for the known vendor shape, with manual column mapping as the fallback.
- **Complete version:** Handles arbitrary vendor shapes via the clarification flow (FEAT-044), with learned mappings reused per vendor.
- **Open questions / assumptions:** ASSUM-13 — live telemetry replacing CSV upload entirely is a named future phase, out of this blueprint's scope.
- **Risks:** This is the input side of every number the business bills on; an ingest bug is a billing bug. Deserves explicit Phase 9 test coverage against real vendor exports, not synthetic ones.

### FEAT-044 — Ingest clarification & mapping confirmation
- **Capability:** CAP-03 · **Persona:** PER-01 · **Serves:** JTBD-01
- **Surface(s):** SUR-01
- **Problem:** CON-30 anticipates ambiguous file shapes — a new vendor's export where the AI can't confidently identify which column is consumption, what the units are, or how timestamps are structured. Guessing silently is the worst possible behavior here.
- **Description:** When the AI's interpretation is uncertain, it asks PER-01 clarifying questions (which column is consumption, what unit, what timestamp format) and normalizes based on the answers. PER-01 also sees and confirms the proposed mapping before readings are committed.
- **Behavioral rules:** Uncertainty produces a question, never a guess — this is the explicit CON-30 design. Confirmed mappings are the point at which readings become committed data; an unconfirmed interpretation is not yet readings.
- **Acceptance criteria:**
  - AC-1 (happy): Given an ambiguous file, when the AI asks which column holds consumption and PER-01 answers, then normalization completes using that mapping and the readings are committed.
  - AC-2 (empty): Given no uploads await clarification, the queue shows a caught-up state.
  - AC-3 (failure): Given PER-01 can't answer (an unreadable file), the upload can be abandoned without leaving partial readings behind.
  - AC-4 (permission): Given a non-PER-01 actor, clarification answering is unavailable.
  - AC-5 (edge): Given PER-01 spots that the AI's confident interpretation is nonetheless wrong, they can override the mapping before committing — confidence is not authority.
- **Permissions:** PER-01 (answer, confirm, override).
- **Data touched:** Updates the pending ingest's mapping; commits `MeterReading` rows on confirmation.
- **Triggers:** Ambiguity detected during FEAT-043's normalization.
- **Emits:** `IngestMappingConfirmed`.
- **Consumes:** `ReadingsUploaded`.
- **Depends on:** FEAT-043.
- **Depended on by:** FEAT-045, FEAT-046.
- **Failure modes:** none beyond standard.
- **Limits & scale:** Should be rare once known vendors are handled — trivial.
- **Minimum viable version:** Manual column-mapping confirmation on every upload.
- **Complete version:** AI asks only when genuinely uncertain, and remembers per-vendor mappings.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-045 — Upload-time anomaly detection
- **Capability:** CAP-03 · **Persona:** PER-01 · **Serves:** GOAL-01, INV-09
- **Surface(s):** SUR-01
- **Problem:** INV-09 states it plainly: catching a bad reading before the bill goes out is cheaper than disputing it afterward. Without detection at ingest, the first person to notice a bad reading is the customer.
- **Description:** Every upload runs basic anomaly detection before that month's bill can be generated: missing days, zero/null readings, readings outside a plausible range for the circuit, and implausible day-over-day jumps. Flagged items are shown to PER-01 to resolve, ignore-with-reason, or send for investigation.
- **Behavioral rules:** Detection is a gate on billing, not merely an advisory — a month with unresolved anomalies should not silently produce an invoice (INV-09's "before that month's bill is generated"). This is deliberately *basic* detection; the full real-time notification/monitoring system is paired with live telemetry and deferred (ASSUM-13). The same anomaly concept also serves CAP-02's monitoring-window validity flags (CON-19) — one mechanism, two consumers.
- **Acceptance criteria:**
  - AC-1 (happy): Given a clean upload, when detection runs, then no anomalies are raised and the month is eligible for billing.
  - AC-2 (empty): Given no anomalies pending anywhere, the review queue shows a caught-up state.
  - AC-3 (failure/flagged): Given a day shows a zero reading mid-month, it's flagged with the specific reason and the month is held from billing until PER-01 resolves or explicitly accepts it with a recorded reason.
  - AC-4 (permission): Given a non-PER-01 actor, resolving anomalies is unavailable.
  - AC-5 (edge): Given an anomaly occurs during a CAP-02 monitoring window, it also marks that day invalid and triggers the window restart (CON-19) — the same detection feeds both paths rather than being duplicated.
- **Permissions:** PER-01 (review, resolve, accept-with-reason).
- **Data touched:** Creates `ReadingAnomaly` records against days/circuits; gates the month's billing eligibility.
- **Triggers:** Automatic, on every upload (FEAT-043/044 commit).
- **Emits:** `AnomalyDetected`, `AnomalyResolved`.
- **Consumes:** committed `MeterReading` rows.
- **Depends on:** FEAT-043, FEAT-044.
- **Depended on by:** CAP-04 (billing eligibility gate), CAP-02's FEAT-012/014 (window validity), CAP-05 (an anomaly may become a deviation review).
- **Failure modes:** Over-sensitive rules would hold every month's billing and train PER-01 to accept-with-reason reflexively, defeating the gate — thresholds need tuning against real data.
- **Limits & scale:** Trivial computationally.
- **Minimum viable version:** Missing-day and zero/null detection only.
- **Complete version:** Adds range and day-over-day-jump rules, plus the shared window-validity integration (AC-5).
- **Open questions / assumptions:** ASSUM-13 bounds this to basic, upload-time detection — real-time monitoring is explicitly out.
- **Risks:** See failure modes — threshold tuning is the whole game here.

### FEAT-046 — Reading aggregation & missing-day handling
- **Capability:** CAP-03 · **Persona:** PER-01 · **Serves:** JTBD-01, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** The source data is hourly, but every calculation in the business (CON-10's benchmark, CON-19's windows, CON-01's monthly comparison) works in days and months — and months are frequently incomplete (CON-12).
- **Description:** Normalized readings are aggregated hourly → daily → monthly. Where days are missing, those days are excluded from the month's calculation and the remaining days' readings are used for the benchmark comparison (CON-12) — with the coverage (how many days of data the month actually has) recorded and displayed alongside every derived figure.
- **Behavioral rules:** A monthly figure computed from partial coverage must always carry its coverage count — presenting a 20-day month as if it were a full month is exactly the kind of untraceable figure INV-02 forbids. Exclusion is by *day*, never by interpolation: no estimated or filled-in readings, ever.
- **Acceptance criteria:**
  - AC-1 (happy): Given a full month of hourly readings, when aggregated, then daily and monthly totals are produced with coverage recorded as complete.
  - AC-2 (empty/first-run): Given a month with no readings at all, no monthly figure is produced — the month is explicitly "no data," not zero consumption.
  - AC-3 (failure/partial): Given 6 days are missing, those days are excluded, the monthly average is computed from the remaining days (CON-12), and the coverage (24/30 days) is attached to the figure.
  - AC-4 (permission): Aggregation is a system computation — no role can hand-edit a derived total.
  - AC-5 (edge): Given coverage falls **below 20 days** (CON-12's floor, set at the Phase 3 gate), the month is flagged as unusable for PER-01's judgment rather than silently producing a billing-grade figure — PER-01 can still accept it explicitly, but the system won't compute a comparison from it unprompted.
- **Permissions:** system (compute), PER-01 (view, act on low-coverage flags).
- **Data touched:** Creates daily and monthly aggregate records with coverage metadata.
- **Triggers:** Automatic, after readings commit.
- **Emits:** `MonthAggregated`, `LowCoverageFlagged`.
- **Consumes:** committed `MeterReading` rows.
- **Depends on:** FEAT-043/044.
- **Depended on by:** CAP-04 (billing), CAP-05 (deviation review), CAP-02 (window averages), CAP-08 (portfolio view), CAP-06 (savings report).
- **Failure modes:** Timezone/day-boundary handling on hourly data is the classic source of silent error — a reading attributed to the wrong calendar day shifts CON-19's window arithmetic. Worth explicit test coverage.
- **Limits & scale:** ~720 hourly rows per circuit-month — aggregation is cheap; storage is the only real consideration and it's modest.
- **Minimum viable version:** Hourly→daily→monthly aggregation with day-level exclusion and coverage recording.
- **Complete version:** Adds the 20-day low-coverage flag (AC-5) and the FEAT-052 roll-forward rule for a low-coverage first reference month.
- **Open questions / assumptions:** none blocking — the 20-day floor was set at the Phase 3 gate (CON-12).
- **Risks:** Day-boundary/timezone correctness is the sharpest technical risk in this capability.

### FEAT-047 — Reading history & raw-file archive
- **Capability:** CAP-03 · **Persona:** PER-01 · **Serves:** GOAL-06
- **Surface(s):** SUR-01
- **Problem:** When a society disputes a figure, the answer has to be reconstructable from the original vendor file — not from the system's interpretation of it. INV-02's traceability claim ultimately rests on this archive.
- **Description:** A per-circuit history of every upload: the raw file (downloadable), the normalization mapping used, the resulting readings, and any anomalies and their resolutions. Any derived figure can be traced back through this chain to the file it came from.
- **Behavioral rules:** Raw files are retained indefinitely — they are the evidentiary base for the billing model. Superseded uploads (a replaced duplicate, a re-normalization) are retained too, not deleted, so a corrected figure can be explained rather than merely asserted.
- **Acceptance criteria:**
  - AC-1 (happy): Given a monthly figure, when PER-01 traces it, then they reach the daily readings, the upload that produced them, and the original raw file.
  - AC-2 (empty/first-run): Given a circuit with no uploads, the history shows an empty state.
  - AC-3 (failure/degraded): Given the raw file is unretrievable from storage, the readings still display but the traceability gap is shown explicitly rather than silently omitted.
  - AC-4 (permission): Given a non-internal actor, raw files aren't exposed — the society sees derived figures and their reading-level provenance (CAP-14), not vendor files.
  - AC-5 (edge): Given an upload was replaced by a corrected one, both remain in the history with the supersession recorded, so a changed figure has a visible explanation.
- **Permissions:** PER-01 (view, download raw).
- **Data touched:** Reads raw file records, ingest metadata, `MeterReading`, `ReadingAnomaly`.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** all CAP-03 events.
- **Depends on:** FEAT-043.
- **Depended on by:** CAP-05 (deviation investigations start here), CAP-06 (savings report provenance), CAP-14 (the society-facing traceability view derives from this chain).
- **Failure modes:** none beyond standard list-surface handling (INV-06).
- **Limits & scale:** Low hundreds of files/month at 2-year scale, retained indefinitely — storage grows steadily but stays small in absolute terms.
- **Minimum viable version:** Per-circuit upload list with raw download.
- **Complete version:** Full trace-through from a monthly figure to its source file in one path.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-048 — Monthly savings calculation run
- **Capability:** CAP-04 · **Persona:** PER-01 · **Serves:** JTBD-01, GOAL-01
- **Surface(s):** SUR-01
- **Problem:** This is the heart of GOAL-01 — today the extrapolation, benchmark comparison, and savings arithmetic are done by hand every month for every society, which is both the biggest ops time sink and the biggest audit risk.
- **Description:** Once a month's readings are ingested and validated (CAP-03), the savings calculation runs **automatically** (CON-33): for each metered circuit, extrapolated consumption = (represented light count ÷ metered light count) × metered units; monthly savings (units) = extrapolated consumption × benchmark savings %; savings (₹) = that × the contracted per-unit electricity rate; FirsThing's fee = that × the contracted revenue-share % (CON-11). **Extrapolation is scoped per light type** (CON-11 as corrected 2026-08-12): each metered circuit's factor applies only across the lights of its own type — basement parking to basement parking, staircase to staircase — and the society's monthly total is the sum of those per-type results. One circuit is never scaled across a society's entire light count, because operating profiles differ enough between types that doing so biases every bill for the term.
- **Behavioral rules:** Automatic on validated data — PER-01 does not trigger it manually (CON-33). Every input (represented light count, metered light count, benchmark %, unit rate, revenue-share %) is a versioned, auditable field, and the calculation records which version of each it used — this is what makes INV-02 hold for a figure computed months ago. The calculation runs against the effective-dated baseline, so a mid-term rescale (FEAT-041) doesn't retroactively change earlier months. **This computes the compliance check, not a fresh bill** (CON-01) — the amount payable is normally the contracted fixed monthly amount, and this run's output is what that amount is checked against.
- **Acceptance criteria:**
  - AC-1 (happy): Given a month's readings are validated with no unresolved anomalies, when the run executes, then per-circuit extrapolated consumption, savings units, savings ₹, and FirsThing's computed fee are produced with every input version recorded, and the society total is the sum of the per-circuit fee lines rather than a separately-computed figure.
  - AC-2 (empty/first-run): Given a society in its first partial month, the run produces a prorated result via FEAT-051 rather than a full-month figure.
  - AC-3 (failure): Given unresolved anomalies exist for the month (FEAT-045), the run is held and the month is not billable until they're resolved — INV-09's gate, enforced here.
  - AC-4 (permission): Given any role, the computed figures cannot be hand-edited; corrections happen by fixing inputs and re-running, which is itself recorded.
  - AC-5 (edge): Given a month with partial reading coverage (CON-12), the calculation uses only the days with data and carries the coverage count through to every derived figure — a 24/30-day month is never presented as a full month.
- **Permissions:** system (compute), PER-01 (view, re-run after input correction).
- **Data touched:** Creates `MonthlyCalculation` per (society, service line, month): per-circuit extrapolation, savings units/₹, computed fee, input version refs, coverage.
- **Triggers:** Automatic, on `MonthAggregated` with no unresolved anomalies.
- **Emits:** `MonthlyCalculationCompleted`, `CalculationHeldForAnomalies`.
- **Consumes:** `MonthAggregated` (FEAT-046), `AnomalyResolved` (FEAT-045), contract terms (CAP-07), `Circuit` benchmark (FEAT-040/041).
- **Depends on:** CAP-03, CAP-07, FEAT-040, FEAT-041.
- **Depended on by:** FEAT-049 through FEAT-054; CAP-05 (deviation review acts on this output); CAP-06 (savings report); CAP-08 (portfolio view); CAP-14 (society portal).
- **Failure modes:** A wrong `representedLightCount` silently scales every figure for that society — this single field is the highest-leverage error in the product, and it comes from a survey count (FEAT-006) that no meter validates.
- **Limits & scale:** 200 societies × a few circuits at the 2-year target — a monthly batch of low hundreds of calculations, computationally trivial.
- **Minimum viable version:** The CON-11 formula with versioned inputs and coverage handling.
- **Complete version:** Adds re-run/versioning of calculations themselves with visible diffs when inputs are corrected.
- **Open questions / assumptions:** none blocking.
- **Risks:** Highest-consequence computation in the product alongside FEAT-014's benchmark. Both belong at the top of Phase 9's test plan.

### FEAT-049 — Tolerance-band compliance check
- **Capability:** CAP-04 · **Persona:** PER-01 · **Serves:** GOAL-01, JTBD-02
- **Surface(s):** SUR-01
- **Problem:** CON-01 reframes the monthly reading as a compliance check rather than a repricing input — so the system's real monthly job is deciding "in band or out of band," which today is a manual judgment with no recorded rationale.
- **Description:** The month's measured savings % is compared against the circuit's fixed benchmark, within the contract's tolerance band (CON-01a — per-contract, commonly ±5% or ±10%, never a platform constant). **The check runs per metered circuit, independently** (CON-11 as corrected 2026-08-12): a society with four typed circuits gets four compliance results, not one. In-band circuits bill their contracted fixed fee line with no further action. Each out-of-band circuit raises its own deviation review (CAP-05), scoped to that circuit, while the society's other circuits continue billing normally.
- **Behavioral rules:** The tolerance band is read from the contract, never hardcoded (CON-01a — the real Ace Aspire contract uses ±10% while other deals use ±5%). A single out-of-band month raises a review but never changes the bill; **"sustained" is 2 consecutive out-of-band months (CON-01c)** — month 1 is the correction window, and only month 2 can adjust. The check itself never adjusts anything. **"Approaching tolerance" is within 20% of the band edge (CON-01d)** — 4% off on a ±5% contract, 8% off on a ±10% contract — flagged amber for GOAL-08's early warning. On `negotiated-fixed` contracts the comparison is against the first-month reference rather than a measured benchmark (FEAT-052), but the band logic is identical. **Consecutive-month state is tracked per circuit**, not per society — circuit A's second consecutive breach flips circuit A's fee line while circuit B, breaching for the first time, does not. There is deliberately no society-level composite check: a broken circuit must not be able to hide inside a healthy average.
- **Acceptance criteria:**
  - AC-1 (happy, in band): Given the month's measured savings sits within the contracted band, when the check runs, then the month is marked compliant and bills at the contracted fixed amount with no review raised.
  - AC-2 (empty): Given a society in a pre-billing state, no compliance check applies and its record says so rather than showing a spurious pass.
  - AC-3 (failure/out of band): Given the month falls outside the band, then a deviation review is raised (CAP-05) and the month is flagged pending that review's outcome — the invoice does not auto-adjust, and a *first* out-of-band month never adjusts at all (CON-01c).
  - AC-4 (permission): Given any role, the band value cannot be edited here — it belongs to the contract (CAP-07) and changing it is a contractual act, not an operational one.
  - AC-5 (edge): Given a contract with a ±10% band, the check uses 10% — a society-specific value, confirmed against real contract evidence, not a platform constant. Given a society with several typed circuits where one is out of band and three are in band, exactly one deviation review is raised and only that circuit's fee line is at risk.
- **Permissions:** system (evaluate), PER-01 (view).
- **Data touched:** Writes the compliance result onto `MonthlyCalculation`; raises deviation records.
- **Triggers:** Automatic, following FEAT-048.
- **Emits:** `MonthCompliant`, `MonthOutOfBand`.
- **Consumes:** `MonthlyCalculationCompleted`, contract terms.
- **Depends on:** FEAT-048, CAP-07.
- **Depended on by:** CAP-05 (deviation review), FEAT-050, CAP-08's approaching/breached status chips (GOAL-08).
- **Failure modes:** A hardcoded 5% anywhere in the implementation would produce silently wrong compliance results for every ±10% contract — the single most likely way this feature goes wrong. The second most likely: evaluating the band against a society-level aggregate instead of per circuit, which silently masks a single failing light type behind three healthy ones.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Per-contract band comparison with in/out result and consecutive-month tracking.
- **Complete version:** Adds the CON-01d "approaching band" amber state feeding CAP-08's early-warning chips (GOAL-08 explicitly asks for flagging *as* a society approaches the band, not only on crossing).
- **Open questions / assumptions:** none blocking — CON-01c fixed "sustained" at 2 consecutive months and CON-01d fixed "approaching" at 20% of the band edge, both at the Phase 3 gate.
- **Risks:** Consecutive-month state means the check is no longer stateless per month — a re-run after a corrected input must recompute the streak, not just the single month, and it must do so per circuit. Per-circuit reviews also multiply the ops review queue by the number of typed circuits per society (CON-11); at 200 societies this is the volume assumption most worth revisiting in Phase 6.

### FEAT-050 — Billing adjustment application
- **Capability:** CAP-04 · **Persona:** PER-01 · **Serves:** GOAL-01, JTBD-02
- **Surface(s):** SUR-01
- **Problem:** When a deviation review concludes, its outcome has to actually reach the invoice — and the treatment differs sharply by root cause (CON-01b, OQ-09/OQ-10), which is exactly the kind of rule that gets misapplied when it lives only in someone's head.
- **Description:** Applies a deviation review's outcome (CAP-05) to the month's billing. Per OQ-10 (resolved), the adjustment is not a separate penalty formula: a **FirsThing-attributable** shortfall still out of band in the *second* consecutive month (CON-01c) flips **that circuit's fee line** for that month from `pricingBasis: fixed` to `actual-metered`, so it bills through CON-11's standard calculation using that month's *actual measured* savings % in place of the benchmark %. An **excluded/society-caused** shortfall (CON-01b's named list: lighting-layout changes, blocked sensors, usage-pattern changes, external electrical issues, lack of society-side maintenance) leaves `pricingBasis: fixed` unchanged, with the society notified why (OQ-09).
- **Behavioral rules:** The adjustment decision is never made here — it's applied here. CAP-05's review produces the root-cause classification and decision; this feature translates that into a billing effect, so the two can't drift. An excluded-cause month still bills in full but must generate a customer-facing explanation (OQ-09) — silence would read as an unexplained bad month.
- **Acceptance criteria:**
  - AC-1 (happy): Given a review concludes "FirsThing-attributable, uncorrected," when applied, then the month's `pricingBasis` becomes `actual-metered`, the amount is recomputed through CON-11 using the measured savings %, and the change is recorded with its review reference.
  - AC-2 (empty): Given no adjustments this cycle, the billing run proceeds entirely at fixed contracted amounts.
  - AC-3 (failure/excluded cause): Given the root cause is on CON-01b's exclusion list, then the bill stays at the contracted fixed amount and an explanation is generated for the society (OQ-09) — not silently billed as normal.
  - AC-4 (permission): Given a non-PER-01 actor, applying an adjustment is unavailable; and no adjustment can be applied without a linked completed review.
  - AC-5 (edge): Given a FirsThing-attributable issue that *was* corrected within a month, no adjustment applies (CON-01b's "corrected at no cost" path) — the correction, not the deviation, is what determines the billing outcome.
- **Permissions:** PER-01 (apply, always against a completed review).
- **Data touched:** Writes `pricingBasis` (`fixed | actual-metered`) and the adjustment record against the **per-circuit fee line** on `MonthlyCalculation`/invoice (CON-11 — an invoice is a set of per-circuit lines summing to the total, so one circuit can be `actual-metered` while the rest stay `fixed`); generates the customer explanation.
- **Triggers:** A completed deviation review (CAP-05).
- **Emits:** `BillingAdjustmentApplied`, `ExcludedCauseNotified`.
- **Consumes:** CAP-05's review outcome.
- **Depends on:** FEAT-049, CAP-05, CAP-07 (the contract's remedy terms).
- **Depended on by:** FEAT-053/054 (the invoice reflects it), CAP-06 (the savings report explains it), CAP-14 (the society sees it).
- **Failure modes:** Applying an adjustment without a completed review would be an untraceable billing change — AC-4 makes the linkage mandatory rather than conventional.
- **Limits & scale:** Rare — trivial.
- **Minimum viable version:** `pricingBasis` switching with a mandatory review link.
- **Complete version:** Adds the auto-generated excluded-cause explanation to the society (AC-3).
- **Open questions / assumptions:** none blocking — OQ-10 resolved the adjustment mechanism as a `pricingBasis` flip rather than a separate formula.
- **Risks:** A fee line billed `actual-metered` can be materially lower than the fixed rate; the society should be able to see clearly which basis applied to which circuit and why (CAP-14), or a mixed-basis invoice becomes its own confusing conversation — this is a real invoice-presentation problem for Phase 5, not just a calculation one.

### FEAT-051 — Partial-month proration
- **Capability:** CAP-04 · **Persona:** PER-01 · **Serves:** GOAL-01
- **Surface(s):** SUR-01
- **Problem:** CON-22 is precise: billing starts the day after the completion certificate is signed, and the first month is pro-rated for the actual remaining days. A full-month first invoice is both wrong and the customer's very first billing experience.
- **Description:** For a society's first billing month (and any other partial period, e.g. mid-month termination), the contracted monthly amount is pro-rated by actual days in that calendar month rather than billed in full.
- **Behavioral rules:** Proration is by actual days in the specific calendar month, not a 30-day convention — a February start and a July start prorate against different denominators. The start date is the day *after* the completion certificate's signature date (CON-22), a distinction that's easy to lose by one day.
- **Acceptance criteria:**
  - AC-1 (happy): Given a completion certificate signed on the 18th of a 31-day month, when the first bill is computed, then it's pro-rated for 12 days (the 19th onward), not the full month.
  - AC-2 (empty/first-run): Given a society whose billing hasn't started, no invoice is produced at all rather than a zero-value one.
  - AC-3 (failure): Given no completion date is recorded, the proration cannot compute and the bill is held with a clear reason — the date is a hard input.
  - AC-4 (permission): Prorated figures are computed, not entered; no role hand-adjusts them.
  - AC-5 (edge): Given billing ends mid-month (termination), the same proration applies to the final month — one mechanism, both ends of the contract.
- **Permissions:** system (compute), PER-01 (view).
- **Data touched:** Writes the prorated amount and its day-count basis onto the month's calculation.
- **Triggers:** Automatic, when a billing period is partial.
- **Emits:** `ProratedMonthComputed`.
- **Consumes:** `BillingStarted` (FEAT-037), termination events (CAP-07).
- **Depends on:** FEAT-037, FEAT-048.
- **Depended on by:** FEAT-053/054.
- **Failure modes:** Off-by-one on the start date (billing from the signature day rather than the day after) is the specific error CON-22's wording anticipates.
- **Limits & scale:** Trivial.
- **Minimum viable version:** First-month proration by actual days.
- **Complete version:** Adds final-month proration on termination (AC-5).
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant beyond the off-by-one.

### FEAT-052 — Agreed-benchmark billing with first-month reference (demo-skip path)
- **Capability:** CAP-04 · **Persona:** PER-01 · **Serves:** GOAL-01
- **Surface(s):** SUR-01
- **Problem:** CON-25's demo-skip path produces contracts whose benchmark % was agreed rather than measured. **Corrected at the Phase 3 gate (2026-08-12):** these contracts *are* metered — an earlier draft of this feature assumed they weren't, and would have left a whole class of contracts with no monitoring at all.
- **Description:** For contracts marked `benchmarkSource: negotiated-fixed` (FEAT-027): the monthly amount is the flat figure derived from the **agreed** benchmark % (e.g. 65%) written into the agreement — not recomputed from readings. But the circuit is metered, and the **first full month of readings after installation becomes the reference consumption level**. Every subsequent month is compared against that reference under the contract's normal tolerance band, feeding the same compliance check (FEAT-049) and deviation review (CAP-05) as any other contract.
- **Behavioral rules:** Two separate things, deliberately decoupled: the **fee** is agreement-derived and flat; the **monitoring** is fully metered and traceable. **Pre-install readings are retained as evidence (CON-25d, resolved at the audit 2026-08-12):** the meter goes in at survey but installation may be weeks later, so genuine pre-install consumption is recorded on this path. It never becomes a benchmark and never feeds the tolerance-band comparison — but it is shown as measured before/after on the savings report (FEAT-059) and gives FirsThing an internal check on whether the agreed % was reasonable. The first post-install month is captured once and then fixed as the reference — later months never re-baseline. Customer-facing surfaces must state the basis honestly: the savings *percentage* comes from the agreement, while the consumption figures behind it are measured (INV-02's narrowed exception).
- **Acceptance criteria:**
  - AC-1 (happy): Given a `negotiated-fixed` contract past its first post-install month, when the monthly run executes, then the flat agreed amount is billed **and** that month's metered consumption is compared against the first-month reference under the tolerance band.
  - AC-2 (empty/first-run): Given the first full post-install month, that month establishes the reference and is billed flat with no variance comparison — there is nothing to compare it against yet, and that's stated rather than shown as a pass.
  - AC-3 (failure): Given a later month's consumption varies beyond the tolerance band from the reference, a deviation review is raised exactly as for a measured-benchmark contract (FEAT-049/CAP-05) — the demo-skip path is not exempt from monitoring.
  - AC-4 (permission): Given a non-management actor, `benchmarkSource` cannot be changed — it's a contractual property (FEAT-032/CAP-07).
  - AC-5 (edge): Given the society views its savings in the portal, the basis is stated plainly: the percentage is agreement-derived, the consumption is metered. Not presented as a measured benchmark, and not presented as unmeasured either.
  - AC-6 (edge, pre-install evidence): Given the survey→installation gap produced usable pre-install readings, when the savings report is generated, then measured before/after consumption is shown alongside the agreed percentage — clearly labelled as evidence, not as the billing basis. Given the gap was too short to produce usable readings, the report shows the agreed percentage alone and says so, rather than showing an empty chart.
- **Permissions:** system (compute), PER-01 (view).
- **Data touched:** Reads `Contract.benchmarkSource` and the agreed %; writes the flat monthly amount; writes/reads `Circuit.firstMonthReference`; reads retained pre-install readings for the report's evidence panel (never for billing).
- **Triggers:** Automatic monthly; reference set once on the first complete post-install month.
- **Emits:** `FixedMonthBilled`, `FirstMonthReferenceSet`.
- **Consumes:** contract terms (CAP-07), monthly aggregates (FEAT-046).
- **Depends on:** FEAT-027 (sets `benchmarkSource`), FEAT-032, FEAT-037 (installation completion defines "first post-install month"), CAP-03, CAP-07.
- **Depended on by:** FEAT-049 (compliance check runs against the reference rather than a measured benchmark), FEAT-053/054, CAP-06, CAP-14.
- **Failure modes:** If the first post-install month has poor reading coverage (below CON-12's 20-day floor), the reference itself is unreliable and every later comparison inherits that — this month should not be accepted as the reference on low coverage; it should roll to the next complete month.
- **Limits & scale:** Trivial; expected to be a small minority of contracts (CON-25 calls it exceptional).
- **Minimum viable version:** Flat billing plus first-month reference capture and variance comparison.
- **Complete version:** Adds the low-coverage roll-forward rule (see failure modes) and explicit basis labelling in customer-facing surfaces.
- **Open questions / assumptions:** none blocking — resolved at the Phase 3 gate.
- **Risks:** If this path grows beyond "exceptional," the product's measured-savings positioning (GOAL-06, and the whole vision) weakens — worth monitoring as a business metric, not just a feature.

### FEAT-053 — Zoho invoice handoff & manual invoice upload
- **Capability:** CAP-04 · **Persona:** PER-01 · **Serves:** JTBD-01
- **Surface(s):** SUR-01
- **Problem:** The formal tax invoice is generated in Zoho, not in this app (CON-33) — so the app has to hand off billing data and take back a finished invoice, without a Zoho integration necessarily ever existing.
- **Description:** Once a month's amount is final, billing data is handed to Zoho for invoice generation. Two paths, and the fallback is the one that must always work: **(a)** an API integration pushing data and fetching the resulting invoice (desired, explicitly "if possible"); **(b)** the current real process — PER-01 generates the bill in Zoho manually, downloads it, and uploads it into the app per society per month via the existing AI-extraction invoice-upload flow already built in `/admin/invoices`.
- **Behavioral rules:** Path (b) must work standalone regardless of whether path (a) ever ships (CON-33) — the integration is an efficiency, never a dependency. The uploaded invoice is matched to its month's calculation so the app's computed amount and the actual invoiced amount can be reconciled; a mismatch is surfaced, not silently accepted.
- **Acceptance criteria:**
  - AC-1 (happy, manual path): Given a finalized month, when PER-01 uploads the Zoho-generated PDF, then it's extracted, matched to that society+month's calculation, and any amount mismatch is flagged.
  - AC-2 (empty): Given a month with no invoice uploaded yet, the society's billing record shows "invoice pending" explicitly — this is the state ops chases at month end.
  - AC-3 (failure): Given the uploaded invoice's amount differs from the computed amount, the discrepancy is shown and must be acknowledged or corrected before release (FEAT-054), not auto-reconciled.
  - AC-4 (permission): Given a non-PER-01 actor, invoice upload is unavailable.
  - AC-5 (edge): Given the Zoho API integration exists and fails mid-cycle, the manual path remains fully available as a fallback in the same UI — no separate degraded mode to learn under pressure.
- **Permissions:** PER-01 (upload, reconcile).
- **Data touched:** Creates/updates the invoice record linked to `MonthlyCalculation`; stores the invoice document.
- **Triggers:** Manual (path b) or automatic (path a) after the month's amount is final.
- **Emits:** `InvoiceAttached`, `InvoiceAmountMismatch`.
- **Consumes:** `MonthlyCalculationCompleted`, adjustments (FEAT-050), proration (FEAT-051).
- **Depends on:** FEAT-048; the existing AI invoice-extraction upload flow (already built, per PROJECT_CONTEXT.md).
- **Depended on by:** FEAT-054, CAP-06, CAP-14, CAP-13's non-payment tracking (CON-13).
- **Failure modes:** Treating the Zoho integration as the primary path and the manual upload as a degraded afterthought would invert CON-33's actual guidance and leave ops worse off than today.
- **Limits & scale:** 200 invoices/month at the 2-year target — trivial.
- **Minimum viable version:** The manual upload path only, reusing what already exists.
- **Complete version:** Adds the Zoho API integration as an optional accelerator.
- **Open questions / assumptions:** Zoho integration feasibility is explicitly a Phase 7/8 architecture question (CON-33), not decided here.
- **Risks:** Building toward the integration first would be building on an undecided dependency.

### FEAT-054 — Accountant review & release gate
- **Capability:** CAP-04 · **Persona:** PER-08 (Accountant — a distinct role with its own login, confirmed at the Phase 3 gate 2026-08-12) · **Serves:** GOAL-01, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** CON-33 states that before either the invoice or the savings report goes to a society, the company's own accountant reviews and approves — without a gate, an automated pipeline would send unreviewed bills, which is worse than today's manual process, not better.
- **Description:** A review queue of finalized months awaiting release: each shows the computed savings, the contracted fixed amount, any adjustment and its review reference, any invoice-amount mismatch, and coverage/anomaly notes. The reviewer releases the invoice and savings report together, or sends the month back for correction.
- **Behavioral rules:** Nothing reaches a society before release — this gate covers both the invoice (FEAT-053) and the savings report (CAP-06), since sending one without the other is a support call waiting to happen. Release is attributed and timestamped; a released month is immutable, and any later correction is a visible new version (matching the invoice-immutability principle already established in this product).
- **Acceptance criteria:**
  - AC-1 (happy): Given a finalized month with no outstanding flags, when the accountant releases it, then the invoice and savings report become visible to the society and the release is attributed.
  - AC-2 (empty): Given nothing awaits review, the queue shows a caught-up state.
  - AC-3 (failure): Given an unacknowledged invoice-amount mismatch (FEAT-053 AC-3) or an unresolved anomaly, release is blocked with the specific reason listed.
  - AC-4 (permission): Given any user who is not PER-08, release is unavailable — including PER-01. The accountant is a separate login with its own scoped access (billing data and the release queue), not an ops permission.
  - AC-5 (edge): Given a released month later needs correction, a new version is issued and the society can see both — the original is never silently replaced.
- **Permissions:** PER-08 (Accountant) only — a distinct role, scoped to billing data and this release queue.
- **Data touched:** Writes release state, reviewer attribution, and version history on the month's invoice and savings report.
- **Triggers:** `InvoiceAttached` plus a generated savings report.
- **Emits:** `MonthReleased`, `MonthSentBackForCorrection`.
- **Consumes:** `InvoiceAttached`, CAP-06's report generation.
- **Depends on:** FEAT-053, CAP-06.
- **Depended on by:** CAP-14 (the society only ever sees released months), CAP-13's payment tracking, CAP-12 (billing queries reference released documents).
- **Failure modes:** A rubber-stamped release gate provides false assurance — the same risk shape as FEAT-003 and FEAT-010, and worth the same watchfulness.
- **Limits & scale:** 200 releases/month at the 2-year target — a real monthly workload, arguing for batch-friendly review UI rather than one-at-a-time.
- **Minimum viable version:** Per-society release with blocking flags.
- **Complete version:** Batch review/release for clean months, with only flagged months requiring individual attention.
- **Open questions / assumptions:** Resolved at the Phase 3 gate — the accountant is a distinct role (PER-08), not a permission on PER-01. PER-08's own working preferences remain un-researched (RG-08).
- **Risks:** At 200 societies, a one-at-a-time release flow becomes its own month-end bottleneck — the exact toil GOAL-01 set out to remove. Sharper now that the gate belongs to a single dedicated person rather than being spread across ops.

### FEAT-055 — Deviation chart & initial findings
- **Capability:** CAP-05 · **Persona:** PER-01 · **Serves:** JTBD-02
- **Surface(s):** SUR-01
- **Problem:** CON-31 step 1 is explicit: ops starts from raw daily readings plotted against the benchmark. Without that view, an out-of-band month is just a number, and the first diagnostic question ("is this one bad day or a sustained drift?") can't be answered.
- **Description:** When FEAT-049 raises an out-of-band month **for a specific circuit** (CON-11 — reviews are per circuit, never per society), PER-01 opens the deviation with that circuit's raw daily readings charted against its benchmark line for the period, plus context: reading coverage, any anomalies flagged at ingest, recent inspections, recent rescales, and recent tickets for that society. From here PER-01 either resolves it directly (an ingest error, a known cause) or assigns it for field investigation (FEAT-056).
- **Behavioral rules:** The chart shows raw daily readings, not just the monthly aggregate — the shape of the deviation is the diagnostic signal (a step change points to a physical change; a gradual drift points elsewhere; a few spike days point to an ingest problem). All context is assembled on one view rather than requiring PER-01 to cross-reference four screens. Where a society has several typed circuits, the view also shows the sibling circuits' current standing — a deviation isolated to one light type points somewhere very different from all four drifting together.
- **Acceptance criteria:**
  - AC-1 (happy): Given an out-of-band month, when PER-01 opens the deviation, then daily readings are plotted against the benchmark with coverage, anomalies, recent inspections, rescales, and tickets shown alongside.
  - AC-2 (empty): Given no open deviations, the queue shows a caught-up state.
  - AC-3 (failure/degraded): Given readings can't be loaded for the chart, the deviation still opens with its numeric summary and an explicit note that the chart is unavailable (INV-06).
  - AC-4 (permission): Given a non-PER-01 actor, deviations are not visible — these are internal billing judgments, not customer-facing.
  - AC-5 (edge): Given the deviation is explained by low reading coverage (CON-12) rather than real consumption change, PER-01 can resolve it as a data issue without dispatching anyone — the cheapest resolution should be the easiest one to reach.
- **Permissions:** PER-01 (view, resolve, assign).
- **Data touched:** Reads `MonthlyCalculation`, `MeterReading`, `ReadingAnomaly`, inspections, rescales, tickets; creates a `DeviationReview` record.
- **Triggers:** `MonthOutOfBand` (FEAT-049).
- **Emits:** `DeviationOpened`, `DeviationResolvedByOps`.
- **Consumes:** `MonthOutOfBand`.
- **Depends on:** FEAT-049, CAP-03.
- **Depended on by:** FEAT-056, FEAT-057; FEAT-050 (billing application) waits on this review's outcome.
- **Failure modes:** none beyond standard.
- **Limits & scale:** Should be a small fraction of months — but at 200 societies even 5% is ~10 reviews/month, enough that the queue needs to be workable rather than incidental.
- **Minimum viable version:** Chart plus numeric summary and a resolve/assign action.
- **Complete version:** Full assembled context (inspections, rescales, tickets) on the same view.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-056 — Assign a deviation for field investigation
- **Capability:** CAP-05 · **Persona:** PER-01 (assign), PER-03 (investigate) · **Serves:** JTBD-02, JTBD-04
- **Surface(s):** SUR-01 (assign), SUR-02 (investigate)
- **Problem:** CON-31 steps 2-3: some deviations can only be explained on site. Without a real assignment path, "someone should go look" is a phone call that leaves no record and no findings.
- **Description:** PER-01 assigns the deviation to an inspector for on-site investigation, which schedules a field visit through CAP-17. The inspector investigates, resolves the problem if they can, and records findings — including which of CON-01b's root causes they observed. The case then returns to PER-01 (FEAT-057).
- **Behavioral rules:** Assignment goes through CAP-17's scheduling rather than a bespoke dispatch mechanism — one field-visit model, not two. The inspector reports findings and observed cause; they do **not** make the billing classification (CON-31 step 4 puts that with ops), which keeps a field observation separate from a revenue decision.
- **Acceptance criteria:**
  - AC-1 (happy): Given an assigned deviation, when the inspector completes their visit and records findings, then the deviation returns to PER-01's queue marked investigated with the findings attached.
  - AC-2 (empty): Given an inspector has no assigned investigations, their SUR-02 list shows that plainly alongside their other work (JTBD-04's single view).
  - AC-3 (failure): Given the inspector can't determine a cause on site, they record that explicitly — "cause not found" is a first-class outcome (CON-31 step 5b), not a blank form.
  - AC-4 (permission): Given an inspector, they can record findings but cannot classify the billing root cause or close the deviation.
  - AC-5 (edge): Given the inspector fixes the problem during the visit (e.g. cleans blocked sensors), both the finding and the fix are recorded — the distinction matters, because a corrected FirsThing-attributable issue bills differently from an uncorrected one (CON-01b, FEAT-050 AC-5).
- **Permissions:** PER-01 (assign), PER-03 (investigate, record findings and fixes).
- **Data touched:** Updates `DeviationReview` (assignee, state, findings, observed cause, fix applied); creates a `FieldVisit` via CAP-17.
- **Triggers:** PER-01's assignment.
- **Emits:** `DeviationAssigned`, `DeviationInvestigated`.
- **Consumes:** `DeviationOpened`.
- **Depends on:** FEAT-055, CAP-17, CAP-11 (the inspector's own surface).
- **Depended on by:** FEAT-057.
- **Failure modes:** A deviation assigned but never visited stalls the month's billing — this needs to surface through CAP-17's overdue/escalation mechanism (FEAT-018) rather than being tracked separately.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Assignment with findings capture on return.
- **Complete version:** Adds the fix-applied distinction (AC-5) and full CAP-17 integration.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-057 — Root-cause classification & decision record
- **Capability:** CAP-05 · **Persona:** PER-01 · **Serves:** JTBD-02, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** INV-03 requires that any revenue-affecting deviation decision be an auditable record with an owner and a root-cause classification — not a binary fixable/not-fixable flag, and certainly not an undocumented judgment.
- **Description:** CON-31 step 4: PER-01 reopens the investigated case, selects the root cause as reported by the inspector (from CON-01b's classification — FirsThing-attributable vs. one of the named exclusions), records the decision and its reasoning, and closes it. The classification is what drives FEAT-050's billing treatment.
- **Behavioral rules:** The classification is a closed list derived from CON-01b, not free text — free text can't drive a billing rule and can't be audited consistently. Every decision carries an owner and timestamp (INV-03). Closing the review is what releases the month's billing treatment; an open review holds the month.
- **Acceptance criteria:**
  - AC-1 (happy): Given an investigated deviation, when PER-01 classifies the cause as FirsThing-attributable-and-uncorrected and closes it, then FEAT-050 flips that month to `actual-metered` and the decision record shows who decided, when, and why.
  - AC-2 (empty): Given no investigated deviations await classification, the queue shows a caught-up state.
  - AC-3 (failure): Given PER-01 attempts to close without selecting a root cause, closure is refused — INV-03's auditable-classification requirement, enforced rather than encouraged.
  - AC-4 (permission): Given a non-PER-01 actor, classification and closure are unavailable.
  - AC-5 (edge): Given the inspector reported "cause not found," PER-01 cannot force a classification — the only available path is escalation to management (FEAT-058), matching CON-31 step 5b exactly.
- **Permissions:** PER-01 (classify, close, escalate).
- **Data touched:** Writes root-cause classification, decision, owner, timestamp on `DeviationReview`.
- **Triggers:** `DeviationInvestigated`, or direct resolution from FEAT-055.
- **Emits:** `DeviationClosed`, `DeviationEscalated`.
- **Consumes:** `DeviationInvestigated`.
- **Depends on:** FEAT-055, FEAT-056.
- **Depended on by:** FEAT-050 (billing treatment), FEAT-058 (escalation), CAP-06 (the savings report explains the month), CAP-14.
- **Failure modes:** Habitually classifying ambiguous cases as excluded/society-caused (the classification that leaves revenue untouched) would be an invisible bias with real customer consequences — worth periodic review of the classification distribution, not just per-case correctness.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Closed-list classification with owner and reasoning.
- **Complete version:** Adds classification-distribution reporting for the bias check noted above.
- **Open questions / assumptions:** none blocking.
- **Risks:** See failure modes.

### FEAT-058 — Management escalation for unresolved deviations
- **Capability:** CAP-05 · **Persona:** management · **Serves:** JTBD-02
- **Surface(s):** SUR-01
- **Problem:** CON-31 step 5b is specific and easy to miss: when a deviation can't be resolved and no cause is found, the decision is **not** ops' to make. It escalates to management, who decide whether to adjust the benchmark % and billing calculation based on post-investigation readings.
- **Description:** An escalated deviation goes to management with the full case: the chart, the inspector's findings, the "cause not found" conclusion, and the post-investigation readings. Management decides whether to adjust the benchmark savings % and the billing calculation going forward — the only route by which a benchmark changes for a reason other than a verified light-count change (FEAT-041).
- **Behavioral rules:** This is the sole exception to "the benchmark is fixed for the term" other than CON-10's light-count rescale — so it must be a distinctly-permissioned, fully-recorded decision, not an ops action with a different label. **Approval depends on direction (CON-37, resolved at the Phase 3 gate):** an adjustment that **favours the society** (they pay less) applies immediately with the society notified; one that **favours FirsThing** requires a signed contract amendment (FEAT-064) before taking effect. Either way the change is effective-dated forward and prior months are not restated.
- **Acceptance criteria:**
  - AC-1 (happy, society-favourable): Given an escalated deviation where management lowers the benchmark, then it takes effect immediately, effective-dated, with the decision recorded and the society notified — no amendment needed.
  - AC-2 (empty): Given nothing is escalated, the management queue shows a caught-up state.
  - AC-3 (failure): Given management decides no adjustment is warranted, the deviation closes with that decision recorded and the month bills at the contracted fixed rate.
  - AC-4 (permission): Given PER-01 (ops without management permission), they can escalate but cannot make this decision — the separation is the entire point of CON-31 step 5b.
  - AC-5 (edge, FirsThing-favourable): Given the adjustment would increase what the society pays, then it does **not** take effect on management's decision alone — it produces a proposed contract amendment (FEAT-064) and applies only once signed (CON-37).
- **Permissions:** management only (a named permission distinct from general admin, mirroring FEAT-032's approach).
- **Data touched:** Writes the management decision; may write a new effective-dated benchmark on `Circuit`.
- **Triggers:** `DeviationEscalated` (FEAT-057).
- **Emits:** `BenchmarkAdjustedByManagement`, `EscalationClosedNoChange`.
- **Consumes:** `DeviationEscalated`.
- **Depends on:** FEAT-057.
- **Depended on by:** FEAT-048/049 (future months compute against the adjusted benchmark), CAP-07 (a benchmark change may require a contract amendment), CAP-14.
- **Failure modes:** A society-favourable adjustment applied immediately still leaves the system and the signed agreement disagreeing until the next renewal — acceptable per CON-37, but the divergence should be visible on the contract record (FEAT-065's amendment history) rather than invisible.
- **Limits & scale:** Should be rare — trivial.
- **Minimum viable version:** Escalation queue with a recorded decision and the direction check.
- **Complete version:** Adds the effective-dated benchmark write plus automatic routing of FirsThing-favourable adjustments into FEAT-064's amendment flow.
- **Open questions / assumptions:** none blocking — CON-37 resolved the approval question at the Phase 3 gate.
- **Risks:** The direction test must be evaluated on the *billing effect*, not the raw percentage — depending on how a benchmark moves, "lower number" and "society pays less" are not always the same thing, and getting that backwards would apply an unsigned increase.

### FEAT-059 — Monthly savings report generation
- **Capability:** CAP-06 · **Persona:** PER-01 · **Serves:** JTBD-01, JTBD-06, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** The savings report is what makes the bill defensible — it's the artefact a committee reads to decide whether the number is trustworthy (JTBD-06). Built by hand each month, it's both a time sink and inconsistent between societies.
- **Description:** Distinct from the invoice (which comes from Zoho, CON-33), the savings report is **generated natively by the app**: the month's metered consumption, the extrapolated society-wide figure, the benchmark comparison, savings in units and ₹, the revenue-share split, coverage, and any deviation/adjustment explanation. Generated automatically once the month's calculation completes, and released only through FEAT-054's accountant gate.
- **Behavioral rules:** Every figure links to its provenance (INV-02) — the readings, the benchmark version, the contract terms version used. Where the month was out of band, the report says so and explains the outcome rather than presenting a clean number (an unexplained anomalous month is exactly what triggers a dispute). Where `pricingBasis` was `actual-metered` (FEAT-050) or the contract is `negotiated-fixed` (FEAT-052), the report states the basis plainly — and on a mixed-basis month it states it **per circuit**, since one fee line can be `actual-metered` while the rest stay fixed (CON-11). On a `negotiated-fixed` contract with retained pre-install readings (CON-25d), the report additionally shows measured before/after consumption as evidence, explicitly labelled as evidence rather than as the billing basis.
- **Acceptance criteria:**
  - AC-1 (happy): Given a completed monthly calculation, when the report generates, then it contains metered consumption, extrapolation, benchmark comparison, savings units/₹, the share split, and coverage, each traceable to source.
  - AC-2 (empty/first-run): Given a society's first partial month, the report reflects the prorated period and says so, rather than presenting a partial month as a full one.
  - AC-3 (failure): Given the calculation is held (unresolved anomalies), no report generates and the reason is visible — a report from provisional data is worse than no report.
  - AC-4 (permission): Given any role, report figures aren't hand-editable; narrative/commentary is, following FEAT-021's locked-figures/editable-presentation split from the demo report.
  - AC-5 (edge): Given a month whose bill was adjusted after a deviation review, the report includes the root-cause explanation (CON-01b classification, in customer-appropriate language) rather than a bare adjusted number.
- **Permissions:** system (generate), PER-01 (review, edit narrative).
- **Data touched:** Creates `SavingsReport` per (society, service line, month) with provenance links.
- **Triggers:** Automatic on `MonthlyCalculationCompleted`.
- **Emits:** `SavingsReportGenerated`.
- **Consumes:** `MonthlyCalculationCompleted`, `DeviationClosed`, `BillingAdjustmentApplied`.
- **Depends on:** FEAT-048, FEAT-050, CAP-07.
- **Depended on by:** FEAT-054 (release gate covers it), FEAT-060, CAP-14.
- **Failure modes:** A report that presents an extrapolated society-wide figure without making the extrapolation visible would look like measurement when it's inference — CON-11's sample-based model has to be legible to the customer, not buried.
- **Limits & scale:** 200 reports/month at the 2-year target — argues for generation and review at batch scale (see FEAT-054's same concern).
- **Minimum viable version:** In-app report with the core figures and provenance.
- **Complete version:** Adds a rendered, shareable document/image matching the existing real "savings report" artefact (02-users-research.md evidence).
- **Open questions / assumptions:** none blocking.
- **Risks:** This report is the primary vehicle for GOAL-06 — if it isn't genuinely legible to a non-technical committee (PER-05), the traceability exists in the data but not in practice.

### FEAT-060 — Savings report delivery & society view
- **Capability:** CAP-06 · **Persona:** PER-01, PER-05, PER-06 · **Serves:** JTBD-06
- **Surface(s):** SUR-01 (both admin and customer)
- **Problem:** A generated report that stays inside the admin app doesn't serve JTBD-06 at all — the society has to actually receive it, alongside the invoice, in a way they can return to later.
- **Description:** On release (FEAT-054), the savings report and its matching invoice become visible together in the society's portal and are shared through the society's preferred channel. The society can view current and historical months.
- **Behavioral rules:** Report and invoice are released and presented **together** — a bill without its explanation is what generates support calls (JTBD-03/CAP-12). Only released versions are ever visible to a society; history is retained so a society can compare months themselves.
- **Acceptance criteria:**
  - AC-1 (happy): Given a released month, when the committee opens the portal, then that month's savings report and invoice are both available with historical months alongside.
  - AC-2 (empty/first-run): Given a newly-onboarded society with no released months, the portal explains that the first report arrives after the first billing month rather than showing an empty table.
  - AC-3 (failure/degraded): Given a report fails to load, an explicit error state renders (INV-06).
  - AC-4 (permission): Given a society user, they see only their own society's released reports; unreleased months are inaccessible server-side.
  - AC-5 (edge): Given a released month is later corrected, both versions remain visible with the correction explained — consistent with FEAT-054 AC-5.
- **Permissions:** PER-05/PER-06 (view own), PER-01 (share, view all).
- **Data touched:** Reads released `SavingsReport` and invoice records.
- **Triggers:** `MonthReleased` (FEAT-054).
- **Emits:** `SavingsReportDelivered`.
- **Consumes:** `MonthReleased`.
- **Depends on:** FEAT-054, FEAT-059.
- **Depended on by:** CAP-14 (this is a core panel of the society portal), CAP-12 (billing queries reference these documents).
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial per society.
- **Minimum viable version:** In-portal view of released report + invoice.
- **Complete version:** Adds outbound delivery over the society's preferred channel, reusing FEAT-022's share/delivery-tracking mechanism rather than a second one.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-061 — Cross-sell savings projection
- **Capability:** CAP-06 · **Persona:** PER-07, PER-01 · **Serves:** JTBD-08, GOAL-02
- **Surface(s):** SUR-01
- **Problem:** Quoting pump-automation savings to an existing lighting customer currently means a flat, one-size-fits-all percentage — CON-29 rejects that in favour of a projection grounded in the society's actual equipment and history.
- **Description:** For a service line without a live demo, a projected savings % is derived from three inputs (CON-29): the equipment specs captured in the survey (motor HP × count, tank capacity, flat count — FEAT-008), historical benchmark/industry data, and the pump room's actual historical consumption from the photographed logbook (FEAT-009) where available. The projection is presented with its inputs and its uncertainty, not as a measured figure.
- **Behavioral rules:** A projection is never presented as a measurement — the distinction between "projected from equipment and history" and "measured on your site" is the product's core credibility claim (GOAL-06), and blurring it here would undermine it everywhere. Where logbook history is unavailable, the projection is still produced but its confidence is explicitly lower and stated as such.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society with a completed pump equipment audit and logbook history, when a projection is requested, then a projected savings % is produced with all three inputs shown.
  - AC-2 (empty/first-run): Given no survey data exists for that service line, no projection can be produced and the missing input is named (the survey, FEAT-008) rather than a default percentage being offered.
  - AC-3 (failure/partial inputs): Given logbook history is unavailable, the projection is produced from the other two inputs with reduced confidence stated explicitly.
  - AC-4 (permission): Given a non-PER-01/PER-07 actor, projections are unavailable.
  - AC-5 (edge): Given a projection is used in an offer (FEAT-027), the offer records that its benchmark is projected rather than measured — which, if the deal proceeds without a demo, lands it on CON-25's `negotiated-fixed` path with all that implies.
- **Permissions:** PER-01, PER-07.
- **Data touched:** Reads `PumpAsset`/`Tank`/`Tower` (FEAT-042), `HistoricalLogbookPhoto` (FEAT-009), reference/industry data; creates a projection record.
- **Triggers:** Manual, during cross-sell.
- **Emits:** `ProjectionGenerated`.
- **Consumes:** `PumpEquipmentAuditCaptured`, `HistoricalLogbookCaptured`.
- **Depends on:** FEAT-008, FEAT-009, FEAT-042.
- **Depended on by:** FEAT-027 (offer generation for a non-demoed service line), CAP-20.
- **Failure modes:** An over-optimistic projection that a later real demo contradicts is a credibility problem with an existing customer — the most expensive kind. Conservative defaults are the right bias here.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Equipment-spec-based projection with industry reference data; logbook input manual/reference-only.
- **Complete version:** Incorporates extracted logbook consumption as a real quantitative input (pairing with FEAT-009's complete version).
- **Open questions / assumptions:** **Deferred by decision at the Phase 3 gate (2026-08-12).** CON-29 names the three inputs but not how they combine, and the formula needs its own modeling pass. This feature stays in the blueprint but is explicitly not to be built until that pass happens; cross-sell quoting continues manually meanwhile.
- **Risks:** Building a guessed formula would put a fabricated number behind the product's credibility claim — the deferral is the mitigation, and should hold through prioritization (Phase 6).

### FEAT-062 — Contract record & versioned terms
- **Capability:** CAP-07 · **Persona:** PER-01 · **Serves:** GOAL-06, JTBD-01
- **Surface(s):** SUR-01
- **Problem:** Nearly every billing rule in this product reads from a contract term — tolerance band (CON-01a), revenue-share %, unit electricity rate, exclusion list (CON-01b), spare-stock count (CON-15), term dates. Today those live in a PDF, which means the billing engine has no authoritative source and every term is effectively re-typed wherever it's needed.
- **Description:** A first-class contract record per (society, service line), holding: term start/end, benchmark % and its source (`measured | negotiated-fixed`), tolerance band %, revenue-share split, contracted unit electricity rate, the exclusion list, contracted spare-stock count, AMC terms, and a link to the executed agreement document (FEAT-029). All terms are versioned and effective-dated.
- **Behavioral rules:** Terms are **versioned and effective-dated**, never overwritten — a figure computed in March must remain reproducible against March's terms even after an amendment (INV-02). Every calculation records which term version it used (FEAT-048). The contract record is derived from the accepted offer and the executed agreement, not typed independently (FEAT-029's rule against paper-vs-system drift).
- **Acceptance criteria:**
  - AC-1 (happy): Given an executed agreement, when the contract record is created, then all billing-relevant terms are populated from the accepted offer and linked to the signed document.
  - AC-2 (empty/first-run): Given a society with no contract for a service line, its billing cannot start and the record says why rather than defaulting any term.
  - AC-3 (failure): Given a required billing term is missing (tolerance band, revenue-share, unit rate), the contract cannot be activated — every one of these is a hard input to FEAT-048/049.
  - AC-4 (permission): Given a non-PER-01 actor, contract terms are read-only; amendments require the stronger permission in FEAT-064.
  - AC-5 (edge): Given terms are amended mid-contract, prior months remain computed against the version effective at the time, and the new version applies forward only.
- **Permissions:** PER-01 (create from agreement, read), management (amend — FEAT-064).
- **Data touched:** Creates `Contract` with versioned, effective-dated term records; links the executed document.
- **Triggers:** `AgreementExecuted` (FEAT-029).
- **Emits:** `ContractActivated`.
- **Consumes:** `AgreementExecuted`, accepted `Offer` terms.
- **Depends on:** FEAT-029, FEAT-039.
- **Depended on by:** CAP-04 (every billing feature reads terms here), CAP-05 (tolerance band, exclusions), CAP-10 (contracted spare-stock count), CAP-14 (society view), CAP-13.
- **Failure modes:** A term stored unversioned would make historical figures irreproducible the first time anything is amended — quietly breaking INV-02 for every prior month.
- **Limits & scale:** One contract per (society, service line); 200 societies at the 2-year target — trivial.
- **Minimum viable version:** All billing-relevant terms as a single current version.
- **Complete version:** Full effective-dated versioning with per-calculation version references.
- **Open questions / assumptions:** none blocking.
- **Risks:** This record is the authority behind every rupee billed; its correctness at creation (FEAT-029's handoff) matters more than any feature that reads it.

### FEAT-063 — Term end, ownership transfer & AMC
- **Capability:** CAP-07 · **Persona:** PER-01 · **Serves:** JTBD-06
- **Surface(s):** SUR-01
- **Problem:** CON-15 (from a real signed agreement) establishes that hardware ownership transfers to the society at term end, with an optional post-term AMC at 25% of analyzed monthly savings. Neither event is tracked anywhere today, and both have direct asset and revenue consequences.
- **Description:** Tracks contract term end: the approaching-expiry window, the hardware ownership transfer (moving FirsThing-owned assets to society-owned, CON-08/CON-15), and the AMC decision — offered, accepted with terms reconfirmed at renewal, or declined.
- **Behavioral rules:** Ownership transfer is an asset-state change with real consequences downstream (CAP-10's inventory scope, CAP-11's maintenance obligations), not a status label. **AMC has no default rate** — it is renegotiated at every renewal and stored per contract (CON-15, updated at the Phase 3 gate); the system must never carry a rate forward or assume 25%. The approaching-expiry window must surface early enough to act on — a term end discovered on the day is a lost renewal.
- **Acceptance criteria:**
  - AC-1 (happy): Given a contract approaching term end, when the window opens, then it appears in PER-01's queue with the renewal/AMC decision outstanding.
  - AC-2 (empty): Given no contracts near term end, the queue is clean.
  - AC-3 (failure): Given term end passes with no decision recorded, the contract is flagged as expired-undecided rather than silently continuing to bill — billing past a term without a renewal is a real exposure.
  - AC-4 (permission): Given a non-PER-01 actor, recording renewal/AMC outcomes is unavailable.
  - AC-5 (edge): Given ownership transfers at term end, then FirsThing-owned assets for that society flip to society-owned, and they leave FirsThing's own inventory and replacement obligations (CAP-10/CAP-11) accordingly — the transfer propagates rather than being recorded in isolation.
- **Permissions:** PER-01 (manage), management (approve non-standard renewals).
- **Data touched:** Updates `Contract` (term end state, renewal, AMC terms); updates asset ownership records.
- **Triggers:** Time-based (approaching term end).
- **Emits:** `TermEndApproaching`, `OwnershipTransferred`, `AMCAccepted`, `ContractExpired`.
- **Consumes:** `ContractActivated`.
- **Depends on:** FEAT-062, FEAT-042 (assets), CAP-10.
- **Depended on by:** CAP-04 (billing stops or shifts to AMC terms), CAP-10 (inventory scope), CAP-11 (maintenance obligations), CAP-14.
- **Failure modes:** Continuing to bill past an undecided term end (AC-3) is the specific failure worth engineering against.
- **Limits & scale:** Trivial today (no contract has reached term end yet) but structurally important.
- **Minimum viable version:** Term-end tracking with a recorded renewal/AMC decision.
- **Complete version:** Adds automated ownership-transfer propagation to assets and inventory.
- **Open questions / assumptions:** none blocking — CON-15 was updated at the Phase 3 gate: **there is no default AMC rate.** It is renegotiated at each renewal and stored per contract like the tolerance band, for as long as the society wants maintenance and services. The Ace Aspire contract's 25% is that contract's own figure, not a platform constant.
- **Risks:** No contract has reached this stage yet, so none of it has been exercised in reality — the specification here is derived from contract text, not operational experience.

### FEAT-064 — Contract amendments & termination
- **Capability:** CAP-07 · **Persona:** PER-01 (management) · **Serves:** GOAL-06
- **Surface(s):** SUR-01
- **Problem:** Terms do change mid-contract — a management benchmark adjustment (FEAT-058), a scope change from installation (FEAT-036), a renegotiated revenue share. Without a controlled amendment path, these become direct edits to billing inputs with no paper trail.
- **Description:** A controlled path to amend contract terms mid-term or terminate a contract. Each amendment creates a new effective-dated term version with its reason, approver, and supporting document. Termination sets an end date, triggers final-month proration (FEAT-051 AC-5), and resolves asset ownership.
- **Behavioral rules:** Amendments require management permission and a stated reason — this is the counterpart control to FEAT-062's versioning, and together they're what keep billing inputs auditable. Amendments are forward-effective; prior months are never restated (consistent with FEAT-041/FEAT-058). Where an amendment stems from a system decision (a management benchmark adjustment), the two records link so the chain is followable.
- **Acceptance criteria:**
  - AC-1 (happy): Given a renegotiated revenue-share, when management records the amendment with reason and effective date, then a new term version applies forward and prior months keep their original terms.
  - AC-2 (empty): Given a contract with no amendments, its history shows the original terms only.
  - AC-3 (failure): Given an amendment without a reason or supporting document, it's refused — an unexplained change to a billing input is exactly what INV-03's spirit prohibits.
  - AC-4 (permission): Given PER-01 without management permission, amendments are unavailable — reading terms and changing them are deliberately different rights.
  - AC-5 (edge): Given termination mid-month, the final month prorates (FEAT-051) and asset ownership is resolved per the contract's terms rather than defaulting either way.
- **Permissions:** management only.
- **Data touched:** Creates new effective-dated `Contract` term versions; writes termination state and dates.
- **Triggers:** Manual; may follow `BenchmarkAdjustedByManagement` (FEAT-058) or a scope change (FEAT-036).
- **Emits:** `ContractAmended`, `ContractTerminated`.
- **Consumes:** `BenchmarkAdjustedByManagement`, `RequirementChangeRaised`.
- **Depends on:** FEAT-062.
- **Depended on by:** CAP-04 (all billing), CAP-05, CAP-13, CAP-14.
- **Failure modes:** An amendment recorded without linking to the decision that prompted it (e.g. FEAT-058's escalation) leaves two half-explanations instead of one chain.
- **Limits & scale:** Rare — trivial.
- **Minimum viable version:** Amendment with reason, approver, effective date, and document.
- **Complete version:** Adds linkage to originating system decisions and a termination workflow with asset resolution.
- **Open questions / assumptions:** none blocking — CON-37 settled this: FirsThing-favourable benchmark adjustments route here for a signed amendment, society-favourable ones don't.
- **Risks:** none significant beyond FEAT-058's direction-test correctness.

### FEAT-065 — Society read-only contract view
- **Capability:** CAP-07 · **Persona:** PER-05, PER-06 · **Serves:** JTBD-06
- **Surface(s):** SUR-01 (customer portal)
- **Problem:** OQ-08 confirmed a read-only contract view is in scope: a committee checking a bill wants to see the terms it was computed against without emailing someone for a PDF.
- **Description:** The society sees its own contract's key terms — benchmark %, tolerance band, revenue-share split, unit rate, term dates, exclusion list, AMC terms — alongside the executed agreement document, presented in plain language rather than as raw fields.
- **Behavioral rules:** Read-only, always — a society can see terms but never change them. Terms shown are the version currently in effect, with amendments visible as history so a changed term isn't a surprise. The exclusion list (CON-01b) is shown plainly, since it's what determines whether a bad month affects their bill — hiding it would make FEAT-050's excluded-cause notifications feel arbitrary.
- **Acceptance criteria:**
  - AC-1 (happy): Given an active contract, when the committee opens it, then current terms are shown in plain language with the signed document downloadable.
  - AC-2 (empty/first-run): Given a society without an active contract, the view explains that rather than showing empty fields.
  - AC-3 (failure/degraded): Given terms can't load, an explicit error state renders (INV-06).
  - AC-4 (permission): Given a society user, they see only their own society's contract, read-only, enforced server-side.
  - AC-5 (edge): Given the contract has been amended, both the current terms and the amendment history are visible — a term that silently changed is worse for trust than one that visibly did.
- **Permissions:** PER-05/PER-06 (read own).
- **Data touched:** Reads `Contract` current version and amendment history.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** `ContractActivated`, `ContractAmended`.
- **Depends on:** FEAT-062.
- **Depended on by:** CAP-14 (a panel of the society portal).
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Current terms plus the signed document.
- **Complete version:** Adds plain-language rendering and amendment history.
- **Open questions / assumptions:** none blocking — OQ-08 resolved this as in scope.
- **Risks:** none significant.

### FEAT-066 — Ops home priority task queue
- **Capability:** CAP-08 · **Persona:** PER-01 · **Serves:** GOAL-05
- **Surface(s):** SUR-01
- **Problem:** Ops work arrives from eight different capabilities — tickets, deviation reviews, pipeline follow-ups, overdue field visits, unresolved anomalies, documents awaiting verification, months awaiting release, out-of-range demo results. Without one queue, staying on top of them means checking eight screens and remembering which ones exist.
- **Description:** The ops home's top section: a single priority-ordered task queue aggregating work from every source, each item showing its status indicator, priority level, and whether it's on time, delayed, or escalated (confirmed layout, 2026-08-10). Clicking an item goes to its own capability's detail view.
- **Behavioral rules:** Aggregation, not duplication — items live in their owning capability and this queue is a projection, so acting on an item there updates it everywhere. Priority combines the item's own urgency with its SLA state; a breached SLA (CON-27's pattern) outranks a fresh high-priority item. The queue must be honest about what it can't show: a source that fails to load is flagged, not silently omitted, or ops would trust an incomplete queue.
- **Acceptance criteria:**
  - AC-1 (happy): Given open work across tickets, deviations, and pipeline follow-ups, when PER-01 opens the home, then all appear in one priority-ordered queue with status, priority, and on-time/delayed/escalated state.
  - AC-2 (empty/first-run): Given nothing outstanding anywhere, the queue shows a genuine caught-up state rather than an empty table.
  - AC-3 (failure/degraded): Given one source (e.g. deviations) fails to load, the queue renders the rest and explicitly flags the missing source (INV-06's degraded state, and the reason it matters most here).
  - AC-4 (permission): Given a user without a given capability's permission, items from that source don't appear in their queue — the aggregate respects each source's own access rules rather than widening them.
  - AC-5 (edge): Given an item breaches its SLA, it moves up in priority and is visually distinguished as escalated, matching CON-27's escalation semantics rather than defining new ones.
- **Permissions:** PER-01 (view, scoped by underlying capability permissions).
- **Data touched:** Reads across tickets (CAP-09), deviations (CAP-05), pipeline follow-ups (FEAT-031), field visits (FEAT-018), anomalies (FEAT-045), documents (FEAT-024/026), release queue (FEAT-054), demo results (FEAT-015).
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** overdue/escalation events from every contributing capability.
- **Depends on:** the contributing capabilities existing.
- **Depended on by:** nothing structurally — but it's the screen that makes GOAL-05 real in daily use.
- **Failure modes:** An aggregate view that silently drops a failing source is worse than no aggregate at all, because ops would stop checking the individual screens — AC-3 exists specifically for this.
- **Limits & scale:** At 200 societies the queue could hold hundreds of items; prioritization and filtering matter more than raw display.
- **Minimum viable version:** Aggregates tickets, deviations, and overdue visits.
- **Complete version:** All eight sources with SLA-aware prioritization.
- **Open questions / assumptions:** The exact priority ordering across heterogeneous sources isn't defined — deliberately left to Phase 5/6 with real usage in mind rather than guessed here.
- **Risks:** This screen's value depends entirely on being trustworthy and complete; a partially-wired version may be worse than none.

### FEAT-067 — Society status list & drill-down
- **Capability:** CAP-08 · **Persona:** PER-01 · **Serves:** GOAL-08, GOAL-05
- **Surface(s):** SUR-01
- **Problem:** Below the task queue, ops needs the portfolio answer: which societies are fine, which are drifting, which have crossed the band — and a path from that signal down to the circuit causing it.
- **Description:** The ops home's second section (confirmed layout, 2026-08-10): a list of societies with a status chip each — on-track / approaching-tolerance / breached — drilling down society → service line → circuit, where FEAT-068's per-circuit detail lives.
- **Behavioral rules:** Status is derived from the compliance check (FEAT-049), never manually set. "Approaching tolerance" is a real state, not just a colour on "on-track" — GOAL-08 explicitly asks for flagging as a society *approaches* the band, which is the difference between a preventable and a reported problem. Drill-down follows the real hierarchy (society → service line → circuit), since a society can be fine on lighting and drifting on pumps.
- **Acceptance criteria:**
  - AC-1 (happy): Given societies in varied states, when PER-01 opens the list, then each shows a derived status chip and can be drilled into by service line and circuit.
  - AC-2 (empty/first-run): Given no active societies, an `EmptyState` explains rather than showing a bare table (INV-06).
  - AC-3 (failure/degraded): Given status can't be computed for a society (no readings yet, held calculation), it shows an explicit "no data" state rather than defaulting to on-track — a false green is the worst possible failure here.
  - AC-4 (permission): Given a non-PER-01 actor, the portfolio list is unavailable.
  - AC-5 (edge): Given a society is on-track for lighting but breached for pumps, its top-level chip reflects the worst state across its service lines, and the drill-down shows which one — never an averaged status that hides a problem.
- **Permissions:** PER-01 (view all).
- **Data touched:** Reads `MonthlyCalculation` compliance results, `Society`, `Circuit`.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** `MonthCompliant`, `MonthOutOfBand`.
- **Depends on:** FEAT-049, FEAT-039, FEAT-040.
- **Depended on by:** FEAT-068 (the drill-down target).
- **Failure modes:** AC-3's false-green case is the one worth engineering against explicitly.
- **Limits & scale:** 200 societies — a single scrollable/filterable list is sufficient.
- **Minimum viable version:** Society list with derived status and drill-down.
- **Complete version:** Adds the approaching-tolerance state and worst-of-service-lines rollup.
- **Open questions / assumptions:** none blocking — CON-01d set "approaching" at within 20% of the band edge, scaled per contract (4% on a ±5% band, 8% on a ±10% band).
- **Risks:** none significant.

### FEAT-068 — Per-circuit consumption-vs-benchmark monitoring
- **Capability:** CAP-08 · **Persona:** PER-01 · **Serves:** GOAL-08, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** GOAL-08 is specific: a portfolio-wide view, **per circuit**, of metered consumption against benchmark at daily, monthly, and to-date granularity. This is what operationalizes GOAL-01/GOAL-06 — without it, the billing decision has no source view to act from.
- **Description:** Per circuit, metered consumption plotted against its benchmark across daily, monthly, and contract-to-date views, with the tolerance band shown, coverage indicated, and anomalies and rescales marked on the timeline. This is the same underlying view FEAT-055's deviation review opens into — one chart component, two entry points.
- **Behavioral rules:** The tolerance band is drawn from the contract (CON-01a), so two circuits under different contracts show different bands — the chart is not one-size-fits-all. Days with no data are shown as gaps, never interpolated (FEAT-046's no-fill rule made visual). Rescale events (FEAT-041) and benchmark adjustments (FEAT-058) are marked on the timeline, since a step in the line is otherwise inexplicable.
- **Acceptance criteria:**
  - AC-1 (happy): Given a circuit with readings, when PER-01 opens its monitoring view, then daily/monthly/to-date consumption is plotted against the benchmark with the contracted tolerance band shown.
  - AC-2 (empty/first-run): Given a circuit commissioned but not yet reading, the view says so rather than rendering an empty chart.
  - AC-3 (failure/degraded): Given readings partially load, coverage is shown explicitly and gaps render as gaps (INV-06).
  - AC-4 (permission): Given a non-PER-01 actor, per-circuit monitoring is unavailable.
  - AC-5 (edge): Given a benchmark rescale occurred mid-period, the chart marks it and compares each period against the benchmark effective at that time — not the current one applied retroactively.
- **Permissions:** PER-01 (view).
- **Data touched:** Reads `MeterReading` aggregates, `Circuit` benchmark versions, contract tolerance, anomalies, rescales.
- **Triggers:** Page load / drill-down from FEAT-067.
- **Emits:** none.
- **Consumes:** CAP-03 and CAP-04 outputs.
- **Depends on:** FEAT-040, FEAT-046, FEAT-049, FEAT-062.
- **Depended on by:** FEAT-055 (deviation review reuses this view), CAP-14 (a simplified society-facing version).
- **Failure modes:** Comparing historical periods against the *current* benchmark rather than the effective-dated one would misrepresent history — AC-5 is the guard, and it's an easy mistake to make.
- **Limits & scale:** ~720 hourly readings per circuit-month aggregated to daily for display — chart data volumes stay modest with daily granularity.
- **Minimum viable version:** Daily and monthly plots against a static benchmark line with the tolerance band.
- **Complete version:** Adds to-date view, event markers (anomalies, rescales, adjustments), and effective-dated benchmark comparison.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant beyond AC-5's correctness.

### FEAT-069 — Business analytics & portfolio stats
- **Capability:** CAP-08 · **Persona:** management, PER-01 · **Serves:** GOAL-05, GOAL-07
- **Surface(s):** SUR-01
- **Problem:** Confirmed as a separate second view (2026-08-10): the ops home answers "what needs attention today," but management also needs "how is the business doing" — total verified savings delivered, portfolio growth, revenue, pipeline health.
- **Description:** A business-wide analytics view, deliberately distinct from the operational home: total ₹ verified monthly savings delivered (the north-star metric from Phase 1), societies active by service line, portfolio growth against the 200-society target (GOAL-07), revenue, pipeline conversion, and aggregate deviation/dispute rates.
- **Behavioral rules:** The north-star metric must be system-generated from released months only (Phase 1's definition), never estimated or including unreleased figures — a headline number derived loosely would undermine the same credibility the product sells. Analytics are read-only and derived; nothing here is a data-entry surface.
- **Acceptance criteria:**
  - AC-1 (happy): Given released months across the portfolio, when management opens the view, then total verified ₹ savings delivered is shown alongside portfolio, revenue, and pipeline metrics.
  - AC-2 (empty/first-run): Given insufficient history for a trend, the metric shows its current value without a fabricated trend line.
  - AC-3 (failure/degraded): Given a metric can't be computed, it's shown as unavailable with the reason — not as zero, and not omitted (the same honesty principle already applied to the existing admin dashboard's untracked KPIs).
  - AC-4 (permission): Given PER-01 without management permission, business/revenue metrics may be restricted while operational metrics remain visible — the two audiences differ.
  - AC-5 (edge): Given some months are billed `actual-metered` or `negotiated-fixed`, the verified-savings total distinguishes measured from agreement-derived figures rather than summing them as if equivalent.
- **Permissions:** management (full), PER-01 (operational subset).
- **Data touched:** Reads released `MonthlyCalculation`/`SavingsReport`, `Society`, `Pipeline`, `Contract`.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** `MonthReleased`, pipeline and contract events.
- **Depends on:** FEAT-054, FEAT-048, CAP-15's pipeline.
- **Depended on by:** nothing — this is a leaf view.
- **Failure modes:** Mixing measured and agreement-derived savings into one headline number (AC-5) would quietly overstate the metric that defines the company's own success.
- **Limits & scale:** Aggregate queries over 200 societies × months — modest, but worth precomputing if the view gets slow.
- **Minimum viable version:** North-star metric plus society/service-line counts.
- **Complete version:** Full revenue, pipeline conversion, and dispute-rate metrics with measured/derived separation.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-070 — Raise a ticket
- **Capability:** CAP-09 · **Persona:** PER-05, PER-06 (society), PER-03 (inspector), PER-01 · **Serves:** JTBD-07
- **Surface(s):** SUR-01 (society + ops), SUR-02 (inspector)
- **Problem:** Issues reach FirsThing today by whoever knows whom — a manager calls, an inspector mentions something. Nothing is tracked, nothing has an SLA, and nobody can see what's outstanding for a society.
- **Description:** A ticket can be raised by the society (either committee **or** manager — confirmed 2026-08-10, broader than ASSUM-11's general role split), by an inspector from their findings, or by ops. Typical causes: faulty/non-working equipment, spare stock exhausted before a scheduled visit, or any other issue needing an inspector.
- **Behavioral rules:** Raising is deliberately low-friction — a society blocked by a form won't use it and will call instead, which defeats the whole capability. Every ticket starts the CON-27 clock immediately (24h first response), so creation time is a contractual-grade timestamp, not incidental metadata. Tickets attach to a society and, where relevant, a specific circuit or asset.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society user with a fault, when they raise a ticket with a description and optional photo, then it's created, the 24h first-response clock starts, and ops sees it in their queue (FEAT-066).
  - AC-2 (empty/first-run): Given a society has never raised a ticket, their tickets view explains how rather than showing an empty table.
  - AC-3 (failure): Given required detail is missing (no description), creation is refused with a specific prompt — but the required set stays minimal.
  - AC-4 (permission): Given a society user, they can raise tickets only for their own society; inspectors raise against societies they're assigned to.
  - AC-5 (edge): Given an inspector raises a ticket during a visit for something they can't fix on the spot (spare stock exhausted, CON-26), it's created with their findings pre-attached rather than re-described from scratch.
- **Permissions:** PER-05, PER-06, PER-03, PER-01 (raise); scoped by society.
- **Data touched:** Creates `Ticket` (society, optional circuit/asset ref, description, photos, origin, created-at).
- **Triggers:** Manual.
- **Emits:** `TicketRaised`.
- **Consumes:** may originate from CAP-11 inspection findings.
- **Depends on:** CAP-13 (society accounts).
- **Depended on by:** FEAT-071 through FEAT-074; FEAT-066 (ops queue); CAP-14 (society ticket tracking).
- **Failure modes:** If raising a ticket is slower than making a phone call, the phone wins and the system stays empty — friction is the real risk here, not data quality.
- **Limits & scale:** At 200 societies, plausibly tens of tickets/week — the highest-volume workflow in the product after billing.
- **Minimum viable version:** Description + optional photo, society and internal origins.
- **Complete version:** Adds circuit/asset linkage and pre-attached inspection findings.
- **Open questions / assumptions:** none blocking.
- **Risks:** see failure modes.

### FEAT-071 — Ticket acknowledgement & triage
- **Capability:** CAP-09 · **Persona:** PER-01, PER-02 · **Serves:** JTBD-07
- **Surface(s):** SUR-01
- **Problem:** CON-27 sets a hard first-response obligation: backend must acknowledge and reply within 24 hours, deciding whether the issue is resolvable by call (close directly) or needs a field visit (schedule it, resolve within 48 hours of ticket creation).
- **Description:** Ops/support acknowledges a new ticket within 24 hours and triages it down one of two paths: **resolvable by call** — resolve and close directly with the resolution recorded; or **needs a field visit** — schedule one through CAP-17, with a 48-hour-from-creation resolution target.
- **Behavioral rules:** The 48-hour resolution clock runs from **ticket creation**, not from triage (CON-27) — so a slow acknowledgement eats into the resolution window rather than resetting it. Acknowledgement is a substantive reply to the society, not an internal status flip. Field visits are scheduled through CAP-17, not a bespoke dispatch.
- **Acceptance criteria:**
  - AC-1 (happy, call path): Given a ticket resolvable by phone, when ops resolves it and records the resolution, then the ticket closes within the first-response window and the society sees the outcome.
  - AC-2 (empty): Given no unacknowledged tickets, the triage queue shows a caught-up state.
  - AC-3 (failure/SLA): Given 24 hours pass without acknowledgement, the first-response SLA is breached and auto-escalates to management (CON-27, FEAT-074) — not merely highlighted.
  - AC-4 (permission): Given a non-PER-01/PER-02 actor, triage is unavailable.
  - AC-5 (edge): Given the ticket needs a field visit, when scheduled, then the visit is created via CAP-17 with the 48h-from-creation deadline attached, and both the ticket and the visit reflect the same deadline rather than tracking separately.
- **Permissions:** PER-01, PER-02 (acknowledge, triage, resolve-by-call).
- **Data touched:** Updates `Ticket` (state, acknowledgement, resolution path); creates a `FieldVisit` via CAP-17.
- **Triggers:** `TicketRaised`.
- **Emits:** `TicketAcknowledged`, `TicketClosedByCall`, `TicketScheduled`.
- **Consumes:** `TicketRaised`.
- **Depends on:** FEAT-070, CAP-17.
- **Depended on by:** FEAT-072, FEAT-074.
- **Failure modes:** Acknowledging as an internal status flip without actually replying to the society would satisfy the timer while failing its purpose — the acknowledgement should be a real communication, logged (shared with CAP-12's thread model per CON-32).
- **Limits & scale:** Trivial per ticket; the volume is the workload.
- **Minimum viable version:** Acknowledge + two-path triage with SLA timers.
- **Complete version:** Adds CAP-17 integration and shared communication logging with CAP-12.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-072 — Field resolution of a ticket
- **Capability:** CAP-09 · **Persona:** PER-03 · **Serves:** JTBD-04, JTBD-07
- **Surface(s):** SUR-02
- **Problem:** JTBD-04 is precisely this: the inspector wants to see what's assigned to them and log the outcome from their phone, without a separate desktop reporting step afterward.
- **Description:** The inspector sees the ticket in their assigned work (FEAT-019's SUR-02 view), attends, and either marks it resolved with findings and evidence, or flags it as needing more time/resources — which spins off sub-tasks (FEAT-073).
- **Behavioral rules:** "Needs more time/resources" is a first-class outcome (CON-27), not a failure to complete — the inspector shouldn't be pushed into a false "resolved." Resolution requires evidence (what was found, what was done) so the society's own view (CAP-14) can show a real resolution rather than a status word.
- **Acceptance criteria:**
  - AC-1 (happy): Given an assigned ticket, when the inspector marks it resolved with findings and photos, then it closes and the society sees the resolution.
  - AC-2 (empty): Given no assigned tickets, the inspector's list shows that alongside their other work (one view, per JTBD-04).
  - AC-3 (failure): Given the inspector can't resolve it, when they flag needs-more-resources with a reason, then sub-tasks are spun off (FEAT-073) and the ticket stays open rather than closing prematurely.
  - AC-4 (permission): Given an inspector, they can resolve only tickets assigned to them.
  - AC-5 (edge): Given resolution required consuming spare stock, the consumption is recorded against inventory (CAP-10) as part of the same action — not as a separate task the inspector must remember.
- **Permissions:** PER-03 (resolve own assigned tickets).
- **Data touched:** Updates `Ticket` (resolution, findings, evidence); may write spare-stock consumption (CAP-10).
- **Triggers:** `TicketScheduled` + visit attendance.
- **Emits:** `TicketResolved`, `TicketNeedsResources`.
- **Consumes:** `TicketScheduled`.
- **Depends on:** FEAT-071, CAP-17, CAP-10.
- **Depended on by:** FEAT-073, FEAT-074; CAP-14.
- **Failure modes:** Poor connectivity in the field delaying resolution logging can breach the 48h SLA on paper while the work was actually done on time — worth distinguishing work-completed-at from logged-at.
- **Limits & scale:** Trivial per ticket.
- **Minimum viable version:** Resolve with findings, or flag needs-resources.
- **Complete version:** Adds inline spare-stock consumption and work-completed-at capture.
- **Open questions / assumptions:** ASSUM-16 (PER-03's abandonment triggers) unconfirmed — relevant to field UX, not to the spec.
- **Risks:** none significant.

### FEAT-073 — Sub-task spin-off for unresolved tickets
- **Capability:** CAP-09 · **Persona:** PER-01, PER-03 · **Serves:** JTBD-07
- **Surface(s):** SUR-01 (create/assign), SUR-02 (execute)
- **Problem:** CON-27: when a ticket needs more time or resources, it spins off assigned tasks, **each with its own SLA**. Without this, a complex issue either sits as one perpetually-open ticket or gets closed prematurely.
- **Description:** From a needs-resources ticket, one or more sub-tasks are created — order a part, schedule a return visit, escalate to a vendor — each assigned with its own SLA. The parent ticket stays open until its sub-tasks resolve.
- **Behavioral rules:** Each sub-task carries its own SLA, and breaching **any** of them escalates (CON-27's "any SLA" rule). The parent cannot close while sub-tasks are open — otherwise the ticket's closure would misrepresent the society's actual situation.
- **Acceptance criteria:**
  - AC-1 (happy): Given a needs-resources ticket, when sub-tasks are created and assigned, then each carries its own SLA and appears in the assignee's work queue.
  - AC-2 (empty): Given a ticket with no sub-tasks, none are shown — this is not a mandatory structure for simple tickets.
  - AC-3 (failure): Given an attempt to close the parent with open sub-tasks, closure is refused with the open items listed.
  - AC-4 (permission): Given a non-PER-01 actor, creating/assigning sub-tasks is unavailable; assignees can complete their own.
  - AC-5 (edge): Given a sub-task breaches its own SLA, that breach escalates independently of the parent ticket's state (CON-27's "any SLA" rule) — a parent within its window doesn't shield a late sub-task.
- **Permissions:** PER-01 (create/assign), assignees (complete).
- **Data touched:** Creates `TicketTask` records with their own SLAs and assignees.
- **Triggers:** `TicketNeedsResources` (FEAT-072).
- **Emits:** `SubTaskCreated`, `SubTaskCompleted`.
- **Consumes:** `TicketNeedsResources`.
- **Depends on:** FEAT-072.
- **Depended on by:** FEAT-074; FEAT-066's ops queue includes sub-tasks as items.
- **Failure modes:** Deeply nested or numerous sub-tasks would make the parent's status meaningless — a flat one-level structure is likely sufficient and worth constraining to.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Flat sub-tasks with individual SLAs.
- **Complete version:** Adds parent-closure gating and independent escalation.
- **Open questions / assumptions:** none blocking — CON-35 seeds sub-task SLAs at **72h**, configurable by management (XC-03). Per-type variation can be layered on later if 72h proves wrong for some kinds of work.
- **Risks:** none significant.

### FEAT-074 — SLA tracking & management escalation
- **Capability:** CAP-09 · **Persona:** PER-01, management · **Serves:** GOAL-05
- **Surface(s):** SUR-01
- **Problem:** CON-27's SLAs are only real if breaching them does something. Three separate clocks run — 24h first response, 48h resolution from creation, and each sub-task's own — and breaching **any** of them auto-escalates to management for intervention.
- **Description:** Tracks all three SLA clocks per ticket, surfaces approaching and breached states in the ops queue (FEAT-066), and auto-escalates breaches to management. This is the escalation mechanism CAP-17 (FEAT-018) and CAP-12 also reuse rather than each defining their own.
- **Behavioral rules:** Escalation is automatic on breach, not a manual judgment (CON-27's wording is "auto-escalates"). One escalation mechanism serves ticketing, field-visit non-response, and support threads (CON-32's note that CAP-12 shares CAP-09's state-machine shape) — three consumers, one pattern.
- **Acceptance criteria:**
  - AC-1 (happy): Given a ticket resolved within all SLAs, no escalation occurs and the ticket's SLA performance is recorded for the society's own visibility (CAP-14 shows resolution timeliness).
  - AC-2 (empty): Given nothing escalated, the management escalation queue is clean.
  - AC-3 (failure/breach): Given the 48h resolution SLA passes with the ticket open, then it auto-escalates to management with the full ticket history attached.
  - AC-4 (permission): Given PER-01, they can see escalations but management is the intervention owner; the distinction mirrors FEAT-058's ops/management split.
  - AC-5 (edge): Given a ticket breaches its first-response SLA and later also its resolution SLA, both breaches are recorded rather than the second overwriting the first — SLA performance reporting needs the full picture.
- **Permissions:** PER-01 (view), management (intervene).
- **Data touched:** Writes SLA state and breach records on `Ticket`/`TicketTask`; creates escalations.
- **Triggers:** Time-based, continuously evaluated.
- **Emits:** `SLABreached`, `TicketEscalated`.
- **Consumes:** all CAP-09 events.
- **Depends on:** FEAT-070 through FEAT-073.
- **Depended on by:** FEAT-066 (ops queue prioritization), CAP-14 (society-visible resolution timeliness), FEAT-018 and CAP-12 (shared escalation mechanism).
- **Failure modes:** Escalating everything (because SLAs are set too tight for reality) turns management escalation into noise — the durations came from the user directly, but should be validated against actual performance once there's data.
- **Limits & scale:** Trivial computationally; the management workload is the real constraint.
- **Minimum viable version:** The three clocks with breach flagging in the ops queue.
- **Complete version:** Auto-escalation to management plus SLA-performance reporting surfaced to societies (explicitly requested for CAP-14).
- **Open questions / assumptions:** none blocking.
- **Risks:** Exposing resolution-timeliness performance to societies (a confirmed CAP-14 requirement) means SLA breaches become customer-visible — right for accountability, but it raises the stakes on threshold realism.

### FEAT-075 — Per-society spare stock ledger
- **Capability:** CAP-10 · **Persona:** PER-03, PER-01 · **Serves:** CON-08, CON-15
- **Surface(s):** SUR-02 (inspector counts), SUR-01 (ops rollup)
- **Problem:** Spare stock is a **contractually specified per-society number** (CON-15 — e.g. 20 for Ace Aspire, not a global policy), and stock running out before a scheduled visit is a named ticket cause (CAP-09). Neither the contracted level nor the actual count is tracked anywhere today.
- **Description:** A per-society spare-stock ledger with the contracted stock level (from CAP-07) and the actual counted stock, classified into the two states CON-26 requires: **Fresh/Working** (usable) and **Faulty/already-replaced** (used, pending return or disposal). The inspector is the system of record — the count comes from their physical reconciliation on each visit (OQ-06).
- **Behavioral rules:** Two states minimum, never a single number (CON-26) — a society holding 20 "spares" of which 15 are dead units awaiting collection is a stockout waiting to happen, and a single count hides that. The contracted level comes from the contract, not a global default (CON-15). The inspector's count on a visit is authoritative over any inferred running total — physical reality wins over the ledger's arithmetic.
- **Acceptance criteria:**
  - AC-1 (happy): Given an inspection visit, when the inspector records the Fresh/Working and Faulty/replaced counts, then the ledger updates and any shortfall against the contracted level is flagged.
  - AC-2 (empty/first-run): Given a society whose stock has never been counted, the ledger shows the contracted level with actual counts unknown — not assumed to equal the contracted level.
  - AC-3 (failure): Given the counted Fresh/Working stock is below the contracted level, replenishment is flagged (FEAT-076) rather than merely recorded.
  - AC-4 (permission): Given a non-PER-03/PER-01 actor, the ledger is read-only.
  - AC-5 (edge): Given the inspector's physical count disagrees with the ledger's running total, the physical count wins and the discrepancy is recorded — a silent correction would hide either a data problem or a real loss.
- **Permissions:** PER-03 (count), PER-01 (view, adjust with reason).
- **Data touched:** `SpareStockLedger` per society (contracted level, Fresh/Working count, Faulty/replaced count, last counted at/by, discrepancies).
- **Triggers:** Inspection visits (CAP-11); ticket resolutions consuming stock (FEAT-072 AC-5).
- **Emits:** `StockCounted`, `StockShortfallFlagged`.
- **Consumes:** `ContractActivated` (contracted level), inspection and ticket events.
- **Depends on:** FEAT-062 (contracted level), CAP-11.
- **Depended on by:** FEAT-076, CAP-09 (stock exhaustion is a named ticket cause), CAP-11's checklist.
- **Failure modes:** If the ledger is only updated at inspection cadence (~monthly) it will be stale between visits — which is exactly why stock exhaustion arrives as a ticket rather than a prediction. Acceptable, but worth being explicit about.
- **Limits & scale:** Tens of units per society — trivial.
- **Minimum viable version:** Two-state count per society against the contracted level.
- **Complete version:** Adds discrepancy tracking and shortfall prediction between visits.
- **Open questions / assumptions:** CON-14 — whether the society's own electrician or FirsThing's inspector performs a swap varies by deal; the ledger must work either way (OQ-06 confirms the inspector remains system of record even when someone else does the swap).
- **Risks:** none significant.

### FEAT-076 — Spare consumption & replenishment
- **Capability:** CAP-10 · **Persona:** PER-03, PER-01 · **Serves:** JTBD-04
- **Surface(s):** SUR-02 (consume/record), SUR-01 (fulfil replenishment)
- **Problem:** Stock gets consumed during swaps and needs replenishing before it runs out — CON-26 names replenishment as part of the inspection routine, and stock exhaustion as a ticket trigger.
- **Description:** Recording consumption (a spare fitted, a faulty unit collected) and requesting/fulfilling replenishment to bring Fresh/Working stock back to the contracted level. Consumption can be recorded inline during a ticket resolution (FEAT-072) or an inspection (FEAT-078), not only as a standalone action.
- **Behavioral rules:** Consumption is recorded where the work happens, not as a separate bookkeeping step the inspector must remember afterward — a separate step is a step that gets skipped. A faulty unit swapped out moves into the Faulty/replaced state rather than disappearing; it's pending return/disposal, and FirsThing owns it (CON-08).
- **Acceptance criteria:**
  - AC-1 (happy): Given an inspector fits a spare, when they record it inline during the visit, then Fresh/Working decrements, Faulty/replaced increments by the removed unit, and the ledger reflects both.
  - AC-2 (empty): Given no replenishment requests outstanding, ops' fulfilment queue is clean.
  - AC-3 (failure): Given stock falls below the contracted level, a replenishment need is raised automatically rather than depending on someone noticing.
  - AC-4 (permission): Given a non-PER-03 actor, recording field consumption is unavailable; PER-01 fulfils replenishment.
  - AC-5 (edge): Given the society's own electrician performed the swap (CON-14), the inspector still records it as an audit/count rather than as their own action — the performer is an attribute, not an assumption (OQ-06).
- **Permissions:** PER-03 (record consumption), PER-01 (fulfil replenishment).
- **Data touched:** Writes consumption events and replenishment records against `SpareStockLedger`.
- **Triggers:** Inline during ticket resolution or inspection; automatic on shortfall.
- **Emits:** `SpareConsumed`, `ReplenishmentRequested`, `ReplenishmentFulfilled`.
- **Consumes:** `StockShortfallFlagged`, ticket/inspection events.
- **Depends on:** FEAT-075.
- **Depended on by:** CAP-11's checklist, CAP-09 (stock-exhaustion tickets), FEAT-066's ops queue.
- **Failure modes:** A collection recorded on site but never reconciled into the returns pool would leave units untracked in transit — the handoff between on-site count and returns pool needs to be a single action, not two.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Inline consumption recording and manual replenishment.
- **Complete version:** Automatic shortfall-triggered replenishment requests.
- **Open questions / assumptions:** none blocking — CON-36 settled this at the Phase 3 gate: the inspector collects Faulty/replaced units on the next routine visit, clearing them from the society's count, and they continue to be tracked in a **returns pool with per-unit warranty-claim status** (FirsThing owns the hardware, so it owns disposal and supplier recovery).
- **Risks:** none significant.

### FEAT-077 — FirsThing-owned hardware asset register
- **Capability:** CAP-10 · **Persona:** PER-01 · **Serves:** CON-08
- **Surface(s):** SUR-01
- **Problem:** CON-08 is a business-model fact with an asset-tracking consequence: FirsThing installs and **owns** the hardware — lighting fully, and the pump automation layer partially. That's a capital asset base sitting across many societies with no register.
- **Description:** A register of FirsThing-owned hardware deployed per society: installed lighting fixtures (by area/circuit), meters, and the pump automation layer (controllers, VFDs, contactors, pressure switches, level sensors, actuator valves). Records ownership, install date, condition, and eventual disposition (ownership transfer at term end, FEAT-063).
- **Behavioral rules:** Ownership is per-asset (CON-08's lighting-fully/pumps-partially split makes a per-society flag insufficient). This register is the counterpart to FEAT-042's pump asset model — that one records what exists at a site regardless of owner; this one records what FirsThing owns and is therefore responsible for maintaining and eventually transferring.
- **Acceptance criteria:**
  - AC-1 (happy): Given a completed installation, when assets are registered, then FirsThing-owned units are recorded per society with install date and condition.
  - AC-2 (empty/first-run): Given a society before installation, its register is empty and says so.
  - AC-3 (failure): Given an asset without an ownership designation, it can't be registered — ownership is what the register exists to record.
  - AC-4 (permission): Given a non-PER-01 actor, the register is read-only.
  - AC-5 (edge): Given contract term end (FEAT-063), FirsThing-owned assets for that society transfer to society-owned and leave FirsThing's maintenance obligation and asset base — the register reflects the transfer rather than the assets simply disappearing.
- **Permissions:** PER-01 (manage), PER-03 (update condition from the field).
- **Data touched:** `OwnedAsset` records (type, society, circuit/location, ownership, install date, condition, disposition).
- **Triggers:** `InstallationCompleted` (FEAT-037); updated by inspections; transferred at term end.
- **Emits:** `AssetRegistered`, `AssetTransferred`.
- **Consumes:** `InstallationCompleted`, `OwnershipTransferred`.
- **Depends on:** FEAT-037, FEAT-042, FEAT-063.
- **Depended on by:** FEAT-063 (term-end transfer), CAP-11 (maintenance scope), FEAT-069 (asset base as a business metric).
- **Failure modes:** Registering assets only at install and never reconciling them against inspections would drift from reality over a multi-year contract.
- **Limits & scale:** Potentially thousands of lighting fixtures per society — argues for registering lighting at circuit/area granularity rather than per fixture, while pump equipment stays per unit (as FEAT-008 already captures it).
- **Minimum viable version:** Circuit/area-level lighting registration plus per-unit pump assets.
- **Complete version:** Adds condition reconciliation from inspections and term-end transfer handling.
- **Open questions / assumptions:** none blocking.
- **Risks:** Getting the granularity wrong (per-fixture lighting) would create an unmaintainable register — noted in Limits above.

### FEAT-078 — Routine inspection checklist
- **Capability:** CAP-11 · **Persona:** PER-03 · **Serves:** JTBD-04
- **Surface(s):** SUR-02
- **Problem:** Inspections are the recurring touchpoint that keeps installed hardware working — but the current screens are desktop-shaped and Supabase-backed (PROJECT_CONTEXT.md), which is the wrong shape for a phone-based field role.
- **Description:** A structured recurring inspection (~monthly per society) covering CON-26's checklist: visual fault-finding (broken or tampered lights, damaged equipment, motion-sensor functionality — the installed fixtures are motion-sensor LED per CON-15), plus spare-stock reconciliation (the two-state count, FEAT-075) and replenishment where needed.
- **Behavioral rules:** The checklist is structured, not free text — consistency across inspections is what makes fault trends visible over time. Motion-sensor functionality is explicitly checked, since a non-functioning sensor directly degrades savings and would otherwise surface only as an unexplained deviation months later. The inspection is designed for phone use in mechanical rooms and outdoor conditions with variable connectivity.
- **Acceptance criteria:**
  - AC-1 (happy): Given a scheduled inspection visit, when the inspector completes the checklist and stock count, then the inspection record is submitted and ops sees it.
  - AC-2 (empty/first-run): Given a society's first inspection, the checklist presents fresh with no prior findings — and prior findings are shown from the second inspection onward, so recurring faults are obvious.
  - AC-3 (failure/offline): Given connectivity drops mid-inspection, entered data is retained locally and submitted when possible — the same offline concern as CAP-16's field capture.
  - AC-4 (permission): Given a non-PER-03 actor, completing an inspection is unavailable.
  - AC-5 (edge): Given a fault is found that the inspector can't fix on the spot, it spins off a ticket (FEAT-079) rather than living only inside the inspection record where it might not be actioned.
- **Permissions:** PER-03 (complete), PER-01 (view).
- **Data touched:** Creates `Inspection` with checklist results, fault records, photos; updates `SpareStockLedger`.
- **Triggers:** Scheduled visit (CAP-17), recurring cadence.
- **Emits:** `InspectionCompleted`.
- **Consumes:** `VisitAccepted` (CAP-17).
- **Depends on:** CAP-17, FEAT-075.
- **Depended on by:** FEAT-079, FEAT-080; FEAT-041 (a verified light-count change may originate here); CAP-05 (inspection history is deviation-review context).
- **Failure modes:** Offline data loss is the primary field failure mode across every SUR-02 feature and should be solved once, not per feature — a candidate for §5's cross-cutting requirements.
- **Limits & scale:** ~200 inspections/month at the 2-year target — the highest-volume field workflow.
- **Minimum viable version:** Structured checklist + stock count + photos.
- **Complete version:** Adds prior-findings context and offline resilience.
- **Open questions / assumptions:** ASSUM-16 (PER-03 abandonment triggers) unconfirmed.
- **Risks:** This is the Supabase-cutover target (GOAL-04) as well as a redesign — worth treating as a rebuild rather than a port.

### FEAT-079 — Fault logging & ticket spin-off
- **Capability:** CAP-11 · **Persona:** PER-03 · **Serves:** JTBD-04, JTBD-07
- **Surface(s):** SUR-02
- **Problem:** A fault noted in an inspection report that nobody actions is just a record of a problem persisting. CON-26's checklist finds faults; CAP-09's ticketing resolves them — the two need a real connection.
- **Description:** Faults found during an inspection are logged with type, location, and photo, and those needing follow-up spin off tickets (FEAT-070) with the inspection findings pre-attached. Faults fixed on the spot are recorded as resolved within the inspection itself.
- **Behavioral rules:** Fixed-on-the-spot and needs-follow-up are distinct outcomes — conflating them either inflates the ticket queue or loses real work. A spun-off ticket carries the inspection's evidence rather than requiring re-description (FEAT-070 AC-5).
- **Acceptance criteria:**
  - AC-1 (happy): Given a fault the inspector fixes on site, when recorded as resolved, then no ticket is created and the fix is part of the inspection record.
  - AC-2 (empty): Given an inspection with no faults, that's recorded explicitly as a clean inspection — meaningful information, not an absence of data.
  - AC-3 (failure): Given a fault needing follow-up, a ticket is created with the findings and photos attached and appears in ops' queue.
  - AC-4 (permission): Given a non-PER-03 actor, fault logging within an inspection is unavailable.
  - AC-5 (edge): Given the same fault recurs across consecutive inspections, it's flagged as recurring rather than logged as a fresh independent finding each time — a recurring fault is a different problem from a new one.
- **Permissions:** PER-03 (log, resolve, spin off).
- **Data touched:** Creates fault records on `Inspection`; creates `Ticket` records for follow-ups.
- **Triggers:** During an inspection.
- **Emits:** `FaultLogged`, `TicketRaised` (via CAP-09).
- **Consumes:** inspection context.
- **Depends on:** FEAT-078, FEAT-070.
- **Depended on by:** FEAT-080, CAP-09, CAP-05 (recurring faults are deviation context).
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial per inspection.
- **Minimum viable version:** Fault logging with fixed/needs-follow-up outcomes.
- **Complete version:** Adds recurrence detection (AC-5) and pre-attached evidence on spun-off tickets.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-080 — Inspection report & history
- **Capability:** CAP-11 · **Persona:** PER-01, PER-05, PER-06 · **Serves:** JTBD-06, GOAL-05
- **Surface(s):** SUR-01
- **Problem:** Ops needs inspection outcomes to spot patterns (recurring faults, stock trends, societies needing attention), and societies want to see that their site is actually being maintained — currently the reports exist as documents rather than as queryable history.
- **Description:** Per-society inspection history: each inspection's checklist results, faults found and their outcomes, stock counts, and photos, viewable by ops and — in an appropriate form — by the society. Feeds CAP-05's deviation context and CAP-08's portfolio view.
- **Behavioral rules:** The society-facing view emphasizes what was checked and what was fixed; the ops view adds trend and cross-society comparison. Inspection history is a primary input when investigating a deviation (FEAT-055's assembled context), so it must be queryable by circuit and date, not just browsable per society.
- **Acceptance criteria:**
  - AC-1 (happy): Given completed inspections, when PER-01 opens a society's history, then each inspection's results, faults, and stock counts are shown in date order with photos.
  - AC-2 (empty/first-run): Given a society with no inspections yet, an `EmptyState` explains the cadence rather than showing a blank table (INV-06).
  - AC-3 (failure/degraded): Given the history query fails, an explicit error state renders (INV-06).
  - AC-4 (permission): Given a society user, they see their own inspections in a customer-appropriate form; other societies' inspections are inaccessible server-side.
  - AC-5 (edge): Given a deviation review is open for that society (FEAT-055), the relevant inspections are surfaced directly in the review's context rather than requiring a separate lookup.
- **Permissions:** PER-01 (all), PER-05/PER-06 (own society, scoped view).
- **Data touched:** Reads `Inspection`, fault records, `SpareStockLedger` history.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** `InspectionCompleted`, `FaultLogged`.
- **Depends on:** FEAT-078, FEAT-079.
- **Depended on by:** FEAT-055 (deviation context), CAP-08, CAP-14.
- **Failure modes:** none beyond standard list-surface handling (INV-06).
- **Limits & scale:** ~12 inspections/society/year × 200 societies — a few thousand records at the 2-year target, trivial.
- **Minimum viable version:** Per-society chronological history for ops.
- **Complete version:** Adds the society-facing view and cross-society trend queries.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-081 — Log a support thread
- **Capability:** CAP-12 · **Persona:** PER-02 · **Serves:** JTBD-03
- **Surface(s):** SUR-01
- **Problem:** Support conversations happen by phone and WhatsApp and leave no record — so the next person to speak with that society starts from zero, and there's no way to see how often a society is in touch or about what.
- **Description:** Support staff log each new call or message as its own **thread** (a query/complaint record) with the society, channel, who initiated, the substance, and a category (CON-32). Follow-ups append to the same thread rather than creating duplicates (FEAT-082).
- **Behavioral rules:** One thread per distinct issue, not per contact event — a society calling three times about the same billing question is one thread with three entries, which is what makes "how many open issues does this society have" answerable. Threads share their state-machine shape with CAP-09's tickets (CON-32 explicitly notes this) — likely one underlying case/thread entity rather than two parallel ones, a real Phase 7 data-model decision.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society calls with a billing question, when PER-02 logs a thread with category and notes, then it's open against that society and visible to ops.
  - AC-2 (empty/first-run): Given a society with no support history, its record shows that plainly — itself useful information.
  - AC-3 (failure): Given required detail is missing (society, substance), logging is refused with a minimal prompt.
  - AC-4 (permission): Given a non-PER-02/PER-01 actor, support threads are unavailable.
  - AC-5 (edge): Given the query is actually a fault needing field work, it converts to (or spawns) a CAP-09 ticket rather than being tracked twice in parallel — the two systems must not both own the same issue.
- **Permissions:** PER-02, PER-01 (log, view).
- **Data touched:** Creates a support `Thread` (society, channel, initiator, category, notes, state).
- **Triggers:** Manual, on contact.
- **Emits:** `ThreadOpened`.
- **Consumes:** none.
- **Depends on:** CAP-13 (society records).
- **Depended on by:** FEAT-082, FEAT-083, FEAT-084; CAP-08's ops queue; CAP-14 (society-visible threads where appropriate).
- **Failure modes:** If logging is slower than just handling the call, it won't happen — the same friction risk as FEAT-070, and the reason the required field set must stay minimal.
- **Limits & scale:** Daily volume across 200 societies — one of the higher-volume workflows.
- **Minimum viable version:** Thread with society, category, and notes.
- **Complete version:** Adds channel tracking and ticket conversion (AC-5).
- **Open questions / assumptions:** Whether threads and tickets are one entity or two is a genuine Phase 7 decision (CON-32 leans toward one).
- **Risks:** none significant.

### FEAT-082 — Thread follow-ups & resolution
- **Capability:** CAP-12 · **Persona:** PER-02 · **Serves:** JTBD-03
- **Surface(s):** SUR-01
- **Problem:** CON-32 requires a proper open→close lifecycle: follow-ups append to the existing thread, and threads actually get closed rather than fading out.
- **Description:** Subsequent contact on an existing issue appends to that thread with a timestamp and who spoke. The thread progresses through an open→close lifecycle, closing with a recorded resolution.
- **Behavioral rules:** Appending is the default; creating a new thread for an existing issue should require deliberately choosing to. Closing requires a recorded resolution — a thread closed with nothing said is indistinguishable from one abandoned.
- **Acceptance criteria:**
  - AC-1 (happy): Given an open thread, when a follow-up call happens, then it appends with timestamp and author, and the thread's last-activity updates.
  - AC-2 (empty): Given no open threads, the support queue shows a caught-up state.
  - AC-3 (failure): Given an attempt to close without a resolution, closure is refused.
  - AC-4 (permission): Given a non-PER-02/PER-01 actor, appending and closing are unavailable.
  - AC-5 (edge): Given a thread reopens after closure (the society comes back on the same issue), it reopens rather than spawning a new thread — the issue's full history stays in one place.
- **Permissions:** PER-02, PER-01.
- **Data touched:** Appends entries to `Thread`; updates state and resolution.
- **Triggers:** Manual, on each contact.
- **Emits:** `ThreadUpdated`, `ThreadClosed`, `ThreadReopened`.
- **Consumes:** `ThreadOpened`.
- **Depends on:** FEAT-081.
- **Depended on by:** FEAT-083, FEAT-084.
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial per thread.
- **Minimum viable version:** Append + close with resolution.
- **Complete version:** Adds reopen handling (AC-5).
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-083 — Support thread escalation on non-response
- **Capability:** CAP-12 · **Persona:** PER-02, management · **Serves:** JTBD-03
- **Surface(s):** SUR-01
- **Problem:** CON-32 specifies escalation to senior management when **either side** goes non-responsive — notably including FirsThing's own side, which is unusual and deliberate.
- **Description:** Threads with no activity past a threshold escalate to senior management, distinguishing whether the stall is on FirsThing's side (we haven't replied) or the society's (they haven't come back). This reuses CAP-09's escalation mechanism (FEAT-074) rather than defining a second one.
- **Behavioral rules:** Both directions escalate, but they're different problems and are labelled as such — FirsThing's own non-response is a service failure; the society's is a follow-up need. The escalation mechanism is shared with CAP-09 and CAP-17 (one pattern, three consumers).
- **Acceptance criteria:**
  - AC-1 (happy): Given an actively-progressing thread, no escalation occurs.
  - AC-2 (empty): Given nothing escalated, the queue is clean.
  - AC-3 (failure): Given FirsThing hasn't replied past the threshold, the thread escalates labelled as a FirsThing-side stall.
  - AC-4 (permission): Given PER-02, they see escalations on their threads; management owns intervention.
  - AC-5 (edge): Given the society is the non-responsive side, escalation still occurs but is labelled accordingly — management's action differs (a nudge, or closing the thread) from the service-failure case.
- **Permissions:** PER-02 (view), management (intervene).
- **Data touched:** Writes escalation records against `Thread`.
- **Triggers:** Time-based on thread inactivity.
- **Emits:** `ThreadEscalated`.
- **Consumes:** `ThreadUpdated`.
- **Depends on:** FEAT-082, FEAT-074's shared escalation mechanism.
- **Depended on by:** CAP-08's ops queue.
- **Failure modes:** Thresholds too tight would escalate normal back-and-forth pauses — the same tuning concern as every SLA in this blueprint.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Inactivity flagging with side labelling.
- **Complete version:** Full escalation to management via the shared mechanism.
- **Open questions / assumptions:** none blocking — CON-35 seeds thread-inactivity escalation at **48h** of silence, configurable by management (XC-03).
- **Risks:** none significant.

### FEAT-084 — Society context view for support
- **Capability:** CAP-12 · **Persona:** PER-02 · **Serves:** JTBD-03
- **Surface(s):** SUR-01
- **Problem:** JTBD-03 states it directly: support wants to see the society's record — bill, dispute history, communication log — themselves, rather than relaying every question through ops or Yugesh (confirmed, 02-users-research.md).
- **Description:** A single society view for support: current and recent bills and their status, savings figures, open and historical tickets, support thread history, contract summary, and any active deviation or suspension state. Read-mostly — support acts through threads and tickets, not by editing billing data.
- **Behavioral rules:** Scoped permissions (PER-02 is explicitly a scoped-permission role per 02-users-research.md) — support sees what's needed to answer a question, not everything an admin sees. The view must show *why* a bill is what it is (basis: fixed vs. actual-metered vs. negotiated-fixed, plus any deviation explanation) — that's the actual content of most billing calls.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society calls about their bill, when PER-02 opens the society view, then the current bill, its basis, its savings report, and any deviation explanation are visible in one place.
  - AC-2 (empty/first-run): Given a society with no billing history yet, the view says so rather than showing empty panels.
  - AC-3 (failure/degraded): Given one panel's data fails to load, the rest render and the failure is explicit (INV-06).
  - AC-4 (permission): Given PER-02, billing data is read-only and internal-only fields (e.g. deviation root-cause classifications, internal notes) are appropriately scoped rather than fully exposed.
  - AC-5 (edge): Given the society is in a suspension-warning state (FEAT-087), that's prominently visible — support answering a routine question while unaware of an imminent suspension would be a bad call for everyone.
- **Permissions:** PER-02 (scoped read), PER-01 (full).
- **Data touched:** Reads across billing, savings reports, tickets, threads, contract, suspension state.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** events across CAP-04, CAP-09, CAP-12, CAP-13.
- **Depends on:** the contributing capabilities.
- **Depended on by:** nothing — a leaf view, but the one that makes PER-02 a real independent role rather than a relay.
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Bills, tickets, and threads in one view.
- **Complete version:** Adds contract summary, deviation explanations, and suspension state.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-085 — Society record & lifecycle management
- **Capability:** CAP-13 · **Persona:** PER-01 · **Serves:** GOAL-02
- **Surface(s):** SUR-01
- **Problem:** The society is the customer entity every other capability hangs off — and it needs to exist in a lightweight form well before an agreement (a prospect at lead stage, FEAT-001) and persist through to term end.
- **Description:** Create and manage society records across their whole lifecycle: prospect (created from a lead, minimal data), active (post-agreement, with contract and service-line engagements), suspended (FEAT-087), and ended. Holds the profile and governance data captured in the survey (FEAT-005) once promoted.
- **Behavioral rules:** A society must be creatable with minimal data at prospect stage — requiring full details before a lead can be logged would push sales back to spreadsheets. Promotion from prospect to active pulls in survey-captured profile data (FEAT-005) rather than requiring re-entry. Society names are normalized consistently on every create/update path (an existing convention in this codebase, worth preserving).
- **Acceptance criteria:**
  - AC-1 (happy): Given a lead is logged, when a lightweight society record is created, then it exists as a prospect and can carry pipelines, surveys, and offers without a contract.
  - AC-2 (empty/first-run): Given no societies, the list shows an `EmptyState` (INV-06).
  - AC-3 (failure): Given a duplicate society (same name/location) is created, it's flagged for review rather than silently allowed — duplicates fracture a society's history across two records, which is hard to unpick later.
  - AC-4 (permission): Given a non-PER-01 actor, society creation and editing are unavailable.
  - AC-5 (edge): Given a society is enrolled in multiple service lines, its record shows each engagement's independent state (one active-billing, one mid-pipeline) rather than a single society-wide status — CON-24's keying, reflected in the UI.
- **Permissions:** PER-01 (manage).
- **Data touched:** `Society` (profile, governance, lifecycle state), links to engagements.
- **Triggers:** Manual, or from lead logging (FEAT-001).
- **Emits:** `SocietyCreated`, `SocietyPromoted`, `SocietyEnded`.
- **Consumes:** `LeadLogged`, `SocietyProfileCaptured`, `AgreementExecuted`.
- **Depends on:** none (foundational).
- **Depended on by:** essentially every capability.
- **Failure modes:** Duplicate societies created independently by sales and ops is the realistic data-integrity failure — AC-3 is the guard.
- **Limits & scale:** 200 societies at the 2-year target — trivial.
- **Minimum viable version:** Society CRUD with lifecycle state.
- **Complete version:** Adds duplicate detection and multi-engagement status display.
- **Open questions / assumptions:** none blocking — CON-34 settled this: a prospect gets a limited account at survey/demo stage, scoped to the demo report, its query thread, and document upload. Promotion to a full account happens on agreement.
- **Risks:** none significant.

### FEAT-086 — User accounts, roles & permissions
- **Capability:** CAP-13 · **Persona:** PER-01 (management) · **Serves:** GOAL-02
- **Surface(s):** SUR-01
- **Problem:** Seven personas across two surfaces, several capabilities gated behind named permissions rather than plain roles (management-only actions in FEAT-032, FEAT-058, FEAT-064; the accountant gate in FEAT-054; PER-02's scoped support access) — this needs a real model, not a role enum.
- **Description:** Management of user accounts and their access: internal users (ops, support, inspectors, installers, sales, management) and society-side users (committee, manager), with named permissions layered over roles for the specifically-gated capabilities identified across this phase.
- **Behavioral rules:** Named permissions supplement roles rather than replacing them — the existing codebase already established this pattern (an `AdminPermission` array on admin accounts), and this phase has surfaced at least four more capabilities needing it. Structural separation matters where it was explicitly asked for: an ordinary user account must not be able to become an admin account through a data change alone.
- **Acceptance criteria:**
  - AC-1 (happy): Given a new ops hire, when an account is created with the appropriate role and permissions, then they can access exactly those capabilities and no others.
  - AC-2 (empty/first-run): Given a society with no portal users yet, the account list shows that and offers creation.
  - AC-3 (failure): Given an attempt to remove the last holder of a critical permission (e.g. the last admin-manager), it's refused — self-lockout is a real, hard-to-recover failure mode.
  - AC-4 (permission): Given a user without the manage-users permission, account management is unavailable — including to ordinary admins.
  - AC-5 (edge): Given a society user's role changes (a committee member rotates off after an RWA election, FEAT-005's election-date field), access can be revoked and reassigned without deleting the society's history.
- **Permissions:** management / named user-management permission only.
- **Data touched:** User accounts, roles, named permissions, society associations.
- **Triggers:** Manual.
- **Emits:** `UserCreated`, `UserAccessChanged`.
- **Consumes:** none.
- **Depends on:** FEAT-085.
- **Depended on by:** every permission-gated feature in this phase.
- **Failure modes:** Committee turnover (AC-5) is a recurring real-world event — RWA elections happen on a cycle, which is exactly why FEAT-005 captures the next election date.
- **Limits & scale:** Under 1,000 concurrent users (00-intake.md §7) — trivial.
- **Minimum viable version:** Roles plus the named permissions this phase identified.
- **Complete version:** Adds society-side user lifecycle tied to committee turnover.
- **Open questions / assumptions:** none blocking — resolved at the Phase 3 gate: the Accountant is a distinct role (PER-08) with its own login, scoped to billing data and FEAT-054's release queue, not a permission on PER-01.
- **Risks:** none significant — the existing codebase's approach is a sound starting point.

### FEAT-087 — Payment tracking & automatic suspension
- **Capability:** CAP-13 · **Persona:** PER-01 · **Serves:** GOAL-01
- **Surface(s):** SUR-01 (ops), SUR-01 customer (warnings)
- **Problem:** CON-13 defines a precise, automatic escalation from unpaid invoice to full service suspension — and its most unusual property is that **manual intervention is only needed to stop or delay a suspension, never to trigger one**.
- **Description:** An invoice-linked state machine: overdue tracking starts 2 days after an invoice is generated/shared; at roughly 10 days overdue (matching the standard contract payment term), a 5-day suspension-warning countdown begins and society users are notified; if still unpaid, **suspension fires fully automatically** — covering servicing, not just app login — with no approval step. The society can request an extension during the warning window; backend can grant increments of **up to 5 days per request**.
- **Behavioral rules:** The automatic path must not be gated behind any approval (CON-13, explicitly) — every manual touchpoint in this feature is a brake, never an accelerator. **Payments are recorded manually by ops from Zoho, and suspension may only fire against a same-day-confirmed payment status** (CON-13, added at the Phase 3 gate) — a safety rule, not an approval gate: stale payment data stops the timer rather than firing on it. Suspension covers **servicing**, not merely portal access; the operational consequence is real, so the warning must be unmistakable to the society. Extensions are granted in increments of up to 5 days per request, not as an open-ended pause. **Suspension halts physical field servicing only (CON-13, resolved at the audit 2026-08-12):** meter ingest, the monthly savings calculation, invoice generation, and society portal access all keep running while suspended. Arrears continue to accrue, the record stays complete, and the committee can still see exactly what is owed next to the savings evidence — which is precisely the moment that evidence is most useful. What stops is routine inspections, ticket dispatch, and spare replacement. Suspension is therefore a society-level flag read only by the scheduling/dispatch capabilities (CAP-09, CAP-11, CAP-17); billing and portal capabilities ignore it entirely, and restoring on payment is a single state change with no backfill.
- **Acceptance criteria:**
  - AC-1 (happy): Given an invoice paid within terms, no overdue tracking escalates and nothing is triggered.
  - AC-2 (empty): Given no societies in overdue states, the ops view is clean.
  - AC-3 (failure/suspension): Given an invoice remains unpaid through the 5-day warning countdown with no extension granted **and payment status was confirmed today**, then suspension fires automatically without any manual approval — and the firing is recorded with its full timeline. If payment status is stale, the firing is held and ops is prompted to confirm rather than the suspension proceeding on old data.
  - AC-4 (permission): Given PER-01, they can grant extensions (up to 5 days per request) and halt a suspension; nobody needs a permission to let the automatic path proceed.
  - AC-5 (edge): Given payment arrives during the warning countdown, the countdown cancels immediately and the society is notified — a suspension firing after payment lands would be a serious customer-facing failure.
- **Permissions:** PER-01 (grant extensions, halt); the automatic path requires none.
- **Data touched:** `PaymentStatus` state machine per invoice (generated → overdue → warning → suspended), extension grants, suspension records.
- **Triggers:** Time-based from invoice generation/share.
- **Emits:** `InvoiceOverdue`, `SuspensionWarningStarted`, `ExtensionGranted`, `ServiceSuspended`, `SuspensionCancelled`.
- **Consumes:** `InvoiceAttached`/`MonthReleased` (FEAT-053/054), payment records.
- **Depends on:** FEAT-053, FEAT-054, FEAT-085.
- **Depended on by:** CAP-14 (the society sees warnings), FEAT-084 (support must see suspension state), CAP-08's ops queue.
- **Failure modes:** AC-5's race — payment landing as the countdown expires — is the highest-consequence failure here. Payment recording is manual (Zoho-side, CON-33), which is exactly why the same-day-confirmation rule exists: it converts a silent wrong suspension into a visible prompt for ops.
- **Limits & scale:** Trivial computationally; high consequence per event.
- **Minimum viable version:** The full state machine with notifications, manual mark-as-paid with a freshness timestamp, the same-day-confirmation rule, and manual extension grants.
- **Complete version:** Adds automated payment reconciliation from Zoho, which would remove the need for the same-day-confirmation brake entirely.
- **Open questions / assumptions:** none blocking — resolved at the Phase 3 gate: manual mark-as-paid, with the same-day confirmation rule as the safety mechanism.
- **Risks:** An erroneous automatic suspension is among the worst customer-facing failures this product can produce; the payment-recording gap above is the most likely cause of one.

### FEAT-088 — Society portal home & savings view
- **Capability:** CAP-14 · **Persona:** PER-05, PER-06 · **Serves:** JTBD-06
- **Surface(s):** SUR-01 (customer)
- **Problem:** Confirmed as a principle this phase: give societies **maximal visibility** — cumulative savings, bill and payment status, active tickets, and contract summary together, not a stripped-down view. GOAL-02 asks for one login showing savings across all a society's active service lines.
- **Description:** The society portal's home: cumulative and monthly savings across every active service line, the current bill and its payment status, released savings reports and invoices (FEAT-060), active tickets and their resolution progress (FEAT-089), a contract summary (FEAT-065), and any suspension warning (FEAT-087).
- **Behavioral rules:** Multi-service-line from the outset (GOAL-02) — a society with lighting and pumps sees both, aggregated and separately, never a lighting-only view. Every savings figure shown carries its basis and provenance (INV-02): measured, actual-metered, or agreement-derived (FEAT-052 AC-5). Only released months appear (FEAT-054).
- **Acceptance criteria:**
  - AC-1 (happy): Given an active society with released months, when the committee opens the portal, then cumulative savings, the current bill and its status, reports, tickets, and contract summary are all present.
  - AC-2 (empty/first-run): Given a newly-onboarded society before its first release, the portal explains what will appear and when, rather than showing empty panels.
  - AC-3 (failure/degraded): Given one panel fails, the rest render and the failure is explicit (INV-06).
  - AC-4 (permission): Given a society user, only their own society's data is accessible, enforced server-side; committee and manager may differ in what they can act on (raising tickets is available to both — confirmed this phase).
  - AC-5 (edge): Given the society has one service line active and another mid-pipeline, the portal shows the active one's billing plus the in-progress one's status, rather than hiding the pipeline or mixing the two.
- **Permissions:** PER-05, PER-06 (own society).
- **Data touched:** Reads released calculations/reports, invoices, payment state, tickets, contract, pipelines.
- **Triggers:** Page load.
- **Emits:** none.
- **Consumes:** events across CAP-04, CAP-06, CAP-07, CAP-09, CAP-13.
- **Depends on:** FEAT-054, FEAT-060, FEAT-065, FEAT-087, FEAT-089.
- **Depended on by:** nothing — but this is where GOAL-02 and GOAL-06 actually become visible to the customer.
- **Failure modes:** Maximal visibility without careful hierarchy becomes an unreadable wall for a non-technical volunteer committee (PER-05) — the risk here is comprehension, not data availability.
- **Limits & scale:** Trivial per society.
- **Minimum viable version:** Savings, current bill, and released reports.
- **Complete version:** Full multi-service-line view with tickets, contract, and pipeline status.
- **Open questions / assumptions:** none blocking.
- **Risks:** See failure modes — this screen carries GOAL-06's entire "traceable and trustworthy" promise to the audience that matters most.

### FEAT-089 — Society ticket raising & resolution tracking
- **Capability:** CAP-14 · **Persona:** PER-05, PER-06 · **Serves:** JTBD-07
- **Surface(s):** SUR-01 (customer)
- **Problem:** Confirmed explicitly this phase: societies should be able to create tickets, track progress, and see resolution timeliness and issue-resolution performance — not just receive service passively.
- **Description:** The society-facing side of CAP-09: raise a ticket (FEAT-070), track its state through to resolution, see what was found and done, and see resolution-timeliness performance over time (how quickly their issues have historically been resolved).
- **Behavioral rules:** Both committee and manager can raise and track tickets (confirmed this phase — broader than ASSUM-11's general role split). Resolution timeliness is shown from real SLA data (FEAT-074), not a curated summary — which means FirsThing's own SLA misses become customer-visible, and that's the intent.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society raises a ticket, when it progresses, then they see its current state, who's handling it, and the resolution once complete.
  - AC-2 (empty/first-run): Given no tickets ever raised, the view explains how to raise one rather than showing an empty table.
  - AC-3 (failure/degraded): Given ticket data fails to load, an explicit error renders (INV-06).
  - AC-4 (permission): Given a society user, they see only their own society's tickets, enforced server-side.
  - AC-5 (edge): Given a ticket breached its SLA, that's visible in the society's resolution-timeliness view rather than hidden — accountability is the stated point, and hiding misses would make the metric worthless.
- **Permissions:** PER-05, PER-06 (raise, view own society's).
- **Data touched:** Reads/creates `Ticket` scoped to the society; reads SLA performance.
- **Triggers:** Page load; manual raise.
- **Emits:** `TicketRaised` (via CAP-09).
- **Consumes:** all CAP-09 events.
- **Depends on:** FEAT-070, FEAT-074.
- **Depended on by:** FEAT-088 (a panel of the portal home).
- **Failure modes:** none beyond standard.
- **Limits & scale:** Trivial per society.
- **Minimum viable version:** Raise and track state.
- **Complete version:** Adds resolution-timeliness performance history (AC-5).
- **Open questions / assumptions:** none blocking.
- **Risks:** Publishing SLA performance to customers raises the cost of a systemic SLA problem — correct for accountability, and a real operational commitment.

### FEAT-090 — Notification event catalogue & templates
- **Capability:** CAP-22 · **Persona:** PER-01 · **Serves:** CON-39
- **Surface(s):** SUR-01
- **Problem:** 21 briefs in this document say someone "is notified" and none of them says by what. Left unowned, each feature grows its own ad hoc email call, and nobody can answer "what does the system actually send a society?" — which matters most for CON-13's pre-suspension warning, the one message with contractual weight.
- **Description:** A registry of typed notification events (visit assigned, offer shared, document received, deviation raised, SLA breached, suspension warning, month released, ticket updated), each with a named template, a default recipient rule (FEAT-092), and an enabled/disabled state. Templates are editable by PER-01 without a deploy, and each carries the variables it can interpolate.
- **Behavioral rules:** Adding a new notification means registering an event, never calling an email library from a feature — this is the constraint that keeps CON-39's "add a channel later, don't rewrite" promise true. A disabled event is recorded as suppressed rather than silently skipped, so the delivery log stays a complete account of what the system decided to do. Contractually-weighted events (the suspension warning) are marked as such and cannot be disabled from this screen.
- **Acceptance criteria:**
  - AC-1 (happy): Given PER-01 edits the suspension-warning template, when saved, then subsequent sends use the new copy and the previous version is retained against the events already sent with it.
  - AC-2 (empty/first-run): Given a fresh environment, the catalogue is seeded with every event the 89 briefs reference, each disabled-by-default except the contractual ones, rather than starting empty.
  - AC-3 (failure): Given a template references a variable the event does not provide, saving is refused with the offending variable named — a broken interpolation reaching a society is worse than a rejected save.
  - AC-4 (permission): Given a non-PER-01 actor, templates are read-only; and no role can disable an event marked contractually required.
  - AC-5 (edge): Given a template is edited between a month's generation and its release, the copy in force at *send* time is what goes out and what the log records — not the copy at generation time.
- **Permissions:** PER-01 (edit), all internal roles (view).
- **Data touched:** `NotificationEvent`, `NotificationTemplate` (versioned).
- **Triggers:** PER-01 editing; seeded at install.
- **Emits:** `TemplateUpdated`.
- **Consumes:** —
- **Depends on:** —
- **Depended on by:** FEAT-091, FEAT-093, and every feature whose briefs say "is notified".
- **Failure modes:** A template edited to remove a legally/contractually material line (the suspension date) would ship silently — versioning plus the contractual-event marking is the mitigation, not prevention.
- **Limits & scale:** Small fixed catalogue; trivial.
- **Minimum viable version:** Fixed catalogue with editable copy, no versioning.
- **Complete version:** Adds template versioning and the contractual-event lock.
- **Open questions / assumptions:** none blocking — CON-39 settled email-only at launch.
- **Risks:** A catalogue that drifts out of sync with what features actually send is worse than no catalogue; FEAT-091 sending only through registered events is what prevents that.

### FEAT-091 — Email delivery & delivery log
- **Capability:** CAP-22 · **Persona:** system · **Serves:** CON-39, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** CON-13's suspension fires unattended and halts real field servicing. Without a record of whether the warning email actually reached the society, a disputed suspension is unarguable in both directions — and email delivery genuinely fails (bounces, spam filters, stale addresses).
- **Description:** The single send path for every registered event: renders the template, resolves recipients (FEAT-092), sends by email, and writes an immutable log row per recipient with the event, template version, address, timestamp, and provider result (queued/sent/bounced/failed). Retries transient failures with backoff; surfaces hard bounces to PER-01.
- **Behavioral rules:** Every send goes through here — no feature sends directly. The log is append-only (XC-04): a delivery record is evidence, so it is never edited or deleted, and a resend is a new row referencing the original rather than an update. A hard bounce on a contractually-weighted event is escalated to PER-01 rather than logged and forgotten, because an undelivered suspension warning should stop the suspension clock, not run alongside it.
- **Acceptance criteria:**
  - AC-1 (happy): Given a registered event fires with a resolvable recipient, when sent, then the email is delivered and a log row records event, template version, address, timestamp, and provider result.
  - AC-2 (empty/first-run): Given a society with no notification history, its notification panel shows an empty state rather than an error.
  - AC-3 (failure): Given the email provider is unavailable, the send is queued and retried with backoff, the log shows `failed`/`retrying` rather than a false success, and a contractually-weighted event that ultimately cannot be delivered raises an operational alert to PER-01.
  - AC-4 (permission): Given any role, log rows cannot be edited or deleted; a resend creates a new row linked to the original.
  - AC-5 (edge): Given a hard bounce on a suspension warning, then the suspension countdown does not advance on that notification alone — PER-01 is alerted to reach the society another way (CON-13's brake, applied here).
- **Permissions:** system (send), PER-01/PER-02 (view log).
- **Data touched:** Writes `NotificationDelivery` (append-only); reads templates and recipients.
- **Triggers:** Any registered event firing anywhere in the system.
- **Emits:** `NotificationSent`, `NotificationFailed`, `NotificationBounced`.
- **Consumes:** every `*Notified`-style event across the 89 briefs.
- **Depends on:** FEAT-090, FEAT-092.
- **Depended on by:** FEAT-093, FEAT-087 (suspension warning), and every notifying feature.
- **Failure modes:** Treating a provider-accepted send as proof of receipt — it isn't. The log must distinguish "accepted by provider" from "delivered", or AC-5's brake is built on a false signal.
- **Limits & scale:** At 200 societies with per-circuit deviation reviews, volume is modest but not trivial; the log grows unbounded and needs a retention position by Phase 7.
- **Minimum viable version:** Send + append-only log with provider result.
- **Complete version:** Adds retry/backoff, bounce escalation, and AC-5's suspension brake.
- **Open questions / assumptions:** email provider is a Phase 7 architecture choice, deliberately not made here.
- **Risks:** This becomes a single point of failure for every outbound message — its degraded state (queue backed up, provider down) is one of the few places INV-06's "degraded" state genuinely applies.

### FEAT-092 — Recipient resolution & society contact directory
- **Capability:** CAP-22 · **Persona:** PER-01 · **Serves:** CON-39
- **Surface(s):** SUR-01
- **Problem:** "The society is notified" is ambiguous — a society has a committee (PER-05), a manager (PER-06), and per CON-28a a contact list with posts and an RWA election date that changes who those people are. Sending to a stale address is the most likely way a suspension warning silently fails.
- **Description:** A per-society contact directory (name, post, email, role mapping) feeding a recipient rule per notification event: which internal roles and which society contacts receive it. Sourced from CON-28a's survey capture and maintained thereafter by PER-01 or the society itself through the portal.
- **Behavioral rules:** Recipient rules are per event, not global — a deviation review notifies ops only; a suspension warning notifies every active committee contact plus the manager. Contacts have an active/inactive state rather than being deleted, so historical delivery rows still resolve to a real person. CON-28a records the next RWA election date; contacts should be prompted for re-verification around it, since that is exactly when a committee turns over.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society with an active committee contact list, when a suspension warning fires, then every active committee contact and the manager receive it, each as its own delivery row.
  - AC-2 (empty): Given a society with no contacts recorded, a contractually-weighted event is not silently dropped — it raises an operational alert to PER-01 that the society is unreachable.
  - AC-3 (failure): Given every contact for a society hard-bounces, the society is flagged unreachable and PER-01 is alerted before any unattended action (suspension) proceeds.
  - AC-4 (permission): Given a society portal user, they may maintain their own society's contacts but never another's (INV-05); PER-01 may maintain any.
  - AC-5 (edge): Given a committee turned over at an RWA election, prior delivery rows still resolve to the now-inactive contact they were actually sent to, rather than re-pointing at the new committee.
- **Permissions:** PER-01 (all societies), PER-05/PER-06 (own society only).
- **Data touched:** `SocietyContact`, per-event recipient rules.
- **Triggers:** Survey capture (CON-28a), PER-01 or society edits.
- **Emits:** `ContactsUpdated`, `SocietyUnreachable`.
- **Consumes:** CON-28a's survey profile.
- **Depends on:** FEAT-090, CAP-13.
- **Depended on by:** FEAT-091, FEAT-087.
- **Failure modes:** A society whose only contact left the committee — AC-2/AC-3 exist specifically because this failure is silent by nature.
- **Limits & scale:** Handful of contacts per society; trivial.
- **Minimum viable version:** Contact list plus per-event role rules.
- **Complete version:** Adds unreachable-society detection and election-date re-verification prompts.
- **Open questions / assumptions:** none blocking.
- **Risks:** Contact data decays faster than almost anything else in this system, and nothing in the product forces it to be refreshed except the election-date prompt.

### FEAT-093 — Notification history & manual resend
- **Capability:** CAP-22 · **Persona:** PER-01, PER-02 · **Serves:** CON-39, JTBD-03
- **Surface(s):** SUR-01
- **Problem:** JTBD-03 is PER-02 wanting a society's full record without relaying through ops — and "what have we actually told them?" is a question support has to answer constantly during a dispute. Today that history lives in individual inboxes.
- **Description:** A per-society notification history: every delivery row with its event, timestamp, recipients, and outcome, filterable by event type and date, with the rendered content of what was sent. PER-01 can resend a specific notification (creating a new linked delivery row, never mutating the original).
- **Behavioral rules:** History is read-only evidence (XC-04); resend appends. Support (PER-02) can view but not resend, matching their scoped-permission profile. The rendered content shown is the version actually sent, not the current template — otherwise the history quietly rewrites itself every time copy is edited.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society with delivery history, when PER-02 opens their record during a call, then every notification sent is listed with what it said and whether it was delivered.
  - AC-2 (empty): Given a newly-onboarded society, the panel shows an empty state explaining no notifications have been sent yet.
  - AC-3 (failure): Given a resend fails, the new row records the failure and the original remains untouched and clearly distinguishable from it.
  - AC-4 (permission): Given PER-02, resend is unavailable and history is read-only; given a society portal user, they see only their own society's history (INV-05) — and only events intended for them, not internal ops notifications about them.
  - AC-5 (edge): Given a template was edited after a notification was sent, the history shows the copy as sent at the time, not the current template.
- **Permissions:** PER-01 (view + resend), PER-02 (view only), society users (own, filtered to society-facing events).
- **Data touched:** Reads `NotificationDelivery`; writes new rows on resend.
- **Triggers:** PER-01/PER-02 opening a society record.
- **Emits:** `NotificationResent`.
- **Consumes:** FEAT-091's log.
- **Depends on:** FEAT-091.
- **Depended on by:** CAP-12 (support threads), FEAT-088 (society portal panel).
- **Failure modes:** Exposing internal ops notifications to a society portal user — AC-4's second clause is the guard, and it is easy to miss when the history is a single table.
- **Limits & scale:** Grows with society age; needs pagination, not architecture.
- **Minimum viable version:** Read-only per-society history with as-sent content.
- **Complete version:** Adds resend and the society-facing filtered view.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant.

### FEAT-094 — No-demo commissioning variant
- **Capability:** CAP-02 · **Persona:** PER-04, PER-01 · **Serves:** JTBD-05
- **Surface(s):** SUR-02
- **Problem:** CON-25's demo-skip path still commissions circuits — meter install and load validation happen exactly as normal — but it skips the pre/post 5-day windows that FEAT-012/013/014 are built around. Until this brief, that behaviour lived only inside FEAT-052, a *billing* feature, which is the wrong home for a field-commissioning flow and made CAP-02's advertised "no-demo variant" untraceable.
- **Description:** For a deal with `demoSkipped` set (FEAT-032), PER-04 runs meter installation and load validation per circuit (FEAT-011) and the gate-pass sign-off (XC-01) exactly as on the standard path, then stops — no baseline window, no light replacement as a demo, no post-install window, no measured benchmark. The circuit is marked `benchmarkSource: negotiated-fixed` and enters a `metered-awaiting-installation` state. Pre-install readings accumulate from meter install until full installation completes; they are retained as evidence (CON-25d) and never become a benchmark. On installation completion (FEAT-037), the first full post-install month sets the reference (FEAT-052).
- **Behavioral rules:** The meter is installed on survey day or later, never before (CON-24) — the survey is what identifies the circuit. Everything CON-25 does *not* skip must genuinely run: load validation is still a hard gate, the gate pass is still required before PER-04 leaves. The variant is selected by the deal's `demoSkipped` flag, never chosen by the field operator on site, so the commissioning path is a consequence of a recorded, approved exception rather than an in-the-field decision.
- **Acceptance criteria:**
  - AC-1 (happy): Given a deal with an approved `demoSkipped` flag, when PER-04 completes meter install, load validation, and gate pass on each typed circuit, then each circuit reaches `metered-awaiting-installation` with no monitoring window scheduled and no benchmark computed.
  - AC-2 (empty/first-run): Given no demo-skipped deals exist, the variant is never offered — it is not a mode PER-04 can select, only one a deal can be in.
  - AC-3 (failure): Given load validation fails on a circuit (outside CON-17's ±10%), the variant blocks exactly as the standard path does — skipping the demo never means skipping validation.
  - AC-4 (permission): Given PER-04 on site, they cannot set or clear `demoSkipped`; it is a management exception recorded upstream (FEAT-032).
  - AC-5 (edge): Given the survey→installation gap yields 5+ valid days of pre-install readings, they are retained and labelled as evidence (CON-25d) — but the circuit still does **not** get a measured benchmark, because the commercial terms were agreed on the negotiated percentage and re-deriving them post-hoc would reopen a signed agreement.
- **Permissions:** PER-04 (execute), PER-01 (monitor), management (set the upstream exception).
- **Data touched:** Writes `Circuit.benchmarkSource: negotiated-fixed`, circuit lifecycle state; retains pre-install readings as evidence.
- **Triggers:** A deal with `demoSkipped` reaching the meter-install stage.
- **Emits:** `CircuitMeteredNoDemo`, `PreInstallEvidenceRetained`.
- **Consumes:** `DemoSkipApproved` (FEAT-032), survey output (FEAT-007).
- **Depends on:** FEAT-011, FEAT-032, XC-01.
- **Depended on by:** FEAT-052 (first-month reference), FEAT-059 (evidence panel), FEAT-037.
- **Failure modes:** Treating "demo skipped" as "commissioning skipped" — the exact error CON-25's correction at the Phase 3 gate exists to prevent, and the reason this brief exists separately from FEAT-052.
- **Limits & scale:** Expected to be a small minority of deals (CON-25 calls it exceptional).
- **Minimum viable version:** Meter install + load validation + gate pass, ending in `metered-awaiting-installation`.
- **Complete version:** Adds pre-install evidence retention and its labelling downstream.
- **Open questions / assumptions:** none blocking — CON-25 corrected at the Phase 3 gate, CON-25d added at the audit.
- **Risks:** If demo-skip stops being exceptional, a growing share of the portfolio bills on agreed rather than measured percentages, which erodes GOAL-06 and the measured-savings positioning — worth watching as a business metric (also flagged on FEAT-052).

### FEAT-095 — Deal outcome & re-engagement
- **Capability:** CAP-20 · **Persona:** PER-07 · **Serves:** JTBD-08
- **Surface(s):** SUR-01
- **Problem:** Discovered in Phase 4 (FLOW-01 step 7, FLOW-06). **Nothing in the product ever terminates a pipeline.** A society that says no simply stays at whatever stage it reached, forever — which inflates the pipeline board, makes "how many live deals do we have" unanswerable, and actively corrupts CON-23's lead-health signal, since a dead deal accumulates stalled-step time exactly like a stuck live one.
- **Description:** A terminal `closed-lost` state settable from any pipeline stage, carrying a reason (price, no interest, chose a competitor, society governance changed, unreachable, disqualified on size) and free-text notes. Closed-lost deals leave the active board, stop accruing follow-up counters, and appear in a separate closed view. A closed-lost deal can be re-opened, which creates a **new** pipeline for the same `(society, serviceLine)` linked to the previous one rather than resurrecting the old record.
- **Behavioral rules:** Re-engagement creates a new record rather than reviving the old one, so the original deal's history — what was offered, what was measured, why it was lost — stays intact as evidence for the next attempt. `closed-won` is set automatically by FLOW-07's completion certificate and is never a manual choice; `closed-lost` is always manual, because no timer can know a society has decided against you. A society at `closed-lost` on one service line stays fully active on any other (CON-24).
- **Acceptance criteria:**
  - AC-1 (happy): Given a society declines, when PER-07 closes the deal with a reason, then it leaves the active pipeline board, stops accruing follow-up counters, and the reason is recorded against it.
  - AC-2 (empty): Given no closed deals yet, the closed view shows an empty state rather than an error — and the active board never hides deals merely because they are old.
  - AC-3 (failure): Given a deal is closed by mistake, re-opening is available and creates a new linked pipeline; the mistaken closure remains visible in history rather than being erased.
  - AC-4 (permission): Given a non-PER-07/PER-01 actor, closing a deal is unavailable — it is a commercial judgement, not an operational cleanup action.
  - AC-5 (edge): Given a society is closed-lost on lighting while active and billing on pumps, the closure affects only the lighting pipeline; the society itself remains `active` (CON-24).
- **Permissions:** PER-07, PER-01 (close, re-open).
- **Data touched:** Writes `Pipeline.stage = closed-lost`, reason, closedAt, closedBy; links a re-opened pipeline to its predecessor.
- **Triggers:** PER-07's manual action.
- **Emits:** `DealClosedLost`, `DealReopened`.
- **Consumes:** —
- **Depends on:** FEAT-001 (the pipeline record), FEAT-004 (follow-up counters it must stop).
- **Depended on by:** FEAT-004 and CAP-08's pipeline views — both currently over-count live deals without this.
- **Failure modes:** Ops using `closed-lost` as a way to hide a stalled-but-live deal from the board would corrupt the funnel numbers in the opposite direction. The reason field is what makes that visible.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Terminal state with a reason and removal from the active board.
- **Complete version:** Adds re-engagement with predecessor linkage and closed-reason reporting.
- **Open questions / assumptions:** none blocking.
- **Risks:** Without this, every pipeline metric this product produces is wrong from the first lost deal onward — it is a small feature holding up a large amount of reporting.

### FEAT-096 — Site-access coordination
- **Capability:** CAP-17 · **Persona:** PER-01, PER-03/04 · **Serves:** JTBD-04
- **Surface(s):** SUR-01 (arrange), SUR-02 (field)
- **Problem:** Discovered in Phase 4 (FLOW-02 step 2). `02-users-research.md` §1 explicitly names facility/security staff as a **blocker** on physical site access, and then gives them no product support at all. Every SUR-02 flow — survey, commissioning, installation, inspection, ticket visit — begins with "get into the building", and a refused entry wastes an entire scheduled visit.
- **Description:** Access details captured on the society record (gate contact name and number, access hours, whether prior intimation is required and how much notice, parking/entry instructions, any pass or ID requirement), surfaced on the field visit itself, plus an "access blocked" outcome on a visit that records the reason and returns the visit to scheduling rather than marking it failed.
- **Behavioral rules:** Access details belong to the **society**, not the visit — captured once at survey (CON-28a's contact list is the natural home) and reused by every later visit. "Access blocked" is a distinct outcome from "visit completed with nothing found": one wasted a trip, the other did the work. Repeated access blocks at the same society are an escalation signal, not just a rescheduling nuisance.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society with access details recorded, when a visit is scheduled, then the assignee sees gate contact, access hours, and notice requirements on their visit card before travelling.
  - AC-2 (empty): Given a society with no access details yet, the visit card says so plainly rather than showing blank fields — the assignee needs to know to call ahead.
  - AC-3 (failure): Given entry is refused on arrival, when the assignee records "access blocked" with a reason, then the visit returns to `proposed` for rescheduling and the wasted trip is counted against the society.
  - AC-4 (permission): Given a society portal user, they may maintain their own society's access details (they are the ones who know them) but never another society's (INV-05).
  - AC-5 (edge): Given three access blocks at one society within a period, the pattern is escalated to PER-01 rather than silently absorbed as repeated rescheduling.
- **Permissions:** PER-01 (all), PER-05/06 (own society), PER-03/04 (read on their visits).
- **Data touched:** Society access profile; `FieldVisit` outcome `access-blocked`.
- **Triggers:** Survey capture; visit scheduling; on-site refusal.
- **Emits:** `AccessBlocked`.
- **Consumes:** CON-28a's survey profile.
- **Depends on:** FEAT-005 (survey profile), FEAT-016/017 (visit lifecycle).
- **Depended on by:** every SUR-02 flow.
- **Failure modes:** Access details recorded once at survey and never refreshed will go stale exactly like contacts do (FEAT-092's known weakness) — an RWA election changes who authorises entry.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Access fields on the society, shown on the visit card.
- **Complete version:** Adds the `access-blocked` outcome and repeat-pattern escalation.
- **Open questions / assumptions:** none blocking.
- **Risks:** Low cost, and it addresses a blocker the research named explicitly — one of the clearer gaps between what the research found and what was specified.

### FEAT-097 — Provisional gate-pass release
- **Capability:** CAP-02 · **Persona:** PER-04, PER-01 · **Serves:** CON-40
- **Surface(s):** SUR-02
- **Problem:** Discovered in Phase 4 (FLOW-03 step 3, cross-surface contracts XS-04/XS-05). CON-18 makes backend approval a precondition for a technician **leaving the premises**, and meter installs happen in basements and pump rooms. With no fallback, a connectivity or backend failure does not degrade gracefully — it physically strands a person on site. This is the only place in the product where a software failure traps a human.
- **Description:** Per CON-40: if backend approval has not returned within **30 minutes** of gate-pass submission, the technician may leave under a **provisional** gate pass. The submission queues for review, is flagged `provisional` and reviewed the same day. The society's physical signature and photographs — already captured — remain the binding evidence. Applies at all three of XC-01's gate-pass points (meter installation, demo-installation completion, full-installation completion).
- **Behavioral rules:** The timeout releases the *technician*, never the *record* — the gate pass still requires approval, just not synchronously. A provisional release is always recorded as such with its timeout timestamp, so nobody can later claim it was approved in the normal way. Backend reviewing a provisional pass and finding a discrepancy raises a follow-up rather than an undo, since the equipment and the technician have both already left.
- **Acceptance criteria:**
  - AC-1 (happy): Given a gate pass submitted with connectivity, when backend approves within 30 minutes, then the technician is released normally and the pass is `approved` — the provisional path is never touched.
  - AC-2 (empty/first-run): Given a site with no connectivity at all, the pass is captured entirely offline and the 30-minute timer starts from capture, not from a successful upload — otherwise the timer never starts and the fallback never fires.
  - AC-3 (failure): Given no approval within 30 minutes, then the technician is released under a `provisional` pass, the submission is queued, and PER-01 sees it in a same-day review queue flagged distinctly from normal submissions.
  - AC-4 (permission): Given PER-04, they cannot approve their own gate pass — provisional release is a timeout, not a self-approval, and the distinction must hold in the data.
  - AC-5 (edge): Given backend reviews a provisional pass and finds a discrepancy, a follow-up is raised against the society and the installation record; the pass is not silently rejected, because the physical situation can no longer be changed.
- **Permissions:** PER-04 (submit; released by timeout), PER-01 (approve, review provisional).
- **Data touched:** `GatePass.state` gains `provisional`; records timeout timestamp and releasing mechanism.
- **Triggers:** 30 minutes elapsed since submission with no decision.
- **Emits:** `GatePassProvisionallyReleased`.
- **Consumes:** XC-01's gate-pass submissions.
- **Depends on:** XC-01, FEAT-011, FEAT-013, FEAT-037.
- **Depended on by:** FLOW-03, FLOW-07, FLOW-08 — every on-site equipment handover.
- **Failure modes:** A 30-minute timer running on the device clock could be gamed or simply wrong; the release should be adjudicated server-side wherever connectivity exists, and only fall back to device time when genuinely offline — the same problem FLOW-X1's 24h lockout has.
- **Limits & scale:** Rare by design.
- **Minimum viable version:** Timeout release with a `provisional` flag and a review queue.
- **Complete version:** Adds server-side adjudication and discrepancy follow-up (AC-5).
- **Open questions / assumptions:** 30 minutes is a starting figure, not a researched one — worth making configurable alongside CON-35's other SLA thresholds.
- **Risks:** Softening a control designed to prevent unrecorded equipment movement. The mitigation is that the *evidence* (signature, photos) is unchanged; only the timing of backend's challenge moves.

### FEAT-098 — Prospect-to-customer account conversion
- **Capability:** CAP-13 · **Persona:** system, PER-01 · **Serves:** CON-34, GOAL-02
- **Surface(s):** SUR-01
- **Problem:** Discovered in Phase 4 (FLOW-06 step 7). CON-34 issues societies a **scoped prospect login** at survey/demo stage — demo report, queries, KYC upload, nothing else. Nothing widens it when the deal is won. As specified, a newly-signed society either keeps a crippled login that cannot see its own bills, or is issued a second unrelated account.
- **Description:** On contract activation, the society's existing prospect account is promoted to a full customer account: scope widens to the complete portal (savings, invoices, contract, tickets), the pre-contract history it accumulated (demo report, queries, uploaded documents) carries forward, and the same credentials keep working.
- **Behavioral rules:** Promotion is automatic on contract activation, not a manual admin step — a signed society that cannot log in properly is a bad first impression at the worst moment. Credentials never change; a society that has been using the portal for weeks during the deal should notice only that more is now visible. A society being cross-sold a second service line already has a full account and must not be re-promoted or re-issued anything.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society with a prospect account, when its contract activates, then the same login gains full portal scope and all pre-contract history remains attached.
  - AC-2 (empty/first-run): Given a society that never had a prospect account (documents came via WhatsApp, CON-34 is optional), a full customer account is created at activation instead — the backend-entry path must not produce a society with no login at all.
  - AC-3 (failure): Given promotion fails, the society retains prospect scope and PER-01 is alerted — it must never leave an account in a partially-promoted state where scope and contract disagree.
  - AC-4 (permission): Given any actor, prospect scope cannot be widened manually without an active contract; the contract is the authority, not an admin toggle.
  - AC-5 (edge): Given a society already active on lighting signs for pumps, no new account is created and no promotion runs — the existing account simply gains the new service line's data (GOAL-02's one-login promise).
- **Permissions:** system (automatic), PER-01 (view, remediate).
- **Data touched:** Account scope on the society's users; links pre-contract artefacts forward.
- **Triggers:** `ContractActivated` (FEAT-062).
- **Emits:** `AccountPromoted`.
- **Consumes:** contract activation.
- **Depends on:** FEAT-062, FEAT-085, FEAT-086, CON-34.
- **Depended on by:** FEAT-088 (portal home), FEAT-060, FEAT-065.
- **Failure modes:** Two accounts for one society is the failure this prevents, and it is the kind that is discovered months later by a confused committee.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Automatic scope widening on activation, history carried forward.
- **Complete version:** Adds AC-2's no-prospect-account path and AC-5's cross-sell no-op.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant — cheap now, awkward to retrofit once real societies hold both account types.

### FEAT-099 — Bulk multi-circuit reading upload
- **Capability:** CAP-03 · **Persona:** PER-01 · **Serves:** JTBD-01, GOAL-07
- **Surface(s):** SUR-01
- **Problem:** Discovered in Phase 4 (FLOW-09). FEAT-043 uploads **one CSV at a time**, and CON-30's files are per **circuit**, not per society. Since the audit made metering per light type, a society has several circuits — so today's 22 societies mean roughly 90 uploads a month, and GOAL-07's 200 societies mean 800+, each potentially re-answering the same AI clarifying questions. This is JTBD-01's "stop reconciling by hand" failing at exactly the scale the product is aiming for.
- **Description:** Multi-file upload that accepts a batch of CSVs, matches each to its society and circuit (by filename convention, file content, or an explicit mapping step), runs CON-30's AI normalisation across all of them, and presents one review screen listing per-file outcome: matched, normalised, anomalies found, or needs attention. Plus a **remembered per-vendor mapping** so a recognised format skips the clarifying questions entirely on subsequent months.
- **Behavioral rules:** Every file still stores its raw original against the specific society+circuit (CON-30) — batching changes the interaction, never the evidence trail. A file that cannot be confidently matched to a circuit is never guessed: it lands in a needs-attention list, because attaching readings to the wrong benchmark surfaces only weeks later as an implausible deviation. The remembered mapping is per vendor format and is re-confirmed, not silently applied, when the format's shape changes.
- **Acceptance criteria:**
  - AC-1 (happy): Given a batch of CSVs for a known vendor, when uploaded, then each is matched to its circuit, normalised without re-asking mapping questions, and a single review screen shows per-file outcomes.
  - AC-2 (empty/first-run): Given the first ever batch for a new vendor format, the clarifying questions are asked **once** and the resulting mapping is saved for reuse.
  - AC-3 (failure): Given a file that cannot be confidently matched to a circuit, it is quarantined in a needs-attention list with the reason — never attached to a best-guess circuit.
  - AC-4 (permission): Given a non-PER-01 actor, bulk ingest is unavailable; and no upload path may bypass the raw-file retention rule (CON-30).
  - AC-5 (edge): Given a vendor changes its export shape mid-year, the saved mapping no longer fits and the system re-asks rather than misparsing under the old mapping — a silently wrong parse is worse than a question.
- **Permissions:** PER-01.
- **Data touched:** Many `RawReadingFile` + `MeterReading` sets per batch; a per-vendor mapping record.
- **Triggers:** PER-01 uploading a batch at month close.
- **Emits:** `BatchIngested`, `FileNeedsAttention`.
- **Consumes:** vendor CSV exports.
- **Depends on:** FEAT-043, FEAT-044, FEAT-045.
- **Depended on by:** FEAT-100 (the readiness board reads batch outcomes), FEAT-048.
- **Failure modes:** Confident mismatching is the dangerous one — a file attached to the wrong circuit produces plausible-looking readings against the wrong benchmark. AC-3's refusal to guess is the whole mitigation.
- **Limits & scale:** This feature **is** the scale answer for CAP-03; it should be sized against 800+ files/month, with the AI normalisation cost per file worth checking at that volume.
- **Minimum viable version:** Multi-file upload with per-file outcomes and a quarantine list.
- **Complete version:** Adds remembered per-vendor mappings and shape-change re-confirmation.
- **Open questions / assumptions:** whether filenames from the vendor app are reliable enough to match on is unverified — worth testing against real exports before designing the matching step.
- **Risks:** Batching makes it easier to upload a month's data without looking at any of it; the review screen has to make anomalies and quarantines genuinely hard to skip past.

### FEAT-100 — Month-close readiness board
- **Capability:** CAP-04 · **Persona:** PER-01 · **Serves:** JTBD-01, GOAL-01
- **Surface(s):** SUR-01
- **Problem:** Discovered in Phase 4 (FLOW-09 step 8). Nothing in the product answers the single question that governs month close: **which societies are ready to bill, and what is each one blocked on?** Readings arrive per circuit across dozens of societies, anomalies block billing (INV-09), coverage floors flag months unusable (CON-12) — and there is no view that aggregates any of it. A forgotten circuit silently drops a society from a billing cycle, and nobody finds out until the revenue is missing.
- **Description:** A month-scoped operations board listing every active society with its readiness state — all circuits ingested, anomalies outstanding, coverage below CON-12's 20-day floor, calculation run, awaiting accountant release, released — plus the specific blocker per society and a direct link to resolve it. Sorted so the blocked societies surface first.
- **Behavioral rules:** Readiness is computed per society but derived per circuit, since a society is only billable when **every** one of its circuits is resolved (CON-11's fan-in). The board is the month's single source of truth for progress and must count societies, not files — an ops lead needs "18 of 22 ready", not a file list. A society with no circuits reporting at all is the most dangerous state and must be distinguishable from one with a minor anomaly.
- **Acceptance criteria:**
  - AC-1 (happy): Given a month in progress, when PER-01 opens the board, then every active society shows its readiness state and, where blocked, the specific reason and a link to act on it.
  - AC-2 (empty/first-run): Given a month with no readings uploaded yet, the board shows all societies as awaiting data rather than appearing empty or broken.
  - AC-3 (failure/degraded): Given a society where no circuit has reported at all, it is flagged distinctly from one with a resolvable anomaly — silence and a flagged problem are different failures with different causes.
  - AC-4 (permission): Given PER-08, the board is visible read-only — the accountant needs to see the month's shape to plan the release queue (JTBD-09) without being able to alter ingest state.
  - AC-5 (edge): Given a society whose circuits are split across two ingest batches, readiness reflects the union of both; partial progress within a society is shown as such rather than as ready or not-ready.
- **Permissions:** PER-01 (act), PER-08 (view), management (view).
- **Data touched:** Reads across `MeterReading` coverage, anomalies, `MonthlyCalculation`, release state. Writes nothing.
- **Triggers:** PER-01 opening it during month close.
- **Emits:** —
- **Consumes:** FEAT-045/046/047's outcomes, FEAT-048's runs, FEAT-054's queue.
- **Depends on:** FEAT-046, FEAT-047, FEAT-048, FEAT-054.
- **Depended on by:** the whole of FLOW-10 in practice, though nothing depends on it structurally — which is exactly why it was missed.
- **Failure modes:** A board that is merely a list rather than a worklist would be ignored during the busiest days of the month.
- **Limits & scale:** 200 rows at GOAL-07 scale — trivial technically, and the primary defence against ingest failures scaling faster than attention.
- **Minimum viable version:** Per-society readiness with the blocking reason.
- **Complete version:** Adds direct resolve links, accountant read-only view, and split-batch handling.
- **Open questions / assumptions:** none blocking.
- **Risks:** none significant — this is a read-only view over data that already exists.

### FEAT-101 — Invoice-to-calculation reconciliation
- **Capability:** CAP-04 · **Persona:** PER-01, PER-08 · **Serves:** GOAL-01, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** Discovered in Phase 4 (FLOW-10 step 8). The formal tax invoice is authored in **Zoho**, outside the product (CON-33), then uploaded back. **Nobody compares the uploaded invoice's total against the total the platform computed.** That comparison is the one check that would catch a transcription error before it reaches a customer — and with CON-11's per-circuit fee lines, the amount being transcribed is now a sum of several lines rather than one figure, which makes an error more likely, not less.
- **Description:** On invoice upload, the extracted total (and where extractable, the per-line breakdown) is compared against the released `MonthlyCalculation`. A match is recorded silently; a mismatch beyond a tolerance blocks the invoice from being shared with the society until PER-01 either corrects the invoice in Zoho and re-uploads, or records an explicit reason for the difference.
- **Behavioral rules:** The platform's computed figure is the reference, since it is the one with provenance behind it (INV-02); a divergent invoice is treated as suspect rather than authoritative. The block is on **sharing**, not on uploading — the document should still be stored and visible internally while the discrepancy is worked out. An accepted mismatch must carry a recorded reason, because "the invoice and our calculation disagreed and we sent it anyway" is precisely the kind of thing a disputing society will later ask about.
- **Acceptance criteria:**
  - AC-1 (happy): Given an uploaded invoice whose total matches the released calculation, when reconciliation runs, then the match is recorded and the invoice proceeds to sharing with no interruption.
  - AC-2 (empty): Given an invoice uploaded for a month with no completed calculation, reconciliation cannot run and says so — it does not pass by default.
  - AC-3 (failure): Given a mismatch beyond tolerance, sharing is blocked, the difference is shown with the computed figure beside the uploaded one, and PER-01 must re-upload or record an explicit accepted reason.
  - AC-4 (permission): Given PER-01, an accepted mismatch requires a reason; given PER-08, the mismatch is visible in the release queue since it is exactly what the accountant gate exists to catch (CON-33).
  - AC-5 (edge): Given a legitimate divergence — a manual credit or an adjustment applied in Zoho but not in the platform — the reason path exists rather than forcing the numbers to be falsified into agreement.
- **Permissions:** system (compare), PER-01 (resolve), PER-08 (view in release queue).
- **Data touched:** Writes a reconciliation result and any accepted-reason record against the invoice.
- **Triggers:** Invoice upload (FEAT-053).
- **Emits:** `InvoiceReconciled`, `InvoiceMismatch`.
- **Consumes:** the extraction output of FEAT-053, `MonthlyCalculation`.
- **Depends on:** FEAT-048, FEAT-053, FEAT-054.
- **Depended on by:** FEAT-060 (sharing is what gets blocked), FEAT-087 (the overdue clock keys off sharing).
- **Failure modes:** A tolerance set too loose would pass the errors it exists to catch; set too tight it blocks on rounding. This needs a real figure from actual invoices rather than a guess.
- **Limits & scale:** Trivial.
- **Minimum viable version:** Total-level comparison with a sharing block on mismatch.
- **Complete version:** Adds per-line comparison and the accepted-reason audit path.
- **Open questions / assumptions:** the tolerance value is undecided; rupee-level equality may be achievable given both figures derive from the same inputs.
- **Risks:** This is the only automated check between the platform's computed reality and the document the customer actually receives — its absence was the most consequential single gap the flows exposed.

### FEAT-102 — Billing dispute record & arrears visibility
- **Capability:** CAP-13 · **Persona:** PER-05, PER-01 · **Serves:** CON-41
- **Surface(s):** SUR-01 (ops), SUR-01 customer (raise)
- **Problem:** Discovered in Phase 4 (FLOW-12, FLOW-15). A society withholding payment because it disputes a bill runs **the same arrears clock** as one that simply has not paid — and CON-13's suspension fires unattended, roughly 17 days after the invoice. So the product could automatically stop field servicing at a society whose only action was questioning a charge, with no human deciding that.
- **Description:** A formal billing dispute raised by the society against a specific invoice, with a reason and supporting detail. It starts its own resolution timer for the backend team, appears prominently against the invoice on the arrears board, and is visible on the society record and in support's 360 view. **Per CON-41 (user's explicit decision) it does not pause the arrears clock** — ops uses the existing extension mechanism (up to 5 days per request) where it judges the dispute genuine.
- **Behavioral rules:** The dispute and the arrears countdown are deliberately independent mechanisms; the connection between them is *visibility plus an operator's judgement*, not automation. A disputed invoice must be unmistakable on the arrears board — an operator scanning for who to extend needs to see it without looking for it. Resolution records an outcome (upheld, partially upheld, rejected) so a repeat dispute has history behind it.
- **Acceptance criteria:**
  - AC-1 (happy): Given a society raises a dispute against an invoice, when submitted, then a resolution timer starts, PER-01 is notified, and the invoice is flagged as disputed everywhere it appears — arrears board, society record, support view.
  - AC-2 (empty): Given a society with no disputes, the disputes panel shows an empty state; the arrears board is unchanged in appearance.
  - AC-3 (failure): Given a dispute is resolved as rejected, the arrears clock — which never stopped — is wherever it has reached, and the society is notified of the outcome and the current arrears position together, not separately.
  - AC-4 (permission): Given a society user, they may raise a dispute only against their own society's invoices (INV-05); only PER-01 or management may record the resolution.
  - AC-5 (edge): Given a dispute is still open when the suspension warning stage is reached, the warning still fires as designed (CON-41) — but the arrears board must show that this society is disputing, so ops can consciously choose to extend rather than let it proceed unnoticed.
- **Permissions:** PER-05/06 (raise, own society), PER-01/management (resolve).
- **Data touched:** A dispute record against the invoice; flags on the society and arrears views.
- **Triggers:** Society submitting a dispute; resolution by ops.
- **Emits:** `DisputeRaised`, `DisputeResolved`.
- **Consumes:** invoice and arrears state.
- **Depends on:** FEAT-087, FEAT-060, FEAT-082 (support's 360 view).
- **Depended on by:** FEAT-087's extension decisions in practice.
- **Failure modes:** The dispute flag being visible but not *prominent* would leave the whole safeguard resting on an operator noticing a subtle marker during the busiest week of the month.
- **Limits & scale:** Low volume expected.
- **Minimum viable version:** Dispute record, resolution timer, and a prominent flag on the arrears board.
- **Complete version:** Adds resolution outcomes and per-society dispute history.
- **Open questions / assumptions:** **ASSUM-23** — that disputes resolve, or are extended, inside CON-13's ~17-day window.
- **Risks:** **Known and accepted (CON-41):** the extension cap is ~10 days total, which is shorter than a dispute needing a site visit (CON-31). A slow dispute can still reach automatic suspension. The decision was to accept this rather than build a pausing mechanism; if a real dispute ever reaches the warning stage unresolved, ASSUM-23 is wrong and CON-41 should be revisited.

### FEAT-103 — Term-end hardware ownership transfer
- **Capability:** CAP-07 · **Persona:** PER-01 · **Serves:** CON-15
- **Surface(s):** SUR-01
- **Problem:** Discovered in Phase 4 (FLOW-17 step 5). CON-15, confirmed from the real signed Ace Aspire agreement, states that **hardware ownership transfers from FirsThing to the society at the end of the contract term**. Nothing in the product models this. It is not a status change — it alters who owns the assets, who is responsible for maintaining them, whether FirsThing's spare inventory at that site still applies, and whether the AMC is now the only commercial relationship.
- **Description:** A term-end transition that records the ownership transfer for a society's installed hardware: an itemised transfer record of what passed to the society (mirroring CON-18's gate-pass pattern — a list, acknowledged by the society), the effective date, and the consequent changes to asset ownership, spare-stock obligation, and service entitlement. Where an AMC is agreed (FEAT-063), servicing continues under those terms; where it is not, the relationship ends and the society owns and maintains the hardware itself.
- **Behavioral rules:** Transfer is contract-driven and effective-dated, never retroactive. The itemised acknowledgement matters for the same reason gate passes do: this is FirsThing's capital leaving its books, and "what exactly did the society receive" must be answerable years later. Spare units held on site (CON-36) need an explicit disposition at transfer — they either pass to the society or come back — rather than being silently orphaned in the inventory model.
- **Acceptance criteria:**
  - AC-1 (happy): Given a contract reaching term end with hardware installed, when the transfer is executed, then an itemised record is produced, acknowledged by the society, and the assets are marked society-owned from the effective date.
  - AC-2 (empty/first-run): Given no contract has yet reached term end (true for every current society), the renewals view shows the upcoming ones rather than an empty screen — this feature's first real use is years away and it must not look broken until then.
  - AC-3 (failure): Given the society does not acknowledge the itemised list, the transfer is recorded as disputed rather than completing silently — ownership of physical assets is not something to assume agreement on.
  - AC-4 (permission): Given PER-01, executing a transfer requires the contract to have actually reached term end or been terminated; it is not an ad hoc action.
  - AC-5 (edge): Given spare units are held on site at transfer, their disposition is recorded explicitly (passed to the society, or collected) — they must not remain in FirsThing's inventory against a society it no longer services.
- **Permissions:** PER-01 (execute), management (approve), society (acknowledge).
- **Data touched:** Asset ownership flags, transfer record, spare-unit disposition, contract state.
- **Triggers:** Contract term end or termination (FEAT-063, FEAT-051 AC-5).
- **Emits:** `HardwareOwnershipTransferred`.
- **Consumes:** contract term data, asset registry, spare inventory.
- **Depends on:** FEAT-062, FEAT-063, FEAT-075/076 (spares), FEAT-042 (pump assets).
- **Depended on by:** the asset model's correctness after any contract ends.
- **Failure modes:** Assets remaining marked FirsThing-owned after transfer would misstate the company's own asset position — an accounting problem, not just a data one.
- **Limits & scale:** Rare, and genuinely distant: no current society is near term end.
- **Minimum viable version:** Itemised transfer record with acknowledgement and asset re-flagging.
- **Complete version:** Adds spare disposition and AMC-continuation handling.
- **Open questions / assumptions:** whether ownership transfer has tax or accounting implications that need modelling is unexamined — worth asking the accountant (PER-08) before this is built.
- **Risks:** **v2 horizon.** Included for completeness because CON-15 is confirmed contract evidence, not speculation — but nothing forces it for years, and Phase 6 should prioritise it accordingly rather than treating it as peer to the monthly-loop gaps.

### FEAT-104 — Scheduled vendor API reading fetch
- **Capability:** CAP-03 · **Persona:** system (headless) · **Serves:** GOAL-01, GOAL-06, JTBD-01
- **Surface(s):** — (headless; output surfaces on SUR-01)
- **Problem:** CON-30's manual CSV path means a month's readings only exist in the system once someone downloads and uploads roughly 90 files (800+ at GOAL-07), and until then nobody knows whether a meter has been dark for three weeks. Ingest is both a labour cost and a blind spot.
- **Description:** A scheduled job pulls readings for every active meter directly from the vendor's API, at a configurable interval (daily by default; several times a day supported). Readings land in the same normalised store as CSV-ingested rows, and the raw API response is retained exactly as CON-30 retains a raw file.
- **Behavioral rules:** This **supplements** the manual path rather than replacing it (CON-43) — the monthly CSV remains the reconciliation artefact and the fallback when the API is unavailable. Where both paths supply the same circuit-day, **the CSV wins on conflict** and the difference is flagged, because the vendor's own export is the record a dispute would be settled against. The fetch never overwrites a reading already used in a released calculation. Fetch cadence is per-deployment configuration, not per-society.
- **Acceptance criteria:**
  - AC-1 (happy): Given active meters and a reachable API, when the scheduled fetch runs, then each meter's new readings are normalised, stored with their raw response, and the meter's last-seen timestamp advances.
  - AC-2 (empty): Given a meter with no new readings since the last fetch, no rows are written and no anomaly is raised — absence of *new* data is not the same as missing data.
  - AC-3 (failure): Given the vendor API returns an error or times out, the run records the failure per meter, retries with backoff, and raises an ingest-health alert (FEAT-106) rather than failing silently.
  - AC-4 (permission): The scheduled job runs as the system; no user role can alter a fetched reading, only supersede it via the CSV path.
  - AC-5 (edge): Given a fetched reading conflicts with an already-committed CSV reading for the same circuit-day, the CSV value is retained, the conflict is recorded, and it surfaces on SCR-084.
  - AC-6 (edge): Given a reading arrives for a period already included in a released calculation, it is stored but does not alter that calculation — INV-03 makes released figures immutable.
- **Permissions:** None — headless.
- **Data touched:** Writes `MeterReading` rows and raw API responses; updates per-meter last-seen and health state.
- **Triggers:** Scheduler, at the configured interval.
- **Emits:** `ReadingsFetched`, `FetchFailed`, `ReadingConflictDetected`.
- **Consumes:** the vendor API; the meter registry (FEAT-040).
- **Depends on:** FEAT-040 (circuit/meter registry), vendor API availability (ASSUM-24).
- **Depended on by:** FEAT-105, FEAT-106, FEAT-048 (calculation), CAP-08.
- **Failure modes:** A silently changed API contract writes plausible-but-wrong values with no human in the loop — worse than the CSV path's failure, where a person at least sees the file. FEAT-106's shape and range checks are the only defence. Fetching several times a day multiplies that exposure.
- **Limits & scale:** ~90 meters today, 800+ at GOAL-07; at four fetches a day that is ~3,200 calls/day. Vendor rate limits are unknown (ASSUM-24).
- **Minimum viable version:** Daily fetch, all active meters, failure alerting.
- **Complete version:** Configurable sub-daily cadence, per-meter backoff, conflict detection against the CSV path.
- **Open questions / assumptions:** ASSUM-24 — that the vendor exposes a usable, documented, authenticated API with per-meter reading history. **This is unverified and the whole feature rests on it.**
- **Risks:** If the vendor's API turns out to be absent, undocumented or rate-limited below what 800 meters need, this feature does not exist and CON-30's manual path stays load-bearing — so it should not be scheduled ahead of a technical spike against the real API.

### FEAT-105 — On-demand reading refresh
- **Capability:** CAP-03 · **Persona:** PER-01 · **Serves:** JTBD-01, GOAL-06
- **Surface(s):** SUR-01
- **Problem:** During a month-close or a deviation investigation, the question "what is this meter reading *right now*" cannot wait for tonight's scheduled fetch.
- **Description:** A permission-gated action that fetches the latest readings for one meter, or for a selected set, immediately. Available from the meter/circuit registry, the ingest health screen, and the deviation review.
- **Behavioral rules:** **Gated by a named permission, not by role** — the user's explicit requirement that not every backend user can trigger it. Follows the existing `AdminPermission` pattern already used for `manage_admins`/`manage_users`, adding `fetch_readings`. Rate-limited per user and per meter to protect the vendor API. A refresh that returns nothing new says so explicitly rather than appearing to have done nothing.
- **Acceptance criteria:**
  - AC-1 (happy): Given a user holding `fetch_readings`, when they refresh a meter, then new readings are fetched, stored, and the screen updates with a fresh timestamp.
  - AC-2 (empty): Given no new readings are available, the action reports "No new readings since 14:05 today" rather than failing or silently succeeding.
  - AC-3 (failure): Given the vendor API errors, the user sees the specific failure (auth, timeout, meter not found) and the meter's health state updates.
  - AC-4 (permission): Given a user without `fetch_readings`, the action is not rendered; the server action rejects it independently of the UI.
  - AC-5 (edge): Given a bulk refresh of 40 meters where 3 fail, the 37 succeed and the 3 are named individually — partial success is reported, never rolled back.
- **Permissions:** `fetch_readings` (new named permission).
- **Data touched:** Same as FEAT-104.
- **Triggers:** User action.
- **Emits:** `ManualFetchRequested`, `ReadingsFetched`, `FetchFailed`.
- **Consumes:** the vendor API.
- **Depends on:** FEAT-104 (shares the fetch and normalisation path), the admin permission model.
- **Depended on by:** FEAT-055 (deviation review), FEAT-047.
- **Failure modes:** Unrestricted use during month-close could exhaust a vendor rate limit and break the scheduled fetch for everyone — hence the rate limit, which is a functional requirement rather than a nicety.
- **Limits & scale:** Bulk selection capped at the visible page (50).
- **Minimum viable version:** Single-meter refresh.
- **Complete version:** Multi-select bulk refresh with per-meter partial-failure reporting.
- **Open questions / assumptions:** Depends on ASSUM-24 exactly as FEAT-104 does.
- **Risks:** Same vendor-API dependency; additionally, a manual refresh mid-calculation could change inputs under a running job — the calculation must pin its input versions (INV-02 already requires this).

### FEAT-106 — Ingest health monitoring & alerting
- **Capability:** CAP-03 · **Persona:** PER-01 · **Serves:** GOAL-01, GOAL-06, INV-09
- **Surface(s):** SUR-01
- **Problem:** ASSUM-16 is load-bearing for the entire monthly loop and today has **no system visibility at all** — a vendor export changing shape, an API failing, or a meter going dark are all discovered late, by a person noticing an absence during a 17-day window.
- **Description:** Continuous monitoring of ingest across both paths, distinguishing the three failure types the user named: (a) the vendor API is erroring or unreachable, (b) a specific meter is offline or not reporting, (c) readings for a period are missing for a meter that is otherwise reporting. Each surfaces as an alert with its own severity and its own resolution path.
- **Behavioral rules:** The three causes must stay **distinguishable**, because they have different owners — a vendor API failure is an integration problem, an offline meter is a field-service dispatch, and a period gap on a live meter is a data-quality investigation. Collapsing them into one "ingest failed" alert would send every case to the wrong person. Alerts are deduplicated per meter per cause so a week-long vendor outage raises one alert, not 5,600. Severity escalates with proximity to the close window: a gap on day 2 is informational; the same gap on day 12 is blocking.
- **Acceptance criteria:**
  - AC-1 (happy): Given all meters reporting on schedule, the ingest health view shows a caught-up state and raises nothing.
  - AC-2 (empty): Given a newly-commissioned meter with no history, it is shown as `awaiting first reading` and not alerted as offline until its first expected interval passes.
  - AC-3 (failure — API): Given the vendor API fails for 3 consecutive runs, one alert is raised naming the API as the cause, with the last successful fetch time.
  - AC-4 (failure — meter): Given one meter stops reporting while others continue, it is alerted as offline, with its last-seen timestamp and a link to raise a field visit.
  - AC-5 (failure — period gap): Given a meter reporting normally but missing days 8–11, a gap alert is raised naming the exact dates, distinct from an offline alert.
  - AC-6 (permission): Given a non-PER-01 actor, alerts are visible but not resolvable.
  - AC-7 (edge): Given a CSV upload later fills a gap that was alerted, the alert resolves automatically and records what closed it.
- **Permissions:** PER-01 (view, resolve, snooze-with-reason); read-only for others.
- **Data touched:** Creates `IngestAlert` records; reads per-meter health state and expected-reading schedules.
- **Triggers:** After every scheduled fetch, after every CSV commit, and on a daily sweep for period gaps.
- **Emits:** `IngestAlertRaised`, `IngestAlertResolved`.
- **Consumes:** FEAT-104's fetch outcomes, FEAT-043's commits, the meter registry.
- **Depends on:** FEAT-040, FEAT-043, FEAT-104.
- **Depended on by:** FEAT-047 (readiness), CAP-08 (ops home), FEAT-100.
- **Failure modes:** Alert fatigue is the real risk — an ops team that sees 40 alerts every morning stops reading them. Deduplication and close-window-proportional severity are the controls, and both need tuning against real data.
- **Limits & scale:** One health row per meter; alerts bounded by dedup.
- **Minimum viable version:** Missing-readings alerting against the expected schedule, covering the CSV path only — this alone closes ASSUM-16's blind spot without waiting on the vendor API.
- **Complete version:** All three causes distinguished, close-window-proportional severity, auto-resolution.
- **Open questions / assumptions:** The expected-reading schedule per meter has to come from somewhere — currently implied by "active circuit" but not modelled. Needs a field on the circuit registry.
- **Risks:** Depends partly on ASSUM-24 for the API-failure branch; the missing-readings branch does not, which is why it is the minimum viable version.

## 4. Feature interaction matrix

### 4.1 The lead-to-cash spine

The dependency chain confirmed by the capability walkthrough. Each arrow is a real state handoff,
not just a sequence. **Only the demo is skippable** (FEAT-032, CON-24 as corrected at the Phase 3
gate); the survey is mandatory and metering happens on every deal, skip or no skip. Note also that
from CAP-16 onward the spine runs **once per metered circuit, not once per society** — CON-11 as
corrected at the post-gate audit meters one circuit per light type, so survey → commissioning →
compliance → deviation review all fan out per circuit and reconverge at the invoice (CAP-04), which
sums per-circuit fee lines into one monthly total.

```
CAP-15 lead/proposal
  └→ CAP-16 survey (society profile, lighting inventory, circuit choice, pump audit, logbook)
       └→ CAP-02 benchmark commissioning (meter install → baseline window → light swap → post window → benchmark)
            └→ CAP-18 demo report → share → society queries
                 └→ CAP-19 KYC documents
                      └→ CAP-20 offer → negotiation → agreement → CAP-07 contract
                           └→ CAP-21 installation (batches → daily society review gate → completion certificate)
                                └→ CAP-04 billing starts (CON-22 prorated)
                                     ├→ CAP-03 monthly reading ingest → CAP-04 calculation → CAP-06 savings report
                                     ├→ CAP-05 deviation review (only when out of band)
                                     └→ CAP-13 payment tracking → suspension (CON-13)
```

CAP-17 (field visit scheduling) is invoked repeatedly along this spine rather than sitting at one
point in it: survey visits, meter installation, light replacement, installation days, deviation
investigations, ticket resolutions, and routine inspections all schedule through it.

### 4.2 Cross-feature couplings that are easy to miss

| When this happens | These must react | Why it's non-obvious |
|---|---|---|
| FEAT-032 marks the demo stage skipped | FEAT-027 forces `benchmarkSource: negotiated-fixed`; FEAT-052 bills flat; FEAT-052 AC-5 labels the basis to the society | A workflow shortcut silently changes the *commercial* model, not just the step count (CON-25) |
| FEAT-041 rescales a benchmark (light-count change) | FEAT-048 uses the effective-dated baseline; FEAT-068 marks the timeline; FEAT-049's compliance result changes | Comparing history against a *current* benchmark would misstate closed months |
| FEAT-036 records a requirement change altering light count | FEAT-041 (rescale), FEAT-064 (possible contract amendment), FEAT-048 (`representedLightCount`) | An install-floor decision propagates all the way into billing |
| FEAT-045 flags an anomaly during a CAP-02 window | FEAT-012/FEAT-014 restart the 5-valid-day count (CON-19) | One detection mechanism, two very different consumers |
| FEAT-057 classifies a root cause | FEAT-050 flips `pricingBasis`; FEAT-059's report explains it; FEAT-088 shows the basis | The classification is a billing input, not a note |
| FEAT-058 adjusts a benchmark (management) | FEAT-064 (contract amendment), FEAT-048/049 forward, CAP-14 | The only non-light-count route to a changed benchmark |
| FEAT-037 records the completion certificate | FEAT-051 prorates the first month; FEAT-077 registers assets; CAP-11 inspection cadence begins; CAP-03 ingest starts | One signature starts four different clocks |
| FEAT-063 transfers ownership at term end | FEAT-077 (asset base), CAP-10 (inventory scope), CAP-11 (maintenance obligation), FEAT-069 | Ownership is a real field with operational consequences, not a label |
| FEAT-072 resolves a ticket using a spare | FEAT-075/076 (stock ledger, both states) | Recorded inline or not at all — a separate step gets skipped |
| FEAT-054 releases a month | FEAT-060 (society sees it), FEAT-087 (overdue clock starts 2 days later), FEAT-069 (north-star metric) | Release, not generation, is the event everything downstream keys off |
| Any SLA breach (CON-27) | FEAT-074's escalation, shared by FEAT-018 (visits) and FEAT-083 (threads) | Three consumers, one mechanism — not three mechanisms |
| Any feature saying "is notified" | FEAT-091's single send path, via FEAT-090's event catalogue and FEAT-092's recipients | 21 briefs across 12 capabilities; CON-39 makes this one mechanism rather than 21 ad hoc email calls |
| FEAT-087's suspension warning bounces | FEAT-091 AC-5 halts the countdown, FEAT-092 flags the society unreachable | The only notification with contractual weight — an undelivered warning must stop the clock, not run beside it |
| FEAT-040 sets a circuit's `lightType` | FEAT-048's extrapolation base, FEAT-049's per-circuit band, FEAT-050's fee line, FEAT-055's review scope | Post-audit (CON-11): `lightType` and `representedLightCount` are billing-critical fields, not labels — a wrong one biases a fee line for the whole term |

### 4.3 Shared-contract capabilities (both surfaces must agree)

CAP-16, CAP-02, CAP-17, CAP-21, CAP-01, CAP-05, CAP-09, CAP-10, CAP-11, CAP-22 each carry state that
SUR-01 and SUR-02 both read and write. For these, one underlying model with role-scoped
projections is required — FEAT-038 (installation dashboards) is the clearest example, and
FEAT-035's daily review gate the most consequential, since the field crew, ops, and the society
must never disagree about whether tomorrow's work is unblocked.

## 5. Cross-cutting requirements

Requirements that recur across capabilities and should be built once, not per feature.

### XC-01 — Gate pass / field-document pattern (CON-18)
An itemized equipment list, physically signed by the society, photographed via the app, **and**
re-entered as a structured form by field staff, with backend verification and approval **gating
the technician's departure from the premises**. Applies at three named points: meter installation
(FEAT-011), demo-installation completion (FEAT-013), and full-installation completion (FEAT-037).
Needs its own line-item entity and an approval-gates-departure state machine — not three
independent implementations. Gemini-style auto-population from the photograph is a stated future
improvement, explicitly not required now.

### XC-01b — Notification delivery (CON-39, CAP-22)
Not a pattern to reimplement per feature but a dependency to route through: every brief in this
document that says a party "is notified" resolves to CAP-22's single send path (FEAT-091), via a
registered event (FEAT-090) and a resolved recipient (FEAT-092). Email is the only wired channel
at launch. Listed here rather than left implicit because the post-gate audit found 21 such
statements across 12 capabilities with no owner — exactly the condition that produces 21 slightly
different implementations.

### XC-02 — Offline-tolerant field capture (SUR-02)
Every SUR-02 feature captures data in mechanical rooms, basements, and outdoors with variable
connectivity, much of it photo-heavy: FEAT-005 through FEAT-009 (survey), FEAT-011/013 (install),
FEAT-034 (batches), FEAT-072 (ticket resolution), FEAT-078/079 (inspection). Local retention with
retry must be solved once at the surface level. Distinguishing *work-completed-at* from
*logged-at* also belongs here — a connectivity delay must not read as an SLA breach (FEAT-072).

### XC-03 — SLA timers and management escalation (CON-27)
One timer/escalation mechanism, three consumers: ticket SLAs (FEAT-074), field-visit non-response
and repeat reschedules (FEAT-018), and support-thread inactivity in either direction (FEAT-083).
Breaching any SLA auto-escalates to management. **Thresholds are configurable, not hardcoded**
(CON-35, resolved at the Phase 3 gate), seeded with these defaults: **24h** to acknowledge a
field-visit assignment, **72h** per ticket sub-task, **48h** of support-thread silence before
escalation. CON-27's own 24h first-response and 48h resolution figures stay fixed as contractual
commitments; everything else is management-editable once real behaviour is observed.

### XC-04 — Provenance and immutability of customer-facing figures (INV-02)
Every figure shown to a society as "savings" traces to the readings, benchmark version, and
contract term version that produced it. Concretely this requires: effective-dated contract terms
(FEAT-062), effective-dated benchmarks (FEAT-041/058), raw-file retention (FEAT-047), per-
calculation input version references (FEAT-048), and version-locking on anything shared or
released (FEAT-022, FEAT-054). Derived figures are never hand-editable anywhere; corrections are
made by fixing inputs and re-running, and produce a visible new version. The one named exception is CON-25's
demo-skip path, where the savings *percentage* traces to the signed agreement rather than to a
measured demo — but the consumption behind it is still fully metered (FEAT-052). There is no
path where a society sees a savings figure with no meter data behind it.

### XC-05 — Every list surface has four states (INV-06)
Loading, empty, error, and degraded — mandated by the existing wireframes companion doc and
carried into every list/queue feature here. Degraded is the one most often skipped and matters
most in aggregate views: FEAT-066's ops queue must flag a source it couldn't load rather than
silently omitting it, and FEAT-067 must never render "on-track" for a society whose status simply
couldn't be computed.

### XC-06 — Named permissions layered over roles
Roles alone are insufficient. This phase identified capabilities gated by specific named
permissions rather than by role: management-only actions (FEAT-032 stage skips, FEAT-058 benchmark
adjustment, FEAT-064 contract amendments), the accountant release gate (FEAT-054), user management
(FEAT-086), and PER-02's deliberately scoped support access (FEAT-084). The existing codebase's
`AdminPermission` array is the established pattern to extend. Structural separation is required
where explicitly asked for: an ordinary account must not become an admin account through a data
change alone.

### XC-07 — Document storage and naming convention
Uploaded documents (KYC, agreements, invoices, reports, field photos) follow the established
`Documents/{Society}/{YYYY-MM}/{DocType}/…` convention, with the month always an explicit user
selection rather than inferred. Already implemented in the codebase and reused rather than
redesigned. Field photos across XC-02's features are the largest new volume this phase adds.

### XC-08 — Physical/system reconciliation
Several features record a physical reality that the system's own arithmetic may disagree with:
spare-stock counts (FEAT-075 AC-5), executed agreements differing from accepted offers
(FEAT-029 AC-5), invoice amounts differing from computed amounts (FEAT-053 AC-3). The consistent
rule across all of them: the physical/legal artefact wins, and the discrepancy is recorded rather
than silently reconciled.

## 6. Explicitly out of scope

Carried from `00-intake.md` §2 and confirmed or added during this phase:

- **No resident/flat-level application.** The society is the customer; individual residents are not users.
- **No actuation of pump hardware** (INV-08). The platform is monitor-only — it reads sensor/status data and never issues start/stop or valve commands. This constrains the data model (no command entities) as well as the UI, and is a safety decision, not a phasing convenience.
- **No live device telemetry** (ASSUM-13). Meter data arrives as vendor CSV uploads (CON-30). The full real-time notification/monitoring system is paired with telemetry and deferred together; only basic upload-time anomaly detection (INV-09, FEAT-045) is in scope.
- **Solar (SVC-03) and wastewater (SVC-04) are modeled only.** They exist in the service-line registry (FEAT-039) so the abstraction is proven, but no capability implements them. SVC-04's metric shape is genuinely undefined and must not be forced.
- **No security-deposit collection flow** (CON-09). A society-paid deposit is a planned future business-model addition; the current model is a pure ongoing savings-share fee with zero upfront cost.
- **The tax invoice is not generated in this product** (CON-33). Zoho generates it; this product hands off billing data and takes back the finished document. The savings report *is* native (FEAT-059).
- **No in-portal contractual acceptance** (FEAT-028 complete version). Offers are accepted out-of-band and recorded; whether an in-app acceptance would be legally sufficient is unresolved and deliberately not assumed.
- **No CSV meter-reading benchmark-variance pipeline beyond what CAP-03/CAP-05 specify.** The richer review workflow described in earlier project notes is superseded by the CON-30/CON-31 design captured here.

## 7. Traceability check

### 7.1 Capabilities → features
All 22 capabilities are expanded. FEAT-001 … FEAT-103, no gaps, no duplicates:

| Capability | Features | Capability | Features |
|---|---|---|---|
| CAP-15 | FEAT-001–004 | CAP-01 | FEAT-039–042 |
| CAP-16 | FEAT-005–010 | CAP-03 | FEAT-043–047, 099 |
| CAP-02 | FEAT-011–015, 094, 097 | CAP-04 | FEAT-048–054, 100, 101 |
| CAP-17 | FEAT-016–019, 096 | CAP-05 | FEAT-055–058 |
| CAP-18 | FEAT-020–023 | CAP-06 | FEAT-059–061 |
| CAP-19 | FEAT-024–026 | CAP-07 | FEAT-062–065, 103 |
| CAP-20 | FEAT-027–032, 095 | CAP-08 | FEAT-066–069 |
| CAP-21 | FEAT-033–038 | CAP-09 | FEAT-070–074 |
| | | CAP-10 | FEAT-075–077 |
| | | CAP-11 | FEAT-078–080 |
| | | CAP-12 | FEAT-081–084 |
| | | CAP-13 | FEAT-085–087, 098, 102 |
| | | CAP-14 | FEAT-088–089 |
| | | CAP-22 | FEAT-090–093 |

### 7.2 Strategic goals → features

| Goal | Served by | Covered? |
|---|---|---|
| GOAL-01 — billing decision as a system output | FEAT-048, 049, 050, 051, 053, 054, 087 | yes |
| GOAL-02 — one login, all service lines | FEAT-039, 088, 085, 086 | yes |
| GOAL-03 — service-line abstraction | FEAT-039, 040, 042, 005, 006 | yes |
| GOAL-04 — replace the Supabase-backed files | CAP-11's rebuild (FEAT-078–080) is the largest remaining piece; the rest is migration work, not a feature | partial — deliberately, it's a technical goal, addressed in Phases 7-8. **Flagged by the post-gate audit: this is the only MVP goal with no dedicated feature brief.** It must be carried into Phase 6 as an explicit engineering workstream with its own backlog items, or it falls through prioritisation unnoticed — nothing in the FEAT-numbered backlog will surface it |
| GOAL-05 — single operational view, assignable work | FEAT-066, 067, 019, 074, 031 | yes |
| GOAL-06 — every savings figure traceable | XC-04, and FEAT-047, 048, 059, 062, 065, 088 | yes |
| GOAL-07 — 200 societies without rework | FEAT-039 (the abstraction), FEAT-069 (measuring it) | yes |
| GOAL-08 — portfolio per-circuit consumption vs. benchmark | FEAT-068, 067 | yes |

### 7.3 Jobs to be done → features

| JTBD | Persona | Served by | Covered? |
|---|---|---|---|
| JTBD-01 — automatic monthly bill & report | PER-01 | FEAT-043–048, 053, 059 | yes |
| JTBD-02 — review out-of-band months auditably | PER-01 | FEAT-055–058, 050 | yes |
| JTBD-03 — see the society's record directly | PER-02 | FEAT-081–084 | yes |
| JTBD-04 — assigned work, logged from the phone | PER-03 | FEAT-019, 072, 078, 079 | yes |
| JTBD-05 — guided benchmark capture | PER-04 | FEAT-011–015 | yes |
| JTBD-06 — a bill the committee can trust | PER-05 | FEAT-060, 065, 088 | yes |
| JTBD-07 — log and track day-to-day fixes | PER-06 | FEAT-070, 089 | yes |
| JTBD-08 — visible sales pipeline | PER-07 | FEAT-001–004, 027, 028, 031 | yes |

### 7.4 Personas → surfaces

Every persona has at least one feature where they are the primary actor: PER-01 (throughout),
PER-02 (FEAT-081–084), PER-03 (FEAT-072, 078, 079), PER-04 (FEAT-005–014, 034), PER-05/PER-06
(FEAT-023, 025, 035, 065, 088, 089), PER-07 (FEAT-001–004, 027, 028), **PER-08 Accountant
(FEAT-054)** — added at the Phase 3 gate as a distinct role with its own login rather than a
permission on PER-01. Management is treated as a permission rather than a persona (XC-06) and owns
FEAT-032, 058, 064, and the escalation endpoints of XC-03.

### 7.5 Constraints and invariants → features

CON-01/01a/01b → FEAT-049, 050 · **CON-01c (sustained = 2 months) → FEAT-049, 050** ·
**CON-01d (approaching = 20% of band) → FEAT-049, 067** · CON-02 → FEAT-041 · CON-03 → FEAT-039 ·
CON-07 → FEAT-040 · CON-08 → FEAT-077, 042 · CON-09 → out of scope (§6) · CON-10 → FEAT-012, 014,
041 · **CON-11 (per-light-type metering, per-circuit bands — corrected 2026-08-12) → FEAT-040, 048,
049, 050, 055, 011, 094** · CON-12 (incl. the 20-day coverage floor) → FEAT-046 · CON-13 (incl. the
same-day payment-confirmation rule) → FEAT-087 · CON-14 → FEAT-076 AC-5 · CON-15 (AMC renegotiated,
no default) → FEAT-063, 075 · CON-16 → FEAT-007 · CON-17 → FEAT-011 · CON-18 → XC-01 · CON-19 →
FEAT-012, 014 · CON-20 → FEAT-014, 015 · CON-21 → FEAT-035 · CON-22 → FEAT-051 · CON-23 →
FEAT-030, 031 · CON-24 (demo is the only skippable stage) → FEAT-032, 002, 010 · CON-25 (metering
always happens; first post-install month is the reference) → FEAT-052, 032, 027, **094** ·
**CON-25d (pre-install readings retained as evidence) → FEAT-094, 052, 059** · CON-26 →
FEAT-078 · CON-27 → XC-03, FEAT-071–074 · CON-28 → FEAT-005, 006, 008, 009 · CON-29 → FEAT-061
(deferred) · CON-30 → FEAT-043, 044 · CON-31 → FEAT-055–058 · CON-32 → FEAT-081–083 · CON-33 →
FEAT-048, 053, 054, 059 · **CON-34 (prospect accounts) → FEAT-023, 025, 085** · **CON-35
(configurable SLAs) → XC-03, FEAT-018, 073, 083** · **CON-36 (spare returns/warranty) → FEAT-076** ·
**CON-37 (direction-dependent benchmark approval) → FEAT-058, 064** · **CON-40 (provisional
gate-pass release) → FEAT-097** · **CON-41 (disputes do not pause the arrears clock) → FEAT-102** ·
**CON-38 (seasonality ruled
out as a variance driver) → no feature, deliberately — it is the *absence* of a seasonal-adjustment
layer in FEAT-048/049; tracked as ASSUM-22** · **CON-39 (email-only notifications behind one
capability) → CAP-22, FEAT-090–093**.

INV-02 → XC-04 · INV-03 → FEAT-057 · INV-06 → XC-05 · INV-07 → FEAT-014, 041 · INV-08 → FEAT-042
and §6 · INV-09 → FEAT-045.

### 7.6 Open items — resolved at the Phase 3 gate (2026-08-12)

All twelve items raised in the first draft of this section were put to Yugesh one at a time and
answered. Each answer has been written back into `00-intake.md` as a constraint and into the
affected briefs; nothing below is still open.

| Item | Resolution | Recorded as | Affects |
|---|---|---|---|
| What counts as a "sustained" out-of-band breach | **2 consecutive out-of-band months.** Month 1 raises the review and is the correction window; only month 2 can adjust | CON-01c | FEAT-049, 050 |
| The "approaching tolerance" threshold | **Within 20% of the band edge**, scaled per contract (4% on ±5%, 8% on ±10%) | CON-01d | FEAT-049, 067 |
| Reading-coverage floor for an unusable month | **Below 20 days.** Flagged for judgment, never silently computed; ops can still accept explicitly | CON-12 (extended) | FEAT-046, 052 |
| Do prospects get portal accounts pre-agreement? | **Yes — a limited account** at survey/demo stage, scoped to the demo report, its query thread, and document upload. The backend-entry path stays mandatory regardless | CON-34 | FEAT-023, 025, 085 |
| Is the accountant a role or a permission? | **A distinct role with its own login (PER-08)**, not a permission on an admin account | 02-users-research.md PER-08, RG-08 | FEAT-054, 086 |
| Does a management benchmark adjustment need the society's signature? | **Depends on direction.** Society-favourable applies immediately with notification; FirsThing-favourable requires a signed amendment first | CON-37 | FEAT-058, 064 |
| Can a stage be skipped once in progress? | **Reframed entirely — the question didn't apply.** The survey is mandatory, the **demo is the only skippable stage**, and nothing else is optional. A demo skip is decided before the demo starts, by definition | CON-24 (corrected) | FEAT-032 (rewritten), 002, 010 |
| Demo-skip path and metering | **Metering always happens** — meter installed on survey day or later, never before. The agreed % drives billing; the **first full post-install month becomes the reference** every later month is compared against | CON-25 (corrected), INV-02 (narrowed) | FEAT-052 (rewritten), 027, 032; CAP-02 gains a no-demo variant |
| How is payment recorded? | **Manual mark-as-paid from Zoho**, plus a hard safety rule: suspension may only fire against a **same-day-confirmed** payment status. Still no approval gate on the automatic path | CON-13 (extended) | FEAT-087 |
| SLA thresholds beyond CON-27's 24h/48h | **Configurable, seeded with defaults:** 24h visit acknowledgement, 72h per sub-task, 48h thread silence | CON-35 | XC-03, FEAT-018, 073, 083 |
| AMC monthly calculation basis | **No default rate.** Renegotiated at each renewal and stored per contract; Ace Aspire's 25% is that contract's figure, not a platform constant | CON-15 (updated) | FEAT-063 |
| Cross-sell projection formula | **Deferred by decision.** Stays in the blueprint, explicitly not to be built until a modeling pass defines how CON-29's three inputs combine; cross-sell quoting stays manual meanwhile | FEAT-061 marked deferred | FEAT-061 |

### 7.7 Post-gate audit (2026-08-12) — what it changed

A comprehensive review of all four blueprint documents was run immediately after the Phase 3 gate.
It found 9 confirmed defects, 5 stale phase references, 6 places where the tolerance band was
written as a hardcoded `±5%`, and 8 substantive gaps. Mechanical fixes were applied directly; the
substantive ones needed product decisions and are recorded here:

| # | Finding | Decision | Applied to |
|---|---|---|---|
| D1 | 21 briefs said "is notified"; no capability owned notifications | **Email-only at launch, behind one capability** so channels can be added later without a rewrite | CON-39, CAP-22, FEAT-090–093 |
| D2 | A once-measured 5-day baseline is compared against for the whole term, with no seasonal normalisation — and CON-01c now flips billing after 2 consecutive out-of-band months | **Seasonality, weather and occupancy explicitly ruled out as material drivers** (owner's domain call). No adjustment layer. Recorded as ASSUM-22 so it stays revisitable | CON-38, ASSUM-22 |
| D3 | Nothing required the sample metered circuit to be *representative*; one circuit was extrapolated across a society's entire light count | **Meter one circuit per light type**, each extrapolating only across its own type | CON-11, CON-16, FEAT-040, 048, 011, 094 |
| D3a | With several metered circuits, where does the tolerance band apply? | **Per circuit, independently** — own benchmark, own review, own `pricingBasis`. Invoices become per-circuit fee lines; the contract carries a per-circuit benchmark table | CON-11, FEAT-049, 050, 055, 059 |
| D4 | On the demo-skip path the meter records real pre-install consumption that nothing used | **Retained as evidence, never as the billing basis** — shown on the savings report, does not become a benchmark | CON-25d, FEAT-094, 052, 059 |
| D5 | FEAT-087 suspended a society "including servicing" but never said what else stopped | **Field servicing only.** Ingest, calculation, invoicing and portal access all continue | CON-13, FEAT-087 |
| D6 | GOAL-04 (Supabase cutover) had no feature briefs | Left as-is — it is technical remediation, not capability — but flagged in §7.2 as needing an explicit Phase 6 engineering workstream | §7.2 |
| D7 | CAP-02 advertised a "no-demo variant" whose behaviour lived inside FEAT-052, a billing feature | **Given its own brief** | FEAT-094 |
| D8 | PER-08 (Accountant) had no JTBD while all other personas did | **JTBD-09 added** | `02-users-research.md` |

### 7.7b Phase 4 feedback (2026-08-12) — 9 features the flows exposed

`04-flows-system-map.md` mapped all 19 flows and, as the method predicts, exposed features Phase 3
missed — almost all of them connective tissue *between* capabilities rather than gaps inside one.
All nine were adopted (user's decision) as FEAT-095..103. Two needed product decisions of their
own, recorded as CON-40 and CON-41:

| Was | Now | Feature |
|---|---|---|
| Nothing ever terminated a pipeline — dead leads sat at their last stage forever, corrupting CON-23's lead health | `closed-lost` with a reason, plus re-engagement as a new linked pipeline | FEAT-095 |
| Facility/security staff named as an access blocker in the research, with no product support | Access details on the society, an `access-blocked` visit outcome, repeat-pattern escalation | FEAT-096 |
| CON-18's blocking gate-pass approval could physically strand a technician on site | **CON-40:** 30-minute timeout → provisional release; evidence unchanged, only backend's challenge window moves | FEAT-097 |
| CON-34's prospect logins never widened at signing — a signed society kept a crippled account | Automatic promotion on contract activation, history carried forward | FEAT-098 |
| Single-file reading upload against 800+ files/month at GOAL-07 scale | Batch upload, per-file outcomes, quarantine on ambiguous match, remembered vendor mappings | FEAT-099 |
| No answer to "which societies are ready to bill" | A month-close readiness board, per-society state with the blocking reason | FEAT-100 |
| The Zoho invoice total was never checked against the computed total | Reconciliation on upload; mismatch blocks *sharing*, not storage | FEAT-101 |
| A disputing society ran the same automatic suspension clock as a defaulting one | **CON-41:** dispute recorded and made prominent; clock still runs, ops uses existing extensions. Residual risk accepted — see ASSUM-23 | FEAT-102 |
| CON-15's term-end ownership transfer was unmodelled | Itemised transfer, acknowledgement, spare disposition — flagged **v2 horizon** | FEAT-103 |

### 7.8 Genuinely still open (not blocking this phase)

| Item | Nature | When it needs an answer |
|---|---|---|
| PER-08's working preferences and volume tolerance | Research gap RG-08 — the role is confirmed, the person hasn't been interviewed | Before Phase 5 specs FEAT-054's release screen |
| RG-02 / RG-03 / RG-04 / RG-05 (inspector, support, committee/manager not interviewed; field connectivity uncharacterized) | Carried from Phase 2, unchanged | Before Phase 5 specs the SUR-02 and customer-portal screens |
| SVC-04 (wastewater) metric shape | Genuinely undefined; the model must tolerate a service line with no metric rather than forcing one | Only when wastewater moves from modeled-only to built |
| Whether support threads and tickets are one entity or two | Phase 7 data-model decision; CON-32 leans toward one shared case entity | Phase 7 |
| Zoho API integration feasibility | Phase 7/8 architecture question (CON-33); the manual path must work regardless | Phase 7/8 |

Smaller design gaps surfaced by individual briefs, all appropriate to settle during Phase 4 flows
or Phase 5 screens rather than now:

- No maximum-retry or escalation path for a monitoring window stuck in repeated anomaly restarts (FEAT-012, FEAT-014).
- No defined remedy for a persistently unresponsive society onlooker beyond CON-21's single skip (FEAT-035).
- The society-side confirmation mechanism for a demo-circuit choice — in-person signed vs. async (FEAT-007), to settle alongside XC-01's gate-pass component.
- Whether demo-report sharing over WhatsApp is a real integration or a logged manual step (FEAT-022).
- Lead-health thresholds (FEAT-031) and the priority ordering across heterogeneous sources in the ops queue (FEAT-066) — both want real usage data before being fixed.
