# Onboarding the 19 pre-system societies, by hand

These societies were commissioned years before this system existed. Walking
each one through the product's own screens — society, agreement, demo report,
circuit, two meter uploads — is six screens and three uploads *per circuit*,
for a job that happens exactly once. So it is done as data instead: read the
two documents, fill three CSVs, generate SQL, insert.

**Two documents carry everything:**

| Document | What is taken from it |
|---|---|
| The signed **agreement** | revenue share, ₹/kWh, term length, tolerance, contracted light count, monthly service charge, signature date |
| The **post-installation savings report** | per circuit: the fixtures, counts, wattages, running hours, the pre-install baseline, the after figure, the savings %, and the commissioning dates |

Everything else is either already in the database (the 19 societies, their
locations, flat counts and portal accounts all exist) or comes from the
operator's own records — the term start, above all, which no document states.

## What this deliberately does not do

**No `meter_readings` rows are created.** The baseline and the benchmark are
written directly from the figures the report prints. The consequence is real
and worth stating plainly: those figures will not be recomputable inside the
app, the circuit's reading panels will be empty, and the evidence for any
dispute is the PDF rather than a stored day-by-day table. That is the trade
this approach makes in exchange for not re-keying ten months of hourly data
per circuit. If a society's readings ever matter that much, its workbook can
still be uploaded through the normal reading flow afterwards — the circuit
will already exist to receive it.

## The chain, table by table

Every row below is written once per society unless noted. Ids are
deterministic (`ace-city`, `ace-city-lighting`, `ace-city-ckt-1`) so a
re-run is detectable and any row can be traced back to its CSV line.

| # | Table | One per | What goes in it | Source |
|---|---|---|---|---|
| 0 | `societies` | society | **already exists** — only `status` moves `prospect` → `active` | — |
| 1 | `engagements` | society × service line | `service_line='lighting'`, `status='active'` | fixed |
| 2 | `pipelines` | society × service line | `stage='active_billing'`, contact name/phone, `meeting_date`, sales owner, `authoritative=true` | CSV 1 |
| 3 | `site_surveys` | pipeline | nothing but the link — circuits must hang off one (CON-24) | fixed |
| 4 | `circuits` | **metered circuit** | light type, metered & represented counts, wattage, working hours, `state='benchmark_confirmed'`, meter-installed and lights-replaced dates, `pre_install_baseline`, `benchmark_savings_pct` | CSV 2 |
| 5 | `circuit_devices` | **fixture line** | device type, count, wattage, hours/day, `excluded_from_calculation`, `historical=true` | CSV 3 |
| 6 | `offers` | society | `version=1`, `status='accepted'`, `benchmark_source='negotiated_fixed'`, tolerance, revenue share, ₹/kWh, term months, projected fee, `circuit_terms` | CSV 1 (+ built from CSV 2) |
| 7 | `agreements` | society | links pipeline ↔ offer, `signed_at` | CSV 1 |
| 8 | `contracts` | society | `status='active'`, `term_start`, `term_end`, `activated_at` | CSV 1 |
| 9 | `contract_term_versions` | contract | `version=1`, the same terms, `circuit_benchmarks` | CSV 1 (+ built from CSV 2) |

`offers.circuit_terms` and `contract_term_versions.circuit_benchmarks` hold
the same JSON array, one entry per circuit, built from CSV 2 — not typed by
hand:

```json
[{ "circuitId": "...", "lightType": "basement", "location": "Basement",
   "meteredLightCount": 96, "representedLightCount": 2508,
   "benchmarkSavingsPct": 66.4, "preInstallBaseline": 48.7,
   "projectedSavedKwhPerDay": 0 }]
```

## Rules settled with the user (2026-08-26)

- **`term_start`** is supplied per society from your own records. Neither
  document states it — the agreement only says the term runs "from the date of
  installation completion" — and it is the date billing runs from (CON-22).
- **`tolerance_pct`** is **10** wherever the agreement states none, which is
  common.
- **`lights_replaced_on`** is the **day before the post-installation readings
  start**, when the report does not say. Note this dates the *report's*
  measurement, not necessarily the physical work: Ace City's meter shows the
  drop two months before its report re-measured.
- **The signature date** is the agreement's front-page date, falling back to the
  stamp — these scans routinely carry four different dates.
- Where a report **contradicts itself**, the reading that fits the measured
  consumption wins, and the contradiction goes in `notes`. Ace City's
  conclusion says 20 lights where the rest of it says 96; 20 lights cannot
  draw 48.70 kWh/day.

## What I compute rather than ask for

- `dedupe_key` — already set on every society
- `term_end` = `term_start` + `term_months`
- the circuit's headline `wattage` and `working_hours` — from its retrofitted fixture line
- `metered_light_count` — the sum of the retrofitted fixture lines
- `projected_saved_kwh_per_day` — baseline × savings %
- every `id`, from the society name and an index

## The three CSVs

1. **`societies.csv`** — one row per society. The commercial terms, from the agreement.
2. **`circuits.csv`** — one row per metered circuit. The measured figures, from the report.
3. **`circuit_devices.csv`** — one row per fixture line within a circuit. A circuit
   with 42 retrofitted tube lights and 5 unreplaced surface lights sharing it is
   two rows, the second marked `excluded=yes` so its load comes off both sides
   of the savings figure.

Keys are the society's name exactly as it appears in the database, and the
circuit's location — those two strings join the three files.
