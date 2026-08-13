# SUR-01 society portal — the only surface an RWA ever sees
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft — all 7 priority-1 specified
**Last updated:** 2026-08-13

The customer-facing half of SUR-01. Everything here is read by a committee member on their own
phone or laptop, usually once a month, often years into a contract they did not personally sign.
FLOW-16 states the success condition in five words: *the committee believes the number.*

Global rules: [`00-global-patterns.md`](00-global-patterns.md). Visual system:
[`../05a-theme-system.md`](../05a-theme-system.md) — **this whole surface runs `.roomy`**, the
density modifier that exists precisely because a console is the wrong register for an RWA.

**Screens (7 priority 1):** SCR-031, 041, 051, 062, 100, 260, 261.
**Also on this surface (priority 2):** SCR-101 contract view, SCR-121 extension request, SCR-130
ticket raise, SCR-180 notification history.

---

## 0. Surface rules

### 0.1 Authority (CON-45, FEAT-108)

A society holds several named logins, not one. Three authorities, checked **server-side on the
action** — hiding a button is a courtesy, never the guarantee:

| Authority | Binding acts | Operational | Visibility |
|---|---|---|---|
| `office-bearer` | ✅ accept/decline offer, sign completion, accept amendment, dispute an invoice, manage the society's accounts | ✅ | full |
| `committee` | — | ✅ approve batches, upload KYC, raise tickets | full |
| `manager` | — | ✅ approve batches, maintain access details, raise tickets | full |

**When an action is unavailable, the screen names who can do it** — "Only an office-bearer can
accept this offer. R. Menon and S. Iyer hold that role." A disabled control with no explanation
sends someone to WhatsApp to find out why, which is where this product loses.

Every approval records the account, **the authority held at that moment**, and `capturedAt`.
Authorities change; the record must state what was true when the act happened.

### 0.2 Register

This surface is read by people who are not paid to use software. Applying `.roomy` is necessary and
not sufficient — the language changes too.

| Ops says | The portal says |
|---|---|
| Out of band | Being reviewed |
| Actual-metered basis | Billed on measured use this month |
| Deviation review | We're looking into last month's readings |
| Circuit | The lights in your basement car park |
| `representedLightCount` | The 420 lights this meter stands for |

**Never show an internal identifier.** No SCR numbers, no circuit IDs, no `FEAT-` anything, no
status enum values. A society sees a named place and a plain-English state.

### 0.3 The email carries the substance

FLOW-16's own note: *a committee that never logs in is a real and likely outcome.* Every portal
screen that matters has an emailed counterpart carrying the actual content, not a link to it
(CON-39, FEAT-091). The portal is where someone goes to check; the email is where most of them
will actually read it.

### 0.4 Trust is the product

INV-02 exists because a number a society cannot audit is a number they will dispute. On this
surface that means: every figure traces to what produced it, in one tap, in language that makes
sense without training. This is not a nice-to-have on a savings report — it is the savings report.

---

## SCR-100 — Portal home

**Features:** FEAT-088 · **Flows:** FLOW-16 (step 2) · **Personas:** PER-05, PER-06

**Purpose:** answer, in one screen, the four questions a committee actually has.
**Primary action:** none — this is a status screen. Its success is that nobody has to ask.

**Maximal visibility is the stated principle** (CAP-14, FEAT-088): cumulative savings, bill and
payment status, active tickets, and contract summary **together**, deliberately not a stripped-down
view. A portal that shows only the current month invites the phone call the portal exists to
prevent.

