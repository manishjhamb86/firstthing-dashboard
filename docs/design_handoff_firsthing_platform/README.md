# Handoff: FirsThing EnergiTrack Customer Platform

## Overview

A role-based energy-operations platform for FirsThing.earth (IoT energy management for co-living
spaces and commercial infrastructure). It unifies energy-savings visibility, digital inspections,
billing records, water-tank monitoring, live metering analytics and society onboarding into one
multi-tenant app, per the "FirsThing Next-Gen Platform - Product & Technical Blueprint v2.0".

Two design files are included:

| File | Fidelity | Purpose |
|---|---|---|
| `FirsThing Platform UI.dc.html` | **High-fidelity** | 15 screens, 4 roles, 5 switchable themes. The visual and behavioural source of truth. |
| `FirsThing Platform Wireframes.dc.html` | **Low-fidelity** | IA, workflow state machines, annotated layout intent, required empty/loading/error states, open questions. |

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes that show the
intended look, structure and behaviour. They are **not production code to copy**. They are single-file
streaming components with inline styles; there is no build system, routing, data layer or auth in them.

Your task is to **recreate these designs in the target codebase's existing environment** using its
established patterns and libraries. The blueprint specifies the intended stack:

- Next.js App Router + TypeScript (strict)
- Tailwind CSS + a component system driven by design tokens
- TanStack Query for server state; Zod for form/schema validation
- Supabase Postgres + Supabase Auth, Edge Functions for domain workflows
- Background jobs for report generation, notifications and ingestion cleanup

If that codebase already exists, follow its conventions and map the tokens below onto its Tailwind
theme. If nothing exists yet, scaffold the stack above.

**Do not ship the HTML.** In particular: the sidebar "VIEWING AS" role switcher is a review
affordance only — production must resolve the role from the session and never render a switcher.

## Fidelity

**High-fidelity** for `FirsThing Platform UI.dc.html`. Colors, typography, spacing, radii and
interaction states are final and should be reproduced faithfully.

**Low-fidelity** for `FirsThing Platform Wireframes.dc.html`. Use it for structure, flow, state
coverage and annotations; take styling from the hi-fi file.

---

## Roles & Permissions

Four roles are implemented in the design; two more are named in the blueprint as future work.

| Role | Key | Landing screen | Scope |
|---|---|---|---|
| Platform Admin | `admin` | Portfolio dashboard | All societies, all modules |
| Society Manager | `socmgr` | Society dashboard | One society (its towers only) |
| Customer / Society | `customer` | My dashboard | One society, read-mostly |
| Inspection Team | `inspector` | My tasks | Assigned tasks only |
| Finance/Ops Analyst | — | future | cross-society analysis, exports |
| Support / Read-only Auditor | — | future | immutable logs, no edit |

Permission model: **RBAC + scoped resource permissions** — role-level access, society-scope
restriction, action-level rights (view/create/edit/approve/publish/delete) and field-level
restriction for sensitive data. Enforce server-side with Postgres row-level security; the UI matrix
is documentation, not enforcement.

Matrix as designed (Users & Roles screen):

| Resource | Admin | Society Mgr | Customer | Inspector | Auditor |
|---|---|---|---|---|---|
| Societies | ALL | EDIT | VIEW | — | VIEW |
| Reports | PUBLISH | APPROVE | VIEW | CREATE | VIEW |
| Invoices | ALL | VIEW | VIEW | — | VIEW |
| Inspections | ALL | REVIEW | VIEW | SUBMIT | VIEW |
| Meters & devices | ALL | VIEW | VIEW | READ+ | VIEW |
| Users & roles | ALL | SCOPED | — | — | VIEW |
| Contact PII | FULL | MASKED | SELF | MASKED | MASKED |

Hard rules encoded in the design:

1. Role assignment is **mandatory before dashboard access**.
2. Profile basics must be completed on first login; role and society mapping are read-only to the user.
3. Society Manager must never see portfolio-wide figures, other societies, or a "New society" action.
4. **Billing is view-and-download only** — no payment flow anywhere in the product for now.
5. Published reports and issued invoices are immutable; corrections create a new version.
6. English (IN) only. Hindi/regional is a later phase — keep all copy in translatable string form.

