# Inventory & device lifecycle (2026-09-25)

User-asked: track every device end to end — bought when, from whom, on which invoice, in which
batch; when and where deployed; when returned and to which office; what is where in what
quantity; each unit's warranty and when it expires. A batch gets a code printed on its lights, and
tracking goes down to a single light.

## Decisions (the user's, 2026-09-25)

| Question | Answer |
| --- | --- |
| What is printed on a light | A **unique code per unit**: batch code + the unit's number (`B2609-017-00042`), as text and a QR code. The system prints label sheets per batch. |
| Existing installations (~19 societies) | **Start fresh** — inventory covers purchases from now on; installed lights stay in the circuit records. |
| Tracked one by one | Lights, meters, WiFi routers, WiFi extenders, SIM cards, tank monitors, actuator valves, actuator valve controllers, float switches. |
| Tracked by length | LAN wire, in metres. |
| Tracked by quantity | Everything else. |

## Model — the practice it follows

Standard asset-management practice (ITIL asset lifecycle; the lot/serial split GS1 codes use):

- **Supplier → Purchase (the supplier's invoice, PDF kept) → Batch (one line of a delivery, a lot
  with its own code, received at an office on a date) → Unit (one serialized item)**.
- **Tracking mode per item type**: `serial` (units), `length` (metres), `quantity` (count).
- **Stock movements are a ledger, never edited.** Receive, transfer, deploy, return, fault,
  repair, scrap, lost, return-to-supplier, adjust — each with a date, from/to location, the
  society/circuit for a deployment, a reason, and who recorded it. A correction is a new movement.
  Stock per location (per batch) is the sum of movements; a serial unit also carries its current
  status and location, written in the same transaction as the movement that changed it, so a
  list never has to replay the ledger to show where something is.
- **Locations**: offices (created in the app) and sites (one per society, created on first
  deployment). A unit returned to the supplier or scrapped has no location.
- **Unit lifecycle**: `in_stock → deployed → faulty → (in_stock after return | repaired) →
  returned_to_supplier | scrapped | lost`. `src/lib/inventory.ts` holds which transitions are
  allowed; anything else is refused in words.
- **Warranty** per batch: months, and whether it runs from the purchase (invoice) date or from
  installation. A unit's expiry is computed, never stored, so correcting a date corrects it.
- **Codes**: batch `B{YYMM}-{nnn}` (sequence per month), unit `{batch}-{nnnnn}`, both unique.
  The manufacturer's own serial (a SIM's ICCID, a meter's device id) is kept beside it.

INV-08 is untouched: an actuator valve is tracked as stock; nothing here can operate one.

## Not built yet (stated)

Purchase orders before delivery; costing (valuation per location); on-site label scanning with a
phone camera (codes are typed or scanned by a USB scanner into the search box).

## Dependency: `qrcode` (Research Gate)

Labels carry the unit code as text and as a QR code. QR encoding (Reed–Solomon error correction,
masking) is not something to hand-write; `qrcode` (MIT, no runtime dependencies beyond its own
encoder, widely used) renders an SVG string on the server — nothing is fetched, nothing runs in
the browser. Error-correction level M, so a scuffed sticker still scans.

Supplier invoices are stored under the **private** `Ingest/`-style prefix `Inventory/` and served
by a short-lived presigned GET — they are commercial documents, not society-facing ones, so they
do not belong in the public-read `Documents/` tree.
