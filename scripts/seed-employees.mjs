// One-shot script: pull every row from Airtable `Employe` and upsert into
// the Supabase `employees` mirror table. Optionally auto-assigns regions.
//
// Usage:
//   $env:SUPABASE_SERVICE_ROLE_KEY="…"; node scripts/seed-employees.mjs
//   $env:SUPABASE_SERVICE_ROLE_KEY="…"; node scripts/seed-employees.mjs --regions
//   $env:SUPABASE_SERVICE_ROLE_KEY="…"; node scripts/seed-employees.mjs --dry
//
// The service-role key is REQUIRED (anon key is blocked by RLS for writes).
// Get it from Supabase dashboard → Project Settings → API → service_role.

import 'dotenv/config';
import Airtable from 'airtable';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AT_KEY       = process.env.VITE_AIRTABLE_API_KEY;
const AT_BASE      = process.env.VITE_AIRTABLE_BASE_ID;

const args = new Set(process.argv.slice(2));
const ASSIGN_REGIONS = args.has('--regions');
const DRY = args.has('--dry');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const ROLE_FROM_DEPT = {
  'Sales': 'sales',
  'Pre Sales': 'presales',
  'AR': 'ar',
  'Founder': 'management',
  "Founder's Office": 'management',
};

const SALES_AGENTS = [
  'Alam', 'Ashima', 'Ekta', 'Deepika', 'Lavanya', 'Ashfaq', 'Abhilash',
  'Ayushi', 'Harsh', 'Karan', 'Shraddha', 'Anisha', 'Lokeshwari',
  'Nehaal', 'Anshika', 'Elegbede Damilola Janet', 'Rishi',
  // Pre-sales agents observed in Demo Booking Form
  'Aksha', 'Aman', 'Nitu', 'Rahul', 'Sandhya', 'Shabbir', 'Zelish',
];

const HONORIFICS = new Set(['md', 'mr', 'ms', 'mrs', 'dr', 'sri', 'shri']);
const tokens = (s) => (s || '').toLowerCase().trim().split(/\s+/).filter(t => t && !HONORIFICS.has(t));
function lev(a, b) {
  if (a === b) return 0; if (!a) return b.length; if (!b) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return dp[a.length][b.length];
}
function matchAgent(empFullName, agentName) {
  const ets = tokens(empFullName), ats = tokens(agentName);
  if (!ets.length || !ats.length) return false;
  if (ats.length > 1) return ats.every(at => ets.some(et => fuzzyEq(et, at)));
  return ets.some(et => fuzzyEq(et, ats[0]));
}
function fuzzyEq(a, b) {
  if (a === b) return true;
  return lev(a, b) <= (Math.min(a.length, b.length) <= 6 ? 2 : 3);
}
function inferAgentName(fullName) {
  for (const c of SALES_AGENTS) if (matchAgent(fullName, c)) return c;
  return null;
}

// Country → region. Mirrors src/pages/AdminPanel.jsx COUNTRY_REGION.
const COUNTRY_REGION = {
  USA: 'North America', Canada: 'North America',
  UK: 'UK & Europe', Ireland: 'UK & Europe', Germany: 'UK & Europe', France: 'UK & Europe',
  Spain: 'UK & Europe', Italy: 'UK & Europe', Netherlands: 'UK & Europe',
  Australia: 'Australia & NZ', 'New Zealand': 'Australia & NZ',
  UAE: 'MENA', 'Saudi Arabia': 'MENA', Qatar: 'MENA', Kuwait: 'MENA', Oman: 'MENA', Bahrain: 'MENA',
  Singapore: 'SEA', Malaysia: 'SEA', Indonesia: 'SEA', Philippines: 'SEA', Thailand: 'SEA', Vietnam: 'SEA',
  India: 'India',
};

Airtable.configure({ apiKey: AT_KEY });
const base = Airtable.base(AT_BASE);
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function fetchAirtableEmployees() {
  const out = [];
  await base('Employe').select({ pageSize: 100 }).eachPage((records, next) => {
    records.forEach(r => out.push({ id: r.id, fields: r.fields }));
    next();
  });
  return out;
}

async function fetchRegions() {
  const { data, error } = await supabase.from('regions').select('id,name');
  if (error) throw error;
  return Object.fromEntries((data || []).map(r => [r.name, r.id]));
}