---

## Navigation (role-aware)

Left sidebar, 246px fixed, dark shell, sticky full height. Items are **filtered by role, not disabled**.
Badge counters show only actionable work.

- **admin**: Dashboard · Societies (12) · Live Metering (3) · Analytics · Inspections (8) · Reports (2) · Invoices (4) · Water Tanks (1) · Document Center · Users & Roles · Notifications (5) · Audit Log · Settings
- **socmgr**: Society Dashboard · Analytics · Inspections (2) · Reports (1) · Invoices (1) · Water Tanks (1) · Documents · Members & Roles · Notifications (4) · Settings
- **customer**: My Dashboard · Analytics · Reports (2) · Invoices (1) · Live Metering · Water Tanks · Documents · Notifications (2) · Settings
- **inspector**: My Tasks (8) · Evidence & Reports · Notifications (3) · Settings

Sidebar structure top to bottom: logo lockup (32px rounded-9px gradient tile, "FirsThing" 14/700 +
"ENERGITRACK OPS" 9px mono, letter-spacing .08em) → "VIEWING AS" role list (review-only) →
"NAVIGATION" list → footer with auth-screens link and the current user chip (28px circle initials,
name 11.5/600, scope line 9.5px mono).

## App shell header

Sticky, `z-index:20`, 16px/30px padding, 1px bottom border, `backdrop-filter: blur(10px)`,
background `var(--hdr)` (a per-theme translucent value — must be tokenised, not hardcoded, or it
breaks in dark themes). Contents, left to right:

1. Breadcrumb (9px mono, .09em tracking, e.g. `ADMIN / OVERVIEW`, `SOCIETY MGR · ASF INSIGNIA / SETTINGS`)
2. Page title, 21/700, letter-spacing -.5px
3. Theme swatch row (5 buttons, 24px, 7px radius, 2px ring on the active one)
4. Freshness pill — green dot with a 2.4s pulse + "FEED LIVE · 42s ago". **Global data-freshness
   indicator: if any feed is stale the shell must say so.** Dashboards never lie silently.
5. Search field (placeholder "Search societies, meters…")
6. One primary action per screen (see table below)

Header must `flex-wrap` and the title block needs `min-width:230px` so nothing collides under ~1250px.

| Screen | Primary action |
|---|---|
| Portfolio dashboard | New society |
| Society dashboard | Invite member |
| Societies | Add society |
| Live Metering | Add device |
| Analytics | Export dashboard |
| Inspections | Assign task |
| Reports | Upload report |
| Invoices | New invoice |
| Water Tanks | Add tank |
| Document Center | Upload |
| Users & Roles | Invite user |
| My Society (customer) | Download report |
| Notifications | Preferences |
| Audit Log | Export package |
| Settings | Save changes |

---

## Screens

### 1. Portfolio dashboard (admin)

**Purpose** — portfolio-wide health in one screen; every card is a link into a workflow.

**Layout** — vertical stack, 20px gaps:
1. KPI grid, `repeat(4, minmax(0,1fr))`, 14px gap, 8 tiles
2. `minmax(0,1.62fr) / minmax(0,1fr)` — savings chart + exceptions panel
3. `1fr / 1fr` — pending tasks + societies at a glance

**KPI tile** — card, 16px/17px padding, 14px radius. Label 9.5px mono .07em tracking muted; value
26/800 letter-spacing -1px; unit 11/600 muted; delta chip 10.5px mono in a semantic tint; context
note 10.5/500 muted. The 8 tiles map 1:1 to the blueprint success metrics:

