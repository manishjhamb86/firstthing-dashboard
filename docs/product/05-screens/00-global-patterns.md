# Global patterns & shared components
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft
**Last updated:** 2026-08-12

Rules every screen inherits, written **before** the first screen spec so that fifty specs cannot
quietly contradict each other. A screen spec states only where it *departs* from this file.

Visual system: `../05a-theme-system.md` (DIR-02 Console, Approved 2026-08-12). Token names below
are that system's.

---

## 1. Global patterns

### 1.1 Formatting

| Pattern | Rule |
|---|---|
| **Dates** | `DD MMM YYYY` (`17 Aug 2026`). Never numeric-only — `08/07` is ambiguous between the Indian and US readings and this product has both an Indian operator and imported vendor data. |
| **Date + time** | `17 Aug 2026, 14:30`. 24-hour, no seconds unless the field is an audit timestamp, which shows `17 Aug 2026, 14:30:52 IST`. |
| **Timezone** | Asia/Kolkata (IST) everywhere, always. Single-country product (CON-07 scope); no per-user timezone. Stored UTC, rendered IST. Audit rows name the zone explicitly; nothing else does. |
| **Months** | `"YYYY-MM"` stored, `MMMM YYYY` (`July 2026`) displayed — the existing `src/lib/format-month.ts` convention, kept. The month is **always an explicit selection, never inferred** (CON-25). |
| **Currency** | `₹` prefix, Indian digit grouping (`₹19,24,860` — lakh/crore, not thousands). Whole rupees in tables and totals; paise only on an invoice line that carries them. Never abbreviate to `19.2L` in a billing context; the portfolio KPI strip may, and marks it. |
| **Percentages** | 1 decimal (`67.1%`). Variance carries an explicit sign (`−1.9%`, `+2.4%`) and uses U+2212 minus, not a hyphen, so it aligns in a tabular column. |
| **Energy** | kWh, no decimal above 1,000; 1 decimal below. Always unit-suffixed — a bare number in this product is ambiguous between kWh, rupees and percent. |
| **Counts of things** | Plain integers, tabular. `31 / 31` for coverage-style ratios. |
| **Absent values** | Right-aligned em-dash `—` in `--text-subtle`. **Never `0`, never blank.** A zero in a savings column is a claim; a gap is a gap. |
| **Not-yet-tracked values** | `— Not yet tracked`, not a fabricated number. Established on the admin portfolio dashboard and kept. |
| **Truncation** | Society and person names truncate at 40ch with an ellipsis and a `title` attribute carrying the full value. Free text in a table cell truncates to one line; the full value is on the detail screen, never in a tooltip alone. |
| **Numbers in columns** | `font-variant-numeric: tabular-nums` and the mono face, always. Any figure a person compares down a column is mono (§3.3 of the theme). |

### 1.2 Interaction

| Pattern | Rule |
|---|---|
| **Toast vs inline vs dialog** | Toast for a completed action the person can walk away from ("Month approved"). Inline, next to the field, for anything they must fix. Blocking dialog only for destructive or irreversible actions. Never a toast for an error the person has to act on. |
| **Destructive confirmation** | Modal naming the object and the consequence, with the verb repeated on the confirm button ("Void and create v2", never "OK"). Where the record is immutable (invoices, INV-03), the dialog says so and describes what will actually happen instead. |
| **Undo** | Preferred over confirmation wherever the action is reversible; a 10-second toast with Undo. Not available on anything that sends email (CON-39) or writes an audit row. |
| **Loading over 500ms** | Skeleton matching the eventual layout, never a centred spinner on a full page. Under 500ms, nothing — a flash of skeleton is worse than a brief wait. |
| **Slow actions** | Any action over ~2s becomes a background job with a toast on completion; the button shows an inline spinner and stays disabled meanwhile. Monthly calculation (HL-01) and bulk upload (FEAT-099) are always background. |
| **Optimistic vs pessimistic** | Pessimistic for anything touching money, benchmarks, contracts or audit rows — the person must see the server agreed. Optimistic only for cheap, local, reversible UI state (filters, sort, selection, read/unread). |
| **Unsaved changes** | Browser `beforeunload` plus an in-app dialog on route change. Field surface (SUR-02) never warns — it **persists the draft locally** instead (XC-02), because a technician in a basement should not be asked to decide. |
| **Session expiry** | Modal over the current screen preserving all state; re-authenticate in place and continue. Never a redirect that loses a half-filled survey. |
| **Permission denied** | Actions the person lacks are **hidden**, not disabled, except where their absence would be confusing — then disabled with a tooltip naming the permission. Route-level denial is SCR-221. |
| **Live update** | Nothing polls by default. Only screens with a genuine freshness requirement refresh (named per screen), and a refreshed value never animates into place. A freshness pill in the header states when the data was read. |
| **Bulk selection** | Checkbox column, header checkbox selects the filtered page only, and a bar states exactly what is selected ("2 societies selected") with the actions and a Clear. Selecting across pages is never implicit. |
| **Sort & filter persistence** | Persist per user per screen for the session; do not persist across sessions. Filters are reflected in the URL so a state can be shared with a colleague — this matters in ops handover. |
| **Keyboard** | Every action reachable without a mouse. `/` focuses search on list screens, `Esc` closes any overlay, `Enter` submits a focused form. No other global shortcuts — an ops tool with invented chords is a training burden. |

