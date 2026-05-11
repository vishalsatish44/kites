-- =====================================================================
-- WBR Dashboard — initial Supabase schema
-- Run this in your Supabase SQL editor after creating the project.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ----------------------- regions -----------------------
create table if not exists regions (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  countries text[] default '{}',
  created_at timestamptz default now()
);

insert into regions (name, countries) values
  ('North America', '{USA,Canada}'),
  ('UK & Europe',   '{UK,Ireland,Germany,France,Spain,Italy,Netherlands}'),
  ('Australia & NZ','{Australia,"New Zealand"}'),
  ('MENA',          '{UAE,"Saudi Arabia",Qatar,Kuwait,Oman,Bahrain}'),
  ('SEA',           '{Singapore,Malaysia,Indonesia,Philippines,Thailand,Vietnam}'),
  ('India',         '{India}'),
  ('Rest of World', '{}')
on conflict (name) do nothing;

-- ----------------------- employees mirror -----------------------
-- Lightweight mirror of Airtable Employe so we can attach auth + targets.
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  airtable_id text unique,                 -- Employe row id in Airtable
  full_name text not null,
  email text unique,
  department text,                          -- Sales | Pre Sales | AR | etc
  app_role text not null default 'staff',   -- management | sales | presales | ar | staff
  region_id uuid references regions(id) on delete set null,
  designation text,
  reporting_manager_email text,
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists employees_role_idx on employees(app_role);
create index if not exists employees_region_idx on employees(region_id);

-- ----------------------- auth -> employee link -----------------------
create table if not exists user_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  employee_id uuid references employees(id) on delete set null,
  created_at timestamptz default now()
);

-- ----------------------- targets -----------------------
-- Region-level targets (set first, then distributed to individuals).
create table if not exists region_targets (
  id uuid primary key default gen_random_uuid(),
  region_id uuid references regions(id) on delete cascade,
  team text not null check (team in ('sales','presales','ar')),
  period_month date not null,             -- always 1st of month
  monthly_revenue_target numeric default 0,
  monthly_demo_target int default 0,
  daily_demo_target int default 4,
  min_aov numeric default 0,
  min_cpc numeric default 0,
  created_at timestamptz default now(),
  unique(region_id, team, period_month)
);

-- Individual targets (override region default).
create table if not exists individual_targets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  period_month date not null,
  weekly_target int default 0,
  monthly_target int default 0,
  monthly_revenue_target numeric default 0,
  monthly_demo_target int default 0,
  daily_demo_target int default 4,
  min_aov numeric default 0,
  min_cpc numeric default 0,
  notes text,
  created_at timestamptz default now(),
  unique(employee_id, period_month)
);

-- ----------------------- attendance -----------------------
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  date date not null,
  status text not null check (status in ('P','A','L','HALF','LOP','WO','HOL')),
  reason text,
  auto_flagged boolean default false,
  marked_by uuid references auth.users,
  created_at timestamptz default now(),
  unique(employee_id, date)
);

create index if not exists attendance_date_idx on attendance(date);

-- ----------------------- incentive config -----------------------
-- Stored as JSON so management can tweak slabs without migrations.
create table if not exists incentive_config (
  id uuid primary key default gen_random_uuid(),
  team text not null check (team in ('sales','presales','ar')),
  effective_from date not null default current_date,
  config jsonb not null,
  created_at timestamptz default now()
);

-- ----------------------- user preferences -----------------------
create table if not exists user_preferences (
  user_id uuid primary key references auth.users on delete cascade,
  preferred_timezones text[] default '{Asia/Kolkata,Australia/Sydney,Europe/London,America/New_York,America/Toronto,Asia/Singapore,Asia/Dubai}',
  dark_mode boolean default false,
  default_currency text default 'INR',
  updated_at timestamptz default now()
);

-- ----------------------- RLS -----------------------
alter table employees           enable row level security;
alter table user_profiles       enable row level security;
alter table region_targets      enable row level security;
alter table individual_targets  enable row level security;
alter table attendance          enable row level security;
alter table incentive_config    enable row level security;
alter table user_preferences    enable row level security;
alter table regions             enable row level security;

-- Helper: is current user management?
create or replace function is_management() returns boolean
language sql stable as $$
  select exists (
    select 1 from user_profiles up
    join employees e on e.id = up.employee_id
    where up.user_id = auth.uid() and e.app_role = 'management'
  );
$$;

-- Helper: current user's employee_id
create or replace function my_employee_id() returns uuid
language sql stable as $$
  select employee_id from user_profiles where user_id = auth.uid();
$$;

-- Postgres does not support `CREATE POLICY IF NOT EXISTS`, so we drop-then-create.
-- This makes the migration idempotent.

drop policy if exists regions_read              on regions;
create policy regions_read on regions for select using (true);

drop policy if exists employees_read_all_mgmt   on employees;
create policy employees_read_all_mgmt on employees
  for select using (is_management() or id = my_employee_id());

drop policy if exists profile_self              on user_profiles;
create policy profile_self on user_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists region_targets_read       on region_targets;
create policy region_targets_read on region_targets
  for select using (true);

drop policy if exists region_targets_write      on region_targets;
create policy region_targets_write on region_targets
  for all using (is_management()) with check (is_management());

drop policy if exists ind_targets_read          on individual_targets;
create policy ind_targets_read on individual_targets
  for select using (is_management() or employee_id = my_employee_id());

drop policy if exists ind_targets_write         on individual_targets;
create policy ind_targets_write on individual_targets
  for all using (is_management()) with check (is_management());

drop policy if exists attendance_read           on attendance;
create policy attendance_read on attendance
  for select using (is_management() or employee_id = my_employee_id());

drop policy if exists attendance_write          on attendance;
create policy attendance_write on attendance
  for all using (is_management()) with check (is_management());

drop policy if exists incentive_read            on incentive_config;
create policy incentive_read on incentive_config for select using (true);

drop policy if exists incentive_write           on incentive_config;
create policy incentive_write on incentive_config
  for all using (is_management()) with check (is_management());

drop policy if exists prefs_self                on user_preferences;
create policy prefs_self on user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