| Label | Value | Delta | Note |
|---|---|---|---|
| ENERGY AVOIDED (MTD) | 412 MWh | +9.4% | vs Jun |
| BILL SAVING (MTD) | ₹34.2 L | +11% | 12 societies |
| CO₂ AVOIDED | 293 t | +8.1% | grid factor 0.71 |
| REPORT TURNAROUND | 2.4 days | −1.1d | target ≤3d |
| ACTIVE SOCIETIES | 12 / 14 | 2 onboarding | 1 suspended |
| FEED HEALTH | 92 % | 9 stale | 160 devices |
| INSPECTION CYCLE | 5.8 days | +0.6d | SLA 5d |
| INVOICE OVERDUE | ₹6.8 L | 4 invoices | oldest 41d |

> **Open question for the client, unresolved:** which of these 8 KPIs are *contractual*
> (customer-visible, immutable, auditable) versus internal ops-only. Until answered, do not expose
> FEED HEALTH or INSPECTION CYCLE on customer surfaces.

**Savings chart** — "Portfolio savings vs baseline", subtitle "kWh avoided · 12 societies ·
extrapolated from 38% metered sample". 12 stacked monthly columns, 172px tall, 9px gap. Each column:
value label 9px mono on top, then a **verified metered** segment (`linear-gradient(180deg, lime, ac)`,
radius 5px 5px 2px 2px) above an **extrapolated** segment (`--bd3`, radius 0 0 5px 5px), month letter
below. Range switcher 12M / QTR / MTD (segmented, 3px inset, active pill has a 1px shadow). Legend
below a dashed divider: "Verified metered saving" and "Extrapolated (±6.2% CI)". The two categories
must stay visually distinct and the CI must always be shown.

**Exceptions panel** — title + "7 OPEN" chip. Each row: 3px severity rail, title 12/600, meta
10.5/500 muted, age right-aligned in the severity color, tinted background and border. Sorted by
severity then age. **Exceptions rank above pending tasks — broken data outranks pending work.**
Footer button "Open exception queue". Seed rows: meter offline 3h · missing 14 intervals 6h ·
report unpublished 2d · inspection without evidence 1d · tank critical 52m.

**Pending tasks** — subtitle "Actionable — each row opens its workflow". Row: type chip (APPROVE /
PUBLISH / INGEST / CONTRACT / ASSIGN), title + who, SLA in a semantic color, CTA verb in accent.

**Societies at a glance** — subtitle "Sorted by attention needed" (never alphabetically). Row: name,
meta (units · meters), 74px savings bar with % below, status chip GOOD / ATTENTION / CRITICAL /
ONBOARDING. Header link "View all 12 →".

### 2. Society dashboard (socmgr)

Scoped equivalent of the above for a single society (ASF Insignia).

- 4 tower-level KPIs: ENERGY AVOIDED 118 MWh, BILL SAVING ₹9.10 L, CO₂ AVOIDED 84 t, FEED HEALTH 34/38
- **Your buildings** — Tower 1 / Tower 2 / Common amenities, each with meter + tank counts, savings bar, status chip
- **Your queue** — local approvals, member invites, tank-sheet upload, upcoming inspection
- **Needs attention** — 3 scoped exceptions only
- **Your access** — explicit scope / can / cannot / PII visibility, plus the note "Portfolio-wide
  figures, other societies and invoice editing stay with the FirsThing platform admin."

### 3. Societies (admin)

Left: filter chips (All 14 / Active 12 / Onboarding 2 / Suspended 1 / Bengaluru) + EXPORT CSV, then a
table `2fr 1fr 1fr 1fr 1fr .8fr` — SOCIETY (name + city), UNITS, METERS, MTD SAVING, STATUS chip, Open.

Right rail, 330px: **onboarding wizard** — "Step 3 of 6", 46% progress bar, 6-step checklist with
per-step notes and completed/current/locked styling, "Continue onboarding" button, then a TIMELINE
of onboarding actions. Steps: society profile & contacts → service agreement upload (hash stored) →
asset & meter registry → user invites & roles (blocked until meters mapped) → baseline period &
tariff (needs 30 days of readings) → go-live checklist. Status workflow:
**onboarding → active → suspended → archived**.

### 4. Live Metering (admin/customer)

