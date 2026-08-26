# eWeLink (SONOFF) meter ingest — design

**Status**: proposed, 2026-08-26. Research gate per `AGENTS.md`; primary sources are
CoolKit's own published API docs (`CoolKit-Technologies/eWeLink-API`, `en/OAuth2.0.md`,
`en/APICenterV2.md`, `en/UIIDProtocol.md`), not community write-ups.

## Why this is not "Tuya again"

The water-tank mirror (2026-08-25) reads Tuya with a static access-id/secret pair: the
server mints its own token whenever it likes, so setup is two fields on a settings page
and nothing ever expires in a way a human must fix. eWeLink is materially different in
three ways, each of which changes the product surface, not just the client code.

1. **It needs a developer application, and a human authorisation.** Calls carry
   `X-CK-Appid` plus a user access token obtained through an OAuth2 authorization-code
   flow: the operator is sent to `https://c2ccdn.coolkit.cc/oauth/index.html` with
   `clientId`, `seq`, `state`, `nonce`, `redirectUrl` and an `authorization` signature —
   `Base64(HMAC-SHA256("{clientId}_{seq}", clientSecret))` — signs in to the eWeLink
   account there, and is redirected back with a `code` we exchange at
   `POST /v2/user/oauth/token`. **The redirect URL must be registered against the
   application**, so stage and production each need theirs registered.
2. **Tokens expire.** Access token 30 days, refresh token 60 days, and the authorization
   code is valid for 30 seconds. So the backend must refresh ahead of expiry, and if an
   integration sits idle past the refresh window a human must re-authorise. That is a
   real operational state the UI has to name, not an error to swallow.
3. **The energy history is not in the public API.** `en/APICenterV2.md` documents the
   device list and a status read; it documents **no** consumption-statistics endpoint.
   The only published mechanism is the per-device protocol in `en/UIIDProtocol.md`, and
   it covers **UIID 5 / 32 only** (the older power-detection plugs):
   `{"hundredDaysKwh": "get"}` makes the device return `hundredDaysKwhData` — *"100 days
   of daily electricity consumption in hexadecimal, expressed as an all lowercase
   string, 600 bytes, to two decimal places"*, ordered *"current day is at the top, and
   the others go backwards"*. CoolKit states outright that the complete protocol is
   *"only available to paid APPID users"*, and UIIDs 126/181/182/190 — the POWCT / POW
   Elite / DUALR3 family — are **not** in the public document at all.

   This matters because the CSV this repo already parses (`src/lib/reading-formats.ts`,
   header `data,time,consumption/kwh`) is **hourly**, which no UIID-5 plug produces. So
   the meters on this account are almost certainly a model whose protocol is not
   publicly specified, and **what history the API will yield cannot be settled from the
   documentation — only from the account**. The build therefore ships discovery first
   (what UIID is each meter, what params does it actually return) and treats the
   hundred-day decoder as one implementation behind an interface, per ADR-010.

## Decisions

**D-1 — read-only by construction (INV-08).** `POST /v2/device/thing/status` is eWeLink's
control endpoint, and these meters are switching relays: a POST could de-energise a
society's common-area lighting. `src/lib/ewelink.ts` therefore knows the token, refresh,
device-list and status-**read** endpoints and nothing else, exactly as `tuya.ts` does. The
guarantee is the absence of the call, not a flag somewhere.

**D-2 — a meter is assigned to a CIRCUIT, and the society follows from it.** CON-11 makes
the circuit the billing grain, and the ask is explicitly the circuit "selected during
demo for monitoring and savings benchmark". So `MeterDevice.circuitId` is the assignment,
`societyId` is denormalised alongside it for the listing filter, and a circuit holds at
most one meter (`@@unique`). Assigning to a society alone is allowed as a staging step —
a meter can be known to belong to a society before anyone has decided which circuit it
meters.

**D-3 — API-fetched days go through CON-45's review, not straight into the store.** A
fetch writes its raw payload to S3 under the private `Ingest/` prefix and creates a
`RawReadingFile` (`vendor: "ewelink"`, `source: api` — the enum value reserved for exactly
this since MS-07), then runs the same row-by-row review the CSV path uses. Auto-committing
would put a figure a society is billed on into the store with nobody having looked at it,
which is what INV-02 and INV-09 exist to prevent, and it would bypass the supersede /
exclude / out-of-window rules CON-45 already implements once.

**D-4 — the secret and the tokens are write-only.** Same rule as `TankApiConfig`: never
returned to a page, never logged, blank leaves the stored value alone.

## Open, and only the account can close them

- **The application.** An eWeLink developer App ID + App Secret, and the redirect URL
  registered against it. Nothing can be verified live without them.
- **The device model.** Each meter's `extra.uiid` and the params it actually returns.
  Discovery is a first-class screen for this reason.
- **Whether hourly history is reachable at all.** If the account's model only yields
  daily totals, the API path feeds monitoring and the monthly figure but cannot replace
  the hourly CSV for commissioning, where partial-day interval counts matter (CON-45).
  That is a real limit to state, not to paper over.