async function main() {
  console.log(`Mode: ${DRY ? 'DRY RUN (no writes)' : 'WRITE'}`);
  console.log('Fetching Airtable Employe…');
  const records = await fetchAirtableEmployees();
  console.log(`  → ${records.length} rows`);

  const regions = await fetchRegions();
  console.log(`  → ${Object.keys(regions).length} regions in Supabase`);

  // Build base rows
  const rows = records
    .filter(r => r.fields['Full Name (As per Aadhar Card)'])
    .map(r => {
      const f = r.fields;
      const dept = f['Department'] || null;
      const role = ROLE_FROM_DEPT[dept] || 'staff';
      // Try to find country from Residential Address — best effort.
      const addr = (f['Residential Address'] || '').toLowerCase();
      const country = guessCountry(addr);
      return {
        airtable_id: r.id,
        full_name: f['Full Name (As per Aadhar Card)'],
        email: (f['Personal Email ID'] || '').toLowerCase().trim() || null,
        department: dept,
        app_role: role,
        designation: f['Designation'] || null,
        airtable_agent_name: inferAgentName(f['Full Name (As per Aadhar Card)']),
        active: true,
        _country: country,
      };
    });

  if (DRY) {
    console.log('\nWould upsert:');
    rows.forEach(r => console.log(`  ${r.full_name.padEnd(30)} ${r.email || '—'} ${r.department || '—'} → ${r.app_role}`));
    process.exit(0);
  }

  console.log(`\nUpserting ${rows.length} employees…`);
  const upsertRows = rows.map(({ _country, ...rest }) => rest);
  for (let i = 0; i < upsertRows.length; i += 100) {
    const chunk = upsertRows.slice(i, i + 100);
    const { error } = await supabase
      .from('employees')
      .upsert(chunk, { onConflict: 'airtable_id' });
    if (error) {
      console.error('Upsert failed:', error);
      process.exit(1);
    }
    console.log(`  → ${i + chunk.length}/${upsertRows.length}`);
  }

  if (ASSIGN_REGIONS) {
    console.log('\nAssigning regions by guessed country…');
    const { data: emps } = await supabase.from('employees').select('id, airtable_id, region_id');
    const empByAir = Object.fromEntries((emps || []).map(e => [e.airtable_id, e]));
    const updates = [];
    rows.forEach(r => {
      const target = COUNTRY_REGION[r._country] || 'India';
      const regionId = regions[target];
      if (!regionId) return;
      const existing = empByAir[r.airtable_id];
      if (existing && existing.region_id !== regionId) {
        updates.push({ id: existing.id, region_id: regionId });
      }
    });
    console.log(`  → ${updates.length} employees need region updates`);
    for (const u of updates) {
      const { error } = await supabase.from('employees').update({ region_id: u.region_id }).eq('id', u.id);
      if (error) console.error(`  ! ${u.id}:`, error.message);
    }
    console.log('  → done');
  }

  // Summary
  const byRole = rows.reduce((acc, r) => ({ ...acc, [r.app_role]: (acc[r.app_role] || 0) + 1 }), {});
  console.log('\n✅ Done. Role distribution:');
  Object.entries(byRole).forEach(([k, v]) => console.log(`   ${k.padEnd(12)} ${v}`));

  console.log('\nNext steps:');
  console.log('  1. Promote yourself to management via SQL editor:');
  console.log('     update employees set app_role = \'management\' where lower(email) = lower(\'you@example.com\');');
  console.log('  2. Sign in via /login with that email — magic link auto-links to your employee row.');
  console.log('  3. Open the Admin Panel to manage roles, regions, and auth linkage.');
}

function guessCountry(addrLower) {
  if (!addrLower) return null;
  if (addrLower.includes('india')) return 'India';
  if (addrLower.includes('usa') || addrLower.includes('united states')) return 'USA';
  if (addrLower.includes('uk') || addrLower.includes('united kingdom') || addrLower.includes('england')) return 'UK';
  if (addrLower.includes('australia')) return 'Australia';
  if (addrLower.includes('canada')) return 'Canada';
  if (addrLower.includes('uae') || addrLower.includes('dubai')) return 'UAE';
  if (addrLower.includes('singapore')) return 'Singapore';
  return null;
}

main().catch(e => { console.error(e); process.exit(1); });
