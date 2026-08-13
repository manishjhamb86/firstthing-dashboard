# Cross-cutting screens
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft — both priority-1 specified
**Last updated:** 2026-08-13

Screens that belong to no flow and every surface. Global rules:
[`00-global-patterns.md`](00-global-patterns.md).

**Screens (2 priority 1):** SCR-200, SCR-223.
**Also here (priority 2/3):** SCR-201 password reset, SCR-220 not found, SCR-221 no permission,
SCR-222 server error, SCR-234 audit log.

---

## SCR-200 — Sign in

**Personas:** all · **Surfaces:** SUR-01 and SUR-02 · **Constraints:** CON-46, CON-45, ASSUM-27

**Purpose:** get four quite different populations into the right place.
**Primary action:** sign in.

**One mechanism, email and password** (CON-46, the user's decision). No magic link, no OTP, no SMS
dependency — and no per-population variation in *how* you sign in, only in what happens after.

**Four populations, one form.** Ops and support (daily, desk), field staff (daily, personal phone,
often poor signal), society portal accounts (monthly, personal phone, may not have signed in for a
year), and admin users (a separate table in the shipped schema, checked before `Profile`). The form
does not ask which you are — the account determines it.

### Layout & content

| Region | Element | Format | Notes |
|---|---|---|---|
| Brand | Mark and name | | Enough that a committee member recognises where they are, from an email link |
| Form | Email | text | |
| Form | Password | password, with a reveal toggle | The reveal matters more on a phone than anyone admits |
| Form | Remember this device | checkbox, **default on** | Drives CON-46's 90-day portal session, the main mitigation for monthly users |
| Form | Sign in | primary | |
| Links | Forgot password | prominent, **not** small print | The population most likely to need it is the one least likely to hunt for it |
| Footer | Who to contact | | A human, for someone locked out entirely |

### Post-sign-in routing

Role determines destination, and getting this wrong strands people on a page they cannot use:

| Account | Lands on |
|---|---|
| Admin / ops | SCR-240 ops home |
| Support (PER-02) | SCR-131 ticket triage |
| Accountant (PER-08) | SCR-092 release queue |
| Field (PER-03, PER-04) | SCR-171 my visits |
| Society portal (any authority) | SCR-100 portal home |
| Prospect account (CON-34) | SCR-031 demo report, or a holding page if none exists yet |

A deep link is honoured after sign-in rather than discarded — a committee member following an email
link to their savings report lands on the report, not the home page.

### Sessions

| Population | Length | Why |
|---|---|---|
| Society portal | **90 days** on a remembered device | CON-46's mitigation: a monthly visitor should almost never re-authenticate |
| Ops, support, accountant | 12 hours | Desk use, shared offices |
| Field | 30 days, but **revocable and purged on sign-out** | ASSUM-27 puts cached society data on a personal phone. Long enough to survive a month of basements; short enough that a lost phone ages out |
| Admin | 12 hours | Highest privilege, shortest session |

**Signing out of the field surface is refused while unsynced work exists** (§0.1 of the field
rules) — the sign-out purges the local cache, and purging unsynced captures would lose a site visit.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Sign in | primary | anyone | Authenticates; routes by role | none | Destination above | Wrong credentials → one message that does not reveal whether the email exists |
| Forgot password | link | anyone | → SCR-201 | none | Email sent | The response is identical whether or not the account exists |
| Reveal password | toggle | anyone | Shows the field | none | — | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | submitting | Button in its loading state; the form stays filled | — |
| Empty — first use | fresh visit | The form | Sign in |
| Empty — filtered | n/a | — | — |
| **Failed** | wrong credentials | "That email and password don't match." Never "no such user" | Retry, reset |
| **Rate limited** | repeated failures | A wait, stated with its duration | Wait, reset |
| Partial / stale | expired session | Signed out with the reason stated, and the deep link preserved for after | Sign in |
| Error — network | request fails | Retry; the form keeps its contents | Retry |
| Error — permission | disabled account | "This account has been disabled." Plus who to contact | Contact |
| Success | authenticated | Routed | — |

**Exits:** every role home above, SCR-201.
**Live update:** none.
**Responsive:** mobile-first — two of the four populations are on phones.
**Offline:** **sign-in cannot work offline.** A field cold start with an empty cache and no network
is the one genuinely blocked case (§0.1) → SCR-223.
**Accessibility:** labelled fields, a single focusable error summary, and a reveal toggle that
announces its state.
**Open questions:** ASSUM-29 — whether password friction measurably suppresses portal usage. The
metric is named there: sign-in rate per society per month against report releases.

---

## SCR-223 — Offline & sync pending

**Surface:** SUR-02 · **Personas:** PER-03, PER-04 · **Constraints:** XC-02, CON-44

**Purpose:** tell someone with no signal exactly what they can still do, what is waiting, and what
is genuinely lost — which is nothing.
**Primary action:** keep working.

**Not an error screen.** Offline is the normal condition of a basement, and treating it as a failure
is how a field app teaches people to distrust it. This screen is the honest inventory: the queue,
its age, and what happens next. The field rules (§0.1) say a save that reaches the device is a save,
and this screen is where that promise is made visible.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Connection state | | CMP-14 | Offline, reconnecting, or syncing with progress |
| Header | Last successful sync | | relative + absolute | "14 minutes ago, 15:42" — both, because relative alone is useless in a log |
| Queue | Pending items, oldest first | CMP-01 `.roomy` | | What each is, which society, when captured |
| Queue | **Nothing here is at risk** | | reassurance, stated plainly | Unsynced records are never purged at any age (§0.1) |
| **Poison** | Items the server rejected 3× | `bad` | | Named individually — a blocked queue must be loud |
| Available | What still works offline | | | Every downloaded visit, in full |
| Blocked | What does not | | | Anything needing a live answer: gate-pass approval, override requests, sign-in |

### The poison item is the real content

A queue that says "3 pending" while one item is permanently stuck is the failure mode §0.1 names,
and it is how a survey is quietly lost. A rejected item is listed on its own, with what the server
said, and two ways out: **view the record** or **discard this change**. Discarding requires a
confirmation naming exactly what will be lost.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Retry now | button | any | Forces a sync attempt | none | Progress, or a stated reason | Still offline → says so without clearing the queue |
| Open a pending item | row | any | Shows the record it belongs to | — | — | — |
| View a rejected record | poison row | any | Opens it for correction | — | — | — |
| Discard a rejected change | poison row | any | Removes it from the queue | modal naming precisely what is discarded | Queue unblocks | — |
| Carry on working | primary | any | → back to the visit | — | — | — |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | on open | Queue from local storage, instantly — there is no network to wait for | — |
| Empty — first use | nothing pending, online | "Everything's synced." Reachable deliberately, so the state can be trusted when it matters | Carry on |
| Empty — filtered | n/a | — | — |
| **Offline, queue healthy** | no connection | The queue, its age, and the reassurance | Carry on |
| **Offline, cold start** | empty cache, no network | The one genuinely blocked case: nothing is downloaded and nothing can be. States it plainly and offers the office's number | Retry |
| **Poison** | server rejected 3× | The blocked item named, with its reason | View, discard |
| Partial / stale | syncing | Per-item progress, not a spinner | — |
| Error — permission | session expired offline | Work is retained; sign-in is required when signal returns, and the screen says so rather than discarding anything | Retry |
| Success | queue drains | "All 14 items synced." Then it steps out of the way | Carry on |

**Exits:** SCR-171, whichever visit was open.
**Live update:** connection state on change; queue on every write.
**Responsive:** `.roomy`, one-handed.
**Offline:** this *is* the offline screen.
**Copy:** healthy — "You're offline. 14 things are waiting to send. Nothing is lost — they'll go up
as soon as you have signal." Cold start — "You're offline and nothing's downloaded yet. Get signal
for a moment and today's visits will come down."

---

## Coverage

**Rendered mockups:** https://claude.ai/code/artifact/a356917a-9d95-4ecb-baeb-85905a13a5d3 — both
screens, each at both sizes, with full state sets.

| Screen | Spec | Mockup | Blueprint |
|---|---|---|---|
| SCR-200 sign in | ✅ | ✅ | — |
| SCR-223 offline & sync pending | ✅ | ✅ | — |

Both screens span SUR-01 and SUR-02, so the mockup renders each at both sizes rather than picking
one — SCR-200 as a desktop card beside a phone, SCR-223 as three phone frames, because it is really
three states and the middle one (a poison item in an otherwise-draining queue) is the one that
loses a morning's work if it is folded into a count.
