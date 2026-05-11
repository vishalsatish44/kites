-- =====================================================================
-- Airtable mirror tables. The dashboard reads from these — never directly
-- from Airtable from the browser. A scheduled sync (cron + on-demand)
-- keeps them fresh.
--
-- Run AFTER 0001/0002/0003.
-- =====================================================================

-- ----------------------- After Sales Form mirror -----------------------
create table if not exists at_after_sales (
  airtable_id text primary key,
  batch_id text,
  enrollment_date date,
  created timestamptz,
  agent text,
  team text,
  lead_channel text,
  lead_source text,
  who_booked_demo text,
  enrollment_type text,
  subject text,
  classes_included int default 0,
  classes_monthly int default 0,
  amount numeric default 0,
  currency text,
  currency_label text,
  payment_mode text,
  payment_option text,
  country text,
  grade text,
  timezone_state text,
  timezone_city text,
  country_code text,
  is_referral boolean default false,
  sale_no_demo boolean default false,
  cpc numeric default 0,
  inr_amount numeric default 0,
  raw jsonb,
  synced_at timestamptz default now()
);

create index if not exists at_after_sales_date_idx   on at_after_sales(enrollment_date);
create index if not exists at_after_sales_agent_idx  on at_after_sales(agent);
create index if not exists at_after_sales_country_idx on at_after_sales(country);

-- ----------------------- Demo Booking Form mirror -----------------------
create table if not exists at_demo_bookings (
  airtable_id text primary key,
  student_id text,
  booking_id text,
  presales_agent text,
  sales_agent text,
  dsa text,
  student_name text,
  student_email text,
  student_contact text,
  country text,
  city text,
  student_timezone text,
  subject text,
  demo_date_cx timestamptz,
  demo_date_ist timestamptz,
  form_filling_time timestamptz,
  form_filling_date date,
  lead_source text,
  sale_no_demo boolean default false,
  demo_scheduling_links text[] default '{}',
  after_sales_links text[] default '{}',
  demo_completed_lookup text[] default '{}',
  demo_scheduled_lookup text[] default '{}',
  raw jsonb,
  synced_at timestamptz default now()
);

create index if not exists at_demo_bookings_date_idx  on at_demo_bookings(form_filling_date);
create index if not exists at_demo_bookings_agent_idx on at_demo_bookings(presales_agent);

-- ----------------------- Demo Scheduling mirror -----------------------
create table if not exists at_demo_scheduling (
  airtable_id text primary key,
  demo_id text,
  student_link text[] default '{}',
  demo_scheduled boolean default false,
  demo_completed text,
  is_completed boolean default false,
  final_demo_date timestamptz,
  subject text,
  teacher_link text[] default '{}',
  scheduled_by text,
  wa_mail_sent boolean default false,
  reason_not_scheduled text,
  reason_not_completed text,
  created timestamptz,
  dsa text,
  raw jsonb,
  synced_at timestamptz default now()
);

create index if not exists at_demo_scheduling_date_idx on at_demo_scheduling(final_demo_date);

-- ----------------------- Old Collection (renewals) mirror -----------------------
create table if not exists at_old_collection (
  airtable_id text primary key,
  classes_sold int default 0,
  classes_monthly int default 0,
  currency text,
  currency_label text,
  amount numeric default 0,
  renewed_by text,
  department text,
  payment_date date,
  payment_mode text,
  raw jsonb,
  synced_at timestamptz default now()
);

create index if not exists at_old_collection_date_idx on at_old_collection(payment_date);

-- ----------------------- Sync runs log -----------------------
create table if not exists at_sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz default now(),
  finished_at timestamptz,
  status text default 'running' check (status in ('running','success','error','partial')),
  triggered_by text,                          -- 'cron' | 'manual' | 'webhook'
  triggered_by_user uuid references auth.users,
  rows_after_sales int default 0,
  rows_demo_bookings int default 0,
  rows_demo_scheduling int default 0,
  rows_old_collection int default 0,
  error_message text
);

create index if not exists at_sync_runs_started_idx on at_sync_runs(started_at desc);

-- ----------------------- RLS -----------------------
alter table at_after_sales       enable row level security;
alter table at_demo_bookings     enable row level security;
alter table at_demo_scheduling   enable row level security;
alter table at_old_collection    enable row level security;
alter table at_sync_runs         enable row level security;

-- Reads:
--   * Management: everything
--   * Sales rep:  rows where they're the agent
--   * Pre-sales:  rows where they're the presales agent / who_booked_demo
--   * AR:         everything sales-like (same as sales for now)
-- Writes: only service role (sync script). The anon client cannot write.

drop policy if exists at_after_sales_read on at_after_sales;
create policy at_after_sales_read on at_after_sales for select using (
  is_management()
  or exists (
    select 1 from user_profiles up
    join employees e on e.id = up.employee_id
    where up.user_id = auth.uid()
      and (
        e.app_role in ('ar')
        or (e.app_role = 'sales'    and lower(at_after_sales.agent) = lower(e.full_name))
        or (e.app_role = 'presales' and lower(at_after_sales.who_booked_demo) = lower(e.full_name))
      )
  )
);

drop policy if exists at_demo_bookings_read on at_demo_bookings;
create policy at_demo_bookings_read on at_demo_bookings for select using (
  is_management()
  or exists (
    select 1 from user_profiles up
    join employees e on e.id = up.employee_id
    where up.user_id = auth.uid()
      and (
        e.app_role in ('sales','ar')
        or (e.app_role = 'presales' and lower(at_demo_bookings.presales_agent) = lower(e.full_name))
      )
  )
);

drop policy if exists at_demo_scheduling_read on at_demo_scheduling;
create policy at_demo_scheduling_read on at_demo_scheduling for select using (
  is_management() or exists (
    select 1 from user_profiles up
    join employees e on e.id = up.employee_id
    where up.user_id = auth.uid() and e.app_role in ('sales','presales','ar')
  )
);

drop policy if exists at_old_collection_read on at_old_collection;
create policy at_old_collection_read on at_old_collection for select using (
  is_management() or exists (
    select 1 from user_profiles up
    join employees e on e.id = up.employee_id
    where up.user_id = auth.uid() and e.app_role in ('sales','ar')
  )
);

drop policy if exists at_sync_runs_read on at_sync_runs;
create policy at_sync_runs_read on at_sync_runs for select using (true);

-- ----------------------- Helper view: latest sync -----------------------
create or replace view v_last_sync as
select
  max(case when status = 'success' then finished_at end) as last_success_at,
  max(started_at)                                        as last_started_at,
  (select status from at_sync_runs order by started_at desc limit 1) as last_status,
  (select id     from at_sync_runs order by started_at desc limit 1) as last_id
from at_sync_runs;

grant select on v_last_sync to anon, authenticated;
