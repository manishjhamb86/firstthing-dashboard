# Help from the field app

2026-09-30. User-asked: "a help/chat section for my in-house team, where they can raise a concern,
a ticket, highlight any issue… notify a bug from the app directly… write down or speak the issue…
the app will fetch a screenshot of the current app screen… our AI will review the concern and try
to help… or create a ticket for the development team… or send an update to the concerned person…
the ticket can also include a picture… e.g. water leakage in the basement."

## Decisions (the user's)

| Question | Answer |
| --- | --- |
| Where the button lives | **Only in the field (phone) app.** People who receive reports read them in the back office's Help desk. |
| AI | **Gemini** on the current key, through the model fallback (`gemini-models.ts`). Claude later, if needed. |
| A site blocker notifies | **Whoever assigned the task, and the operations team.** Operations alone when no task is named. |
| Bug tickets live | **In the app only.** The code's GitHub repository is public and third-party; screenshots of our data must not go there. |
| Who receives bugs | **A "Receives bug reports" switch** on each admin account. |
| Voice | **Android: the phone's dictation** (text appears as they speak; nothing stored, no AI read). **iPhone: a recorded voice note**, stored with the report and transcribed by Gemini. Any other phone gets whichever it supports. |

## The flow

1. **Help button** on every field-app screen (floating, above the bottom tabs).
2. Tapping it first takes a **screenshot of the current app screen** (rendered from the page itself
   with `modern-screenshot`, before the help sheet opens, so the sheet is not in it). Only the app
   is captured, never the rest of the phone. The person sees it and can remove it.
3. The sheet asks what is wrong. Filled in by hand, with the attachments:
   - **what's wrong** — typed, dictated (Android) or a voice note (iPhone);
   - **photos** from the camera (up to 4);
   - optionally **which of my tasks** it is about (their open work).
   Added by the app, not the person: the page and its title, the time, the phone's app version, and
   the last errors the page hit.
4. **Send** saves it on the phone first (the outbox, `help.report`). With no signal it waits there
   like any other field work, so a report from a basement still gets through. Attachments go to
   the **private** `Help/{reportId}/` prefix (they can show customer data), served by signed links.
5. On arrival the server records it and asks Gemini to **triage** it, with the field-app guide
   (`src/lib/help-guide.ts`), the screenshot, the photos, the voice note, the page and the task.
   Gemini returns a category and a reply:
   - **question** — how to do something. The answer goes into the chat. The person can reply
     "that didn't help", which hands it to operations.
   - **bug** — something in the app not working as it should. A ticket for everyone with "Receives
     bug reports", with a short title, the steps as described, the page and the errors. The person
     gets a workaround if the guide has one.
   - **blocker** — something on site stopping the work (the basement leakage). Linked to the task,
     sent to its assigner and to operations with the photos. The task shows "Blocked — reported".
   - **suggestion** — "I expected X here". Logged for operations.
   The AI **never changes data**. It only answers and routes, and routing is decided in code from
   its category, not by the model.
6. When Gemini cannot read it (every model at its daily limit, or an error), the report is kept as
   *not read by the AI* and goes straight to operations. The sweep job retries the read later.
7. **Help desk** (back office, `/admin/help`) — every report with its category, screenshot,
   photos, voice note, transcript, the AI's reply and the chat. Staff reply, change the category,
   re-route or resolve it (resolving needs a note). The bell counts open reports.
8. The person sees their reports under **More → My help requests**, with the chat and replies.
   Staff replies reach them as a push notification (already built).

## Not built

- anything outside the app (email, WhatsApp, a tracker);
- the help button in the back office;
- screenshots of anything but the app's own screen.