- **Live load panel** on the dark shell color: title, "14 meters · 1-min interval · last packet 42s ago",
  big current value 48.2 kW (30/800), "▼ 31% VS BASELINE" in lime. 760×190 SVG: 3 gridlines, filled
  area, dashed baseline polyline, 2.4px live polyline, 4.5px head dot, hour labels 00–21.
- **Methodology panel** — "How this number is derived", 4 rows: Baseline (Jan–Mar 2026 · 90 days ·
  tariff ₹8.4/kWh) · Sample coverage (7 of 18 circuits · 38% of installed load) · Extrapolation
  (per-circuit kW ratio × installed base) · Last recompute (3 Aug 2026 02:00 IST · job #22841).
  Callout: "CONFIDENCE ±6.2% — Raw consumption is sample-only fact. Savings are extrapolated to the
  installed base and labelled as such wherever shown."
- **Device registry & feed health** — counts 148 HEALTHY / 9 STALE / 3 OFFLINE, then a 3-column card
  grid: device id (mono), status dot, name, location, current kW, freshness ("42s", "STALE 22m",
  "OFFLINE 3h") colored semantically. Includes an `ESD-` Energy Save Device row showing "−32% load".

### 5. Analytics (admin/socmgr/customer)

Derived from the client's reference dashboards. Vertical stack:

1. `repeat(3,1fr) 1.5fr` — three big-stat cards with sparklines (TOTAL CONSUMPTION 1.42 M kWh,
   ENERGY BILL ₹1.19 Cr, PEAK DEMAND 218 kVA) + **Consumption by sector** bar chart
   (HVAC & chillers 38%, Lifts & pumps 26%, Common lighting 20%, Clubhouse & misc 16%).
2. `1.7fr / 1fr` — **Where the savings come from**: four 96px conic-gradient ring gauges with a 66px
   card-colored hole and the % in the center (HVAC setpoint control 38% / 156 MWh, Lighting schedules
   19% / 78 MWh, Energy Save Device 34% / 140 MWh, Pump optimisation 9% / 38 MWh). Beside it
   **Supply mix**: 132px conic-gradient donut + legend (Grid 61%, Rooftop solar 24%, DG 9%, Avoided by ESD 6%).
3. `1.5fr / 1fr` — **Grid outages & DG run time**: dual-series 640×180 SVG, cut counts as a .55-opacity
   area plus a duration line, 12 month labels, legend. Beside it **Effective tariff paid**: 4 stacked
   bars (2023–2026) with the value printed inside each segment.
4. **Per-circuit series · last 24h** — Grafana-style table `1.5fr 2.2fr repeat(4,.6fr)`: circuit
   (color key + name + id), 300×32 sparkline, MIN / MAX / MEAN / LAST. Link "OPEN IN EXPLORER →".

### 6. Inspections (admin) + inspector field app

**Workflow: Planned → Assigned → In Progress → Submitted → Reviewed → Closed.**

Admin side: 6 stage tiles with counts and a 3px colored top border (6 / 8 / 3 / 4 / 2 / 27), then a
task table `1.6fr 1fr 1fr .9fr .7fr` — title + task id, society, assignee (initials avatar + name),
stage chip, evidence count (or "MISSING" in the error color).

Inspector field app, rendered in a 330px phone frame (10px bezel, 38px outer / 30px inner radius):
- Status bar with an **"OFFLINE · 2 QUEUED"** chip
- Task header: "DG room · Block C", "INSP-2481 · Settl. Nexus · geo-tagged", 62% progress
- Checklist cards, each with a 20px state box (pass / fail / empty), question, and a hint line that
  doubles as the result ("PASS · 0.4 Ω", "FAIL · photo evidence required", "ENTER kW · timestamp auto",
  "NOT STARTED"). A failed item expands an evidence row: two 52px striped photo placeholders + a
  dashed "+" tile. **Mandatory evidence for critical checklist items.**
- Actions: "Save draft" (secondary) and "Submit for review" (primary, flex 1.4), plus
  "Syncs automatically when signal returns". **Offline-capable entry with sync retry is required.**

### 7. Reports

Tabs: All reports / Savings / Inspection / Awaiting me (2). Table `1.8fr 1fr .8fr .9fr .7fr` —
title + meta (`SAVINGS · period 2026-07`), society, version, status chip, CTA.
Statuses: **DRAFT → IN REVIEW → APPROVED → PUBLISHED**.

Right rail: **approval workflow** rail (dot + connector per step: draft created → data validation
passed → in review with SLA → approve & publish, with "Locks v2 · notifies 3 customer users"), the
note "Published versions are immutable. Corrections create v2 and keep v1 downloadable for audit.",
and an **audit trail** list (actor, timestamp, IP).

### 8. Invoices — view and download only

Aging strip, 5 tiles with a 3px left accent: ISSUED ₹18.4L (11) · DUE ≤30D ₹9.2L (6) ·
OVERDUE 31–60D ₹4.6L (3) · OVERDUE 60D+ ₹2.2L (1) · PAID (MTD) ₹27.9L (19).

Table `1fr 1.5fr 1fr 1fr 1fr .8fr` — invoice no (`FT/26-27/0184`), society + **file hash**
(`sha256 a91f…4c2`), amount, due date (red when overdue), status chip, CTA (Remind / Escalate /
Receipt / Open case). Header shows FY and "SEND REMINDERS (4)".
Statuses: **ISSUED → DUE → OVERDUE → DISPUTED → PAID**. Immutable files + hash reference; due-date
reminders at T-7, T-1, then overdue. No payment UI.

### 9. Water Tanks — IoT + manual Excel

Card grid, 3 columns. Each card: 46px × 118px tank glass (2px border, 8px radius) with a bottom-anchored
fill whose height equals the level and whose gradient carries the status color, plus a dashed threshold
line at 32%. Beside it: tank name, society/block, % 24/800, volume ("16,400 / 20,000 L"), a
**reading-source line** (dot + "IoT SENSOR · 15 MIN" or "MANUAL SHEET · 2 AUG 18:05"), and a status
chip GOOD / NEEDS ATTENTION / CRITICAL 52M / MANUAL ENTRY.

Right rail:
- **Reading sources** — "Both paths feed the same series — manual rows are flagged and never overwrite
  a sensor reading." Two counters (IoT SENSOR 18 · 15-min interval; MANUAL / EXCEL 7 · daily log sheet),
  a dashed dropzone ("Drop the daily tank sheet here", ".xlsx / .csv · validated against the tank
  registry before import", "Upload sheet"), and the last 3 imports with OK / WARN / FAIL chips and
  reasons ("42 rows · 0 rejected", "3 out of range", "unknown tank id in row 12").
- **Alerts & escalation** — "Critical > 45 min escalates to the society manager", event log,
  "Manage alert subscriptions".

### 10. Document Center

230px folder tree (All documents 482, per-society, nested per-module counts) + a search field,
metadata filter chips (`PERIOD 2026-07`, `TYPE: SAVINGS`, `PUBLISHED`, `+ FILTER`) and a 4-column
card grid. Card: 96px striped thumbnail labelled by kind (PDF · REPORT, IMG · EVIDENCE, CSV · READINGS),
filename, meta ("2 AUG · 1.4 MB · SIGNED URL", "GEO-TAGGED", "IMMUTABLE"). Downloads go through
**signed URLs** that expire.

### 11. Users & Roles

Permission matrix `1.4fr repeat(5, minmax(0,1fr))` rendering the table above as 38px-wide chips
(ALL / EDIT / VIEW / PUBLISH / APPROVE / SUBMIT / SCOPED / MASKED / SELF / —), tinted by strength.

Right: **Invite user** form (email, ROLE (REQUIRED), society scope, notification default) with the
warning "Role is mandatory before dashboard access. Invite expires in 7 days; resend is rate-limited.",
and **Recent role changes**. User lifecycle: **invited → activated → role set → society mapped → active**.

### 12. Notifications

Filter tabs (All / Critical (2) / Reports / Invoices / Inspections) + MARK ALL READ. Each item: 3px
severity rail, kind chip (CRITICAL / APPROVAL / INVOICE / INSPECTION / REPORT / DIGEST), title, body,
then timestamp · channels ("IN-APP + EMAIL"). Critical rows get a tinted background. CTA verb on the right.

Right rail: **Your preferences** — per-user, per-channel toggles (in-app "ALWAYS ON FOR CRITICAL",
email, digest mode, invoice reminders "T-7, T-1, THEN OVERDUE", WhatsApp shown disabled as
"PHASE 3 ROADMAP · NOT AVAILABLE"), note "Digest mode batches non-critical items into one daily
08:00 IST summary."; and **Delivery log** with SENT / RETRY 2/3 states.
**Critical alerts cannot be muted.**

### 13. Audit Log

4 stat tiles (EVENTS (30 DAYS) 14,822 "append-only, hash-chained" · PRIVILEGED ACTIONS 68 ·
FAILED AUTHORISATIONS 11 "blocked by row-level policy" · RETENTION 7 yrs). Filter chips + EXPORT
COMPLIANCE PACKAGE. Table `1fr 1.1fr .9fr 1.6fr .8fr` — TIMESTAMP (IST), ACTOR (name + role),
ACTION chip (ESCALATE / SUBMIT / IMPORT / REJECT / ROLE CHANGE / DENIED / UPDATE / UPLOAD / UNPUBLISH),
TARGET + before→after diff, SOURCE IP. Footer: "APPEND-ONLY — Entries cannot be edited or deleted by
any role. Retention: 7 years, then archived to cold storage."

### 14. Settings

Two columns.
- **Appearance** — "Saved per user and remembered on this device and next sign-in. Does not affect
  anyone else in your society." 5 theme cards in `repeat(auto-fit, minmax(112px,1fr))` (must auto-fit;
  a fixed 5-track grid clips the labels below ~1250px), each a 52px split-gradient preview + wrapping label.
- **Reporting defaults** — reporting frequency MONTHLY, report SLA 3 DAYS, timezone IST (UTC+5:30),
  financial year APR–MAR, tank critical escalation 45 MIN.
- **Integrations & data** — EnergiTrack device gateway (CONNECTED, "160 devices · 1-min interval ·
  MQTT ingest"), Excel/CSV tank log import (ENABLED), Transactional email (CONNECTED),
  WhatsApp Business (PLANNED, Phase 3), Enterprise SSO SAML (PLANNED, Phase D).
- **Language** — English (IN) active; "हिन्दी · later phase" shown in a dashed disabled chip.
- **Society lifecycle** — Suspend (users keep read access to published artifacts only) · Archive
  (freezes data, reversible within 30 days by a platform admin) · Export everything.

### 15. Customer dashboard (mobile-first) + Auth

**Customer** — dark gradient hero: "YOUR SAVINGS · JULY 2026", ₹2,84,600 at 46/800 letter-spacing -2px,
"saved this month across 184 units", then a divided trio 38,412 kWh AVOIDED / 27.3 t CO₂ AVOIDED /
31% VS BASELINE, and a footer strip "EXTRAPOLATED ±6.2% · From 7 metered circuits · how we calculate this"
(the methodology link must always be present). Then 3 status cards using **only** the words
**Good / Needs attention / Critical**, then Latest reports (PDF chip + Download) and Invoices
(amount + DUE/PAID chip). A 330px phone frame shows the same hierarchy with a 4-item tab bar.
Requirement: **≤3 taps to any report or invoice**.

**Auth** — three panels: sign-in (work email, "Send one-time code", "Use password instead", note that
SSO is Phase D); first-login profile completion (name, OTP-verified mobile, role locked, society locked,
"Your role was set by the platform admin and cannot be changed here. Sign-in events are logged.");
and a dark **session & security log** (current session, revocable field-app session, password reset,
failed sign-in ×3 with BLOCK, role change).

---

## Interactions & Behavior

- **Navigation** — clicking a sidebar item swaps the content region; each screen mounts with
  `fthFade` (`opacity 0 → 1`, `translateY(6px) → 0`, 300ms ease). Role change resets to that role's home screen.
- **Freshness dot** — `fthPulse`, opacity .35 → 1 → .35, 2.4s ease-in-out, infinite.
- **Theme change** — instant; writes `localStorage['fth-theme']` and syncs `document.body.style.background`.
  On load, the stored value is validated against the allow-list before use. Persist per user account server-side too.
- **Hover/active** — every actionable row exposes an accent-colored verb; rows are whole-row link targets.
- **Responsive** — the header wraps; KPI and card grids should collapse 4 → 2 → 1. The customer surface
  is **mobile-first**; the admin surface is desktop-optimised (design width 1440). The inspector
  surface is mobile-only. Hit targets ≥44px on mobile.
- **Required states for every list and panel** (from the wireframes): **loading skeleton**,
  **empty with what + how to fix** ("No published reports yet — upload the first one"),
  **error with cause + retry** ("Ingestion failed for batch #8841 · Retry"), and
  **degraded with a stale-data banner** ("Showing data from 22 min ago").
- **Validation** — invite requires a role; tank sheet import validates every row against the tank
  registry and reports rejected rows; inspection submit blocks when a critical item lacks evidence.

## State Management

Design-level state in the prototype: `role`, `screen`, `theme`. In production:

- Session/role/society-scope from Supabase Auth + a profile/role mapping table (never client-trusted).
- Server state via TanStack Query per module (societies, meters, readings, reports, invoices,
  inspections, tanks, notifications, audit). Dashboard aggregates come from precomputed
  materialized views; time-series from a dedicated interval table.
- Optimistic updates only for local UI (read/unread, filters). Never for publish, approve or import.
- Inspector app needs an offline queue (local persistence + idempotent retry with a visible queue count).
- Ingestion must be idempotent; data-quality flags (missing intervals, outliers, stale feeds) are
  first-class fields that the UI reads, and every metering widget renders a last-updated value.

## Design Tokens

The design runs entirely on CSS custom properties, with **5 themes** selected by a `data-theme`
attribute on the app root. Map these onto the codebase's Tailwind theme rather than hardcoding hex.

Token names: `hdr, bg, card, card2, card3, bd, bd2, bd3, g, ink, m1, m2, sh, shgrad, sh2, shink,
shm1, shm2, ac, okf, lime, limeink, pos, onac, okb, wb, wf, bb, bf, ib, if, pb, pbd, pf, wb2, wbd2,
bb2, bbd2, blue, blue2, purple, amber, amber2, terra2`

Meaning: `bg` canvas · `card/card2/card3` surfaces · `bd/bd2/bd3` borders light→strong · `g` mid grey ·
`ink` primary text · `m1/m2` secondary/tertiary text · `sh*` sidebar shell · `ac` primary action ·
`onac` text on primary · `lime` highlight/active nav · `limeink` text on highlight · `pos` positive
data · `okb/okf, wb/wf, bb/bf, ib/if` semantic chip background/foreground pairs (success, warning,
error, info) · `pb/pbd/pf` info-panel triplet · `wb2/wbd2, bb2/bbd2` soft warning/error row tints ·
`blue, blue2, purple, amber, amber2, terra2` categorical chart hues · `hdr` translucent header backdrop.

Themes (each traceable to a reference the client supplied):

| Theme | key | canvas | card | ink | accent | highlight |
|---|---|---|---|---|---|---|
| FirsThing brand (default) | `firsthing` | #F1F0EA | #FFFFFF | #1B1E1C | #1B7A54 | #C7EF4F |
| SlideEgg light | `slideegg` | #F1F2F3 | #FFFFFF | #333F48 | #4F81A8 | #8CC63F |
| SlideTeam navy | `slideteam` | #F2F5F9 | #FFFFFF | #16304F | #1E5FA8 | #F5A623 |
| Grafana dark | `grafana` | #111217 | #181B1F | #D8D9DA | #3D71D9 | #73BF69 |
| Windora lime | `windora` | #0E110F | #171B18 | #EDF2EC | #2E7D52 | #C6F24E |

Full per-theme values live in the `<style>` block at the top of `FirsThing Platform UI.dc.html` —
copy them from there verbatim.

**Typography** — 'Plus Jakarta Sans' (400/500/600/700/800) for UI; 'JetBrains Mono' (400/500/600) for
data, ids, timestamps, labels and chips. Both from Google Fonts.

Scale in use: 46/800 (customer hero) · 30/800 · 26/800 · 24/800 · 22/800 · 21/700 (page title) ·
17/700 · 15/700 · 14/700 (card title) · 12.5/600 · 12/600 · 11.5/600 · 11/500–600 · 10.5/500 (meta) ·
9.5px mono (labels, .06–.09em tracking) · 9px mono (chips, badges). Negative tracking on display
numbers: -2px at 46, -1.2px at 30, -1px at 26, -.8px at 24, -.5px at 21.

**Spacing** — 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 26, 30px.
Page padding 26px 30px 60px. Card padding 16–22px. Grid gaps 9 / 10 / 14 / 16 / 20px.

**Radii** — 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18px; 999px pills; 26/30/38px phone frames.

**Borders** — 1px `--bd` standard; 1.5px dashed `--bd3` for dropzones; 1px dashed `--bd` for section
dividers; 3px left/top rails for severity and stage.

**Shadows** — used sparingly: `0 20px 50px -20px rgba(12,26,19,.5)` on phone frames,
`0 1px 2px rgba(0,0,0,.05)` on the active segmented control. Depth otherwise comes from borders.

**Animations** — `fthFade` 300ms ease (screen enter), `fthPulse` 2.4s ease-in-out infinite (live dot).

## Assets

No third-party image assets are used. Everything is CSS/SVG:

- Logo is a placeholder — a 32px rounded tile with a gradient and the letter "F". **Replace with the
  real FirsThing logo** (available at firsthing.earth) before implementation.
- Photo/evidence and document thumbnails are intentional striped placeholders
  (`repeating-linear-gradient(45deg, …)`) labelled with what belongs there. Swap in real media.
- Charts are hand-built SVG (polyline/polygon), CSS `conic-gradient` rings and donuts, and flex bar
  columns. Reimplement with the codebase's chart library if it has one — keep the metered vs
  extrapolated distinction, the confidence interval and the last-updated indicator.
- Icons: none. Nav and status rely on type and color. If the codebase has an icon set, adding icons
  is fine, but do not introduce a new icon language just for this feature.

## Content notes

Seed data is realistic Indian society/commercial data (Settl. Nexus HSR Layout, ASF Insignia Gurugram,
Brigade Cornerstone Whitefield, Settl. Vega Koramangala, Prestige Ferns, Godrej Aqua, Embassy Tech Sq.),
₹ amounts in lakh/crore notation, IST timestamps, FY 26–27 invoice numbering. Replace with real data;
keep the formatting conventions.

Voice: plain and specific. Customer-facing status language is restricted to **Good / Needs attention /
Critical**. Every computed metric is explainable — if a number is derived, a methodology affordance
sits next to it.

## Files

- `FirsThing Platform UI.dc.html` — hi-fi, 15 screens, 4 roles, 5 themes (visual source of truth)
- `FirsThing Platform Wireframes.dc.html` — lo-fi IA, workflow states, annotations, required states, open questions
- `FirsThing_Dashboard_Team_Onboarding_Guide_v1.0_Version2.txt` — the original product & technical blueprint
- `support.js` — runtime for the two HTML prototypes. Needed only to open them locally; **not** part of the implementation.

Open both HTML files directly in a browser. In the hi-fi file, use the sidebar "VIEWING AS" list to
switch roles and the header swatches to switch themes.

## Open questions to resolve before/while building

1. Which of the 8 portfolio KPIs are contractual (customer-visible, auditable) vs internal-only? — **blocking for the customer surface**
2. Do published reports need a structured-data representation alongside the PDF (blueprint asks for both)?
3. Escalation targets for prolonged critical tank status beyond the society manager?
4. Retention policy per artifact type — audit is 7 years; what about raw interval readings?
