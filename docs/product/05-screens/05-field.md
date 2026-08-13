# SUR-02 field — mobile web, offline-tolerant
**Product:** FirsThing Platform · **Phase:** 5 — Screens · **Status:** Draft — 5 of 12 priority-1 specified
**Last updated:** 2026-08-13

The only surface that runs where the network doesn't. Everything here is captured in a basement, a
pump room, a stairwell or a car park, one-handed, on a personal phone, by someone who will not come
back a second time if the data is lost. FLOW-02 states the stake plainly: *a survey lost to
connectivity is a wasted site visit and a re-booked appointment.*

Global rules: [`00-global-patterns.md`](00-global-patterns.md). Visual system:
[`../05a-theme-system.md`](../05a-theme-system.md) — the `.roomy` density carries this whole surface.

**Screens (12 priority 1):** SCR-171, 010, 011, 012, 013, 020, 021, 022, 023, 024, 061, 064.
**Also on this surface (priority 2):** SCR-065, 111, 132, 140, 141, 142. **Related:** SCR-223
(offline & sync-pending, specified in `06-cross-cutting.md`).

---

## 0. Surface rules

Written before the first field screen, because twelve screens cannot each invent their own answer to
"what happens when the upload fails." A screen spec below states only where it **departs** from this
section. This is XC-02 made concrete, plus the parts of XS-01/02/03 that are the device's side of a
cross-surface contract.

### 0.1 The offline model

**Local-first, always.** Every field screen writes to local storage first and to the server second.
There is no "save" that can fail because the network is down — a save that reaches the device is a
save. The distinction the person sees is *saved* (on this phone) versus *synced* (the office has it),
and both are always visible.

