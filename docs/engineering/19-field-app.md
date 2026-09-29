# Field app (SUR-02 on Android) — decision and build plan

**Status:** Steps 1, 3–7 built; step 2's read path built (2026-09-29) · **Branch:** `android-app` (from `master` at `bb870a3`) ·
**Decided:** 2026-09-29 · **Owner:** Yugesh

This file is where the Android field app resumes. It records what was decided on 2026-09-29, why,
what was researched, and the order to build it in. Read it together with
[`../product/05-screens/05-field.md`](../product/05-screens/05-field.md) (the field surface's own
rules and screens) and ADR-002.

---

## 1. Where to resume

- **Branch:** `android-app`, created from `master`. `portal-redesign` was merged into it as asked;
  the merge was a no-op because `portal-redesign` (local and `origin`) already pointed at the same
  commit as `master` (`bb870a3`).
- **Built so far (2026-09-29)**:
  - step 1, the installable shell;
  - step 2's online read path;
  - step 3, the outbox;
  - step 4, the monthly inspection filed with no signal;
  - step 5, stock scanning and one move for a scanned pile, with no signal;
  - step 6, a demo's meter install with its load test and its light replacement, with no signal;
  - step 7, an installation day with its photos, blockers, and the completion certificate, with no
    signal.

  §11–§15 say what exists and how it was verified.
- **§9 Q1 was not answered.** Inspection went first, as this plan recommended.
- **Next**: step 8, the survey — the hardest, with multi-person area claims. Step 0's
  reconciliation of `05-field.md` is still owed, and §14 records one scope call it should confirm
  (demo periods and readings stay in the back office).

---

## 2. The decision

**Build the Android app as an installable web app (a PWA) inside the existing Next.js app, at
`/field`.** Field staff open it in Chrome on their Android phones and add it to the home screen. It
opens full-screen with its own icon, works offline, and is updated by every normal deploy.

It is **not** a separate native Android app. A Play Store listing stays possible later without a
rewrite (§6).

This confirms the design choice already on record and changes no blueprint document:
- **ASSUM-12:** the field surface is mobile web, validated at Phase 0.
- **ADR-002:** offline through an IndexedDB outbox, with Route Handlers as the sync API.
- **ADR-001:** one deployable app.

The one refinement is that the app is now **installable**, not only a web page (see §4.1).

### Why (the user's stated purpose: "serve our in-field team")

1. **The work is forms, photos, scanning and checklists.** All of these run well in Chrome on
   Android: surveys, inventory counts, gate passes, meter install and load test, the demo readings,
   the replacement, installation days, inspections, stock scanning, and tasks. The phone-camera
   stock scanner (`/admin/inventory/scan`, 2026-09-25) already works this way in production, using
   the browser's barcode reader, or `jsqr` on iPhone.
2. **All the rules already live on the server.** Ordering and date checks, permissions,
   GATE-01/02, the demo lock, the freeze rules and billing guards are all in `src/lib/*` and the
   Server Actions. A native app would need a second copy of every screen plus a new JSON API for
   every action. This codebase has been caught out repeatedly by two rules answering one question,
   so a second client written in another language is the largest drift risk available.
3. **Deploy once, every phone updated.** No store review, and no field worker stuck on an old
   version that the server has since changed underneath. With a team of one person plus Claude
   Code, a second release train is the cost that matters most.
4. **Android only, on Chrome.** This is the platform where installable web apps are strongest
   (ASSUM-27: personal Android phones).

### Alternatives considered

| Option | Why not now |
|---|---|
| **Native Kotlin / Compose** | A separate codebase plus a JSON API for everything. It needs the Android toolchain, which is absent on this Mac (§10), and a Play Store release train. It reverses ADR-002, and the gain (background execution, native storage) is not needed by this work. |
| **React Native / Expo** | TypeScript is shared, but it is still a second UI codebase and still needs the new API. Expo's cloud builds avoid installing the SDK locally, but not the rest of the cost. |
| **Capacitor shell around the web app** | Kept as the **fallback** (§6), not the starting point. It adds native plugins (background upload, filesystem, push through FCM) around the same web code. |
| **Plain mobile web, not installable** | What `05-field.md` §0.7 originally said ("no install required"). Installing matters because it is what makes Chrome protect the offline data from eviction (§4.1). The app still works uninstalled; installing is the recommended path, not a requirement. |

---

## 3. What the research found (2026-09-29)

| Question | Finding | What it means here |
|---|---|---|
| Can work queued offline be sent after the app is closed? | Chrome on Android supports one-off **Background Sync**: the service worker wakes when connectivity returns, even with the page closed. The browser stops a sync that runs too long, and some devices have been reported to delay it. | Use it, but **never rely on it alone** (ADR-002 already said so). The app also drains the outbox on every open, every visibility change and every `online` event. Keep each sync request small: data first, then one photo per request. |
| Will offline data survive low storage? | Under storage pressure Chrome evicts an origin's IndexedDB and Cache Storage all at once (least recently used first), **unless** `navigator.storage.persist()` was granted. Chrome grants it on a heuristic that counts installation, engagement and notification permission, and it usually needs a user gesture. | **Install + `persist()` is the durability mechanism.** Request it from a tap (the first "Accept visit" or "Start"), show whether it was granted in the sync screen, and warn when it was not. `05-field.md` §0.1 ("unsynced records are never purged") depends on this. |
| Can it be published on the Play Store later? | Yes. A **Trusted Web Activity** built with Bubblewrap (or PWABuilder) wraps the same PWA in an Android package using full Chrome, not a WebView. It needs Digital Asset Links on the domain, a signing key, the $25 developer account and a decent Lighthouse PWA score. | No rewrite needed. It is a packaging step we can take whenever a store listing or sideloadable APK is wanted. |
| Camera, barcode, photos | `getUserMedia`, `BarcodeDetector` (Chrome on Android), and `<input capture>` for photos all work. The stock scanner already proves the camera path. | Photos follow `05-field.md` §0.3: downscale on-device to a 1,600px long edge, JPEG ~0.75, strip GPS, queue, then presigned PUT. |
| Push notifications | Web Push works for installed PWAs on Chrome Android, using VAPID keys; no email provider is needed. | Optional (§9). It could replace "check the app" for new assignments and meter-offline alerts. |