**The four questions:** *Are we saving what we were promised? What do we owe and by when? Is
anything wrong right now? What did we actually agree to?*

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Hero | **Cumulative saved since we started** | all months | ₹ + kWh, large | The AGM number. The one place `--signal` lime is spent on this surface |
| Hero | Months running | | "18 months" | Context for the cumulative figure |
| This month | Saving achieved vs agreed | latest released month | CMP-02 | Plain: "On track" / "Being reviewed" |
| This month | Bill, status, due date | latest invoice | CMP-02 | Paid / due / overdue with the date, never a status word alone |
| Trend | Month-by-month saving | chart, 12 months | `../05a-theme-system.md` §3.10 | With a "show as table" toggle — some committee members will want the numbers |
| Service lines | One card per active line | FEAT-039 | | GOAL-02's unified view: lighting and pumps together, not two portals |
| Attention | Anything needing them | tickets, disputes, outstanding documents, unapproved batches | CMP-01 | Empty is the good state and says so |
| Contract | Summary + link | | | Benchmark, tolerance, revenue share, term end |
| Footer | Who to contact | | | A name and a number, not a form |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Open a month | trend point or card | any authority | → SCR-261 | — | — | — |
| Open an invoice | bill card | any authority | → SCR-260 | — | — | — |
| Raise a query | footer | any authority | → SCR-130 | — | Ticket created | — |
| Manage accounts | menu | `office-bearer` only | → account list (FEAT-108) | — | — | Others see who holds the role |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | contract signed, no month billed yet | "Your lights went in on 20 August. Your first savings report lands in early October." — the model explained once, because month one is the only time it needs to be | Read the contract |
| Empty — filtered | n/a | — | — |
| Partial / stale | month released but under review | `info`: "We're checking last month's readings for the basement car park before we finalise it." | Read more |
| Error — network | load fails | Retry | Retry |
| Error — permission | no society link | SCR-221 | — |
| Success | steady state | The four answers, above the fold | — |

**Exits:** SCR-260, SCR-261, SCR-101, SCR-130, SCR-120 (their arrears view).
**Live update:** none. Monthly data does not need polling.
**Responsive:** `.roomy`, **mobile-first here** — unlike every other SUR-01 screen. A committee
member opens this on a phone from an email.
**Offline:** not supported; the email carries the substance (§0.3).
**Copy:** hero — "You've saved ₹8,42,100 in 18 months." Not "cumulative savings to date".
**Open questions:** ASSUM-11's split — whether PER-06 should see an operations-weighted variant of
this same screen or a different one. Specified here as the same screen with the attention panel
ordered differently; unvalidated.

---

## SCR-261 — Savings report (society view)

**Features:** FEAT-060 · **Flows:** FLOW-16 (step 3) · **Personas:** PER-05, PER-06

**Purpose:** JTBD-06 in one screen — convince a committee the number is real.
**Primary action:** understand it. Failing that, dispute it from here.

**This screen is why INV-02 exists.** FLOW-16 step 3: *a number they cannot audit is a number they
can dispute.* Every figure traces to the readings and the benchmark version that produced it, and
the trace has to be readable by someone who has never seen a kWh export.

**The mixed-basis month is the hard case**, same as its ops counterpart SCR-091. When one circuit
flipped to measured billing and three did not, the total moved for a reason no single number
explains — so the per-circuit table and its plain-language banner are not optional detail, they are
the explanation.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Month, status | | CMP-02 | |
| Headline | **What you saved** | computed | ₹ + kWh, large | Their share, first. The fee is a consequence, not the headline |
| Headline | What you paid us | | ₹ | Stated plainly on the same screen — hiding it would be the fastest way to lose trust |
| Body | Per-area breakdown | per circuit, named as places | CMP-09 `.roomy` | "Basement car park", not "Circuit 3" |
| Body | Basis per area | | CMP-02 | Plain language, always shown, so it is not a surprise the month it changes |
| Body | Mixed-basis explainer | conditional | `warn` | Why the total moved, in a sentence |
| Body | How we worked this out | method note | | Written once, well, and reused every month |
| Body | **Show me the readings** | INV-02 trace | expandable | Daily readings against the benchmark, with the chart's table toggle |
| Footer | Download PDF | | | The artefact that gets circulated and printed |
| Footer | "This doesn't look right" | | | → dispute, one tap, no hunting |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Expand the trace | "Show me the readings" | any authority | Reveals daily data and the benchmark version | — | — | — |
| Download PDF | button | any authority | The print artefact | — | Download | — |
| Ask a question | footer | any authority | → SCR-130, this month attached | — | Ticket | — |
| **Dispute** | footer | `office-bearer` only | Formal dispute (FEAT-102) | modal stating plainly that the arrears clock keeps running (CON-41) | Dispute logged; ops notified | Others see who can raise it |