### 1.3 States — the seven rows

Every screen spec fills all seven or states why a row cannot occur.

| State | Global default |
|---|---|
| **Loading** | Layout-matched skeleton after 500ms. |
| **Empty — first use** | Explains what will appear here and offers the action that creates the first one. Never just "No data". |
| **Empty — filtered to nothing** | Names the filter that excluded everything and offers to clear it. Distinct copy from first-use — conflating them is the most common list-screen defect. |
| **Partial / stale** | Banner in the `info` tone stating what is missing and when the data was read. INV-06 requires this on every list; it is not optional. |
| **Error — network** | Inline, retryable, and the screen keeps whatever it already had. Never replaces loaded content with an error page. |
| **Error — permission** | Inline where a region is denied; SCR-221 where the whole screen is. |
| **Success** | Toast, plus the row or record visibly reflecting the new state. |

### 1.4 Copy

Written from the reader's side of the screen, and the reader differs by surface.

| Surface | Register |
|---|---|
| SUR-01 back office | Ops language. "Out of band", "actual-metered", "second-month breach" — precise domain terms the team uses daily. |
| SUR-01 society portal | Plain language, no jargon. "Being reviewed", not "in deviation review". Never expose a state-machine value verbatim. |
| SUR-02 field | Imperative and short. "Photograph the meter", not "Meter photograph capture". Assume one hand, poor light, bad signal. |

Rules everywhere: active voice; a button says what happens and the confirmation echoes it; an error
says what went wrong **and** what to do; no apologies; never blame the person.

### 1.5 Non-functional defaults

| Pattern | Rule |
|---|---|
| **Load target** | Back-office list ≤1.5s to first meaningful paint on a desk connection; field screen ≤2.5s on 3G. Past target, the skeleton stays — never a blank screen. |
| **Data volume** | Society lists cap around 40 today (CON-07 minimum 1,000 flats limits the addressable set), so tables paginate at 50 and do not virtualize. Reading rows are the exception — a month of per-circuit readings across a portfolio is tens of thousands and is never rendered raw; it is always aggregated. |
| **Responsive** | Back office is desk-first, usable to 1024px, degrading to a stacked card list below 768px rather than a horizontally-scrolling table. Portal is responsive to 360px. Field is phone-first and never assumes desk. |
| **Touch targets** | 44×44 minimum on SUR-02 and the portal — the `.roomy` density. Console density is desk-and-mouse only. |
| **Accessibility** | WCAG 2.2 AA. Contrast verified in the theme system §3.9. Focus visible on every interactive element, logical focus order, form fields labelled (never placeholder-only — an existing decision, kept), status announced to screen readers via a live region. |
| **Offline** | Back office and portal: online-only, with a clear offline banner. Field: offline-tolerant per XC-02, detailed in `05-field.md`. |
| **Audit** | Every write to a contract, benchmark, invoice, reading or permission produces an audit row (INV-03, INV-07, XC-04) visible on SCR-234. Screens do not opt out of this; they only decide whether to surface it inline. |

---

## 2. Shared components

Specified once here and referenced by ID, so the same table does not behave three ways in three
places. All are compositions of the theme system's primitives (`../05a-theme-system.md` §3.7).

