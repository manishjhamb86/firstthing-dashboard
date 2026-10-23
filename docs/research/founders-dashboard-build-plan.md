# Founders' page: build plan and acceptance checklist

Hand-off for whoever builds `/admin/founders`. Written 2026-10-22 after two research passes; the
verifier will check the finished work against the checklist at the bottom.

Read first, in this order:
1. `docs/research/reports/Founder operations dashboard.md` (the design; its notes are in
   `docs/research/research_notes/Founder operations dashboard/`).
2. This file (decisions made since, and what is already done).
3. `CLAUDE.md` / `AGENTS.md` (invariants INV-01..09, Research Gate, validation set).

## Decisions made by the owner

- **Route:** a NEW page `/admin/founders`, not an extension of `/admin` (Portfolio). Portfolio stays as is.
- **Access:** new `AdminPermission` `view_founder_dashboard`, granted to Manish and Yogesh via `/admin/users`.
  Page uses `requireAdminPage("view_founder_dashboard")`; sidebar item uses the same check.
  No hard-coded email list.
- **Users:** Manish has no `AdminUser` row in the repo. Creating his account is data work done in `/admin/users`, not code.
- **Open (not yet decided; do not invent answers, surface them in the UI/notes):**
  complaint and meter-alert thresholds are PROPOSED; whether retail invoices count in payment totals
  (default: separate small line, not silently included); deal-stage ageing is OUT of v1 (needs a `stageEnteredAt` migration).

## Already done (branch `feat/leadership-dashboard-blocks`, uncommitted when this was written)

- `prisma/schema.prisma`: `view_founder_dashboard` added to `AdminPermission`.
- `prisma/migrations/20261022210000_founder_dashboard_permission/migration.sql` (file only; NOT yet applied to the shared dev DB).
- `src/app/admin/users/permission-options.ts`: option for the new permission.
- `src/lib/lateness.ts` + `tests/lateness.test.ts` (33 tests): every "not on time" threshold in one table. Reuse it; do not re-derive lateness in loaders or components.
- Validation at that point: `tsc`, `eslint`, full `pnpm test` (1551) all clean.

## Still to build

1. **Apply the migration** (`pnpm prisma migrate deploy`, lands on the SHARED dev DB), then restart `next dev` and the worker.
2. **Loaders**, each `cache()`-wrapped, all reads filter `voidedAt: null`:
   - `src/lib/payment-summary.ts`: received this month (by `confirmedAsOf`), outstanding, overdue in rupees; aging buckets via `agingBucket()`;
     top five overdue societies incl. defaulters (marked). Use `settledTotal()` so TDS counts as settlement. Defaulter societies are REMOVED from `openNotifications()`; read them separately (`defaulterSocietyIds`).
     Show the CON-13 phase (overdue/warning/suspended) as a separate line from "past due".
   - `src/lib/installation-board.ts`: projects not complete, installed vs contracted lights, next planned day, day gates via `evaluateDayGateChain()` mapped through `installationDayLateness()`.
   - `src/lib/demo-board.ts`: lift the demo-monitoring query into a shared loader; counts per step; reviews via `demoReviewLateness()`, windows via `demoWindowLateness()`, replacement days via `replacementDayLateness()`.
   - Complaints: query `Ticket` directly, include `in_progress` (the feed omits it); exclude `HelpReport` and `MarketingEnquiry` from the count. Use `ticketLateness()`.
   - Meters: `meterAlert.findMany({ closedAt: null })`, use `meterAlertLateness()`. Silent meters have no alert row, so also read `MeterRow.state` if "silent" is shown.
   - Meetings: lift the assignee-or-attendee query from `src/app/admin/your-tasks.tsx` into a shared helper and have both use it.
3. **Page** `src/app/admin/founders/page.tsx` (Server Component, `page.tsx` + `actions.ts` convention):
   `PageHeader` with a late-count chip; summary strip in words where each count jumps to its rows; the **Not on time** list
   (never collapsed, sorted red-then-amber then by `sortLate`, one row grammar: type icon+word, society+item, clock in words,
   chip with a word, a NAMED owner, next action as a verb link, one row per society per type); meetings strip; then a 7/5 grid of cards
   (Payments, Meters, Installations, Complaints, Demos). Late list and meetings render first; slower cards each in their own `<Suspense>` with a skeleton and a try/catch degraded card.
4. **Sidebar item** in `src/components/app-shell.tsx`, gated by `view_founder_dashboard`.
5. **Tests**: pure logic for any merging/ordering (`tests/` style: `now` injected, no DB, no mocks).

## Constraints that must hold

- Only tint warn/bad numbers (`--warn-*`, `--bad-*`); healthy numbers plain. Use CSS tokens and the shared classes in `src/components/ui.tsx`
  (`Card`, `StatRow`, `Stat`, `PageHeader`, `EmptyState`, `StatusChip`); Lucide icons only; the app has 3 themes (light, dark, slate), not 5.
- Dates only through `src/lib/format-date.ts` (eslint-enforced). No internal codes (INV-, CON-, PER-...) in any user-facing string (`tests/no-internal-codes.test.ts`).
- Every list has loading, empty, error and degraded states (INV-06). No actuation UI. Do not import recharts (installed, unused); bars are CSS/SVG.
- No `use cache` / `unstable_cache` / `cacheComponents`; fresh data per request. Check `node_modules/next/dist/docs/` before relying on any Next 16 behaviour.
- Layout: grid children `min-w-0`; one column at phone width, no sideways scroll.
- Record the route, permission and threshold decisions in `PROJECT_CONTEXT.md` (Research Gate).
- Do not push notifications for lateness in v1.

## Verification checklist (the original planner will check each)

- [ ] `view_founder_dashboard` exists in schema + migration, applied, shown on `/admin/users`; page and nav item gated by it; an admin without it is redirected.
- [ ] `/admin` Portfolio is unchanged.
- [ ] All lateness verdicts come from `src/lib/lateness.ts`; no thresholds duplicated elsewhere.
- [ ] Late list present, expanded, correctly sorted, one row grammar, named owners, one row per society per type.
- [ ] Payments: rupee received/outstanding/overdue, aging bar, top-5 incl. defaulters, TDS counted as settled, CON-13 phase separate.
- [ ] Every headline count equals the number of rows in the list it links to.
- [ ] Complaints include `in_progress`, exclude help reports and enquiries.
- [ ] Meetings use the shared "mine" helper; Join link present.
- [ ] Each card degrades independently when its query fails.
- [ ] Looks right in all three themes and at 375px width.
- [ ] `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm test` all clean.
- [ ] Open decisions above are surfaced, not silently decided.