**The dispute modal must state CON-41 honestly.** A society that disputes believing the clock has
stopped, and then gets a suspension warning, has been misled by omission. "Raising this doesn't
pause the payment due date. If you need more time, ask us and we can extend it."

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | first ever report | The model explained above the figures, once | Read |
| Empty — filtered | no reports in range | Names the range | Clear |
| Partial / stale | month under review | `info` banner: not final, and why | Wait |
| Error — network | load fails | Retry | Retry |
| Error — permission | wrong society | SCR-221 | — |
| Success | released | The figure, the breakdown, the trace | — |

**Exits:** SCR-260, SCR-100, SCR-130, SCR-101.
**Live update:** none.
**Responsive:** `.roomy`, mobile-first.
**Offline:** not supported; the PDF is the offline artefact.
**Copy:** mixed basis — "Three of your four areas were billed at the agreed rate this month. The
lift lobby was billed on what it actually used, because its readings stayed outside the agreed
range for a second month. That's why the total is different."
**Not covered by the system:** the PDF is print (`../05a-theme-system.md` §3.11).

---

## SCR-260 — Invoices (society view)

**Features:** FEAT-060 · **Flows:** FLOW-16 · **Personas:** PER-05, PER-06

**Purpose:** what we owe, what we've paid, and what each charge was for.
**Primary action:** find and download an invoice.

**Invoices are immutable (INV-03) and this screen says so.** A correction produces a v2 and both
stay on the record — which is a feature from the society's side, not an inconvenience: their own
history cannot be quietly rewritten.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Outstanding total | | ₹ | Zero is stated, not hidden |
| Filters | Year, status | CMP-04 | | |
| List | One row per invoice | CMP-01 `.roomy` | | Month, amount, due date, status, v2 marker where one exists |
| Detail | The charge, per area | linked calculation | CMP-09 | The same per-area language as SCR-261 |
| Detail | Link to that month's savings report | | | The two documents always reachable from each other |
| Detail | Payment recorded | | date + reference | So a society can see we have registered their payment |
| Detail | Download PDF | | | |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Open | row | any authority | Detail | — | — | — |
| Download | button | any authority | The Zoho PDF | — | Download | — |
| See the savings report | detail | any authority | → SCR-261 | — | — | — |
| **Dispute** | detail | `office-bearer` only | FEAT-102, same CON-41 modal as SCR-261 | modal | Dispute logged | Others see who can |
| Ask about a payment | detail | any authority | → SCR-130 | — | Ticket | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | not yet billed | "Your first invoice comes after your first full month." | — |
| Empty — filtered | filter excludes all | Names the filter | Clear |
| Partial / stale | payment recorded manually, may lag | Freshness note: "Payments are updated when we reconcile, usually within a day." | — |
| Error — network | load fails | Retry | Retry |
| Error — permission | wrong society | SCR-221 | — |
| Success | loaded | List with the outstanding total | — |

**Exits:** SCR-261, SCR-100, SCR-130, SCR-121.
**Live update:** none.
**Responsive:** `.roomy`, mobile-first; rows become cards below 600px.
**Offline:** not supported.
**Copy:** v2 — "This invoice was corrected on 3 September. Both versions are here."

---

## SCR-051 — Offer view & response

**Features:** FEAT-028 · **Flows:** FLOW-06 · **Personas:** PER-05

**Purpose:** present the commercial offer and take the society's answer.
**Primary action:** accept or decline — **office-bearer only**, and this is the sharpest instance
of CON-45 in the product.

**The per-circuit benchmark table is the offer.** Since CON-11, the contract carries a benchmark
per light type, not one society figure, and this screen is where a committee first meets that
structure. Presenting it as a single headline percentage would be a misrepresentation of what they
are signing.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Offer reference, valid until | | CMP-02 | Expiry visible from the top |
| Summary | Zero upfront cost | | | The commercial wedge, stated first because it is the thing that gets forgotten |
| Summary | Revenue share | | "You keep 58%, we take 42% of what's saved" | Plain, both sides |
| Table | **Per-area benchmark** | SCR-050 | CMP-09 `.roomy` | Each area, its lights, its agreed saving %, its tolerance |
| Body | What a benchmark means | | | Explained once, plainly, on the screen where it first matters |
| Body | What happens if we miss it | CON-01c | | The measured-billing consequence, stated before signing rather than discovered in month seven |
| Body | Term, exclusions, what we own | | | |
| Body | Estimated monthly saving | modelled | ₹ range | Labelled an estimate, with what it assumes |
| Action | Accept / decline / ask | | | |