**Not needed, and not possible in a PWA:** location tracking while closed, and long-running
background uploads. Neither is part of this work. If large photo batches prove unreliable in
practice, move to the Capacitor fallback (§6).

**Sources:**
- [Chrome — Introducing Background Sync](https://developer.chrome.com/blog/background-sync)
- [MDN — Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
- [Workbox #1789 — background sync delays on Chrome for Android](https://github.com/GoogleChrome/workbox/issues/1789)
- [web.dev — Persistent storage](https://web.dev/articles/persistent-storage)
- [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [Android Developers — Trusted Web Activities quick start](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2)
- [Google codelab — Adding your PWA to Google Play](https://developers.google.com/codelabs/pwa-in-play)
- [MobiLoud — Publishing a PWA to the app stores in 2026](https://www.mobiloud.com/blog/publishing-pwa-app-store/)

Next.js's own guide is in the installed package, and must be read before building (AGENTS.md):
`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md` and
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`.

---

## 4. Architecture

### 4.1 Shape

- **Routes:** `src/app/field/*`, a third surface beside `/admin` and `/portal`, with its own
  layout. It has **no sidebar**: it is visit-scoped, with a bottom navigation and the sync bar
  (CMP-14) at the top (`05-field.md` §0.4).
- **Who gets in:** admin accounts whose team is field-shaped (engineering, inspection) and who hold
  `manage_survey`. Gates go through `resolveAdmin()`, never the token. Portal accounts never reach
  `/field` (INV-01). `proxy.ts` gains `/field` as an optimistic gate only.
- **Manifest:** `src/app/manifest.ts`, using the Next file convention. Name "FirsThing Field",
  `start_url: /field`, `display: standalone`, `scope: /field`, and FT monogram icons generated from
  `docs/product/brand/`.
- **Service worker:** `public/field-sw.js`, scoped to `/field`. It precaches the field shell, keeps
  runtime caches for the field's GET data, and handles `sync` events. It must not cache
  authenticated pages outside `/field`.
- **Local store:** IndexedDB with three stores:
  - `records`: the downloaded visit data, plus local drafts;
  - `outbox`: pending writes, ordered per device;
  - `photos`: processed image blobs waiting to upload.

  Request `navigator.storage.persist()` from a user tap.
- **Sync API:** Route Handlers under `/api/field/*` (ADR-002), following CONTRACT-01..11 in
  `09-architecture.md` §4. Server Actions do not fit a caller that may submit a day later.
  - **Idempotent by client-generated ids.** Every create carries a UUID made on the device, and a
    replay is a no-op (`05-field.md` §0.1 "Conflict").
  - **Each handler calls the SAME `src/lib` decision functions the admin screens use.** It is a
    thin JSON shell exactly as a Server Action is a thin form shell. No rule is re-implemented for
    the field.
  - **Refusals return a typed `{ error }` and a log line.** A refusal is a *poison item* on the
    device: after three rejections it stops the queue and is named on screen (§0.1).
- **Online-only exceptions:** gate-pass submit and approval (CONTRACT-04/05, CON-18) stay
  online-required by design, with the provisional-release sweep (ADR-006) behind them.
- **Photos:** the existing presigned-PUT pattern, requested from a field Route Handler. Structured
  data goes first and photos after (§0.3).
- **Session:** the same NextAuth credentials (CON-46). Field sessions are long-lived but **never
  expire mid-visit**. Sign-out is refused while the outbox is non-empty, and signing out purges
  cached society data (§0.7).
- **Theme:** Slate by default, from the account row, like everywhere else. `.roomy` density; 48px
  targets; text never below 15px (§0.8).

### 4.2 What the field does NOT do (§0.9, unchanged)

The field app does not browse other societies, show reports or analytics, edit what the office
owns, approve anything, or schedule its own visits. The field captures; the office decides.

---

## 5. Design reference

- The 2026-09-28 design canvas, **"FirsThing Field App"**, holds 8 phone screens:
  Today · My work · Circuit (current step) · Monthly inspection (offline) · Scan stock · Meter ·
  Alerts · More & sync outbox.
  <https://claude.ai/artifact/JnmBiaRzhkH8zZqXNS77tg>
  - It uses the web app's own tokens (Plus Jakarta Sans, `--accent-deep #2C4AE2`, chrome
    `#1C2434`, ok/warn/bad tones).
  - Its figures and names are illustrative, drawn from real dev data.
- The canvas was drawn before this plan. It is a visual direction, not a screen list. The screen
  list comes from §8 step 0.

---

## 6. Later: Play Store, and the fallback

- **Play Store / sideloadable APK:** wrap the PWA as a Trusted Web Activity with Bubblewrap. Needs:
  - JDK 17+ and the Android SDK on the build machine (neither is present, §10);
  - a signing key, stored outside the repo;
  - `/.well-known/assetlinks.json` served by the Next app;
  - a Google Play developer account ($25).

  The app content stays the web app; only a thin package is added.
- **Capacitor fallback:** used only if background photo upload or storage durability prove
  unreliable on the field team's actual phones. The same web code runs inside a native shell with
  background-upload and filesystem plugins. That decision would amend ADR-002 through the blueprint
  first.

**Revisit this whole decision when** company-issued devices replace personal phones (ADR-002's own
trigger), or when a capability the work genuinely needs has no web API.

---

## 7. Reconciliation the field spec needs (why step 0 exists)

`05-field.md` was specified on 2026-08-13. Much has changed in the live app since, and a field
screen built straight from the old spec would reintroduce flows the office side has moved past:

| Change since 2026-08-13 | Effect on the field screens |
|---|---|
| **Demo commissioning belongs to a demo** (2026-09-26): up to 3 demos per circuit; the step spine is `src/lib/demo-steps.ts`; demo periods; accepted day sets; the lock once shared | SCR-020..024 follow the per-demo steps, not the old per-circuit window. Readings are uploaded or typed against the demo's period. |
| **Kept fixtures** (2026-09-26/27): replaced vs kept per line, and the outcome after full installation | The replacement screen (SCR-023) records replaced/kept per inventory line. |
| **Full installation vs demo lights** (2026-09-27) | Counts on installation screens use `src/lib/light-population.ts`. |
| **Schedule & Tasks** (2026-08-25, 2026-09-25): one `ScheduledEvent` for visits, replacement days, meetings and tasks | SCR-171 "My visits" becomes "Today / My work", built from `ScheduledEvent` rows assigned to the person (the field-work list's two sources, 2026-08-25). |
| **Inspections** (2026-09-12): start → finalise, the circuit derives the area, the signed-checklist photo, line-item editing | The inspection is the first fully offline screen (§8 step 4). |
| **Inventory & scanning** (2026-09-25): unit codes, `/i/{code}` label links, collect-for-a-move | The field Scan tab reuses the scanner and `codeFromScan()`. |
| **Meters** (2026-08-28 onward): health, alerts, ownership | The field shows the meters the person owns and their alerts. Read-only apart from acknowledging. |
| **Installation dates correctable** (2026-09-27): the work date is asked for; past days can be recorded without photos | SCR-061 asks for the work date and supports the photo waiver for past days. |
| **Date-change requests after go-live** (2026-09-28) | The field never edits a recorded date after go-live; it would raise a request. Probably out of scope for v1. |

---

## 8. Build plan

Each step ends clean and is verified per CLAUDE.md:
- `tsc`, `lint`, `build` and `pnpm test` pass;
- a Playwright run on a 390px viewport with **network set to offline** where the step is offline;
- assertions on database rows and log lines, not rendered text;
- `PROJECT_CONTEXT.md` updated in the same change.

0. **Reconcile the screen list.** Walk `05-field.md` against §7. Produce the v1 screen list, and
   record the changes as a dated amendment in `05-field.md` and `docs/backlog.yaml` (AGENTS.md:
   scope changes go through the blueprint). Answer §9.
1. **Installable shell.** Build these pieces, then verify the result:
   - the manifest and icons;
   - `/field` layout (bottom nav, sync bar placeholder) and the access gate;
   - a service worker that opens the shell offline;
   - the install prompt;
   - `persist()` requested on a tap.

   *Done when:* the app installs on an Android phone, opens with no network, and a non-field
   account is refused server-side.
2. **Today & My work (read path).** These are built from `ScheduledEvent` + circuit replacement
   assignments + survey assignments, reusing the existing field-work list's sources. Visit data is
   downloaded on accept/open (§0.1 "What downloads") and read from IndexedDB when offline. Shows the
   stale-data banner.
3. **Outbox & sync.** Build these pieces:
   - the IndexedDB outbox;
   - `/api/field/*` with client-generated ids;
   - retry with backoff from 15 s to 5 min;
   - the poison-item handling;
   - the Background Sync registration, plus draining on open, visibility and `online`;
   - the More → "waiting to send" list;
   - sign-out blocked while anything is unsent.

   *Done when:* an item created offline survives an app kill and a phone restart, and syncs exactly
   once on reconnect.
4. **Monthly inspection, fully offline.** Start, fixtures, finalise and the signed-checklist photo,
   through the photo pipeline (§0.3). This is the first end-to-end proof of the offline model.
5. **Scan.** Open a unit, and collect-for-a-move offline, queued as one movement batch.
6. **Circuit / demo steps.** Meter & load test, readings for the demo periods, replacement with
   replaced/kept lines, following `demo-steps.ts`. The gate pass stays online-only.
7. **Installation day capture** (SCR-061) and the completion certificate (SCR-064).
8. **Survey** (SCR-010..013), including multi-person area claims (ADR-007). This is the hardest,
   and comes last on purpose.
9. **Optional:** Web Push for new assignments and meter-offline alerts. **Optional:** the TWA
   package (§6).

---

## 9. Open questions (answer before the step that needs them)

1. **v1 scope.** Is the first release inspections + tasks + scan (the lowest-risk offline proof),
   or must the demo/circuit steps be in v1? (Blocks step 0.)
2. **Who uses it.** Engineering and inspection teams only? Or also operations staff on site, and
   sales for survey visits? (Blocks step 1's gate.)
3. **Distribution.** Is "open the link in Chrome and Add to Home screen" enough, or is a Play Store
   listing or APK wanted for the team? (Decides whether §6's TWA work is scheduled.)
4. **Push notifications.** Wanted for v1? (Step 9, or earlier.)
5. **Cache retention.** Keep `05-field.md`'s 7-day purge of synced data on personal phones
   (ASSUM-27, still "assumed" and to be confirmed with the field team)?
6. **Session length for field accounts** (CON-46: "bounded more tightly than portal"). What number?

---

## 10. Environment notes (this Mac, 2026-09-29)

- Node v22 is present.
- **There is no working Java runtime** (`/usr/bin/java` is the macOS stub) and **no Android SDK**
  (`adb`, `sdkmanager` and `emulator` are all absent, and `ANDROID_HOME` is unset).
- None of this is needed for steps 0–9. It is needed only for the TWA package (§6), and then
  JDK 17+ and the Android command-line tools must be installed first.
- Testing on a real phone during development: run `pnpm dev` and open it from the phone over the
  LAN, or use stage. A service worker needs HTTPS or `localhost`, so real-phone testing of offline
  behaviour happens on stage, or through a tunnel with TLS.

---

## 11. What is built (2026-09-29)

**Step 1 — the installable shell.**

| Piece | Where | Notes |
|---|---|---|
| Manifest | `public/field.webmanifest` | `id`/`start_url`/`scope` = `/field`, standalone, portrait, chrome colour. Linked from `src/app/field/layout.tsx` only, so the back office never installs as "FirsThing Field". |
| Icons | `src/app/field-icon/[size]/route.tsx` | PNG 192/512 plus a maskable 512, drawn by `next/og` from the FT monogram. Outside `/field` on purpose: the browser fetches manifest icons without the session. |
| Service worker | `public/field-sw.js` | Hand-written (Serwist needs webpack). Scope `/field`. `/_next/static` cache-first; `/field` pages network-first, with the last copy kept for no signal and never a sign-in redirect kept; a page never opened → `public/field-offline.html`. A `clear` message empties the kept pages. `next.config.ts` serves it `no-store`. |
| Gate | `src/app/field/access.ts`, `src/proxy.ts` | `/field` is admin-only in the proxy (optimistic); every page re-checks from the row. **§9 Q2 answered provisionally**: any account holding `manage_survey` (engineering, inspection, operations by default). Others go to `/admin`, logged `field.access_refused`. |
| Shell | `src/app/field/field-shell.tsx` | Chrome top bar with an Online / No signal chip and banner; bottom tabs Today · Work · Scan · More, 60px targets, 15px text. Registers the worker. |
| More | `src/app/field/more/` | Account; "This phone" (installed? saved data protected? offline copy active? MB used); an Install button where Chrome offers one, otherwise the menu instruction; **Keep saved data safe** calls `navigator.storage.persist()` from a tap; sign-out clears the kept pages before signing out. |

**Step 2 — the read path, online.**
- **Today** (`/field`): the person's own open `ScheduledEvent`s, meaning visits, replacement days,
  meetings and tasks, split into not closed out / today / next 7 days. "Today" is India's wall-clock
  date (`src/lib/field-today.ts`, 7 unit cases). Each entry has a tap-to-call button when a contact
  phone is on it, and a warning card links to My work when jobs have no visit booked.
- **My work** (`/field/work`): the same rows as the back office's Field work page. The loader was
  moved into `src/lib/field-work.ts` so both read one query.
- **Scan** (`/field/scan`): the existing scanner component (`ScanClient`), reused, not copied.
- `scheduleEventHref()` in `src/lib/schedule.ts` is now shared by Tasks and Today.

**Not yet:**
- Tapping a job still opens its back-office screen, which is outside the app's scope, so the
  installed app shows it with a browser bar.
- No data is downloaded for offline use beyond the pages already opened. The IndexedDB records
  store and the outbox are step 3.
- Sign-out is not yet blocked by unsent work, because nothing can be unsent yet.

**Verified**: 32/32 in a production build (`pnpm start`) at Pixel 7 size.
- Manifest and icons are served without a session; the worker is served `no-store`.
- The worker is active with scope `/field` and controls the page after a full load.
- With the network off, Today and My work open from the phone, the header says No signal, and a
  page never opened shows the offline page.
- Sign-out empties the kept pages and `/field` then needs sign-in again.
- Sales and finance are refused, with log lines.
- Scan opens inside the app.
- The back office's Field work links to the app and carries no manifest.
- There is no sideways scroll on any tab, and no console errors.

**Two lessons for later steps:**
- Sign-in reaches `/field` by client-side navigation. That page is still the `/login` document,
  outside the worker's scope, so it is not controlled until the next full load. A launch from the
  home screen is a full load, so this only matters in tests.
- The dev DB tunnel can drop mid-run and presents as a hung login. Check the server log before
  debugging the app.


## 12. Steps 3 and 4 — the outbox, and the inspection offline (2026-09-29)

**The outbox (step 3).**

| Piece | Where | Notes |
|---|---|---|
| Phone store | `src/app/field/outbox-db.ts` | IndexedDB `ft-field` v1 with three stores: `outbox` (ordered by `seq`, each item with a device UUID, `refusals`, `failures`, `lastError`, `state` pending/blocked), `photos` (processed blobs), and `drafts` (a form in progress). The same layout is written in `public/field-sw.js`; change both together. |
| Sender | `public/field-sw.js` | The one place items are sent from. It is asked by the app ("drain") and by Background Sync (`ft-outbox`). Items go strictly in order and sending stops at the first that cannot be sent. A reply is read as `classifyReply` reads it: 2xx done, 401 sign in (no strike), 400/403/409/422 refused (a strike; three strikes blocks the queue), anything else retried. A photo goes as upload-url → PUT to S3 → attach. |
| Triggers | `src/app/field/outbox-provider.tsx` | Sends on open, when signal returns, when the app becomes visible, after a save, and on a backoff of 15 s doubling to a 5-minute cap (`retryDelayMs`). Background Sync is registered, but it is never the only trigger. The provider also warms the core pages and their scripts once a session. |
| Server | `src/app/api/field/sync`, `src/app/api/field/upload-url` | Route Handlers that check access from the row. A **`FieldSyncReceipt`** (migration `20260929120000`, additive) is written in the same transaction as the work, so a replay returns the stored result and files nothing twice. A race between two sends is caught by the primary key and answered as a replay. Log lines: `field.sync_applied`, `field.sync_refused`, `field.sync_replayed`, `field.photo_presigned`. |
| Rules | `src/lib/field-sync.ts` | Envelope and payload shapes, `classifyReply`, `retryDelayMs`, `afterRefusal`. 8 unit cases. |
| Screens | `field-shell.tsx`, `waiting-item.tsx`, `more/` | The header chip reads **All sent / Sending N… / N saved on phone / N need attention / Sign in to send**. More lists everything waiting. A blocked item shows the office's own reason, with **Try again** and **Discard** (an inspection is discarded with its photo). Sign-out is **refused while anything is waiting**; otherwise it clears the kept pages and deletes the phone store. |

**The inspection offline (step 4).**
- `/field/inspections/new` files a whole inspection in one go: header, faulty fixtures, total,
  representative, notes and the signed-checklist photo. On the phone no server can claim the slot in
  between, so the back office's two acts arrive together.
- The server runs `fileInspection` (`src/lib/inspection-file.ts`), which is **the same refusals
  from `inspection.ts` in the same order**: a third entry point to one decision.
- The form's choices come from `loadInspectionChoices`, now shared with the back office's form.
- The draft is kept on the phone as it is typed, and the photo is processed on the phone first
  (`photo.ts`).
- `/field/inspections` lists what this person filed and what is still on the phone.

**Fixed along the way (the back office too).** A typed visit time is stored wall-clock, but
"is this in the future?" was checked against the server's real instant. Every correctly typed visit
was therefore refused for the 5½ hours India is ahead of UTC, and the back office's form defaulted
to the UTC clock. `inspectionNow()` is India's wall clock, and both paths use it. Verified: a visit
at the current IST minute is filed, and one an hour ahead is refused.

**Found by the e2e, fixed:** the service worker's CSP from Next's guide (`default-src 'self'`)
governs the worker's own fetches, and it silently blocked every photo upload to S3. It now allows
`connect-src 'self' https://*.amazonaws.com`.

**Verified**: 27/27 on a production build at Pixel 7 size, asserted on database rows and log lines.
- The warm-up kept the form on the phone before it was ever opened.
- With the network off:
  - the form opens and fills;
  - a photo is taken and previewed;
  - a reload brings the draft and photo back;
  - saving shows "2 saved on phone" while the database holds nothing;
  - sign-out is refused and says why.
- Back online, the inspection and its photo arrived by themselves:
  - stored exactly as typed, fixture included;
  - two receipts;
  - the photo under `Documents/…/Inspections/` as a re-encoded JPEG;
  - the header reads "All sent" and sign-out is allowed again.
- A replay of the same item filed nothing twice.
- A duplicate slot:
  - was refused by the server with a `field.sync_refused` line;
  - blocked after three tries with "1 needs attention" and the office's reason;
  - filed nothing, and Discard cleared it.
- Sign-out left no kept pages and no phone store. There were no console errors.
- Step 1's suite still passes, 32/32.

Test rows were removed and confirmed by count.

**Not yet:** a 401 mid-queue was not driven end to end. The rule is unit-tested and the banner exists.


## 13. Step 5 — scanning stock with no signal (2026-09-29)

- **One move rule, three callers.** The per-unit logic moved out of the Server Action into
  `src/lib/inventory-move.ts`:
  - `applyUnitMove` is inventory.ts's `nextState` per unit, plus a ledger row and the unit's new
    state;
  - `refuseUnitMove` is the whole-move check (date, reason);
  - `moveDestination` and `siteFor` are shared too.

  The back office's `moveUnits` now runs it in **one transaction**; before, each unit had its own,
  so a crash could leave a move half-applied. The phone's queued move runs it inside the same
  transaction as its sync receipt.
- **The scanner is shared, with two hooks** (`ScanClient`: `lookup`, `recordMove`). The back
  office passes neither and is unchanged. The field app's `FieldScan`:
  - looks a code up only with signal. With none, the code is kept and marked **"Checked when
    sent"**;
  - saves the move as a `stock.move` outbox item. The screen says "Saved on this phone — N units".
- **Nothing refused is silently lost.** A move of forty units where two cannot move still moves the
  other 38. The worker records what the office said for each sent item in a new `sent` store
  (IndexedDB **v2**, in both `outbox-db.ts` and `field-sw.js`, keeping the last 30). More → **Recently
  sent** shows "38 done · 2 not" and names each refused code with its reason.
- A whole-move refusal, such as a future date or no destination, is a 422: the item counts a strike
  and blocks after three, like any other.
- `/field/scan` joins the warm-up, so Scan opens with no signal.

**A defect in the warm-up, found by repeated runs and fixed.** Going offline while the warm-up was
still running could leave a page in the cache without the scripts it needs. It then opened as
"This page couldn't load". Now:
- the warm-up collects every `/_next/static/…` path in the page, including the chunks named in
  Next's inline data;
- it stores the page **last**, only once every asset is stored. A kept page always works, and one
  that is not ready gets the offline page.

Worker version is v4.

**Verified:**
- `field-scan.mjs` 17/17 with a labelled stock fixture (two movable units, one scrapped, one code
  that is nobody's):
  - with no signal, all four scanned and marked "Checked when sent", one deploy saved, nothing
    moved;
  - back online, the two good units were deployed at the society's site with two ledger rows by the
    inspector;
  - the scrapped unit was untouched, the receipt names the two refused, and More shows
    "2 done · 2 not" with each reason;
  - the online lookup is immediate;
  - the back office scanner returned a unit through the shared code.
- The fixture was removed and confirmed by count.
- The inspection suite passed 27/27 three runs in a row after the warm-up fix; step 1's suite passed
  32/32.
- 1,189 unit tests; `tsc`/`lint`/`build` clean. No schema change.

---

## 14. Step 6 — a demo's on-site steps with no signal (2026-09-29)

**What the phone does.** `/field/demo/[demoId]` is the crew's screen for one demo:
- the booked replacement day, the crew, and a tap-to-call for the society's contact;
- what the office already has on record (meter, load test, replacement);
- **Meter & load test** — the meter, the day it went in, and the load it shows. The phone works out
  the difference against the demo's lights (the same `expectedDisplayedLoadW` the back office uses)
  and says whether it is inside ±10%, before anything is sent;
- **Light replacement** — the day the last light went in and, per fixture line, what replaced it,
  how many and at what wattage, or "not replaced — exclude from the benchmark". A partial count
  states how many are kept.

Both are saved on the phone and queued as `demo.meter` and `demo.replacement`. The replacement
opens once the meter is on record **or saved on this phone**, so a crew can do both in one basement
visit; the queue sends them in order, so the meter always reaches the office first.

**One set of rules.** The two steps' bodies moved out of the circuit page's Server Actions into
`src/lib/demo-step-core.ts` (`recordDemoMeterAs`, `recordDemoReplacementAs`). The back office's
actions and the sync route both call them, so the phone is refused for exactly what the desk is:
a locked (shared) demo, a meter already elsewhere, a replacement before the meter, a line replaced
by a device not in its compatibility list, and so on. The core takes an account rather than reading
the session, and it lives in a lib module because a `"use server"` file exposes every export to the
browser.

**Receipts for these two kinds are written after the work, not in the same transaction.** The
cores run their own transactions (the meter step writes the meter's history, the replacement
re-derives the circuit's figures). A retry that races a finished one is caught by the receipt's
unique id and answered as a replay; both steps set values rather than add them, so running one
twice leaves the same row.

**"Saved — check this."** An out-of-tolerance load test is not a refusal: the office keeps it, as
the desk does, so an override can be recorded against it. The reply carries the warning, the
worker keeps it with the sent item, and More → Recently sent shows it instead of "Reached the
office".

**On the phone before it is needed.** My work links a replacement job to this screen, and the
field layout hands the person's own job pages to the warm-up, which re-runs whenever that list
changes. A demo assigned this morning opens in the basement without ever having been opened.

**Scope call, for step 0 to confirm.** The plan listed "readings for the demo periods". They were
left in the back office on purpose: a demo's days come from the meter's own hourly store, and
accepting them — or typing a paper demo's days — is a desk review of figures a benchmark rests on,
not site work. Setting the pre/post periods stays there for the same reason. The gate pass stays
online-only, as planned.

**Also fixed: a sign-out race in the worker.** A warm-up still running when a person signed out
could put a page back into the cache just after sign-out emptied it, leaving the last person's page
on a shared phone. Sign-out now bumps a generation counter, and a page fetched under an older
generation is never kept. Worker version v6.

**Verified:**
- `field-demo.mjs` 21/21 at Pixel 7 size, on a disposable circuit, demo, fixture line, booked day
  and an unassigned meter:
  - the warm-up kept the demo page without it being opened, and My work links to it;
  - with no signal the page opened with the contact, the load test read 15.0% off for 460 W against
    400 W, the replacement opened off the meter saved on the phone, and 18 of 20 read "2 kept";
  - nothing reached the office until the signal came back; then both steps arrived in order,
    stored as typed (meter, date, 460 W, 15.0%, replacement day, 18 × the compatible device), with
    the meter's history entry and two receipts;
  - More showed "Saved — check this";
  - a replayed item returned the stored result and changed nothing; a replacement dated before the
    meter was refused by the server with 422 and nothing changed;
  - the back office's circuit page shows the replacement recorded from the phone.
- Fixtures removed and confirmed by count, the meter's assignment cleared back to none.
- Regression: shell 32/32 (twice), inspection 27/27, scan 17/17.
- 1,191 unit tests; `tsc`/`lint`/`build` clean. No schema change.

---

## 15. Step 7 — installation days, blockers and the certificate with no signal (2026-09-29)

**What the phone does.** `/field/installation/[pipelineId]` is the crew's screen for one
installation:
- every planned day with its review-gate state as the office last knew it, and the gate's reason
  when a day is blocked;
- **Record a day** — installed, old fittings removed, skipped (with the reason the office requires),
  where exactly, the date of the work, and up to 12 photos taken with the camera and previewed on
  the phone. A past day with no photos asks why, as the desk does;
- **Raise a blocker** — its kind, a description, the area and day affected, and for a count
  discrepancy the count found on site;
- **Completion certificate** — offered only to the operations lead, as at the desk. It lists what
  the office last knew is not ready, and can be saved anyway; the office checks again when it
  arrives.

All three are queued: `installation.day`, `installation.blocker`, `installation.certificate`.

**One set of rules.** Starting a day, submitting it, raising a blocker and signing the certificate
moved into `src/lib/installation-core.ts`, called by both the back office's Server Actions and the
sync route. The phone's day is one act (`recordDayAs`): open the day's batch through the review
gate, judged when the work reaches the office, then submit it. One rule was added on both paths: a
certificate cannot be dated in the future.

**Photos travel before the day.** The service worker uploads a day's photos one at a time, saving
each key on the item as it lands, so a dropped connection resumes at the next photo. The keys are
deterministic per planned day and photo number (`batchPhotoKey`): a photo sent twice overwrites
itself rather than leaving a second object this app cannot delete, and the sync route accepts only
keys it would itself have issued for that day.

**Idempotency.** The blocker is one insert, so it commits with its receipt. The day and the
certificate run their own transactions and a second attempt would be refused ("already
submitted", "already signed"), so after a lost reply the route recognises its own earlier success
— the same account's same counts and photos, or the same signatory and date — and answers it as
applied.

**Also changed:**
- **My work shows an installation to the crew assigned its days**, not only to whoever ran the
  survey. The back office's Field work page shares that loader and changes the same way.
- The discard prompt named every non-inspection item "this photo"; it now names each kind.

**Verified:**
- `field-install.mjs` 26/26 at Pixel 7 size on a disposable deal and project with two planned days
  assigned to the inspector:
  - the page was kept on the phone for a crew member who holds a day but not the survey;
  - with no signal: skipped lights refused without a reason, two photos previewed, day 1 saved and
    gone from the open days, a count-discrepancy blocker saved, the certificate not offered to a
    field account, nothing at the office;
  - back online: day 1 awaiting the society exactly as typed with two photos keyed to the planned
    day and present in the bucket as JPEGs, the blocker with its count, two receipts;
  - a replay, and a retry under a fresh id after a "lost reply", both answered without a second
    batch; a photo key the office never issued refused; a field account's certificate refused 403;
  - operations: the certificate was refused while days were unapproved and the blocker open, its
    reason shown on the phone, nothing signed; once the office made it ready, the same saved item
    applied on its own retry — signed 28-09, billing from 29-09 (2 days), the deal in billing.
- `office-install.mjs`: the back office starts and submits a day through the shared core.
- Regression: shell 32/32, inspection 27/27, scan 17/17, demo 21/21. Fixtures removed by count.
- 1,195 unit tests; `tsc`/`lint`/`build` clean. No schema change.
- The test photos remain in the bucket under `Documents/Print_Back_Co/2026-09/Installation/` —
  the app's credentials cannot delete an object, the standing limitation.

---

## 16. Step 8 — the survey shell: design (2026-09-29, the user's call)

**Decided by the user (2026-09-29):**
- **Scope: the full spec shell.** All four sections — society profile & access (SCR-010), lighting
  inventory (SCR-011), circuit selection (SCR-012), pump room audit & logbook (SCR-013) — plus
  per-section state, submission, and the survey read-only for everyone once submitted.
- **Double counting: area claims.** Each inventory row records who counted it; counting an area
  someone else counted warns first; two phones that counted one area offline mark it **contested**,
  and it is settled — one count chosen, with a reason — before the survey can be submitted.
  Contested rows are never summed, deduplicated or silently merged.

**Reconciled against what exists (step 0, for the survey only).** `05-field.md` was specified on
2026-08-13; where the live app has since moved, the live app wins and the spec is amended:

| Spec (2026-08-13) | Live app since | Built as |
|---|---|---|
| SCR-010's committee list lives on the survey because no `Society` row exists yet | A society exists from the lead onward, with a member register and managed positions (2026-09-25) | The committee is written **into the society's member register**. The register's rules win: a mobile number is required, the same mobile twice among current members is refused. "Primary contact" is a new flag on the member (one per society). Security in-charge and Electrician join the positions list. |
| Coordinates on the survey, promoted on signing | `Society.latitude/longitude` exist | Captured on the survey (with accuracy and whether the pin was moved by hand) and copied to the society at submission when the society has none. |
| SCR-012 with the original five CON-16 criteria | "Shared appliances" removed 2026-08-26 (kept fixtures instead); device lines from the catalog; the capture-time exception | The phone uses the office candidate's rules through a shared core. Added from the spec: the **typicality answer** (required) and a **panel photo** (required). A light type can be marked **unresolvable** with a reason. |
| A survey-level `status` | None exists; the office survey is edited freely | `SiteSurvey.status` draft → submitted. After submission every survey write — phone and office — is refused, except in a section the office has **queried**, which reopens that section only. A survey the office fills in by hand is never submitted and so never locked: nothing changes for it. |
| Inventory method walked / estimated | Same | Adds **from the society's records**. Estimated still needs a note. |
| SCR-013 | No model at all | New: the room's structure, the generated per-unit list, per-unit photos, and the month-tagged logbook. |

**Schema** (one additive migration):
- `SiteSurvey` gains `status`, `submittedAt/ById`, and the SCR-010 fields (address, coordinates and
  accuracy, pin moved by hand, RWA member count, next election, gate contact, access hours, notice,
  parking, pass/ID).
- `SurveySection` — one row per survey and section: state (not started / in progress / complete /
  flagged / queried), the flag reason, the office's query note.
- `SurveyPhoto` — every survey photo: site, area row, circuit panel, pump unit, logbook page (with
  its month). Keys are deterministic per subject and number, as for installation days.
- `LightingInventoryArea` gains `areaType`, `label`, `countedById`, and a soft void (the losing
  side of a settled contest). Every read of the inventory filters voided rows.
- `SurveyTypeOutcome` — a light type marked unresolvable, with the reason.
- `Circuit.typicalityNote`.
- `PumpRoomAudit` (the structure, no-access and logbook-not-maintained) and `PumpRoomUnit` (one per
  generated unit: installed, brand, model, condition).
- `FieldVisitType.survey`; `FieldVisitParticipant` gains the phone's last reported pending count, so
  submission can name a teammate whose phone still holds work.
- `SocietyMember.primaryContact`.

**Idempotency.** Rows the phone creates carry ids made on the phone, so a replay finds the row
instead of making a second one; section and profile saves set values. Photos use the day-photo
pattern: uploaded first, keys issued per subject and checked on arrival.

**Build order:** 8a schema, shell, submission and the lock, and SCR-010 · 8b SCR-011 with claims ·
8c SCR-012 · 8d SCR-013 · 8e the office's review of a submitted survey (sections, contests, gaps,
query a section).

### 16a. Built: the shell, the lock, and the society profile (2026-09-29)

- Migration `20260929140000_survey_shell` (additive): everything in the schema list above, plus a
  partial unique index — one current primary contact per society — and the two new positions.
- `src/lib/survey-shell.ts` (pure, 11 cases): sections, what completes the profile, the lock
  (`refuseSurveyWrite`: a draft is open; after submission the field team is read-only except in a
  queried section; operations, reviewing, may still correct), submission blockers, and area keys and
  contests for 8b.
- `src/lib/survey-core.ts`: saving the profile, adding a committee member into the register (the id
  made on the phone), moving the primary mark, setting a section (complete refused with each gap
  named; flagged needs a reason), submitting (sections, contests, teammates' unsent work; the
  society takes the surveyed location when it has none), the office's query, and the phone's
  pending-count report (`/api/field/presence`). Anyone who writes to a survey joins its visit.
- The office's survey actions obey the same lock for field accounts.
- The sync route now runs every "act first, receipt after" kind from one table (`OUTSIDE`): the
  demo steps, the installation day and certificate, and the five survey kinds.
- Phone: `/field/survey/[pipelineId]` (the four sections, their states, submission) and `/profile`
  (location from the phone or by hand, address, the committee with the primary mark, governance,
  access), all kept for offline through the warm-up. The office's inventory form gained the third
  count method, "from the society's records".
- The phone's item kinds now come from the one list in `field-sync.ts`.

**Verified** `field-survey-a.mjs` 27/27: offline capture, the committee in the register exactly as
typed with the primary mark moved not duplicated, a duplicate mobile refused by the server, a
teammate's phone reporting unsent work and submission naming them until it arrived, flagging with
reasons, submission from the phone, the society's location filled, the lock refusing a field write,
operations still able to write, and a queried section — only that one — reopened. Inventory,
circuits and pump room can only be flagged until 8b–8d build them.

### 16b. Built: the lighting inventory with area claims (2026-09-29)

- `/field/survey/[pipelineId]/inventory` (SCR-011): the running total (a live region), the per-type
  roll-up labelled as the extrapolation base with a warning below 50 lights of a type, each area
  with its count, type, method (walked · society's records · estimated, the last needing a note)
  and who counted it, a confirmation above 2,000 in one area, and complete / flag.
- **The claim is the row itself**: every row records who counted it. Counting an area someone else
  counted asks first, naming them and when. Two people's counts of one area — made offline, both
  sent — are both kept and the area is **contested**: left out of the total (the screen says so),
  shown side by side, and settled by choosing one count with a reason. The other rows are voided,
  not deleted, with who decided and why. The inventory cannot complete, nor the survey submit,
  while an area is contested. The office's survey page names contested areas and who counted each.
- Every read of the inventory elsewhere (offer, installation, demo report, deal facts, field work,
  the circuit page) now skips voided rows.
- **Two defects found by running two phones at once, fixed:**
  - the first write to a section by two phones at the same moment failed the second on the unique
    key (a 500, then a minute's backoff). Section rows and the visit's team are now inserted with
    "skip if present", and the survey's visit has an id derived from the survey, so two phones can
    never make two visits;
  - a request the service worker started just as the signal went could hang and hold the whole
    queue. Its requests now time out (30 s; 2 min for photo uploads). Worker v8.
  An unexpected error in the sync route now answers a logged 500 with a sentence.

**Verified** `field-survey-b.mjs` 17/17: two phones offline counting one staircase (30 and 34),
both arriving with who counted each; completion refused naming the area; the office warned; the
phone leaving it out of the total; keeping 30 with a reason voided 34 with the decision recorded;
re-counting a counted area asked first and cancelling saved nothing; completion then accepted and
downstream reads seeing only live rows. 8a's suite 27/27 and every earlier field suite still pass.

### 16c. Built: circuit selection per light type (2026-09-29)

- The office's candidate rules moved, unchanged, into `src/lib/circuit-candidate-core.ts`
  (`recordCandidateAs`); the office action is a shell around it, and so is the phone's path.
- `/field/survey/[pipelineId]/circuits` (SCR-012): one card per light type, generated from the live
  inventory, stating the lights it will represent. A candidate records the panel and its place,
  the fittings on the circuit from the device catalog (wattage prefilled), the three remaining
  CON-16 checks one by one, the **typicality answer** (required: "same fixtures, hours, switching?")
  and **a photo of the panel** (required). Under 50 lights it saves and says it will wait on an
  operations exception; a failed check saves it as ineligible, kept on record, and asks for
  another candidate. A type can be marked **no eligible circuit** with what was found
  (`SurveyTypeOutcome`). The section completes only when every type has an outcome.
- The **represented count is not typed on the phone**: it is the type's surveyed total less the
  lights on this circuit (the demo's own lights), from the live inventory. A circuit that holds
  every light of its type is refused — it has to be a sample.
- **Survey photos**: a new document type (`Documents/{Society}/{YYYY-MM}/Surveys/…`), keys
  deterministic per survey, subject and number (`surveyPhotoKey`), accepted only when issued for
  that subject. The worker's multi-photo upload is now general: an item names what its photos are
  for (`upload`), and the installation day uses the same path. Worker v9.

**Verified** `field-survey-c.mjs` 20/20: offline, a staircase candidate with its fitting, checks,
typicality (a one-word answer refused) and a panel photo (none refused), and the basement marked
as having no eligible circuit; back online, the circuit eligible representing 300 − 60 = 240 with
its fitting line, the photo keyed to the circuit and in the bucket, the basement's reason stored;
the server refusing a candidate with no photo, a forged photo key, and a circuit that is the whole
type; the section completing. Installation, inspection and the two earlier survey suites still pass.

### 16d. Built: the pump room audit and logbook (2026-09-29)

- `src/lib/pump-room.ts` (pure, 9 cases): the room's structure (pass 1: pump type, HP 0.5–200,
  count 1–20, feed and outflow pipes, VFD per pump or shared, towers with their tanks), the unit
  list it generates (flow meter, pressure switch and energy meter for the room; a VFD per pump or
  one shared; a float switch and an actuator valve per tank, named "Tower B, Tank 2"), what each
  unit's answer needs (not fitted ends the row; fitted needs brand, model, condition and a photo,
  named by the unit), the 13 logbook months, and what completes the section.
- `/field/survey/[pipelineId]/pump-room` (SCR-013): pass 1 collapses to a summary once saved; pass
  2 groups the generated units by category with a running "N of M recorded"; "Same as…" copies
  brand, model and condition from an answered unit while its photo stays its own; the logbook has
  a 13-month strip, a month chosen for each page (never inferred), and "the room keeps no logbook"
  as an answer; the section completes, or is flagged "no access" with a reason. Large targets.
- Changing the structure adds the rows it now implies and removes the ones it no longer does (the
  phone warns before an answered row goes); answering a removed unit is refused.
- A unit or a logbook month can be photographed in more than one sitting, so each sitting's photos
  carry a batch id in their key — a second sitting never overwrites the first.

**Verified** `field-survey-d.mjs` 19/19: offline, a 250 HP pump refused, the room generating
7 units, every unit answered (a copied VFD still needing its own photo, a fitted float switch
without one refused by name), the section waiting on the logbook until a page was photographed;
back online, the structure, all 7 answers, a photo for each fitted unit and the logbook page with
its month, each with its own key and in the bucket; removing the tank leaving 5 units, and
answering a removed one refused. The three earlier survey suites still pass.

### 16e. Built: the office's review of a field survey (2026-09-29)

- The office's survey page (`/admin/pipeline/[id]/survey`) opens with a **Field survey** card when
  the phone has worked on the survey (`field-review.tsx`). A survey filled in at the desk has no
  section rows, so the card does not appear and the page is unchanged. The card shows:
  - whether the survey was submitted, when, and by whom;
  - each section's state; a flagged section's reason, a queried one's note, and an unfinished one's
    first gaps;
  - any areas still contested;
  - the profile and access: the address, the pin with its accuracy (or "entered by hand"), the
    primary contact, the gate contact, the access hours and notice, and the election;
  - each phone-recorded circuit's typicality answer and panel photos, and every light type marked
    as having no eligible circuit, with its reason and who recorded it;
  - the pump room: its structure, each unit's answer with its photos, and the logbook months with
    their pages.
- **Query this section** (operations, on a submitted survey): the control stays closed until asked
  for, and a note is required. It calls `querySectionAs`, so it is refused on the server for anyone
  without both permissions, and the refusal is logged `survey.query_refused`. The section reopens
  on every phone with "The office asks: …" pinned at its top. The other sections stay read-only. A
  queried section is not offered a second query.

**Verified** `field-survey-e.mjs` 16/16:
- on a submitted fixture, every part of the card showed;
- the query was refused once `manage_pipeline` was removed behind the open form: nothing was written
  and the refusal was logged;
- with the permission back, the query stored its note;
- the phone showed the question, with the inventory open again and the pump room still read-only;
- a field account saw the review but was offered no query.

8a's suite passes 27/27.

**Step 8 is complete.** Not built:
- SCR-010's optional site photos;
- proposing a new device from the phone;
- approving the light-count exception on the phone, at capture time (operations still approve it on
  the office's survey page).
