# A meter asset moved between sites — research findings

**Status**: accepted, 2026-09-10. Implemented in `c04cb42`; deployed to stage the same day.

**Question researched**: how should a utility/energy-metering system model a physical meter
asset that is moved between customer sites over time, so that readings are attributed to the
correct customer for the correct period? Prompted by the user's own report — *"Sometimes meters
are reused. removed from one society and installed in another. when done so the name of the
meter is changed."*

## About this document, and its provenance

Two fan-out research runs, 106 agents each, decomposed into five angles (standards vocabulary
and cardinality · regulated meter-exchange procedure · temporal modelling in Postgres ·
attribution vs denormalisation for billing-grade rows · implementation and import validation).
Each extracted falsifiable claims from fetched primary sources and put every claim to a
**three-vote adversarial verification** — two refutes kill a claim.

**The runs' own synthesis step failed both times on a session limit**, so this merge — dedupe,
rank by confidence, cite — is written by hand from the two runs' verified claim sets. Nothing
here is a recollection: every claim below carries its **vote** and the source it was quoted
from, and where the two runs disagree, or where a claim only ever reached one source, it says
so rather than rounding up to a finding.

Totals across both runs: **193 claims extracted, 50 verified, 12 confirmed, 8 refuted, 30
supported-but-unreplicated, 26 distinct sources** (24 per run, 22 of them shared).

Confidence is stated three ways throughout:
- **Confirmed** — survived 3-vote verification (`3-0` unanimous, or `2-1`).
- **Supported** — quoted from a primary source but not replicated across sources or runs.
  Directionally reliable, not something to bet a schema on alone.
- **Refuted** — put up and knocked down. Recorded because a refuted claim is the most useful
  kind: it names a plausible design somebody would otherwise have built.

---

## 1. The point and the device are different entities — and this is unanimous

Every standard examined separates the **permanent metering point** from the **movable meter
asset**. This is the finding the whole design rests on, and it is the best-attested one here.

| Standard / system | The point | The asset | Confidence |
|---|---|---|---|
| IEC CIM (61968/61970) | `UsagePoint`, carrying `isSdp` | `Meter` / `EndDevice` | Confirmed 3-0 |
| Netbeheer NL CIM guideline | `UsagePoint` | the meter | Confirmed 3-0 |
| Green Button / ESPI | `UsagePoint` (logical, may be `isVirtual`) | — (see §5) | Confirmed 3-0 |
| UK settlement (REC/MHHS, SMRS) | MPAN | Metering Asset / Meter ID | Confirmed 3-0 |
| NEM (AEMO) | NMI | `MeterSerialNumber` | Confirmed 2-1 |
| Oracle MDM / CC&B | Service Point | Device / Meter | Supported |

> **Distinct from a meter**: While a meter is often located at a UsagePoint, the two are not
> the same. The UsagePoint is the conceptual location where energy is consumed or produced,
> while the meter is the physical device that performs the measurement.
> — Netbeheer Nederland CIM modelling guideline (confirmed 3-0)

> **UsagePoint**: Logical point on a network at which consumption or production is either
> physically measured (e.g., metered) or estimated (e.g., unmetered street lights).
> — Green Button Alliance, ESPI use case (confirmed 3-0)

**The commercial relationship binds to the point, not to the device.** CIM's `UsagePoint`
carries `isSdp`, `amiBillingReady`, `checkBilling`, `connectionState` — service and billing
attributes on the point (confirmed 3-0). ESPI puts a 1:1 `ServiceDeliveryPoint` inside the
UsagePoint carrying `tariffProfile` and `customerAgreement` (confirmed 2-1). So *who is
billed* is a property of the place, and the meter measuring it is swappable underneath.

**What this decided here**: `Circuit` is our metering point; `MeterDevice` is the asset, and
its identity is the vendor's own `ewelinkDeviceId` — never its name, which is exactly what a
rename on reuse changes. The user's own proposal was already the industry's model.

## 2. The link is an effective-dated interval

**Confirmed 3-0** — UK settlement holds, per MPAN, a meter history whose rows are
`(Meter ID, Status, Install Date, Remove Date)`, with a nested Meter Asset Provider history
keyed by "MAP Effective From". An SCD-Type-2-style interval table, maintained centrally in
SMRS/MPRS:

> Outcome | Meter ID  Status  Install Date  Remove Date  MAP Eff From  MAP ID |
> 1 ZZ88Z12345 Installed 01/01/2000 | 01/01/2000 MAP0 / 01/08/2021 MAP4 / 01/11/2022 MAP5
> — REC Portal, *Sharing Metering Asset Data — MHHS Guidance v1.0*

**Oracle MDM names the same record an Install Event** (supported, 2 sources): it links a
Device Configuration to a Service Point, carries the installation date/time, and on removal
the **same row** is updated with a removal date/time — a mutated close-out, not an append-only
event pair. It also carries an on/off history for periods the device was de-energised while
still installed, which is a distinction this build has no use for yet but may later.

**What this decided here**: `MeterInstallation` — one row per stay, half-open
`[installedAt, removedAt)`, closed in place on removal.