**Stating the downside before signature is deliberate.** CON-01c's flip to measured billing is the
single most likely source of a future dispute. A society told about it at offer stage disputes far
less than one who meets it in an invoice.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| **Accept** | primary | `office-bearer` only | Records acceptance with account, authority and `capturedAt`; → agreement | modal restating the share, the term and the measured-billing rule | Ops notified; FLOW-06 continues | Other authorities: disabled, naming who can |
| **Decline** | secondary | `office-bearer` only | Records with a reason | reason required | Deal → closed/lost (FEAT-095) | — |
| Ask a question | button | any authority | → SCR-130, offer attached | — | Ticket; the offer stays open | — |
| Request changes | button | any authority | Note to ops; does not decline | note required | Ops notified | — |
| Download | button | any authority | PDF of the offer | — | Download | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | n/a — reached from a notification | — | — |
| Open | live offer | Full offer, accept enabled for office-bearers | Accept, decline, ask |
| **No authority** | committee or manager viewing | Everything visible; accept and decline disabled, naming the office-bearers | Ask, forward |
| Expiring | within 7 days of expiry | `warn` with the date | Accept, ask |
| Expired | past expiry | Read-only; "Ask us to reissue this" | Ask |
| Partial / stale | superseded by a new offer | Read-only, pointing at the current one | Open current |
| Error — network | action fails | Retry; nothing recorded | Retry |
| Error — permission | wrong society | SCR-221 | — |
| Success | accepted | Confirmation, what happens next, and by when | — |

