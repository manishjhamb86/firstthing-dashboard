# Field app (SUR-02 on Android) — decision and build plan

**Status:** Steps 1, 3 and 4 built; step 2's read path built (2026-09-29) · **Branch:** `android-app` (from `master` at `bb870a3`) ·
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
  - step 4, the monthly inspection filed with no signal.

  §11 and §12 say what exists and how it was verified.
- **§9 Q1 was not answered.** Inspection went first, as this plan recommended.
- **Next**: step 5, scan and collect-for-a-move offline, or step 6, the circuit/demo steps. Which
  comes next is the user's call. Step 0's reconciliation of `05-field.md` is still owed.

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
