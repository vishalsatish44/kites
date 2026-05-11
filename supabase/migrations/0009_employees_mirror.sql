-- Mirror for Airtable "Employe" table.
-- Run after 0004_airtable_mirror.sql

create table if not exists at_employees (
  airtable_id   text primary key,
  full_name     text,
  employee_id   text,
  email         text,
  contact       text,
  department    text,
  designation   text,
  gender        text,
  joining_date  date,
  reporting_manager text[],
  raw           jsonb,
  synced_at     timestamptz default now()
);

create index if not exists at_employees_name_idx       on at_employees(full_name);
create index if not exists at_employees_department_idx on at_employees(department);

alter table at_employees enable row level security;

-- Anyone authenticated can read employees (used for team display in all roles)
drop policy if exists at_employees_read on at_employees;
create policy at_employees_read on at_employees for select using (auth.role() = 'authenticated');