**Exits:** SCR-041 (KYC), SCR-100, SCR-130, SCR-101.
**Live update:** none.
**Responsive:** `.roomy`, mobile-first. The benchmark table scrolls horizontally rather than
collapsing — a committee needs to compare areas side by side.
**Offline:** not supported.
**Copy:** no authority — "Only an office-bearer can accept this. R. Menon and S. Iyer can — forward
it to them, or ask us a question first."
**Resolved 2026-08-13 (user's confirmation), previously an open question:** acceptance here is an
**indication of intent**, and the physically signed agreement (FLOW-06, SCR-052) remains the
binding instrument. This was the spec's provisional reading and is now confirmed, so three things
follow and are settled rather than assumed: SCR-052 stays a **mandatory gate** in the deal flow
rather than becoming a record of something already agreed; **no signature is captured in the
portal**, so CMP-16 stays a field-surface component only; and the screen must keep saying so in as
many words — "Accepting here tells us to prepare the agreement. The signed agreement is what binds
either of us — this is not a signature." A committee that believed one tap had committed them to
seven years would have been misled by omission, which is the same failure mode CON-41's dispute
modal exists to prevent.

---

## SCR-041 — Document upload (KYC)

**Features:** FEAT-025 · **Flows:** FLOW-05 (step 2a) · **Personas:** PER-05

**Purpose:** let a society send the two or three documents that unblock the agreement.
**Primary action:** upload what's outstanding.

**This is one of the most common stall points in the product** (FLOW-05's own note, feeding CON-23's
follow-up counter). The screen's job is to make the outstanding list unmissable and the upload
trivially easy — and to accept that many societies will never use it at all, which is why the
backend-entry path (FLOW-05 step 2b) is mandatory to keep and is not this screen's problem to solve.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | What this unblocks | | | "We need these before we can send the agreement" — the reason, not just the ask |
| List | One row per required document | SCR-040 checklist | CMP-01 `.roomy` | Name, plain description, status, and **the rejection reason where there is one** |
| Row | Example / what good looks like | | | "A GST certificate showing the society's registered name" |
| Upload | Dropzone per item | CMP-07 | PDF, JPG, PNG | Phone camera capture is a first-class path, not a fallback |
| Footer | Who to send it to instead | | | An email address, for the society that will not use this |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Upload | dropzone or camera | any authority | Item → `received`; ops notified | none | Row updates | Wrong type → named inline before upload |
| Replace | on a rejected item | any authority | New file; item → `received` | none | Row updates | — |
| Ask what's needed | per row | any authority | → SCR-130 with the item attached | — | Ticket | — |

**Rejection reasons must reach the society here.** FLOW-05 step 3: *the reason must reach them or
they will re-send the same file.* The reason sits on the row, in their language, not in an email
they may have missed.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | nothing uploaded | The list, what each is, and why | Upload |
| Partial / stale | some verified | Progress: "2 of 3 received. We still need your latest electricity bill." | Upload |
| **Rejected** | ops rejected an item | The reason on the row, in plain language | Replace |
| Error — network | upload fails | Retry; the file is kept | Retry |
| Error — permission | wrong society | SCR-221 | — |
| Success | all verified | "That's everything. We'll send the agreement next." | — |

**Exits:** SCR-051, SCR-100, SCR-130.
**Live update:** verification status refreshes on load.
**Responsive:** `.roomy`, mobile-first — most of these are photographed on a phone.
**Offline:** not supported.
**Copy:** rejected — "The electricity bill you sent is from 2024. We need one from the last three
months."

---

## SCR-062 — Daily installation batch review

**Features:** FEAT-035 · **Flows:** FLOW-07 (step 3) · **Personas:** PER-06, PER-05

**Purpose:** let the society confirm what was actually installed today, before tomorrow starts.
**Primary action:** approve, or dispute with evidence.

**CON-21 makes this the highest-stakes routine screen on the surface.** Not approved at least
**3 hours before the next day's start** and the next day cannot begin — skippable once per project
only, with explicit backend approval. A society that does not check its email in the evening halts
a crew of technicians the following morning.

**One merged day, not three batches** (CON-44 §0.1b). Three technicians in three towers produced
three area-scoped batches; the society sees the day's work as one thing. The partition is how the
work got done and should not become something an RWA has to approve around.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Date, **deadline** | CON-21, computed | countdown, prominent | "Approve by 06:00 tomorrow or the crew can't start" |
| Summary | Total fittings installed today | all batches merged | large | |
| By area | Per area: count, location detail, photos | SCR-061 | CMP-09 `.roomy` | Named as places; the photos are the evidence they check against |
| Progress | Day N of M, running total against plan | SCR-060 | CMP-16 | So the society can see the end |
| Action | Approve / dispute | | | |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| **Approve** | primary | `office-bearer`, `committee`, or `manager` | Batch(es) → approved; records account, authority, `capturedAt`; tomorrow unblocked | none — friction here costs a crew a day | Field team notified | — |
| **Dispute** | secondary | same three | Records the disagreement with photo + location evidence (FLOW-07 step 3) | photo and location required | Ops and field notified; tomorrow blocked pending resolution | — |
| Ask a question | button | any | → SCR-130 | — | Does **not** approve, and the screen says so | — |

**Approval is deliberately low-friction and disputing is not.** Approving is the overwhelmingly
common case with a hard deadline behind it, so it takes one tap and no modal. Disputing requires a
photo and a location, because a dispute stops work and needs to be actionable by someone standing
in the building tomorrow.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | first batch | What this is and why the deadline exists, once | Approve |
| Awaiting | submitted, not reviewed | The day's work and the countdown | Approve, dispute |
| **Deadline near** | within 3 hours of the cutoff | `warn`, and ops is alerted in parallel — a silent miss is a wasted crew day | Approve |
| **Missed** | deadline passed | "Tomorrow's work is on hold." Who to call, and the once-per-project skip named as ops' decision, not theirs | Approve now, call |
| Disputed | society disputed | What was disputed and what happens next | Watch |
| Error — network | action fails | Retry; the deadline is unaffected | Retry |
| Error — permission | wrong society | SCR-221 | — |
| Success | approved | "Approved. The crew starts at 09:00 tomorrow." | — |

**Exits:** SCR-100, SCR-130, SCR-063 (via ops).
**Live update:** the countdown recomputes on load and every minute while within 3 hours.
**Responsive:** `.roomy`, **mobile-first and photo-heavy** — reviewed in the evening on a phone.
**Offline:** not supported. The email carries the counts and photos (§0.3), which for this screen
is not a nicety — it is how most approvals will actually arrive.
**Copy:** missed — "Tomorrow's work is on hold until this is approved. Call Rakesh on 98xxx to sort
it out quickly."

---

## SCR-031 — Demo report view (prospect)

**Features:** FEAT-023 · **Flows:** FLOW-04 · **Personas:** PER-05

**Purpose:** show a prospect the measured result of their own demo — the evidence the whole sale
rests on.
**Primary action:** believe it, and move to an offer.

**The only portal screen a non-customer sees.** CON-34's prospect accounts make this reachable
before any contract exists, which means it must stand alone: no assumed familiarity, no navigation
into things they cannot access, and a clear next step.

**It is a sales document made of measurements**, and the tension is exactly that. Overstate and the
first real month disappoints; understate and there is no deal. INV-02 applies here too — the figure
comes from their own building, and showing the working is more persuasive than any claim.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, demo dates | | | Their name, their building, their dates |
| Headline | **Measured saving** | SCR-024, unrounded | large | Per area where more than one was demoed |
| Working | Before: 5 days measured | | kWh/day | The actual dates |
| Working | After: 5 days measured | | kWh/day | |
| Working | What changed | old vs new fitting spec | | The physical reason, not just the number |
| Projection | What this means annually | modelled | ₹ range | Labelled an estimate, with its assumptions stated |
| Body | How this was measured | method note | | Plain language; this is the credibility of the whole model |
| Footer | What happens next | | | The path to an offer, with a named contact |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Download PDF | button | prospect account | The circulating artefact — this gets shown at a committee meeting | — | Download | — |
| Ask a question | button | prospect account | → ops, no ticket infrastructure assumed at prospect stage | — | Ops notified | — |
| Express interest | primary | prospect account | Signals readiness; advances the pipeline | none | Ops notified; FLOW-05 KYC begins | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Skeleton | — |
| Empty — first use | demo incomplete | "Measurement finishes on the 14th. We'll send this then." | — |
| Partial / stale | one area done, another running | What is measured and what is still running | Read |
| Error — network | load fails | Retry | Retry |
| Error — permission | link expired or wrong society | A plain page with a contact, **not** SCR-221's internal-looking error | Contact us |
| Success | complete | The figure, the working, the next step | Express interest |

**Exits:** SCR-051 (once an offer exists), ops contact.
**Live update:** none.
**Responsive:** `.roomy`, mobile-first; the PDF is the version that gets projected in a meeting.
**Offline:** not supported.
**Copy:** headline — "Your basement car park used 68% less electricity with the new lights. We
measured it over five days before and five days after."
**Open questions:** whether "express interest" should exist at all, or whether the next step is
always a human call. Specified as a low-commitment signal that notifies ops rather than advancing
anything automatically.

---

## Coverage

**Rendered mockups:** https://claude.ai/code/artifact/881a2e1e-e4c9-4ec0-96a9-a55916074e8e — every screen below, each with its full state set.

| Screen | Spec | Mockup | Blueprint |
|---|---|---|---|
| SCR-100 portal home | ✅ | ✅ | — |
| SCR-261 savings report (society) | ✅ | ✅ | — |
| SCR-260 invoices (society) | ✅ | ✅ | — |
| SCR-051 offer view & response | ✅ | ✅ | — |
| SCR-041 document upload (KYC) | ✅ | ✅ | — |
| SCR-062 daily batch review | ✅ | ✅ | — |
| SCR-031 demo report view | ✅ | ✅ | — |

**All 7 priority-1 portal screens specified.** Three carry CON-45's binding-act gate (SCR-051
accept/decline, SCR-261 and SCR-260 dispute); SCR-062's approval is open to all three authorities
because a hard deadline makes restricting it actively harmful.
