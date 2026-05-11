// Pulls Airtable → Supabase mirror tables. Idempotent — safe to run on a cron.
//
// Usage:
//   $env:SUPABASE_SERVICE_ROLE_KEY="…"; node scripts/sync-airtable.mjs
//   $env:SUPABASE_SERVICE_ROLE_KEY="…"; node scripts/sync-airtable.mjs --only=after_sales
//
// Cron suggestion (every 10 min):
//   */10 * * * * SUPABASE_SERVICE_ROLE_KEY=… node /path/scripts/sync-airtable.mjs

import 'dotenv/config';
import Airtable from 'airtable';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AT_KEY       = process.env.VITE_AIRTABLE_API_KEY;
const AT_BASE      = process.env.VITE_AIRTABLE_BASE_ID;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!AT_KEY || !AT_BASE) {
  console.error('Missing Airtable env vars');
  process.exit(1);
}

const args = process.argv.slice(2);
const only = (args.find(a => a.startsWith('--only='))?.split('=')[1] || '').split(',').filter(Boolean);

Airtable.configure({ apiKey: AT_KEY });
const base = Airtable.base(AT_BASE);
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const first = (v) => Array.isArray(v) ? v[0] : v;
const num   = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const date  = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };
const day   = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };
const ccode = (label) => label?.match(/\(([A-Z]{3})\)/)?.[1] || null;

async function fetchAll(table) {
  const out = [];
  await base(table).select({ pageSize: 100 }).eachPage((records, next) => {
    records.forEach(r => out.push({ id: r.id, fields: r.fields }));
    next();
  });
  return out;
}