## 3. A meter exchange shares one instant, deliberately

**Confirmed 3-0, in both runs, from the same primary source.** The outgoing Remove Date is set
equal to the incoming Install Date **specifically so the interval series has no gap**:

> the MeterExchange Event should be utilised for simultaneous removal for an existing Metering
> Asset and installation of a new Metering Asset. This same outcome can be achieved using two
> separate MeterRemoval and MeterInstall events. … In the examples, Install and Removal Dates
> in the case of meter exchanges, are shown as being the same date to ensure no gaps in data.
> — REC Portal, MHHS Guidance v1.0

The NEM does the same at interval resolution (supported): the old meter's final read and the
new meter's opening read of `000000` carry the **same timestamp**, and the replacement's
register identifier need not match the one it replaced.

**What this decided here**: a move writes exactly that — one instant closes one stay and opens
the next. Half-open intervals make the shared boundary legal rather than an overlap, which is
why `covers()` excludes the removal instant.

## 4. Attribution: store the device, resolve the point at calculation time

The sharpest finding, and the one that went **against** the intuitive reading.

A plausible claim was put up twice — *"the attribution anchor is the UsagePoint, not the
device; readings attach to the point"* — and **refuted both times** (1-2, then 0-3). What the
sources actually describe is the opposite ordering:

> Incoming measurement data is attributed at write time to the device and its measuring
> component (channel), not to the service point or customer; the customer/service-point
> attribution is resolved later at usage-calculation time by walking the Install Event history
> for the calculation period. — Oracle MDM Business User Guide (supported, replicated across
> two Oracle guides)

And the NEM keeps **both** identities on the reading record — separate fields, not one
conflated identity (confirmed 2-1):

> RM39: `MDP,SettlementDate,NMI,MeterSerialNumber,Suffix,SeqNo`
> — AEMO MSATS technical specification

**What this decided here — and it is a both/and, not a pick-one.** `MeterHourlyReading` stays
the meter's own unbounded record (the device store). `MeterReading` — the billing grain —
gains `meterId` **beside** its `circuitId`, matching the NEM's two-field record. The
projection between the two is the single place the interval decides the circuit, which is
Oracle's resolve-at-calculation-time walk performed once and then frozen, so a released
figure never silently re-resolves under an invoice a society already holds (INV-02, GATE-02).

## 5. What was refuted, and why each mattered

A refuted claim is worth more than a confirmed one when it names a design somebody would
otherwise have shipped.

1. **"Readings attach to the point, never the device"** (1-2, then 0-3). Had this stood, the
   right build would have been to re-point readings at the circuit and keep no device link —
   and a reuse would then have been unreconstructable. See §4.
2. **"ESPI has no meter/EndDevice entity or serial at all, so a swap cannot be expressed"**
   (0-3, twice). The absolute form does not survive: the correct, narrower statement is that
   *the ESPI interchange format* does not carry meter-asset history, so that history must live
   in the implementing system — which is a statement about a wire format, not about the model.
3. **"The overlap rule is only same-serial, so 'one meter per point' is not a constraint
   anywhere"** (0-3 on the strong form). The UK rule genuinely is same-serial-scoped — see §6 —
   but Oracle CC&B and MDM *do* constrain a service point to one device at a time, so the
   strong universal claim is false in both directions.
4. **"ESPI omits customer identifiers for privacy and delegates the mapping out-of-band"**
   (0-3). Attractive and unsupported by the source quoted.

## 6. One meter per circuit is our narrowing, and it is deliberate

**Confirmed 3-0**: the UK constraint is *"it shall not be possible for two meters with the
same 'Meter ID' to be installed, at the same time for the same Metering Point"* — scoped to
one serial. And the same document works an example on **an MPAN that already has two active
Metering Assets installed**. So "one meter per point at a time" is **not** the UK rule.

Oracle goes the other way (supported): a Service Point is linked to a single Device
Configuration at a time, and several devices at one location need a parent/child Service Point
hierarchy instead.

**What this decided here**: this build takes Oracle's constraint, not the UK's, and states why
rather than inheriting it by accident — **CON-11 makes the circuit the billing grain, so two
meters on one circuit would be two sources for one billed figure that INV-02 cannot resolve.**
Both rules are Postgres **exclusion constraints** (`EXCLUDE USING gist` over a `tsrange`, with
`btree_gist`), because two concurrent assignments both find nothing and both insert — an
application check cannot win that race. `refuseOverlap()` exists only to refuse in words
before the constraint refuses in a 500.

## 7. Removal is a soft delete, in the registry too

**Confirmed 3-0**:

> In the case of meter and MAP 'removals', the SMRS will only 'logically' remove the entries —
> i.e. they will be marked as inactive and not deleted physically from the database.
> — REC Portal, MHHS Guidance v1.0

Even the explicit "delete a meter" operation (setting removal date equal to install date) only
logically removes the row, preserving the audit record of a mis-created meter instance.

**What this decided here**: nothing — it *validated* what this codebase already does for
circuits, rescale events, documents and devices. Recorded because it is the first external
confirmation that the never-delete rule is the industry's, not this project's preference.

