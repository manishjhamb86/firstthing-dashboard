# Google Calendar & Meet (2026-09-25)

User-asked: a task with a time goes onto the assignee's Google calendar; the Schedule tab can
create meetings with invitees and a Google Meet link; the meeting lives both in the app and in
Google Calendar, joinable from either; everyone sees their coming events, meetings and tasks.

## What was weighed

| Route | Verdict |
| --- | --- |
| Email an `.ics` invitation | Not chosen. Needs an email provider (ADR-008 is still Proposed). It cannot create a Meet link, and it cannot update or cancel reliably. |
| Each user connects their own Google account (per-user OAuth) | Not chosen. It needs a consent flow, token storage and refresh per person, and it breaks for anyone who never connected. |
| **Workspace service account with domain-wide delegation** | **Chosen.** firsthing.earth mail is on Google Workspace (MX `smtp.google.com`). One key lets the app act as each organizer. Google sends the invitations itself and creates Meet links. |

## Facts from Google's documentation that shaped it

- **Service accounts need domain-wide delegation to invite attendees.** A plain service account is
  refused with 403 "Service accounts cannot invite attendees without Domain-Wide Delegation of
  Authority". Google's guidance is also not to use a service account as the data owner, but to
  act on behalf of a user through delegation.
- **Token.** A JWT signed with RS256, with `iss` (the service account), `sub` (the user acted for),
  `scope`, `aud=https://oauth2.googleapis.com/token`, and `iat`/`exp` (at most one hour apart).
  It is exchanged with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`. The app does this
  with `node:crypto`, so no `googleapis` dependency is added.
- **Meet link.** `conferenceData.createRequest` with a fresh `requestId` and
  `conferenceSolutionKey.type=hangoutsMeet`, sent with `conferenceDataVersion=1`.
- **Invitations.** `sendUpdates=all` makes Google email every attendee on insert, update and delete.
- **Event ids.** A client may set an event's id: 5–1024 characters from base32hex (`0-9a-v`).
- **Scope requested:** `https://www.googleapis.com/auth/calendar.events`, and nothing broader.

## Design

- **One way, app → Google.** The app is the source of truth. Changes made in Google are not read
  back, except each invitee's RSVP.
- **Organizer.** Whoever set the task or meeting organizes it on their own calendar if their login
  is on the Workspace domain; otherwise a configured fallback organizer does.
- **Attendees.** The assignee, and a meeting's invitees (colleagues, or anyone by email). Google
  puts the event on their calendars and sends the invitation.
- **What syncs.** Every open appointment: tasks, meetings, and the deal's own survey visits,
  replacement days and demo meetings.
  - A date-only entry becomes an all-day event.
  - History is never written: an entry more than a day in the past that was never pushed is left
    out.
  - Cancelled entries are deleted from Google, with notice to attendees.
  - Done entries are left as they are.
- **When.** Tasks and meetings are pushed by their own action immediately, so a meeting has its
  Meet link before the dialog closes. Everything else, including retries, goes through the
  `calendar_sync` job every 5 minutes. That job also reads back RSVPs for the coming week.
- **Idempotent.** The Google event id is derived from the row id (`ft` + hex). A push that runs
  twice can never create two events: a 409 means the event exists, so the push patches it, which
  also restores one that was cancelled and then reopened.
- **Never re-dirties a row.** A row counts as changed when its `updatedAt` is later than
  `calendarSyncedAt`. The sync writes its own columns with `updatedAt` held at the row's value.
- **Failure is visible and bounded.** The entry is saved in the app regardless. The Google error is
  shown on the schedule with a **Try again** button. The sweep stops after 5 failed attempts until
  someone retries.
- **Meetings.** Stored as `ScheduledEvent` kind `meeting`: the host is the assignee, and invitees
  are `ScheduledEventAttendee` rows. The host or operations can change or cancel a meeting;
  invitees see it on their schedule and dashboard.
- **Join.** The Join button opens `meet.google.com` in a new tab. Google Meet cannot be embedded
  inside another site, so the call itself always happens in Meet, whether it is opened from the app
  or from Google Calendar.
- **Credentials.** Operations enters them under Settings → Google Calendar. They are saved only
  after a successful test, and the key is write-only on screen. Alternatively they can come from
  env: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_WORKSPACE_DOMAIN`, `GOOGLE_CALENDAR_ORGANIZER`.
- **Testing without Google.** `GOOGLE_CALENDAR_FAKE=1` is a stand-in that logs
  `calendar.fake_provider_active` on every call.

## Not built (stated)

- Two-way sync: edits made in Google Calendar do not change the app.
- Google Calendar's "free/busy" check when scheduling.
- Society portal accounts as invitees by picker (they can be invited by email).
