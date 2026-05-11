-- =====================================================================
-- Add an override column for matching employees to Airtable agent names.
--
-- Airtable's `Your Name` (After Sales) and `Pre sales agent name` (Demo
-- Booking) are single-select fields with first-names-only values like
-- "Deepika", "Shraddha", "Nehaal". Employee.full_name in Supabase is the
-- legal full name from Aadhar. The fuzzy matcher in src/lib/nameMatch.js
-- handles 90% of cases — but ambiguous ones (two Aman, custom spellings)
-- need manual override.
--
-- The override is a single text column. When set, it takes priority.
-- =====================================================================

alter table employees
  add column if not exists airtable_agent_name text;

create index if not exists employees_airtable_agent_idx
  on employees (lower(airtable_agent_name));

comment on column employees.airtable_agent_name is
  'Override for matching this employee to Airtable agent single-select values. Set when fuzzy matching is wrong.';