## 8. Bitemporality — considered, and deliberately not built

**Supported** (XTDB documentation, single source, three claims): transaction time (when a fact
was recorded, immutable) and valid time (when it is true in the world) are independent axes;
transaction time cannot be written into the past, which is what makes it an audit trail; and a
bitemporal store supports both retroactive writes (backdating an installation) and proactive
ones (scheduling a known future swap).

**Not built, on purpose.** A full bitemporal model is the general answer to "correct an
installation interval after an invoice was issued", and this build already answers that
specific question a narrower way: released calculations are immutable (GATE-02), and every
figure freezes its inputs in an `inputVersionSnapshot`. Adding a second time axis to buy a
property we already hold would be cost without a claim. Recorded here so that if late-arriving
installation corrections ever become routine, the option and its source are on file rather
than rediscovered.

## 9. Import validation: the industry accepts and flags, we exclude and report

The most surprising angle, all **supported** rather than confirmed (AEMO, single source,
several independent claims):

- AEMO **deliberately does not reject** meter data that disagrees with the registry's standing
  data at time of receipt, because standing-data updates lag the meter data.
- **Meter churn is named as the reason** three validations are relaxed: data for unregistered
  registers, for NMIs not yet established, and from a participant not holding the registered
  role all load successfully, each raising an informational warning.
- **Loaded and billable are two different gates**: everything validated is stored, but a
  reading only enters energy allocation if its data stream is registered as settlement-active.
- Mismatches are reconciled **out of band**, by the RM39 Mismatch Data Report pushed to the
  data provider one business day before each settlement run.

Oracle quarantines instead (supported, two guides): raw data lands as Initial Measurement Data
and only reaches the Measurement table through VEE — validate, estimate, edit — with failures
raising exceptions in a hold-for-review state rather than being silently dropped.

**What this decided here**: the two shapes agree on the principle even where they differ in
mechanism — **never reject the file, never silently attribute it.** So a day with no covering
stay is not an error and never an estimate: it stays in the meter's own store, enters no
circuit, and is counted and reported as `outsideStays`. That is AEMO's accept-and-flag with
this build's own already-existing review gate (CON-45) playing Oracle's VEE role.

## What this changed in the build

| Finding | Where it landed |
|---|---|
| Point ≠ asset, identity is the device id | `Circuit` vs `MeterDevice`, keyed on `ewelinkDeviceId` |
| Effective-dated interval | `MeterInstallation`, half-open `[installedAt, removedAt)` |
| Exchange shares one instant | a move closes one stay and opens the next at one instant |
| Reading carries both identities | `MeterReading.meterId` beside `circuitId` |
| Resolve the point by traversing intervals | `meter-billing-handoff.ts`, at projection time |
| One meter per point (Oracle's rule, our reason) | two `EXCLUDE USING gist` constraints |
| Soft delete in the registry | a stay is closed, never deleted |
| Accept and flag, never silently attribute | `outsideStays`, counted and reported |

**Migration of existing history**, per the user's own instruction (*"for old history we can
ignore this and keep the data as it is"*): each backfilled stay opens at
`LEAST(min(hourly day), assigned_at, created_at)` — lossless by construction — and carries
`startInferred`, so the screen says *"Start taken from its earliest reading"* rather than
presenting a derived date as a stated one. On stage: 21 stays for 21 assigned meters, **zero**
opening after their meter's earliest reading.

## Sources

Primary, and load-bearing for a confirmed claim:

1. REC Portal — *Sharing Metering Asset Data, MHHS Guidance v1.0* (UK settlement; §2, §3, §6, §7)
2. Green Button Alliance — ESPI use case documentation (§1, §5)
3. GridWise Architecture Council — MultiSpeak/CIM presentation, incl. the `UsagePoint` class listing (§1)
4. Netbeheer Nederland — CIM modelling guideline, "points" (§1)
5. AEMO — MSATS release schedule and technical specification, 5MS meter data (§4, §9)
6. AEMO — MDFF specification NEM12/NEM13 v2.0 (§3, §4)
7. Oracle Utilities — MDM/SGG Business User Guide v2.2.0.2 (§2, §4, §6, §9)
8. Oracle Utilities — Rate Cloud, *About VEE* (§9)
9. Oracle Utilities — CC&B, Service Point Meter Installation (§6)
10. Oracle Utilities — MDM Functional Overview (§1)
11. XTDB v1 — bitemporality concepts (§8)

Secondary and supporting: `cim.fein-aachen.org` libcimpp UsagePoint reference · Zepben Evolve
CIM EndDevice · Postgres temporal-constraint write-ups (Neon, Xata, Cybertec, Red Gate, Aiven on
PG18's own temporal constraints) for the exclusion-constraint mechanics · Wikipedia on
slowly-changing dimensions, for the Type-2 vocabulary · Metronome invoicing concepts.

Fetched and found unusable (no extractable claims): MultiSpeak `MeterExchangeNotification`
WSDL endpoint · two Elexon BSC guidance notes · AEMO's metering-procedures landing page · SAP
S/4HANA Utilities learning course.
