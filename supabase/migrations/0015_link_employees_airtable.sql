-- Link employees.airtable_id from at_employees mirror.
-- Matches on email first (most reliable), then falls back to full_name.
-- Also inserts Supabase employee rows for any at_employees records that
-- have no match yet — so attendance can reference them by UUID.

-- Step 1: update existing employees rows where email matches
UPDATE employees e
SET airtable_id = ae.airtable_id
FROM at_employees ae
WHERE e.airtable_id IS NULL
  AND lower(trim(ae.email)) = lower(trim(e.email))
  AND ae.email IS NOT NULL
  AND ae.email <> '';

-- Step 2: update by full_name for any still unlinked
UPDATE employees e
SET airtable_id = ae.airtable_id
FROM at_employees ae
WHERE e.airtable_id IS NULL
  AND lower(trim(ae.full_name)) = lower(trim(e.full_name));

-- Step 3: insert employees rows for at_employees records with no match yet
-- (so new hires synced from Airtable are usable in attendance without manual seeding)
INSERT INTO employees (airtable_id, full_name, email, department, designation, active)
SELECT
  ae.airtable_id,
  ae.full_name,
  nullif(trim(ae.email), ''),
  ae.department,
  ae.designation,
  true
FROM at_employees ae
WHERE ae.full_name IS NOT NULL
  AND trim(ae.full_name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM employees e WHERE e.airtable_id = ae.airtable_id
  )
ON CONFLICT (airtable_id) DO NOTHING;
