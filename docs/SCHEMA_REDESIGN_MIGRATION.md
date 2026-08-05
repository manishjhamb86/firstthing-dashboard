# Database Schema — FirsThing EnergiTrack

This is the one-time schema-creation script for the **new, empty Supabase
project** this app now points at (`NEXT_PUBLIC_SUPABASE_URL` in
`.env.local`). Unlike `DB_MIGRATION_INSPECTION.md` (which alters a live
database), there is nothing to alter here yet — run this once, top to
bottom, in that project's SQL Editor.

## Where this schema comes from

There is a separate, older Supabase project with real production data (19
societies, 20 users, 39 invoices). Rather than guess its structure, every
table below except the three new ones was **verified live** by querying
that project's REST API directly (read-only, 2026-08-04) and by reading the
exact `insert()` calls in this repo's admin pages. Nothing here is inferred.

| Table | Verified columns | Live row count |
|---|---|---|
| `societies` | id, name, city, total_lights, savings_percentage, created_at | 19 |
| `society_details` (folded into `societies` below — see note) | society_id, city, state, total_lights, contract_start, contract_end, contact_person, contact_phone, created_at | 2 |
| `profiles` | id, email, role, society_name, society_id, created_at | 20 |
| `invoices` | id, invoice_number, society_name, society_id, invoice_month, amount, gst, total_amount, due_date, status, pdf_url, created_at | 39 |
| `energy_stats` | id, society_name, society_id, today_consumption, total_savings, savings_percentage, system_status, created_at | 3 |
| `devices` | id, society_name, society_id, device_name, device_type, status, last_seen | 13 |
| `meter_readings` | id, society_name, society_id, reading_time, power_kw, energy_kwh, voltage, current | 17 |
| `savings_reports` | id, society_id, report_month, pdf_url, created_at | 30 |
| `tank_configurations` | id, society_id, tank_name, tank_code, tank_type, location, capacity_liters, height_meters, sensor_offset_cm, low_alert_percent, critical_alert_percent, display_order (from `admin/tanks/new/page.tsx`'s insert; table is empty in the reference project) | 0 |
| `tank_readings` | id, tank_id, water_level_percent, current_liters, sensor_distance_cm, status, received_at (from `admin/tanks/[id]/page.tsx`) | 0 |
| `inspection_forms` | id, society_id, society_name, area, inspection_date, inspector_name, contact_number, total_lights_checked, faulty_lights, created_by, created_at | 14 |
| `inspection_form_items` | id, inspection_form_id, location, issue_type, remarks, created_at | 201 |
| `inspection_reports` | id, society_id, report_type, report_date, pdf_url, created_at | 3 |

Two things this table already tells us, confirmed rather than assumed:

- **`devices`, `meter_readings`, and `energy_stats` already have a real
  `society_id` column** alongside `society_name` — the bug this repo's
  README flags (customer dashboard reads `energy_stats` by `society_name`
  while admin writes it by `society_id`, so they can never match) is a
  **query-side** bug, not a missing-column problem. Fixed in the dashboard
  rebuild, not here.
- `documents` is **not a table** — querying it returns `PGRST205: Could not
  find the table`. It's a Storage bucket name only (see Step 8).
- `society_details` is dead weight: the only place it's referenced anywhere
  in this codebase is the admin delete-cascade list — nothing ever reads or
  writes it. Its real columns (`state`, `contact_person`, `contact_phone`,
  `contract_start`, `contract_end`) are useful, so this schema folds them
  directly into `societies` instead of keeping a pointless 1:1 side table.

`energy_stats` is an **insert-only log**, not one row per society — the
admin form always `.insert()`s, never upserts (confirmed in
`admin/energy/page.tsx`). Don't add a `UNIQUE(society_id)` constraint; the
"current" value for a society is its most recent row.

## Step 1: Core tables

```sql
create table societies (
  id serial primary key,
  name text not null,
  city text,
  state text,
  total_lights integer default 0,
  savings_percentage numeric(5,2) default 0,
  status text not null default 'active'
    check (status in ('onboarding','active','suspended','archived')),
  contact_person text,
  contact_phone text,
  contract_start date,
  contract_end date,
  created_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('admin','customer','inspection','socmgr')),
  society_id integer references societies(id) on delete set null,
  -- Denormalized for display only (e.g. "Welcome, {society_name}"). society_id
  -- is the sole authority for filtering/scoping — never query by this column.
  society_name text,
  created_at timestamptz not null default now()
);

create index idx_profiles_society_id on profiles(society_id);
create index idx_profiles_role on profiles(role);
```

## Step 2: Energy & devices

```sql
create table devices (
  id bigserial primary key,
  society_id integer not null references societies(id) on delete cascade,
  society_name text,
  device_name text not null,
  device_type text,
  status text not null default 'Online' check (status in ('Online','Offline')),
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

create table meter_readings (
  id bigserial primary key,
  society_id integer not null references societies(id) on delete cascade,
  society_name text,
  reading_time timestamptz not null default now(),
  power_kw numeric(10,2),
  energy_kwh numeric(12,2),
  voltage numeric(6,2),
  current numeric(6,2),
  created_at timestamptz not null default now()
);

create table energy_stats (
  id bigserial primary key,
  society_id integer not null references societies(id) on delete cascade,
  society_name text,
  today_consumption numeric(12,2),
  total_savings numeric(14,2),
  savings_percentage numeric(5,2),
  system_status text,
  created_at timestamptz not null default now()
);

create index idx_devices_society_id on devices(society_id);
create index idx_meter_readings_society_id on meter_readings(society_id);
create index idx_meter_readings_reading_time on meter_readings(reading_time);
create index idx_energy_stats_society_id on energy_stats(society_id);
create index idx_energy_stats_created_at on energy_stats(created_at);
```

## Step 3: Billing & reporting

```sql
create table invoices (
  id bigserial primary key,
  society_id integer not null references societies(id) on delete cascade,
  society_name text,
  invoice_number text not null,
  invoice_month text,
  amount numeric(12,2),
  gst numeric(12,2),
  total_amount numeric(12,2),
  due_date date,
  status text not null default 'Issued'
    check (status in ('Issued','Due','Overdue','Disputed','Paid')),
  pdf_url text,
  created_at timestamptz not null default now()
);

create table savings_reports (
  id bigserial primary key,
  society_id integer not null references societies(id) on delete cascade,
  report_month text,
  pdf_url text,
  created_at timestamptz not null default now()
);

create index idx_invoices_society_id on invoices(society_id);
create index idx_invoices_status on invoices(status);
create index idx_savings_reports_society_id on savings_reports(society_id);
```

## Step 4: Water tanks

```sql
create table tank_configurations (
  id bigserial primary key,
  society_id integer not null references societies(id) on delete cascade,
  tank_name text not null,
  tank_code text,
  tank_type text,
  location text,
  capacity_liters numeric(12,2),
  height_meters numeric(6,2),
  sensor_offset_cm numeric(6,2),
  low_alert_percent numeric(5,2) default 20,
  critical_alert_percent numeric(5,2) default 10,
  display_order integer default 1,
  created_at timestamptz not null default now()
);

create table tank_readings (
  id bigserial primary key,
  tank_id bigint not null references tank_configurations(id) on delete cascade,
  water_level_percent numeric(5,2),
  current_liters numeric(12,2),
  sensor_distance_cm numeric(6,2),
  status text check (status in ('healthy','medium','critical')),
  received_at timestamptz not null default now()
);

create index idx_tank_configurations_society_id on tank_configurations(society_id);
create index idx_tank_readings_tank_id on tank_readings(tank_id);
create index idx_tank_readings_received_at on tank_readings(received_at);
```

## Step 5: Inspections

Same shape as `DB_MIGRATION_INSPECTION.md`, plus the `society_name` column
the live schema already carries.

```sql
create table inspection_forms (
  id bigserial primary key,
  society_id integer not null references societies(id) on delete cascade,
  society_name text,
  area varchar(255) not null,
  inspection_date date not null,
  inspector_name varchar(255) not null,
  contact_number varchar(20) not null,
  total_lights_checked integer not null,
  faulty_lights integer not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table inspection_form_items (
  id bigserial primary key,
  inspection_form_id bigint not null references inspection_forms(id) on delete cascade,
  location varchar(255) not null,
  issue_type varchar(100) not null,
  remarks text,
  created_at timestamptz not null default now()
);

create table inspection_reports (
  id bigserial primary key,
  society_id integer not null references societies(id) on delete cascade,
  report_type text,
  report_date date,
  pdf_url text,
  created_at timestamptz not null default now()
);

create index idx_inspection_forms_society_id on inspection_forms(society_id);
create index idx_inspection_forms_created_by on inspection_forms(created_by);
create index idx_inspection_form_items_form_id on inspection_form_items(inspection_form_id);
create index idx_inspection_reports_society_id on inspection_reports(society_id);
```

## Step 6: New tables for the redesigned dashboards

The rebuilt admin/customer dashboards need a few things the legacy schema
never captured. Created empty on purpose — the UI renders honest "not yet
available" states until these have real rows, rather than fabricated
numbers. No columns invented for metrics without an agreed definition yet
(report-turnaround days, feed-health %, inspection-cycle days, confidence
intervals) — those need a product decision first, not a schema guess.

```sql
create table monthly_society_metrics (
  id bigserial primary key,
  society_id integer not null references societies(id) on delete cascade,
  month date not null,
  baseline_kwh numeric,
  actual_kwh numeric,
  energy_avoided_kwh numeric,
  co2_avoided_kg numeric,
  bill_saving_inr numeric,
  is_verified_metered boolean not null default false,
  created_at timestamptz not null default now(),
  unique (society_id, month)
);

create table exceptions (
  id bigserial primary key,
  society_id integer references societies(id) on delete cascade,
  severity text not null check (severity in ('critical','high','medium','low')),
  title text not null,
  category text,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table tasks (
  id bigserial primary key,
  society_id integer references societies(id) on delete cascade,
  type text not null,
  title text not null,
  assignee text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open','done'))
);

create index idx_monthly_society_metrics_society_id on monthly_society_metrics(society_id);
create index idx_exceptions_society_id on exceptions(society_id);
create index idx_exceptions_severity on exceptions(severity);
create index idx_tasks_society_id on tasks(society_id);
create index idx_tasks_status on tasks(status);
```

## Step 7: Storage bucket

```sql
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;
```

## Step 8: Row Level Security

**Every table below currently has RLS enforced.** The reference project
does not (confirmed live: its anon key can read `profiles`, `invoices`,
`inspection_forms` with no session at all) — that gap does not carry over
here.

```sql
alter table societies enable row level security;
alter table profiles enable row level security;
alter table devices enable row level security;
alter table meter_readings enable row level security;
alter table energy_stats enable row level security;
alter table invoices enable row level security;
alter table savings_reports enable row level security;
alter table tank_configurations enable row level security;
alter table tank_readings enable row level security;
alter table inspection_forms enable row level security;
alter table inspection_form_items enable row level security;
alter table inspection_reports enable row level security;
alter table monthly_society_metrics enable row level security;
alter table exceptions enable row level security;
alter table tasks enable row level security;

-- profiles: everyone can read/update their own row; admin can read/update all
create policy "Own profile" on profiles for select using (id = auth.uid());
create policy "Own profile update" on profiles for update using (id = auth.uid());
create policy "Admin full access to profiles" on profiles for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- societies: admin full access; everyone else read-only
create policy "Admin full access to societies" on societies for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Read societies" on societies for select using (auth.uid() is not null);

-- Society-scoped read policy, reused for every per-society table below:
-- admin sees everything; customer/socmgr see only their own society_id;
-- inspection has no default read access (granted per-table where it needs one).
create policy "Admin full access to devices" on devices for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Society-scoped read devices" on devices for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.society_id = devices.society_id and p.role in ('customer','socmgr'))
);

create policy "Admin full access to meter_readings" on meter_readings for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Society-scoped read meter_readings" on meter_readings for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.society_id = meter_readings.society_id and p.role in ('customer','socmgr'))
);

create policy "Admin full access to energy_stats" on energy_stats for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Society-scoped read energy_stats" on energy_stats for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.society_id = energy_stats.society_id and p.role in ('customer','socmgr'))
);

create policy "Admin full access to invoices" on invoices for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Society-scoped read invoices" on invoices for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.society_id = invoices.society_id and p.role in ('customer','socmgr'))
);

create policy "Admin full access to savings_reports" on savings_reports for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Society-scoped read savings_reports" on savings_reports for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.society_id = savings_reports.society_id and p.role in ('customer','socmgr'))
);

create policy "Admin full access to tank_configurations" on tank_configurations for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Society-scoped read tank_configurations" on tank_configurations for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.society_id = tank_configurations.society_id and p.role in ('customer','socmgr'))
);

create policy "Admin full access to tank_readings" on tank_readings for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Society-scoped read tank_readings" on tank_readings for select using (
  exists (
    select 1 from tank_configurations tc
    join profiles p on p.society_id = tc.society_id
    where tc.id = tank_readings.tank_id and p.id = auth.uid() and p.role in ('customer','socmgr')
  )
);

-- inspection_forms: inspectors create/view their own; admin sees all;
-- society-scoped roles view forms for their own society (matches
-- DB_MIGRATION_INSPECTION.md's existing policy shape)
create policy "Inspectors create forms" on inspection_forms for insert with check (auth.uid() = created_by);
create policy "Inspectors view own forms" on inspection_forms for select using (auth.uid() = created_by);
create policy "Society-scoped view forms" on inspection_forms for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.society_id = inspection_forms.society_id and p.role in ('customer','socmgr'))
);
create policy "Admin full access to inspection_forms" on inspection_forms for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "View checklist items" on inspection_form_items for select using (
  exists (
    select 1 from inspection_forms f
    where f.id = inspection_form_items.inspection_form_id
    and (
      f.created_by = auth.uid()
      or exists (select 1 from profiles p where p.id = auth.uid() and (p.role = 'admin' or (p.role in ('customer','socmgr') and p.society_id = f.society_id)))
    )
  )
);
create policy "Inspectors create checklist items" on inspection_form_items for insert with check (
  exists (select 1 from inspection_forms f where f.id = inspection_form_items.inspection_form_id and f.created_by = auth.uid())
);

create policy "Admin full access to inspection_reports" on inspection_reports for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Society-scoped read inspection_reports" on inspection_reports for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.society_id = inspection_reports.society_id and p.role in ('customer','socmgr','inspection'))
);

-- New dashboard tables: admin full access; customer/socmgr read-only, scoped
create policy "Admin full access to monthly_society_metrics" on monthly_society_metrics for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "Society-scoped read monthly_society_metrics" on monthly_society_metrics for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.society_id = monthly_society_metrics.society_id and p.role in ('customer','socmgr'))
);

create policy "Admin full access to exceptions" on exceptions for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "Admin full access to tasks" on tasks for all using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
);
```

## Step 9: Verification

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;

select id, name, public from storage.buckets where id = 'documents';
```

## Step 10: Copying real data from the legacy project (optional, do not run without confirming first)

The legacy project's anon key currently allows reading its tables directly
(see the security note above), and this project's `.env.local` has a
service-role-equivalent key, so a straight REST-to-REST copy is possible —
read each table from the legacy project, insert into the matching table
here, `societies` first (parent) then children in FK order. **This moves
real customer data (emails, invoice amounts, inspector phone numbers)
between two live projects — confirm with the user before running any copy,
table by table, rather than doing it silently as part of schema setup.**

## Rollback

```sql
drop table if exists tasks, exceptions, monthly_society_metrics,
  inspection_form_items, inspection_forms, inspection_reports,
  tank_readings, tank_configurations, savings_reports, invoices,
  energy_stats, meter_readings, devices, profiles, societies cascade;

delete from storage.buckets where id = 'documents';
```

## Before running in production

- This was written against a **fresh, empty** project — if you ever point
  this app at a database that already has data in it, do not run Step 1–5
  as-is; diff against what already exists first.
- The role `CHECK` constraint on `profiles` only allows
  `admin/customer/inspection/socmgr`. Adding a 5th role later needs
  `alter table profiles drop constraint ..., add constraint ... check (...)`.
- RLS policies above are a first pass matching current app behavior
  (scoped by `society_id`, admin-full-access) — they have not been
  policy-tested end-to-end; do that before this project handles real data.
