// Supabase Edge Function: pulls Airtable → mirror tables.
//
// Deploy:
//   supabase functions deploy sync-airtable
//
// Set secrets:
//   supabase secrets set AIRTABLE_API_KEY=patNm...
//   supabase secrets set AIRTABLE_BASE_ID=appgvZ1dbX9me183j
//
// Schedule (pg_cron, every 10 min, in SQL editor):
//   select cron.schedule(
//     'sync-airtable-10min', '*/10 * * * *',
//     $$ select net.http_post(
//          url := 'https://<project>.supabase.co/functions/v1/sync-airtable',
//          headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>',
//                                        'x-trigger', 'cron')
//        ); $$
//   );
//
// Manual trigger from the dashboard: POST /functions/v1/sync-airtable with the user's JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AT_KEY  = Deno.env.get('AIRTABLE_API_KEY')!;
const AT_BASE = Deno.env.get('AIRTABLE_BASE_ID')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const first = (v: any) => Array.isArray(v) ? v[0] : v;
const num   = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ccode = (label: any) => label?.match?.(/\(([A-Z]{3})\)/)?.[1] || null;
const date  = (v: any) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); };
const day   = (v: any) => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); };

async function fetchFxRates(): Promise<Record<string, number> | null> {
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const j = await r.json();
    return j.rates as Record<string, number>;
  } catch { return null; }
}

function toInr(amount: number, currency: string | null, rates: Record<string, number> | null): number {
  if (!amount) return 0;
  if (!currency || currency === 'INR') return amount;
  if (!rates) return amount; // no rates available, return raw amount as best guess
  return (amount / (rates[currency] || 1)) * (rates['INR'] || 83);
}

async function airtableAll(table: string, since?: string | null) {
  const out: any[] = [];
  let offset: string | undefined = undefined;
  do {
    const url = new URL(`https://api.airtable.com/v0/${AT_BASE}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    if (since) url.searchParams.set('filterByFormula', `IS_AFTER(LAST_MODIFIED_TIME(), '${since}')`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${AT_KEY}` } });
    if (!res.ok) throw new Error(`Airtable ${table}: ${res.status} ${await res.text()}`);
    const json = await res.json();
    json.records.forEach((r: any) => out.push({ id: r.id, fields: r.fields }));
    offset = json.offset;
  } while (offset);
  return out;
}

