/**
 * What the AI knows about the field app when it answers a Help report
 * (docs/engineering/21-field-help.md). Written from the screens as built
 * (docs/engineering/19-field-app.md §11–18). Keep it true: when a screen
 * changes, change this, or the AI will teach the old way.
 */
export const FIELD_APP_GUIDE = `
FIRSTHING FIELD — the phone app the field team uses (installed from the browser, at /field).

GENERAL
- Four tabs at the bottom: Today (your appointments for today), Work (everything assigned to you: surveys, demos, light replacements, installation days), Scan (stock scanning), More (settings, what is waiting to send, notifications, sign out).
- Everything you save is kept ON THE PHONE first and sent when there is signal. The chip at the top right says where your work is: "All sent", "Sending N…", "N saved on phone" (no signal — it will send by itself later), "Sign in to send" (your session ended — sign in again, nothing is lost), "N need(s) attention" (the office refused something three times — open More to see why, then Try again or Discard).
- With no signal a yellow bar says so. Keep working; pages you opened before still open. A page never opened before cannot open offline.
- Sign out is refused while work is still waiting to send, so nothing is lost. Send it first (get signal), then sign out.
- Install the app: Android Chrome → menu (⋮) → "Add to Home screen" / "Install app". iPhone Safari → Share → "Add to Home Screen". Installing also protects saved work from being cleared (More shows "Saved data is protected").
- Notifications: More → Notifications → turn on. You then get a notification when work is assigned to you or a meter you look after goes offline.
- Photos: "Take a photo" uses the camera. Photos are shrunk and their location removed before sending. Several photos can be added where the form allows.
- The field app cannot: upload meter readings, set demo periods, approve gate passes, see the commissioning monitor, or change billing. Those are done in the back office by operations.

TODAY / WORK
- Work lists every job assigned to you with when it is due and who to ask for on site. Tap a job to open its screen. A job drops off the list once its work is recorded.
- If something assigned to you is missing, it may be assigned to someone else, or its date/assignment is still being arranged in the back office — ask operations.

MONTHLY INSPECTION (More → Inspections, or Work)
- New inspection: choose the society and circuit, then record each faulty fixture (location, sensor state, damage, to be replaced, remarks), the total lights checked, the society representative, and a photo of the signed checklist. "Save inspection" keeps it on the phone and sends it.
- The time you typed is the local time of the visit. A visit cannot be dated in the future.

SCAN STOCK (Scan tab)
- Point the camera at a unit's QR label, or type the code. "Collect for a move" gathers several units, then records one move (deploy to a society, return, faulty, etc.).
- With no signal, scanned codes are marked "Checked when sent" and the move is queued. If some codes are refused, More → Recently sent names each one and why (e.g. a faulty unit cannot be deployed; a deployed unit must come back before it is scrapped).

DEMO — METER INSTALL AND LIGHT REPLACEMENT (Work → the demo job)
- Meter install: record the date and the load test (the displayed load against lights × watts). An out-of-tolerance load test is still saved and shows "Saved — check this"; operations reviews it.
- Light replacement opens only after the meter install is saved and the replacement is assigned and scheduled. Record per fixture line what was replaced and with which fitting; lines not replaced are kept (excluded from the benchmark). "Save the replacement".

INSTALLATION DAYS (Work → the installation job)
- Record a day: counts per line, the work date, photos (required unless the day is recorded after the fact), skipped lines with a reason. "Record a day".
- Raise a blocker: "Raise a blocker" — what is in the way. A light count different from the contract is recorded, never applied by itself.
- The completion certificate can be saved only by the operations lead, once every day is approved.

SITE SURVEY (Work → the survey job)
- Four sections: profile & access (committee, primary contact, access hours, pass/ID, notice before a visit), lighting inventory (areas; walked and counted or estimated with a note), circuit selection (one demo circuit per light type, with typicality and a panel photo), pump room and logbook.
- Two phones can count areas at once; if two people count the same area it shows as contested and is left out of the total until one count is chosen.
- "Submit the survey" when every section is done. It is refused while an area is contested or a teammate's phone still holds unsent survey work (it names who). After submitting, the survey is read only unless the office queries a section, which reopens that section only.

WHEN SOMETHING IS WRONG
- A button that does nothing is often the form refusing a missing field — look for red text near the top or the field. If the chip says "Sign in to send", sign in again.
- If the app behaves wrongly, report it with the Help button: it sends a screenshot to the office.
`.trim();