| ID | Component | Used on | Behaviour | States | Variants |
|---|---|---|---|---|---|
| CMP-01 | **Data table** | most list screens | Sort by any column, filter chips above, paginate at 50, optional bulk-select column, optional row risk-accent, optional footer totals | loading / empty-first / empty-filtered / stale / error | console (36px row), roomy (48px) |
| CMP-02 | **Status chip** | everywhere | Renders a domain state in one of five tones with a label and a shape | — | ok / warn / bad / info / neutral |
| CMP-03 | **KPI tile strip** | ops home, readiness, portfolio, portal home | 2–4 figures with label, value, and a sub-line; a value that cannot be computed shows `— Not yet tracked` | loading / value / untracked | — |
| CMP-04 | **Filter bar** | list screens | Chips for enumerable facets, typeahead combobox for society, `<input type=month>` for period; reflected in the URL | — | — |
| CMP-05 | **Society picker** | anywhere a society is chosen | Typeahead over `Society.name`, keyboard-navigable, shows city as secondary text; offers quick-create only where the spec says so | idle / searching / no-match / selected | with-quick-create, without |
| CMP-06 | **Period picker** | monthly loop screens | `<input type=month>`, defaults to the open close-period, never inferred from content (CON-25) | — | — |
| CMP-07 | **File dropzone** | every upload | Drag-and-drop plus browse, states the accepted types and size cap, shows per-file progress, refuses unsupported types with a named reason | idle / over / uploading / done / rejected | single, multiple |
| CMP-08 | **Document viewer** | invoice, report, agreement, certificate | Embedded PDF/image with download; never the only route to the data where the data is also structured | loading / rendered / unavailable | — |
| CMP-09 | **Per-circuit table** | commissioning, compliance, deviation, contract, offer | The product's signature table — one row per circuit, benchmark vs measured vs variance vs basis, mixed `fixed`/`actual-metered` rows in one view | loading / empty / mixed-basis | editable (offer), read-only (compliance) |
| CMP-10 | **Timeline / audit strip** | contract, ticket, dispute, deviation, society 360 | Append-only reverse-chronological list of events with actor, timestamp and a link to the record | loading / empty / error | compact, full |
| CMP-11 | **Comment & attachment thread** | ticket, support thread, deviation | Threaded notes with attachments, internal-only vs society-visible marking | loading / empty / posting / error | internal, shared |
| CMP-12 | **Approval bar** | anything requiring a decision | Sticky footer stating what is being approved, with the decision buttons and a required-reason field on rejection | idle / submitting / done | approve-only, approve-or-reject |
| CMP-13 | **Escalation banner** | ticket, visit, thread, arrears | States which SLA is breached, by how long, and who it escalated to (XC-03) | none / approaching / breached | — |
| CMP-14 | **Offline / sync-pending bar** | every SUR-02 screen | Persistent bar showing connectivity and the count of queued writes, expandable to the queue (XC-02) | online / offline / syncing / conflict | — |
| CMP-15 | **Photo capture tile** | survey, install, meter, gate pass, certificate | Camera or file, thumbnail grid, retake, required-count indicator, stores locally until synced | empty / captured / uploading / failed | required, optional |
| CMP-16 | **Signature capture** | gate pass, completion certificate, batch review | Draw-to-sign with name and timestamp, clears and retakes, produces an immutable image | empty / signed / error | — |
| CMP-17 | **Freshness pill** | any screen showing computed or polled data | States when the underlying data was read and whether a job is mid-run | fresh / stale / running | — |
| CMP-18 | **Empty state** | every list | Icon, one-line explanation, and the action that resolves it; distinct copy for first-use vs filtered | first-use / filtered / error | — |

---

## 3. What this file does not settle

- **Charts** — *resolved 2026-08-12.* CMP-03 covers figures, not plots; the plot system now exists
  as `../05a-theme-system.md` §3.10 (semantic roles, a six-hue series palette, and the rules that
  keep a series legible without colour). Added when SCR-081 and SCR-110 reached for it rather than
  invented per screen. A chart-bearing screen references those roles; it does not define colours.
- **The savings-report PDF.** Print, not screen, and a distinct artifact from SCR-091.
- **Email templates.** CAP-22 / FEAT-090. Each template is a unit the method counts as a screen,
  and they are priority 3 (SCR-236) — not in this run.