| Rule | Behaviour |
|---|---|
| **Write path** | Field edit → local record → sync queue → server → acknowledgement → local record marked synced. Never the reverse order, and never a write that exists only in memory. |
| **Autosave** | Every field commits locally on blur, and every section commits on leaving it. No explicit save button exists inside a survey section (§0.5 is the one exception — submission). |
| **Queue** | A single ordered per-device queue of pending writes, shown in CMP-14 as a count. Ordered because a photo cannot attach to an equipment row the server hasn't been told about yet. |
| **Retry** | Exponential backoff from 15s to 5 min while the app is open; on regaining connectivity, immediate. A queued item never expires on its own. |
| **Poison item** | An item the server rejects three times (validation, not network) stops the queue, is named in CMP-14, and offers *view the record* / *discard this change*. A blocked queue is loud — a silently stuck queue is how a survey is lost while the app says "3 pending." |
| **What downloads** | On accepting a visit, the device pulls everything that visit needs: society record, access details, circuit registry (XS-11), any existing survey draft, the checklists. A confirmed visit is usable with the phone in flight mode from that moment. |
| **Retention** | Synced records for a society stay on the device for **7 days** after the visit closes, then are purged. Unsynced records are never purged, at any age, for any reason. |
| **Cold start offline** | The app opens to SCR-171 from cache with the stale-data banner, and every downloaded visit remains fully workable. A cold start with an empty cache and no network is the one genuinely blocked case → SCR-223. |
| **Two devices, one person** | Not supported concurrently. Signing in on a second device warns that unsynced work exists on another and offers nothing else — the queue does not migrate. |
| **Two people, one visit** | **Supported, on every visit type** (user's decision 2026-08-13, CON-44). A visit carries a team, not an owner. See §0.1b — this is the one place the offline model gets genuinely harder. |

**Conflict.** Field capture is overwhelmingly create-only, which is why this stays simple: the
device generates the record ID, so two concurrent creates cannot collide. For the small number of
edits (a corrected count, a re-answered checklist item) the rule is **last write by timestamp wins,
and the loser is not discarded** — it is kept as a superseded revision visible on SCR-014. Where the
office has already acted on a value (a survey confirmed, a benchmark locked), the device's late edit
is **rejected**, not merged, and comes back as a poison item naming what happened.

### 0.1b Several people, one visit

**A visit has a team, not an owner** (CON-44). A 1,500-light society is surveyed by two people —
one walking the towers, one in the pump room — and an installation day runs three technicians in
three blocks. "Assignee" everywhere in this document means *any member of the visit's team*; a
phone belonging to someone not on the team still opens the visit read-only.

**What is not at risk.** Record IDs are generated on the device (§0.1), so two people creating rows
at the same time cannot collide, offline or on. There is no merge problem in the database sense and
none is specified.

**What is at risk is double-counting, and it reaches the bill.** If two people both count the
second-floor corridor, the survey reports 60 lights where there are 30. That count sets the
represented light count for its circuit (CON-11), which sets the benchmark, which sets the fee —
and it is discovered, if at all, months later as an unexplained deviation. Everything below exists
for that one failure, not for write safety.

#### Area is the unit of work

Work partitions by **area** — a tower, a block, a level, a basement — not by section and not by
light type. An area is the smallest thing one person can finish alone and the natural thing two
people divide.

| Rule | Behaviour |
|---|---|
| **Claim** | Opening an area for capture claims it for that person. The claim is **advisory and optimistic** — it is recorded locally and synced like any other write, because a lock cannot be acquired with no network. |
| **Visible** | Every team member's screen shows each area's state: unclaimed, claimed by *name*, or complete. Online this is near-live; offline it is as of last sync, and labelled with that time. |
| **Claiming a claimed area** | Allowed, with an interstitial naming the person and when they claimed it: *"Priya started Tower B 40 minutes ago. Count it anyway?"* Not blocked — the other person may have left, and a hard block strands work. |
| **Colliding claims** | Two offline claims on one area both sync successfully. Neither is rejected. The area is marked **contested** and both sets of rows are kept. |
| **Never** | Two people's rows for one area are **never summed, never deduplicated, and never silently merged**. |

#### Reconciliation at submission

A survey cannot be submitted while any area is contested or any contributor has unsynced work.

| Condition | Behaviour |
|---|---|
| **Contested area** | Submission blocked. The submitting person sees each contested area with both counts side by side and who captured each, and must choose one, or merge them by hand with a recorded reason. |
| **Unsynced contributor** | Submission blocked, naming who and how many pending items. The submitter cannot sync another person's phone — the screen says who to chase. |
| **Uncovered area** | Not blocked, but named. An area nobody claimed is reported as a gap on SCR-014 rather than assumed empty. |
| **After submission** | The whole survey is read-only on every team member's device, not just the submitter's. |

#### Installation batches

FLOW-07's daily batches (SCR-061) partition the same way, and are the case most likely to run three
phones at once. Two differences from a survey:

- A batch is **scoped to an area from the moment it is created**, so two technicians in two towers
  are working two separate batches and nothing is contested by construction.
- The society's daily review (SCR-062) sees **one merged day**, not three batches — the partition
  is an internal detail of how the work got done and should not leak into what the RWA approves.

**What this costs.** Roughly: an area-claim record, a contested state, one reconciliation step
before submit, and a team roster on the visit instead of a single assignee. What it buys is that
the double-count is caught at submission by the person who was there, rather than in a deviation
review four months later by someone who was not.

### 0.2 Time semantics

The single rule the SLA machinery depends on: **`capturedAt` is the device clock at the moment of
the action; `receivedAt` is the server clock at sync.** Every field record carries both. Everything
a person is measured by uses `capturedAt`; everything the system enforces a deadline with uses
`receivedAt`. A technician who fixed a fault at 14:00 in a basement and synced at 19:00 resolved it
at 14:00 (XS-08), and is never penalised for the tunnel.

The inverse also holds, and it is why the device clock is never trusted for gates: the **24-hour
reschedule lockout is adjudicated server-side** (XS-02). The device shows the lockout it was told
about at last sync; if a queued reschedule turns out to have crossed the line, the server rejects it
and SCR-171 surfaces the rejection rather than the app quietly having permitted it.

Where the two clocks disagree by more than 5 minutes, the device says so once, on SCR-171, and keeps
working — a wrong phone clock is common and is not a reason to block a visit.

### 0.3 Photos

The heaviest thing this surface does. CON-28c requires a photo per installed pump-room item, XC-01
requires them on every gate pass, and a single pump audit can produce forty.

| Rule | Behaviour |
|---|---|
| **Capture** | Device camera or gallery, multiple selection allowed. Camera is the default action; gallery is one tap away, because a photo taken earlier in the basement with no app open is still evidence. |
| **Processing** | Downscaled on-device to a 1,600px long edge, JPEG ~0.75, EXIF orientation applied and location metadata **stripped** — the record carries the survey's own coordinates, and a photo's embedded GPS is an unnecessary second copy. Target ≈250–400 KB per photo (ASSUM-26). |
| **Storage** | The processed image is held locally and queued; the original is not retained. |
| **Upload** | Presigned PUT direct to S3 (the existing pattern), keyed per XC-07's convention, then the key is attached to the record. Photos upload **after** structured data — the office can act on numbers without images. |
| **Required photos offline** | A required photo is satisfied by a *captured* photo, not an uploaded one. Nothing on this surface blocks on an upload completing. |
| **Failure** | A failed upload retries with the queue. A photo that fails three times is listed by name and thumbnail with *retry* / *retake* / *remove*, and the record it belongs to is flagged incomplete rather than being silently short one image. |
| **Storage pressure** | Below 200 MB of free space the app warns and offers to sync now; it never deletes an unsynced photo to make room. |

### 0.4 Navigation

**Visit-scoped, not module-scoped.** A field worker does not browse the product — they arrive with
one visit and work it. SCR-171 is home; everything else is entered from a visit and returns to it.
There is no sidebar, no society browser, no global search on this surface.

| Element | Behaviour |
|---|---|
| Home | SCR-171 my visits. The back-most screen; browser-back from it exits nothing. |
| Within a visit | A section index (§0.5) rather than a wizard — FLOW-02 is explicit that an experienced surveyor finishes the pump audit while standing in the pump room. |
| Persistent | CMP-14 sync bar at the top of every screen; the visit's society name and type in a compact header. |
| Primary action | A sticky bottom bar, thumb-reachable, one primary action per screen. Never a top-right button — this surface is used one-handed. |
| Exit a visit | Explicit "leave visit" that returns to SCR-171. Nothing is lost; sections retain their state. |

### 0.5 The survey shell (SCR-010–013)

FLOW-02's four capture screens are **sections of one container**, not four independent screens, and
the container carries the behaviour they share. A survey is `SiteSurvey` against a `Pipeline`
(CON-24), created when a survey visit is accepted.

| Section | Screen | Completion rule |
|---|---|---|
| Society profile & access | SCR-010 | Coordinates + at least one contact captured |
| Lighting inventory | SCR-011 | At least one area row, every row with a count and a light type |
| Circuit selection | SCR-012 | Every light type from SCR-011 has a circuit, an exclusion, or a pending exception |
| Pump room | SCR-013 | Every equipment category answered, or the room flagged no-access |

**Per-section state**, shown in the index and sent to SCR-014 unchanged: `not started` ·
`in progress` · `complete` · `flagged` (deliberately incomplete with a recorded reason, e.g. the
committee list unavailable or the pump room locked). `flagged` is a first-class outcome — FLOW-02
calls a partial survey "common and normal", so the product treats it as a state rather than an error.

**Resume** lands on the first section that is neither `complete` nor `flagged`. Section order is a
suggestion, and any section can be opened at any time.

**Submit** lives on the shell, not in a section (FEAT-010). It is enabled when every section is
`complete` or `flagged`, and blocked otherwise with the missing items named — never a generic
"survey incomplete". On a team survey it is blocked by two further conditions from §0.1b: **any
contested area**, and **any contributor with unsynced work** (named, with their pending count —
the submitter cannot sync someone else's phone, so the screen says who to chase). Submitting sets
`SiteSurvey.status = submitted`, queues the whole thing as one logical unit (XS-03 requires partial
sync to be valid, so sections sync independently and the submission marker syncs last), and hands
to SCR-014. After submission the survey is **read-only on every team member's device**, not only
the submitter's; a correction requested by the office (SCR-014's "query a count") reopens exactly
the queried section and nothing else, for the whole team.

### 0.6 Suspension and access, checked before travel and again on arrival

Two things can waste an entire trip, and both are known before it happens.

**Suspension (XS-10, CON-13).** A suspended society must not be serviced. The visit card shows
suspension state, and it is **re-checked when the visit is started** — if the device has been offline
longer than 12 hours the start action says so and asks for a connection first, because a stale
cached "not suspended" is exactly the failure XS-10 names. Where a connection is genuinely
unavailable, starting anyway is possible and is recorded as an unverified start.

**Access (FEAT-096).** Gate contact, access hours, notice requirements, parking and pass/ID
requirements ride on the visit card, offline, and are captured at survey on SCR-010. Where the
society has none recorded the card says so plainly rather than showing blanks. Refused entry is the
`access blocked` outcome, not a failed visit.

### 0.7 Device, session and permissions

| Rule | Behaviour |
|---|---|
| **Device** | Personal Android phone assumed (ASSUM-27), mobile web, no install required. Nothing here needs a native app; nothing here should require a company device. |
| **Session** | Long-lived, and **never expires mid-visit**. Re-authentication is requested when the app is opened with no unsynced work, never while a survey is open — global patterns' session-expiry modal is overridden here (§1.2 of `00-global-patterns.md`). |
| **Sign out** | Refused while unsynced work exists, with the count and a *sync now*. Signing out purges cached society data; that is the answer to a lost phone, along with a remote session revoke by an admin. |
| **Device permissions** | Camera and location are requested **in context, at first use**, never on a splash screen. Both denials are survivable: location falls back to a manual map pin plus the society's address, camera falls back to gallery upload. SCR-211 (first run) explains both before they are needed. |
| **Role** | PER-03 and PER-04 see only visits assigned to them (FEAT-017 AC-4). There is no route on this surface to a society they have no visit for. |

### 0.8 Non-functional

Load ≤2.5s on 3G for a cached screen, and a cached screen must render with **no network at all**.
Touch targets 48px (`.roomy`). Contrast is judged for **direct sunlight and a dim basement**: the
theme's dark mode is the default on this surface between 18:00 and 06:00 device time, overridable.
Text never below 15px. No hover-only affordance exists anywhere on this surface. Screen-reader
labels on every capture control, and every photo tile carries what it is a photo of, not "image".

### 0.9 What this surface deliberately does not do

No browsing of other societies, no reporting or analytics, no editing of anything the office owns
(benchmarks, contracts, invoices, light counts after confirmation), no scheduling of one's own
visits, and no approvals — every approval this surface waits on is granted on SUR-01 by someone
else. The field captures; the office decides. The one apparent exception, XC-01's gate pass, is the
field *requesting* a decision, not making one.

---

## SCR-171 — My visits (field home)

**Surface:** SUR-02 · **Type:** page · **Personas:** PER-03, PER-04
**Features:** FEAT-017, FEAT-096 · **Flows:** FLOW-X1 (steps 2, 3, 5)

**Purpose:** the field worker's whole relationship with the product — what is assigned, what is
today, what has not reached the office yet.
**Primary action:** start today's visit.

FLOW-X1 says it outright: *"Field staff live in SCR-171; it is effectively their home screen."* It
is also the screen most likely to be opened with no signal, in a car park, thirty seconds before
walking into a building.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| App launch | always — this is the root | Cached list, then refreshed |
| Email notification | visit assigned (CON-39, email-only at launch) | Deep link, that visit expanded |
| Any visit screen | "leave visit" | Scroll position, that visit's card focused |
| SCR-223 | connectivity restored | — |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Top | CMP-14 sync bar | local queue | count + state | Persistent; expands to the queue |
| Header | Name, today's date, sync freshness | CMP-17 | `13 Aug 2026` | Freshness is prominent here, not a footnote |
| Section 1 | **Today** | `FieldVisit` where date = today, state `confirmed` | visit cards | First thing on the screen; usually one card |
| Section 2 | **Needs your response** | state `proposed` | visit cards with accept / reschedule | Above upcoming, below today |
| Section 3 | **Upcoming** | `confirmed`, next 14 days, ascending | compact cards, grouped by day | |
| Section 4 | **Recently done** | last 7 days, closed | compact rows | Shows unsynced badges — this is where a stuck upload gets noticed |
| Card | Society, visit type, time, address | `FieldVisit` + `Society` | type as CMP-02 | Type drives which screen "start" opens |
| Card | Access details | FEAT-096 | gate contact, hours, notice, pass/ID | Offline-available; "No access details recorded — call ahead" when absent |
| Card | Suspension flag | XS-10 | `bad` chip | §0.6 |
| Card | Source record | the ticket / deal / inspection that caused the visit | one line | Why this visit exists (FEAT-016: no floating visits) |
| Card body | **Who else is on this visit** | visit team | avatars + names | Present only when the team is more than one. Shows who has accepted and who has not |

### The response gate (FEAT-017)

A `proposed` visit is not a scheduled visit. The card carries **accept** and **request reschedule**,
and states how long it has been waiting — at 24 hours it escalates on SUR-01 (XC-03) whether or not
the phone was ever opened, so the card says *"Ops was notified you haven't responded"* rather than
letting the escalation be a surprise.

**Reschedule inside 24 hours is blocked, not hidden** (FEAT-017 AC-3): the button remains, and
pressing it explains that a change this close needs ops because the society has to be told too, and
offers the ops contact. Blocked-and-explained beats absent — an absent button reads as a bug and
produces a phone call anyway.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Accept visit | card button | any team member | `proposed` → `confirmed` **for that person**; pulls the visit's data pack for offline use (§0.1). Team members accept independently — one person's acceptance does not commit the others | none | Card moves to Today/Upcoming; ops sees who has acknowledged and who has not | Offline → queued, card shows "Accepting…"; server rejects (removed from the team meanwhile) → card returns to a named state |
| Request reschedule | card button | assignee, >24h out | Visit → `proposed` with reason + alternative; routes to PER-01 | reason required, alternative date required | Card shows "Reschedule requested" | <24h → blocked with explanation; offline → queued and **server-adjudicated** (§0.2) |
| Start visit | card primary | assignee, `confirmed` | Opens the visit's own screen by type | Suspension re-check (§0.6) | → SCR-010 survey · SCR-020 meter install · SCR-023 demo install · SCR-061 batch · SCR-140 inspection · SCR-132 ticket · SCR-111 deviation | Suspended → blocked, naming who to call |
| Resume visit | card primary, work exists | assignee | Returns to the first incomplete section | none | Same targets | — |
| Record access blocked | card menu | assignee | Visit outcome `access-blocked`; returns to `proposed` for rescheduling (FEAT-096 AC-3) | reason required, photo optional | Card moves out of Today; ops notified | Third block at one society escalates (FEAT-096 AC-5) |
| Call gate contact | card | assignee | `tel:` — no in-app calling | none | — | No number recorded → the card already said so |
| Navigate | card | assignee | Opens the device's map app with coordinates, or the address if none | none | — | — |
| Sync now | CMP-14 | any | Forces a queue flush | none | Counts update | Offline → says so, keeps the queue |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | cold start with cache | Cached list immediately, freshness pill "checking…" | Everything — the cache is fully usable |
| Empty — first use | no visits ever assigned | "Nothing is assigned to you yet. Visits scheduled by the office appear here." + who to contact | Contact ops |
| Empty — nothing today | visits exist, none today | Today section reads "Nothing scheduled today" and Upcoming carries the next one with its date | — |
| Empty — filtered | n/a — this screen has no filters | — | — |
| Partial / stale | offline, or last sync > 2h | `info` bar: "Showing what was on this phone at 09:14. New assignments may not be here." | Retry, work cached visits |
| Error — network | refresh fails | Silent — the cache stays and the freshness pill goes stale. Never an error page over a usable list | Retry |
| Error — permission | visit reassigned away | Card greys with "Reassigned to someone else" and disappears on next refresh | — |
| Success | accepted / started | Card moves section with a brief highlight; toast on accept | — |
| Queue blocked | poison item | CMP-14 turns `bad` and names the record | View / discard |

**Exits:** SCR-010, SCR-020, SCR-023, SCR-061, SCR-140, SCR-132, SCR-111, SCR-223, SCR-230.
**Live update:** refresh on focus and on connectivity change; 5-minute poll while foregrounded. A new
assignment appears with a count, never by re-ordering under the thumb.
**Responsive:** phone-first, single column, 360px floor. Usable on a tablet; never desk-optimised.
**Offline:** fully available from cache. Accept, reschedule and access-blocked all queue.
**Copy:** lockout — "This visit is in less than 24 hours. Changing it now means the society has to be
told, so ops has to do it. Call Priya on 98xxx xxxxx." · access absent — "No access details
recorded. Call the society before you travel."

---

## SCR-010 — Survey: society profile & access

**Surface:** SUR-02 · **Type:** survey section · **Personas:** PER-04, PER-03
**Features:** FEAT-005, FEAT-096 · **Flows:** FLOW-02 (step 3)

**Purpose:** capture who runs this society, how to reach them, and how to get in — CON-28a.
**Primary action:** capture the committee and move on.

This is the first structured record of a society that will ever exist, and it is captured before
there is a `Society` row at all (it lives on the `Pipeline`'s `SiteSurvey` and is promoted on
signing). Everything downstream that "notifies the society" resolves through the contacts entered
here (FEAT-092), so a thin capture here becomes an unreachable customer later.

### Entry points

| From | Trigger | State carried in |
|---|---|---|
| SCR-171 | start / resume a survey visit | Visit + pipeline |
| Survey shell index | direct | Section state |
| SCR-014 | office queried this section | The query note, pinned at the top |

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society name, visit type, section index | `Pipeline` | | Name is as the lead was logged; correctable here |
| Block 1 | **Location** — coordinates, address | device geolocation + text | 5dp, accuracy in metres | Pin adjustable on a map; accuracy shown honestly |
| Block 2 | **Committee** — repeating member rows | committee list | name · post · phone · email · primary | Uncapped (FEAT-005); posts from an enum with "Other" |
| Block 3 | **Governance** — RWA member count, next election date | | integer · `DD MMM YYYY`, optional | Election date is what SCR-014 reads as negotiation risk |
| Block 4 | **Access & entry** (FEAT-096) | | gate contact, access hours, notice required, parking, pass/ID | Captured once, reused by every future visit |
| Block 5 | **Site photos** | CMP-15, optional | thumbnails | Entrance and gate, so the next visitor recognises the place |
| Footer | Section state + next section | | | Sticky |

### The committee list is the contact directory

Each row is a future notification recipient, so the screen asks for what a recipient needs rather
than what a committee has: a **name, a post, and at least one channel**. Exactly one row is marked
**primary contact** — the person who receives the offer, the report and the invoice — and marking a
second moves the mark rather than duplicating it. A phone number that already exists on another
member of this society warns (the same person entered twice under two posts is the common case) but
does not block, because a shared committee landline is real.

Posts: President, Secretary, Treasurer, Committee Member, Facility Manager, Security In-charge,
Electrician, Other (free text). The last three are not governance roles and are here deliberately —
they are who a field worker actually calls, and FLOW-02 step 2 names facility and security staff as
the blocker on every visit.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Use my location | button | assignee | Reads device GPS, drops a pin, records accuracy | none | Coordinates + accuracy shown | Permission denied → manual pin, explained once; accuracy worse than 50m → warns and offers a retry |
| Adjust pin | drag | assignee | Overwrites coordinates, records that it was manual | none | — | — |
| Add member | button | assignee | Appends a row | none | Row focused on name | — |
| Remove member | row menu | assignee | Deletes the row | confirm, naming the person | Row removed | Removing the primary → the mark must be re-assigned before leaving the section |
| Mark primary | row control | assignee | Moves the mark | none | — | — |
| Flag section incomplete | section menu | assignee | Sets `flagged` with a reason | reason required | Section shows `flagged`; SCR-014 names the gap | — |
| Complete section | footer | assignee | Sets `complete` | none | → next incomplete section | Required fields missing → named inline, section stays open |

### Inputs & validation

| Field | Type | Required | Default | Constraints | Error message | Editable later |
|---|---|---|---|---|---|---|
| Coordinates | geo | yes | device GPS | valid lat/long, within India | "Drop the pin on the building — the location we got looks wrong." | yes, until survey confirmed |
| Address | textarea | yes | from the lead | — | "Add the address — the next person to visit needs it." | yes |
| Member name | text | yes per row | — | 2–80 chars | "Add a name for this member." | yes |
| Post | select | yes per row | Committee Member | enum + Other | "Which post do they hold?" | yes |
| Phone | tel | one channel per row | — | 10 digits, Indian | "That's not a 10-digit number." | yes |
| Email | email | one channel per row | — | valid | "Check the email — it can't receive anything as written." | yes |
| RWA member count | number | no | — | integer 0–20,000 | "Members can't be a negative number." | yes |
| Next election date | date | no | — | future, or past with a warning | "That date has passed — is the committee already changed?" | yes |
| Notice required | select + number | no | Not required | none / same day / N days | — | yes |
| Access hours | text | no | — | free text ("6am–10pm, no entry after 10") | — | yes |

**Validation:** on blur for format, on section-complete for the required set. Nothing validates on
keystroke — a spinner or a red border while typing a phone number one-handed is hostile.
**Half-completed:** every field is local on blur (§0.1); the section survives the app being killed,
the phone dying, and the visit being resumed a day later.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | opening the section | Instant from local draft; nothing fetched | All |
| Empty — first use | new survey | Guided blocks with prompts, not a bare form (FEAT-005 AC-2). One empty member row pre-added | Fill |
| Empty — filtered | n/a | — | — |
| Partial / stale | office edited this section during review | `info`: "Ops changed the committee list at 11:40. Your version is shown." + view theirs | Keep / take theirs |
| Error — network | never blocks | No error — the section is local; CMP-14 owns sync state | — |
| Error — permission | opened by a non-assignee | Read-only with a banner naming the assignee | — |
| Error — device | location or camera denied | Inline, with the fallback already in place | Manual pin / gallery |
| Success | section complete | Index ticks the section; auto-advance to the next incomplete one | — |
| Flagged | committee unavailable today | `warn` on the section: "Committee list not captured — <reason>" | Reopen |

**Exits:** SCR-011, survey shell index, SCR-171.
**Live update:** none while the section is open — a value changing under a typing thumb is worse than
staleness. Office edits surface on section open (the `stale` row above).
**Offline:** fully available. Only the map tile needs network; without it the pin sits on a plain
coordinate readout, which is enough.
**Accessibility:** every row labelled with the member's name once entered, so "remove" is never
ambiguous to a screen reader. Map pin has a coordinate entry alternative.
**Copy:** first-use — "Who runs this society, and how do we get in? This is the record every later
visit and every notification uses." · primary contact — "Offers, reports and invoices go to this
person."

---

## SCR-011 — Survey: lighting inventory by area

**Surface:** SUR-02 · **Type:** survey section · **Personas:** PER-04, PER-03
**Features:** FEAT-006 · **Flows:** FLOW-02 (step 4)

**Purpose:** count every common-area light in the society, by area, and resolve those areas into the
distinct light types that decide how many circuits get metered.
**Primary action:** add every area and its count.

**This is the number that bills the society for the whole term.** FLOW-02 step 4 is unambiguous: a
miscount here *"propagates into `representedLightCount` and biases billing for the term — no
downstream check catches it."* CON-11's extrapolation multiplies by it every month for years. Of the
110 screens in this product, this is the one where a careless entry is most expensive, and it is
being filled in a car park on a phone.

### Two axes, and the screen has to hold both

| Axis | What it is | Used by |
|---|---|---|
| **Area** — the capture unit | Where the lights physically are: "Tower B staircase", "Basement P1" | The proposal, the installation plan (FEAT-033), the field |
| **Light type / operating profile** — the billing unit | Basement parking · stilt parking · lift lobby · staircase · external (CON-16) | CON-11's extrapolation, and how many circuits SCR-012 must find |

Four towers with a staircase each are **four area rows and one light type**, and their counts sum to
the staircase circuit's `representedLightCount`. So every area row carries a light type, and the
section shows a live **per-type roll-up** — labelled as the extrapolation base, not as a subtotal,
because that is what it is.

Basement and stilt parking are separate enum values and can never be merged (CON-28b). An area with
none of a type present is **omitted, not zeroed** (FEAT-006 AC-5) — a zero and an absence read
identically in a table and mean opposite things.

### How each count was obtained

A reviewer at a desk cannot verify 1,200 lights. What they can assess is *how the number was
arrived at*, so every area row records a **count method**: `walked and counted` · `from the
society's records` · `estimated`. An `estimated` row requires a one-line note and is surfaced on
SCR-014 as an explicit weakness rather than sitting in a column of identical-looking numbers.
This is the only control available on the highest-leverage number in the product — see the
discovery log; FEAT-006 was amended to carry it.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Society, section index | | | |
| Banner | Running total | sum of rows | `1,204 lights across 9 areas` | Always visible; this is the headline figure |
| Body | Area rows | `LightingInventoryArea[]` | area type · label · count · light type · method | Add-row list, newest at the bottom |
| Body | **Per-type roll-up** | computed | type · areas · total lights | Labelled "Extrapolation base — one circuit will be metered per type" |
| Body | Per-area photo | CMP-15, optional | | Encouraged on `estimated` rows |
| Footer | Section state, next | | | Sticky |
| Row | **Claim state** | §0.1b | unclaimed / *name* / complete / **contested** | Only when the team is more than one. As-of-last-sync offline, and labelled with that time |

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Claim an area | opening a row for capture | any team member | Places an advisory claim (§0.1b) | none | Row shows the claimant | Already claimed → interstitial naming who and when, then permitted |
| Add area | button | any team member | Appends a row, type first | none | Row focused | — |
| Duplicate area | row menu | assignee | Copies type + method, clears count and label | none | Useful for four identical staircases | — |
| Remove area | row menu | assignee | Deletes | confirm naming the area and count | Roll-up updates | — |
| Complete section | footer | any team member | `complete`; the type list becomes SCR-012's work list | Modal restating the total and the per-type split | → SCR-012 | Any row missing a count or type → named inline; **any contested area → named, and the section cannot complete until resolved** |
| Flag section | menu | assignee | `flagged` with reason | reason required | SCR-014 names the gap | — |

### Inputs & validation

| Field | Type | Required | Default | Constraints | Error message | Editable later |
|---|---|---|---|---|---|---|
| Area type | select | yes | — | basement parking · stilt parking · lift lobby · staircase · external · other | "Which area is this?" | yes, until confirmed |
| Label | text | no | — | ≤40 chars | — | yes |
| Light count | number | yes | — | integer ≥1 | "Enter how many lights are in this area." / "A count can't be negative." / "Zero lights? Remove the area instead — we only record areas that exist." | yes, until confirmed |
| Light type | select | yes | mirrors area type | the five CON-16 profiles | "Which type of lighting is this? It decides which circuit represents it." | yes |
| Count method | select | yes | walked and counted | three values | "How was this counted?" | yes |
| Note | text | required when `estimated` | — | ≤140 chars | "Say how the estimate was made — ops will see this." | yes |

Two guards worth stating because they catch the realistic mistakes rather than the theoretical ones:
a count over **2,000 in a single area** asks for confirmation (a mistyped digit is far more likely
than a 2,000-light stairwell), and a light type appearing in the roll-up with **fewer than 50 total
lights** carries a warning here rather than surfacing for the first time at SCR-012's eligibility
check — because the fix, another walk, is only cheap while the surveyor is still on site.

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | section open | Instant from local | All |
| Empty — first use | no rows | "Add each area that has common lighting. Count basement and stilt parking separately." + Add area | Add |
| Empty — filtered | n/a | — | — |
| Partial / stale | office edited during review | `info` naming the change | Keep / take theirs |
| Error — network | never blocks | — | — |
| Contested area | two people captured the same area | Both counts side by side with who captured each; the roll-up excludes contested areas and says so | Resolve |
| Error — permission | not on the visit team | Read-only | — |
| Error — validation | complete attempted with gaps | Rows with gaps scroll into view and are named | Fix |
| Success | complete | Roll-up locks into SCR-012's work list; toast naming the type count | — |
| Flagged | partial count (a tower inaccessible) | `warn` with the reason, and the roll-up marked provisional | Reopen |

**Exits:** SCR-012, shell index, SCR-010.
**Offline:** fully available. **Responsive:** single column; the roll-up sticks under the header once
scrolled past.
**Accessibility:** the running total is a live region — a screen-reader user gets the number changing
as rows are added, which is the entire feedback loop of this screen.
**Copy:** complete modal — "1,204 lights, 4 types. These counts are the billing basis for the whole
term. Ops will check them, but nothing later in the system re-counts them."

---

## SCR-012 — Survey: circuit selection per light type

**Surface:** SUR-02 · **Type:** survey section · **Personas:** PER-04
**Features:** FEAT-007 · **Flows:** FLOW-02 (step 5)

**Purpose:** choose, for each light type, the one circuit that will be metered and will represent
every light of that type — and record why it qualifies.
**Primary action:** select and check a circuit for each type.

CON-11's correction lives here: **one circuit per light type**, each extrapolating only across its
own type. This section is where the survey stops being a description of a building and becomes the
sampling design of a contract.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Progress by type | from SCR-011's roll-up | `2 of 4 types resolved` | The work list is generated, not typed |
| Card per type | Type, represented count, state | SCR-011 | CMP-02 | One card per type; each needs an outcome |
| Card body | Circuit identification | text | panel/DB name, location, floor | How the next person finds it |
| Card body | Metered light count | number | | The lights actually on this circuit |
| Card body | Existing per-light wattage | number | W | Feeds FEAT-011's ±10% load check at meter install (CON-17) |
| Card body | Represented light count | computed from SCR-011 | read-only | Stated on the card: "This circuit will represent 312 staircase lights" |
| Card body | CON-16 checklist, five criteria | | pass / fail / n-a each | See below |
| Card body | **Typicality answer** | required text | | See below |
| Card body | Photos | CMP-15 | panel, a representative fixture | Required: at least one of the panel |

### CON-16, criterion by criterion

Recorded individually, never as a single "eligible" tick — an incomplete checklist blocks
confirmation (FEAT-007 behavioural rules).

| Criterion | Captured as | If it fails |
|---|---|---|
| ≥50 lights on the circuit | the metered count itself | **Exception-able only** — requests a PER-01 exception with a reason; field staff cannot self-approve (FEAT-007 AC-3) |
| No non-installation appliances sharing the circuit | yes/no + what else is on it | **Hard fail** — pick another circuit |
| WiFi/LAN reachable within 20–40m | distance estimate + a reachability check | **Hard fail** — the meter cannot report |
| Fixtures ≤15 ft | yes/no + approximate height | **Hard fail** — cannot be serviced safely |
| Not on a driveway or ramp | yes/no | **Hard fail** |

Four of the five have **no exception path** (FEAT-007 AC-5), so the screen does not offer one. A hard
fail marks that candidate ineligible, keeps it on the record with its reason, and asks for another
candidate — a rejected candidate is evidence that the choice was made deliberately, so it is never
deleted.

### The typicality question

*Is this circuit typical of the lights it will represent?* CON-16 added it at the audit, and nothing
in the system can check it — a 24-hour basement circuit standing in for dusk-to-dawn staircase
lighting is the exact failure CON-11 was corrected to prevent, and it looks perfectly valid in every
column. It is captured **here, in the field, in writing**, by the only person who has seen both, and
reviewed at SCR-014. Required, free text, no default, and the prompt names the risk rather than
asking for a yes: *"What makes this circuit representative of the other 312 staircase lights — same
fixtures, same hours, same switching?"*

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Select circuit | card | assignee | Creates a survey-stage `Circuit` with `lightType` | none | Checklist reveals | — |
| Record criterion | per criterion | assignee | Persists pass/fail/n-a + evidence | none | Hard fail → candidate marked ineligible, prompt for another | — |
| Request <50 exception | on the count criterion | assignee | Raises a request to PER-01 with a reason | reason required | Circuit `pending-exception`; ops notified | Offline → queued; the section can still be completed with the request pending |
| Mark type unresolvable | card menu | assignee | Records "no eligible circuit" + reason | reason required | SCR-014 decides: exclude the type, or grant an exception | Neither outcome may be silent (FLOW-02 step 5) |
| Replace candidate | card menu | assignee | Keeps the rejected one on record, starts a new one | none | New checklist | — |
| Complete section | footer | assignee | `complete` when every type has a circuit, an exception request, or an unresolvable flag | Modal listing each type and its outcome | → SCR-013 | Any type untouched → named |

### Inputs & validation

| Field | Type | Required | Default | Constraints | Error message | Editable later |
|---|---|---|---|---|---|---|
| Panel / DB identification | text | yes | — | 2–60 chars | "Name the panel so the installer finds it." | yes, until confirmed |
| Location description | text | yes | — | — | "Where is this panel?" | yes |
| Metered light count | number | yes | — | integer ≥1 | "How many lights are on this circuit?" | yes |
| Per-light wattage | number | yes | — | 1–500 W | "The meter check at install compares against this — a wrong wattage fails a good circuit." | yes |
| Each criterion | radio | yes, all five | — | pass/fail/n-a | "Answer all five — an incomplete checklist can't be confirmed." | yes, until confirmed |
| Shared-appliance detail | text | when that criterion fails | — | — | "What else is on this circuit?" | yes |
| Distance to WiFi/LAN | number | yes | — | metres, 0–200 | "Roughly how far is the nearest access point or LAN point?" | yes |
| Typicality answer | textarea | yes | — | ≥20 chars | "Ops can't check this from a desk — describe why this circuit represents the rest." | yes |
| Exception reason | textarea | when requested | — | ≥20 chars | "Why should a circuit under 50 lights be used here?" | no, once submitted |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | section open | Instant; work list from SCR-011 | All |
| Empty — first use | no type resolved | One card per type, each "No circuit selected", with a prompt naming the type and its light count (FEAT-007 AC-2) | Select |
| Empty — no types | SCR-011 not done | Blocked with a link back: "Count the lighting first — that decides which circuits are needed" | → SCR-011 |
| Empty — filtered | n/a — the work list is generated, not filtered | — | — |
| Partial / stale | exception decided while offline | `info`: "Ops approved the exception for Basement P1 at 15:20" on next sync | — |
| Error — network | never blocks capture | Exception requests queue | — |
| Error — permission | non-assignee, or PER-03 on a commissioning survey | Read-only | — |
| Error — hard fail | a hard criterion fails | Card turns `bad`, names the criterion, asks for another candidate; the rejected one stays listed | Replace |
| Pending exception | <50 requested | Card `warn`: "Waiting on ops approval — you can finish the survey" | Continue |
| Success | every type resolved | Section complete; the circuit set is what SCR-014 will lock | — |

**Exits:** SCR-013, SCR-011, shell index.
**Offline:** fully available; exception requests and their approvals are asynchronous by design.
**Copy:** hard fail — "Fixtures over 15 feet can't be serviced safely. This circuit can't be used —
pick another one for staircase lighting." · unresolvable — "No eligible circuit for external
lighting. Ops will either leave external lights out of this deal or approve an exception. Say what
you found."

---

## SCR-013 — Survey: pump room audit & logbook

**Surface:** SUR-02 · **Type:** survey section · **Personas:** PER-04
**Features:** FEAT-008, FEAT-009 · **Flows:** FLOW-02 (steps 6–7)

**Purpose:** record every piece of pump-room equipment as a physical unit with its condition and a
photograph, and capture whatever consumption history the room keeps.
**Primary action:** work through the equipment, one unit at a time.

FEAT-008 names its own risk and it is a design brief: *"the single largest data-entry burden in the
whole survey — if it's not fast/guided enough on a phone, PER-04 may skip or shortcut it."* A form
that asks forty questions in a row gets forty shortcuts. The answer this screen takes is to **derive
the unit list from the room's own structure** so that most of the work is confirming, not typing.

### Structure first, units second

The section runs in two passes, and the first one is short.

**Pass 1 — the room.** Pump type, HP and count; feed-pipe size; common-outflow-pipe size; tower
names; tank count per tower; per tank, type and capacity. Six or seven answers.

**Pass 2 — the units, generated from pass 1.** CON-28c's six categories are per-unit, not per-room,
so the list writes itself: 3 towers × 2 tanks = 6 float-switch rows and 6 actuator-valve rows,
already named ("Tower B, Tank 2"); 4 pumps = 4 VFD slots if the arrangement is per-pump, or 1 if
shared. The surveyor walks the room and answers rows that already exist, in the order the room is
laid out.

| Category (CON-28c) | Unit basis | Generated from |
|---|---|---|
| Flow meter | per room, or per outflow line | Pass 1 |
| Pressure switch / monitor | per room | Pass 1 |
| VFD | per pump, or one shared | Arrangement answer in pass 1 |
| Dedicated pump-room energy meter | per room | Pass 1 |
| Float switch / level sensor | **per tank** | Tower × tank structure |
| Actuator valve | **per tank** | Tower × tank structure |

Each unit: **installed y/n**. `No` ends the row — brand, model, condition and photo are not asked
(FEAT-008 behavioural rules). `Yes` requires brand/make/model, working condition, and **a photo**;
an installed item without a photo is an incomplete audit, not a valid one (AC-3), and the error
names the specific unit rather than the section.

**Copy down** is the concession to reality: three identical float switches are the norm, so any
answered unit offers "same as Tower A, Tank 1" which fills brand, model and condition and still
requires its own photo. Photographs are per-unit precisely because condition is per-unit.

### Layout & content

| Region | Element | Data source | Format | Notes |
|---|---|---|---|---|
| Header | Progress | computed | `14 of 22 units recorded` | Honest denominator — it is known after pass 1 |
| Pass 1 | Room structure | | pumps, pipes, towers, tanks | Collapses to a summary line once answered |
| Pass 2 | Category groups, collapsible | `PumpRoomEquipment[]` | one row per unit | Grouped by category, ordered by tower |
| Row | Installed toggle → detail | | brand · model · condition · photo | Condition: working · working with faults · not working · unknown |
| Block | **Logbook** (FEAT-009) | `HistoricalLogbookPhoto[]` | month-tagged photos, up to 13 | See below |
| Footer | Section state | | | Sticky |

### The logbook (FEAT-009)

Photograph the pump room's manual consumption logbook — current month plus up to 12 back (CON-28d).
Each photo is **tagged with its month by explicit selection** (the product-wide rule: a month is
never inferred, CON-25), and the block shows a 13-cell month strip so gaps are visible as gaps.
Fewer than 12 months is normal and complete (AC-5). No OCR at this stage — these are raw evidence
for CON-29's projection, and the spec says so to stop a later reader assuming the numbers are
extracted.

**"Logbook not maintained" is an explicit answer**, not an empty state (AC-2). Recording it is one
tap and it closes the block as complete — the distinction between "no logbook exists" and "nobody
captured it" is exactly what a silent gap destroys.

### Actions

| Action | Trigger | Permission | Effect | Confirmation | Result | Failure |
|---|---|---|---|---|---|---|
| Answer room structure | pass 1 | assignee | Generates the unit list | none | Pass 2 appears with a real denominator | Changing tank count later adds/removes rows and warns before removing an answered one |
| Record a unit | row | assignee | Persists installed/brand/model/condition/photo | none | Row ticks; progress advances | `Installed: yes` with no photo → blocked, naming the unit |
| Copy from a unit | row menu | assignee | Fills brand/model/condition | none | Photo still required | — |
| Capture photo | CMP-15 | assignee | Local capture, queued (§0.3) | none | Thumbnail | Upload failure is a queue matter, never blocks the row |
| Add logbook photo | block | assignee | Photo + month selection | none | Month strip fills | Month already used → offers to replace or add a second page |
| Mark logbook not maintained | block | assignee | Sets the flag | none | Block complete | Reversible |
| Flag no access | section menu | assignee | `flagged` — pump room locked | reason required | Pump line unquotable; lighting unaffected (FLOW-02 step 6) | — |
| Complete section | footer | assignee | `complete` | Modal if any unit is `unknown` condition | → survey shell, ready to submit | Any unit unanswered → named by tower and tank |

### Inputs & validation

| Field | Type | Required | Default | Constraints | Error message | Editable later |
|---|---|---|---|---|---|---|
| Pump type / HP / count | select + number | yes | — | HP 0.5–200; count 1–20 (00-intake §7) | "How many pumps, and what size?" | yes |
| Feed / outflow pipe size | select | yes | — | standard sizes + Other | — | yes |
| Tower name | text | yes per tower | Tower A, B… | ≤30 chars | "Name the tower as the society calls it." | yes |
| Tank count per tower | number | yes | — | integer ≥0 | "A tower with no tanks is unusual — recording zero is fine, leaving it blank isn't." (AC-5) | yes |
| Tank type / capacity | select + number | yes per tank | — | litres | "Capacity in litres." | yes |
| VFD arrangement | radio | yes if VFDs installed | per-pump | per-pump / shared | "Is there a VFD per pump, or one shared?" | yes |
| Installed | radio | yes per unit | — | yes/no | "Is one fitted here?" | yes |
| Brand / model | text | yes when installed | — | ≤60 chars | "Brand and model — read it off the label." / "Not legible? Write 'label unreadable'." | yes |
| Condition | select | yes when installed | — | 4 values | "What condition is it in?" | yes |
| Photo | CMP-15 | yes when installed | — | ≥1 | "Photograph this one — an installed item without a photo isn't a complete audit." | yes |
| Logbook month | month | yes per photo | — | ≤13 months back, not future | "Which month is this page?" | yes |

### States

| State | Trigger | What the user sees | Actions |
|---|---|---|---|
| Loading | section open | Instant | All |
| Empty — first use | nothing recorded | Pass 1 only, six questions, with the six categories previewed below as "not yet recorded" (FEAT-008 AC-2) — not one giant blank form | Answer |
| Empty — filtered | n/a | — | — |
| Partial / stale | resumed a day later | Progress preserved; resumes at the first unanswered unit | Continue |
| Error — network | never blocks | Photos queue | — |
| Error — permission | non-assignee | Read-only | — |
| Error — validation | installed without photo | Row `bad`, named ("Tower B, Tank 2 — float switch needs a photo") | Capture |
| Error — storage | device nearly full | `warn`: sync now to free space; nothing unsynced is ever deleted (§0.3) | Sync |
| Success | complete | Section ticks; shell offers Submit if the others are done | Submit |
| Flagged | pump room locked | `warn` with reason; SCR-014 shows the pump line as unquotable | Reopen |

**Exits:** survey shell (→ submit → SCR-014), SCR-012, SCR-171.
**Offline:** fully available; this is the most photo-heavy screen in the product and it must be
assumed to run with no signal at all.
**Performance:** the unit list stays in the tens (00-intake §7: 1–20 pumps), so nothing here
virtualises. Forty queued photos at ~350 KB is ~14 MB — sized for a phone, not a desk.
**Accessibility:** each unit row is announced with its full identity ("Tower B, Tank 2, float
switch"), never as "row 14".
**Copy:** first-use — "Start with the room: how many pumps, how many towers, how many tanks. The
equipment list builds itself from that." · no access — "Pump room locked. The lighting survey is
unaffected; pump automation can't be quoted until someone gets in."

---

## Coverage

| Screen | Spec | Mockup | Blueprint |
|---|---|---|---|
| SCR-171 my visits | ✅ | — | — |
| SCR-010 survey: society profile & access | ✅ | — | — |
| SCR-011 survey: lighting inventory | ✅ | — | — |
| SCR-012 survey: circuit selection | ✅ | — | — |
| SCR-013 survey: pump audit & logbook | ✅ | — | — |
| SCR-020 meter install & load validation | — | — | — |
| SCR-021 gate pass | — | — | — |
| SCR-022 commissioning monitor | — | — | — |
| SCR-023 demo installation | — | — | — |
| SCR-024 benchmark result | — | — | — |
| SCR-061 daily batch capture | — | — | — |
| SCR-064 completion certificate | — | — | — |

**FLOW-02's field side is complete** — SCR-010–013 plus the shell hand a submitted survey to SCR-014,
which was specified with the deal loop. **Next:** SCR-020 (meter install & load validation), starting
FLOW-03's commissioning run.