// Page through a mirror table and collect every airtable_id. PostgREST caps a
// response at 1000 rows, so we MUST paginate — otherwise rows beyond the first
// page would look like orphans and get wrongly deleted.
async function allMirrorIds(client: any, table: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let from = 0; const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await client.from(table).select('airtable_id').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} id scan: ${error.message}`);
    if (!data || !data.length) break;
    for (const r of data) ids.add(r.airtable_id);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return ids;
}

function buildNorms(rates: Record<string, number> | null): Record<string, (rec: any) => any> {
  return {
  'After Sales Form': (rec) => {
    const f = rec.fields;
    const inrFromCalc = first(f['INR Calculations']);
    const inrCurrency = first(f['Collection in INR']);
    const amount = num(f["Payment Amount in Customer's Currency"]);
    const currency = ccode(f['Currency']);
    let inr_amount: number =
      typeof inrFromCalc === 'number' ? inrFromCalc :
      typeof inrCurrency === 'number' ? inrCurrency : 0;
    if (!inr_amount && amount) inr_amount = toInr(amount, currency, rates);
    return {
      airtable_id: rec.id,
      batch_id: f['Batch ID'] || null,
      enrollment_date: day(f['Enrollment Date']),
      created: date(f['Created']),
      agent: f['Your Name'] || null,
      team: f['Team Name'] || null,
      lead_channel: f['Lead Channel'] || null,
      lead_source: f['Lead source'] || null,
      who_booked_demo: f['Who booked the trial class ?'] || null,
      enrollment_type: f['Type of enrollment'] || null,
      subject: f['Subject Enrolled for'] || null,
      classes_included: num(f['No of classes included in payment']),
      classes_monthly: num(f['No of classes sold monthly']),
      amount,
      currency_label: f['Currency'] || null,
      currency,
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
      inr_amount,
      student_link_ids: Array.isArray(f['Student ID']) ? f['Student ID'] : [],
      raw: f,
    };
  },
  'Demo Booking Form': (rec) => {
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
  },
  'Demo Scheduling': (rec) => {
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
  },
  'Old Collection ': (rec) => {
    const f = rec.fields;
    return {
      airtable_id: rec.id,
      classes_sold: num(f['No of classes sold in that payment']),
      classes_monthly: num(f['No of classes sold monthly']),
      currency_label: f['Currency'] || null,
      currency: ccode(f['Currency']) || (f['Currency']?.match(/^[A-Z]{3}$/i) ? f['Currency'].toUpperCase() : null),
      amount: num(f["Amount in customer's currency"]),
      renewed_by: f['Renewal done by'] || null,
      department: f['Department'] || null,
      payment_date: day(f['Payment Date']),
      payment_mode: f['Mode of payment'] || null,
      raw: f,
    };
  },
  'Employe': (rec) => {
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
  },
  }; // end of returned object
} // end of buildNorms

const MIRROR: Record<string, string> = {
  'After Sales Form': 'at_after_sales',
  'Demo Booking Form': 'at_demo_bookings',
  'Demo Scheduling': 'at_demo_scheduling',
  'Old Collection ': 'at_old_collection',
  'Employe': 'at_employees',
};

const COUNTER_KEY: Record<string, string> = {
  'After Sales Form': 'rows_after_sales',
  'Demo Booking Form': 'rows_demo_bookings',
  'Demo Scheduling': 'rows_demo_scheduling',
  'Old Collection ': 'rows_old_collection',
  'Employe': 'rows_employees',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-trigger, x-client-info, apikey',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const triggeredBy = req.headers.get('x-trigger') || 'manual';

  const { data: run } = await supabase
    .from('at_sync_runs')
    .insert({ status: 'running', triggered_by: triggeredBy })
    .select().single();
  const runId = run?.id;
  const counters: any = { rows_after_sales: 0, rows_demo_bookings: 0, rows_demo_scheduling: 0, rows_old_collection: 0, rows_employees: 0 };
  let hadError: string | null = null;
  let deletedTotal = 0;

  // Incremental sync: only pull Airtable rows modified since the last successful
  // run (30s safety buffer). Pass header `x-full-sync: 1` or `?full=1` to force a
  // FULL reconcile — required to backfill newly-added columns onto old rows and
  // to re-pull everything. (Even a full sync cannot delete mirror rows that were
  // removed in Airtable — upsert never deletes; clean those out separately.)
  const url = new URL(req.url);
  const forceFull = req.headers.get('x-full-sync') === '1' || url.searchParams.get('full') === '1';
  let since: string | null = null;
  if (!forceFull) {
    const { data: lastRun } = await supabase
      .from('at_sync_runs')
      .select('finished_at')
      .eq('status', 'success')
      .order('finished_at', { ascending: false })
      .limit(1)
      .single();
    if (lastRun?.finished_at) {
      const t = new Date(lastRun.finished_at);
      t.setSeconds(t.getSeconds() - 30);
      since = t.toISOString();
    }
  }

  const rates = await fetchFxRates();
  const NORMS = buildNorms(rates);

  for (const [airTable, mirror] of Object.entries(MIRROR)) {
    try {
      const recs = await airtableAll(airTable, since);
      const rows = recs.map(NORMS[airTable]);
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const { error } = await supabase.from(mirror).upsert(chunk, { onConflict: 'airtable_id' });
        if (error) throw new Error(`${mirror}: ${error.message}`);
      }
      counters[COUNTER_KEY[airTable]] = rows.length;

      // FULL sync only: drop mirror rows whose Airtable record no longer exists
      // (upsert never deletes). Skipped on incremental runs — those only fetch
      // changed rows — and when the pull returned nothing, so a failed or empty
      // fetch can never wipe the mirror.
      if (!since && recs.length > 0) {
        const liveIds = new Set(recs.map((r: any) => r.id));
        const mirrorIds = await allMirrorIds(supabase, mirror);
        const orphans = [...mirrorIds].filter((id) => !liveIds.has(id));
        for (let i = 0; i < orphans.length; i += 100) {
          const { error } = await supabase.from(mirror).delete().in('airtable_id', orphans.slice(i, i + 100));
          if (error) throw new Error(`${mirror} orphan delete: ${error.message}`);
        }
        if (orphans.length) console.log(`${mirror}: removed ${orphans.length} orphan row(s)`);
        deletedTotal += orphans.length;
      }
    } catch (e) {
      console.error(`Failed ${airTable}:`, e);
      hadError = (hadError ? hadError + '; ' : '') + (e as Error).message;
    }
  }

  await supabase.from('at_sync_runs').update({
    status: hadError ? 'partial' : 'success',
    finished_at: new Date().toISOString(),
    ...counters,
    error_message: hadError,
  }).eq('id', runId);

  return new Response(JSON.stringify({ status: hadError ? 'partial' : 'success', counters, deleted: deletedTotal, error: hadError }), {
    headers: { 'content-type': 'application/json', ...CORS },
  });
});
