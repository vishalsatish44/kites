-- =====================================================================
-- Seed default incentive configs for the three teams.
-- Mirrors the defaults from src/lib/incentive.js so management can edit
-- in-app without a code deploy.
-- Run this AFTER 0001_init.sql.
-- =====================================================================

-- Only seed if the table is empty for that team.
insert into incentive_config (team, effective_from, config)
select 'presales', current_date, jsonb_build_object(
  'dailyDemoBookingTarget', 4,
  'halfDayThreshold', 0.5,
  'fullDayThreshold', 0.75,
  'conversionSlabs', jsonb_build_array(
    jsonb_build_object('minPct', 0,  'maxPct', 20, 'perSale', 0),
    jsonb_build_object('minPct', 20, 'maxPct', 26, 'perSale', 300),
    jsonb_build_object('minPct', 26, 'maxPct', 32, 'perSale', 500),
    jsonb_build_object('minPct', 32, 'maxPct', 40, 'perSale', 700),
    jsonb_build_object('minPct', 40, 'maxPct', 100, 'perSale', 1000)
  ),
  'aovMultipliers', jsonb_build_array(
    jsonb_build_object('minAov', 0,     'maxAov', 12000,    'multiplier', 0.30),
    jsonb_build_object('minAov', 12000, 'maxAov', 18000,    'multiplier', 0.60),
    jsonb_build_object('minAov', 18000, 'maxAov', 25000,    'multiplier', 0.85),
    jsonb_build_object('minAov', 25000, 'maxAov', 99999999, 'multiplier', 1.00)
  )
)
where not exists (select 1 from incentive_config where team = 'presales');

insert into incentive_config (team, effective_from, config)
select 'sales', current_date, jsonb_build_object(
  'minCpc', 600,
  'minClassesPerSale', 4,
  'incentiveRate', 0.50,
  'achievementMultipliers', jsonb_build_array(
    jsonb_build_object('minPct', 0,   'maxPct', 70,       'multiplier', 0),
    jsonb_build_object('minPct', 70,  'maxPct', 80,       'multiplier', 0.20),
    jsonb_build_object('minPct', 80,  'maxPct', 90,       'multiplier', 0.50),
    jsonb_build_object('minPct', 90,  'maxPct', 100,      'multiplier', 0.80),
    jsonb_build_object('minPct', 100, 'maxPct', 99999999, 'multiplier', 1.00)
  )
)
where not exists (select 1 from incentive_config where team = 'sales');

insert into incentive_config (team, effective_from, config)
select 'ar', current_date, jsonb_build_object(
  'minCpc', 600,
  'minClassesPerSale', 4,
  'incentiveRate', 0.50,
  'achievementMultipliers', jsonb_build_array(
    jsonb_build_object('minPct', 0,   'maxPct', 70,       'multiplier', 0),
    jsonb_build_object('minPct', 70,  'maxPct', 80,       'multiplier', 0.20),
    jsonb_build_object('minPct', 80,  'maxPct', 90,       'multiplier', 0.50),
    jsonb_build_object('minPct', 90,  'maxPct', 100,      'multiplier', 0.80),
    jsonb_build_object('minPct', 100, 'maxPct', 99999999, 'multiplier', 1.00)
  )
)
where not exists (select 1 from incentive_config where team = 'ar');