async function upsertChunked(table, rows, conflict = 'airtable_id') {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

// ---------------- normalizers ----------------

function normAfterSales(rec) {
  const f = rec.fields;
  const inrFromCalc = first(f['INR Calculations']);
  const inrCurrency = first(f['Collection in INR']);
  return {
    airtable_id: rec.id,
    batch_id: f['Batch ID'] || null,
    enrollment_date: day(f['Enrollment Date']),
    created: date(f['Created']),
    agent: f['Your Name'] || null,
    team: f['Team Name'] || null,
    lead_channel: f['Lead Channel'] || null,
    lead_source: f['Lead source'] || null,
    who_booked_demo: null, // multipleRecordLinks field — stored as student_link_ids instead
    enrollment_type: f['Type of enrollment'] || null,
    subject: f['Subject Enrolled for'] || null,
    classes_included: num(f['No of classes included in payment']),
    classes_monthly: num(f['No of classes sold monthly']),
    amount: num(f["Payment Amount in Customer's Currency"]),
    currency_label: f['Currency'] || null,
    currency: ccode(f['Currency']),
    payment_mode: f['Mode of payment'] || null,
    payment_option: f['Payment Option'] || null,
    country: first(f['Country (from Student ID)']) || null,
    grade: first(f['Grade']) || null,
    timezone_state: f['Timezone/State'] || null,
    timezone_city: first(f['Timezone/City']) || null,
    country_code: first(f['Country Code']) || null,
    is_referral: f['Is this a referral lead'] === 'Yes',
    sale_no_demo: f['Sale w/o Demo'] === 'Yes',
    cpc: num(f['CPC']),
    inr_amount: typeof inrFromCalc === 'number'
      ? inrFromCalc
      : (typeof inrCurrency === 'number' ? inrCurrency : 0),
    student_link_ids: Array.isArray(f['Student ID']) ? f['Student ID'] : [],
    raw: f,
  };
}

function normDemoBooking(rec) {
  const f = rec.fields;
  return {
    airtable_id: rec.id,
    student_id: f['Student ID'] || null,
    booking_id: f['Demo booking ID'] || null,
    presales_agent: first(f['Pre sales agent name']) || f['Agent Name'] || null,
    sales_agent: f['Sales Agent'] || null,
    dsa: f['DSA Name'] || null,
    student_name: f['Student Name'] || null,
    student_email: f['Student Email ID'] || null,
    student_contact: f['Student Contact Number'] || null,
    country: f['Country'] || null,
    city: f['City'] || null,
    student_timezone: f['Student Time Zone'] || null,
    subject: f['Demo Session Subject'] || null,
    demo_date_cx: date(f['Demo Class Date and time (CX TZ)']),
    demo_date_ist: date(f['Demo class data and time IST']),
    form_filling_time: date(f['Form filling time']),
    form_filling_date: day(f['Form Filling date']),
    lead_source: f['Lead source'] || null,
    sale_no_demo: f['Sale w/o Demo'] === 'Yes',
    demo_scheduling_links: f['Demo Scheduling'] || [],
    after_sales_links: f['After Sales'] || [],
    demo_completed_lookup: f['Demo Completed (from Demo Scheduling)'] || [],
    demo_scheduled_lookup: f['Demo Scheduled (from Demo Scheduling)'] || [],
    raw: f,
  };
}

function normDemoScheduling(rec) {
  const f = rec.fields;
  return {
    airtable_id: rec.id,
    demo_id: f['Demo ID'] || null,
    student_link: f['Student ID'] || [],
    demo_scheduled: f['Demo Scheduled'] === true,
    demo_completed: f['Demo Completed'] || null,
    is_completed: f['Demo Completed'] === 'Yes' || f['Demo Completed'] === 'Completed',
    final_demo_date: date(f['Final Demo date and time']),
    subject: f['Demo Subject'] || null,
    teacher_link: f['Demo Teacher Name'] || [],
    scheduled_by: f['Demo Scheduled by'] || null,
    wa_mail_sent: f['Send WA msg and Mail'] === true,
    reason_not_scheduled: f['Reason, if demo not scheduled'] || null,
    reason_not_completed: f['Reason, if demo not completed.'] || null,
    created: date(f['Form filling time']),
    dsa: f['DSA Name'] || null,
    raw: f,
  };
}

function normOldCollection(rec) {
  const f = rec.fields;
  return {
    airtable_id: rec.id,
    classes_sold: num(f['No of classes sold in that payment']),
    classes_monthly: num(f['No of classes sold monthly']),
    currency_label: f['Currency'] || null,
    currency: ccode(f['Currency']),
    amount: num(f["Amount in customer's currency"]),
    renewed_by: f['Renewal done by'] || null,
    department: f['Department'] || null,
    payment_date: day(f['Payment Date']),
    payment_mode: f['Mode of payment'] || null,
    raw: f,
  };
}

function normEmployee(rec) {
  const f = rec.fields;
  return {
    airtable_id: rec.id,
    full_name: f['Full Name (As per Aadhar Card)'] || null,
    employee_id: f['Id'] || null,
    email: f['Personal Email ID'] || null,
    contact: f['Contact Number'] || null,
    department: f['Department'] || null,
    designation: f['Designation'] || null,
    gender: f['Gender'] || null,
    joining_date: day(f['Joinning Date']),
    reporting_manager: Array.isArray(f['Reporting Manager']) ? f['Reporting Manager'] : [],
    raw: f,
  };
}

// ---------------- runner ----------------

const TASKS = {
  after_sales:    { airtable: 'After Sales Form', mirror: 'at_after_sales',     norm: normAfterSales,    counterKey: 'rows_after_sales' },
  demo_bookings:  { airtable: 'Demo Booking Form',mirror: 'at_demo_bookings',   norm: normDemoBooking,   counterKey: 'rows_demo_bookings' },
  demo_scheduling:{ airtable: 'Demo Scheduling',  mirror: 'at_demo_scheduling', norm: normDemoScheduling,counterKey: 'rows_demo_scheduling' },
  old_collection: { airtable: 'Old Collection ',  mirror: 'at_old_collection',  norm: normOldCollection, counterKey: 'rows_old_collection' },
  employees:      { airtable: 'Employe',           mirror: 'at_employees',       norm: normEmployee,      counterKey: 'rows_employees' },
};

async function recordRunStart(triggered_by) {
  const { data, error } = await supabase
    .from('at_sync_runs')
    .insert({ status: 'running', triggered_by })
    .select()
    .single();
  if (error) console.warn('Could not record sync start:', error.message);
  return data?.id;
}

async function recordRunEnd(runId, status, counters, errMsg) {
  if (!runId) return;
  await supabase.from('at_sync_runs').update({
    status, finished_at: new Date().toISOString(),
    ...counters,
    error_message: errMsg || null,
  }).eq('id', runId);
}

async function main() {
  const targets = only.length ? only : Object.keys(TASKS);
  console.log(`Sync targets: ${targets.join(', ')}`);

  const runId = await recordRunStart(process.env.SYNC_TRIGGER || 'manual');
  const counters = { rows_after_sales: 0, rows_demo_bookings: 0, rows_demo_scheduling: 0, rows_old_collection: 0, rows_employees: 0 };
  const startedAt = Date.now();
  let hadError = null;

  for (const key of targets) {
    const t = TASKS[key];
    if (!t) { console.warn(`Unknown target: ${key}`); continue; }
    try {
      console.log(`\n[${key}] fetching from Airtable…`);
      const recs = await fetchAll(t.airtable);
      console.log(`  → ${recs.length} rows`);
      const rows = recs.map(t.norm);
      console.log(`  → upserting…`);
      await upsertChunked(t.mirror, rows);
      counters[t.counterKey] = rows.length;
      console.log(`  ✓ ${rows.length} synced`);
    } catch (e) {
      console.error(`  ✗ ${key} failed: ${e.message}`);
      hadError = e;
    }
  }

  const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
  const status = hadError ? 'partial' : 'success';
  await recordRunEnd(runId, status, counters, hadError?.message);
  console.log(`\n✓ done in ${dur}s — status=${status}`);
  console.log(`  after_sales=${counters.rows_after_sales} demos=${counters.rows_demo_bookings} scheduling=${counters.rows_demo_scheduling} renewals=${counters.rows_old_collection} employees=${counters.rows_employees}`);
  process.exit(hadError ? 1 : 0);
}

main().catch(async e => {
  console.error('Fatal:', e);
  process.exit(1);
});
