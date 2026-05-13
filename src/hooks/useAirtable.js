// Data hooks. Read from Supabase mirror tables (synced from Airtable).
// Fall back to live Airtable reads if Supabase isn't configured or the
// mirror is empty (first run before any sync has happened).
//
// The Supabase mirror is the source of truth in production.

import { useQuery } from '@tanstack/react-query';
import { fetchAll } from '../lib/airtable';
import { supabase, supabaseReady } from '../lib/supabase';
import {
  TABLES,
  F_AFTER_SALES,
  F_DEMO_BOOKING,
  F_DEMO_SCHEDULING,
  F_EMPLOYEE,
  F_OLD_COLLECTION,
} from '../lib/schema';
import { currencyFromLabel } from '../lib/currency';
import { toInr } from './useAutoSync';

const STALE = 60 * 1000; // 1 min — mirror is the source of truth, refetch quickly

const first = (v) => Array.isArray(v) ? v[0] : v;

// ---------------- helpers ----------------

async function selectAllChunked(table) {
  // Supabase REST has a 1000-row default limit. Page through it.
  const out = [];
  let from = 0;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// ---------------- AFTER SALES ----------------

// Mirror row → UI shape (matches the live Airtable normalizer below).
function fromMirrorAfterSales(r, rates) {
  const amount = Number(r.amount) || 0;
  const currency = r.currency || 'INR';
  
  // PRIMARY FIX: Always recalculate INR amount from the Source Amount and Currency
  // using current FX rates to ensure accuracy, regardless of what's stored in the mirror column.
  let inrAmount = toInr(amount, currency, rates);
  
  return {
    id: r.airtable_id,
    batchId: r.batch_id,
    enrollmentDate: r.enrollment_date,
    created: r.created,
    agent: r.agent || '—',
    team: r.team || '—',
    leadChannel: r.lead_channel || '—',
    whoBookedDemo: r.who_booked_demo,
    enrollmentType: r.enrollment_type || '—',
    subject: r.subject || '—',
    classesIncluded: r.classes_included || 0,
    classesMonthly: r.classes_monthly || 0,
    amount,
    currencyLabel: r.currency_label,
    currency,
    paymentMode: r.payment_mode || '—',
    paymentOption: r.payment_option || '—',
    country: r.country || '—',
    grade: r.grade || '—',
    timezoneState: r.timezone_state,
    timezoneCity: r.timezone_city,
    countryCode: r.country_code,
    isReferral: r.is_referral === true,
    saleNoDemo: r.sale_no_demo === true,
    cpc: Number(r.cpc) || 0,
    inrAmount,
    studentLinkIds: r.student_link_ids || [],
    raw: r.raw,
  };
}

function normalizeAfterSale(rec) {
  const f = rec.fields;
  const inrFromCalc = first(f[F_AFTER_SALES.INR_CALC]);
  const inrCurrency = first(f[F_AFTER_SALES.COLLECTION_INR]);
  return {
    id: rec.id,
    batchId: f[F_AFTER_SALES.BATCH_ID],
    enrollmentDate: f[F_AFTER_SALES.ENROLLMENT_DATE] || null,
    created: f[F_AFTER_SALES.CREATED] || null,
    agent: f[F_AFTER_SALES.AGENT] || '—',
    team: f[F_AFTER_SALES.TEAM] || '—',
    leadChannel: f[F_AFTER_SALES.LEAD_CHANNEL] || '—',
    whoBookedDemo: f[F_AFTER_SALES.WHO_BOOKED_DEMO] || null,
    enrollmentType: f[F_AFTER_SALES.ENROLLMENT_TYPE] || '—',
    subject: f[F_AFTER_SALES.SUBJECT] || '—',
    classesIncluded: Number(f[F_AFTER_SALES.CLASSES_INCLUDED]) || 0,
    classesMonthly: Number(f[F_AFTER_SALES.CLASSES_MONTHLY]) || 0,
    amount: Number(f[F_AFTER_SALES.AMOUNT]) || 0,
    currencyLabel: f[F_AFTER_SALES.CURRENCY] || null,
    currency: currencyFromLabel(f[F_AFTER_SALES.CURRENCY]) || 'INR',
    paymentMode: f[F_AFTER_SALES.MODE_OF_PAYMENT] || '—',
    paymentOption: f[F_AFTER_SALES.PAYMENT_OPTION] || '—',
    country: first(f[F_AFTER_SALES.COUNTRY]) || '—',
    grade: first(f[F_AFTER_SALES.GRADE]) || '—',
    timezoneState: f[F_AFTER_SALES.TIMEZONE_STATE] || null,
    timezoneCity: first(f[F_AFTER_SALES.TIMEZONE_CITY]) || null,
    countryCode: first(f[F_AFTER_SALES.COUNTRY_CODE]) || null,
    isReferral: f[F_AFTER_SALES.IS_REFERRAL] === 'Yes',
    saleNoDemo: f[F_AFTER_SALES.SALE_NO_DEMO] === 'Yes',
    cpc: Number(f[F_AFTER_SALES.CPC]) || 0,
    inrAmount: typeof inrFromCalc === 'number' ? inrFromCalc : (typeof inrCurrency === 'number' ? inrCurrency : 0),
    studentLinkIds: Array.isArray(f[F_AFTER_SALES.STUDENT_LINK]) ? f[F_AFTER_SALES.STUDENT_LINK] : [],
    raw: f,
  };
}

async function fetchFxRates() {
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const j = await r.json();
    return j.rates;
  } catch { return null; }
}

export function useAfterSales() {
  return useQuery({
    queryKey: ['after-sales-v2'],
    queryFn: async () => {
      const rates = await fetchFxRates();
      if (supabaseReady()) {
        const rows = await selectAllChunked('at_after_sales');
        return rows.map(r => fromMirrorAfterSales(r, rates));
      }
      const recs = await fetchAll(TABLES.AFTER_SALES);
      return recs.map(normalizeAfterSale);
    },
    staleTime: STALE,
  });
}

// ---------------- DEMO BOOKING ----------------

function fromMirrorDemoBooking(r) {
  return {
    id: r.airtable_id,
    studentId: r.student_id,
    bookingId: r.booking_id,
    presalesAgent: r.presales_agent || '—',
    salesAgent: r.sales_agent,
    dsa: r.dsa,
    studentName: r.student_name || '—',
    studentEmail: r.student_email,
    studentContact: r.student_contact,
    country: r.country || '—',
    city: r.city,
    studentTimezone: r.student_timezone,
    subject: r.subject || '—',
    demoDateCx: r.demo_date_cx,
    demoDateIst: r.demo_date_ist,
    formFillingTime: r.form_filling_time,
    formFillingDate: r.form_filling_date,
    leadSource: r.lead_source,
    saleNoDemo: r.sale_no_demo === true,
    demoSchedulingLinks: r.demo_scheduling_links || [],
    afterSalesLinks: r.after_sales_links || [],
    demoCompletedLookup: r.demo_completed_lookup || [],
    demoScheduledLookup: r.demo_scheduled_lookup || [],
  };
}

function normalizeDemoBooking(rec) {
  const f = rec.fields;
  return {
    id: rec.id,
    studentId: f[F_DEMO_BOOKING.STUDENT_ID],
    bookingId: f[F_DEMO_BOOKING.DEMO_BOOKING_ID],
    presalesAgent: first(f[F_DEMO_BOOKING.PRESALES_AGENT]) || f[F_DEMO_BOOKING.AGENT_NAME] || '—',
    salesAgent: f[F_DEMO_BOOKING.SALES_AGENT] || null,
    dsa: f[F_DEMO_BOOKING.DSA_NAME] || null,
    studentName: f[F_DEMO_BOOKING.STUDENT_NAME] || '—',
    studentEmail: f[F_DEMO_BOOKING.STUDENT_EMAIL] || null,
    studentContact: f[F_DEMO_BOOKING.STUDENT_CONTACT] || null,
    country: f[F_DEMO_BOOKING.COUNTRY] || '—',
    city: f[F_DEMO_BOOKING.CITY] || null,
    studentTimezone: f[F_DEMO_BOOKING.STUDENT_TIMEZONE] || null,
    subject: f[F_DEMO_BOOKING.SUBJECT] || '—',
    demoDateCx: f[F_DEMO_BOOKING.DEMO_DATE_CX] || null,
    demoDateIst: f[F_DEMO_BOOKING.DEMO_DATE_IST] || null,
    formFillingTime: f[F_DEMO_BOOKING.FORM_FILLING_TIME] || null,
    formFillingDate: f[F_DEMO_BOOKING.FORM_FILLING_DATE] || null,
    leadSource: f[F_DEMO_BOOKING.LEAD_SOURCE] || null,
    saleNoDemo: f[F_DEMO_BOOKING.SALE_NO_DEMO] === 'Yes',
    demoSchedulingLinks: f[F_DEMO_BOOKING.DEMO_SCHEDULING_LINK] || [],
    afterSalesLinks: f[F_DEMO_BOOKING.AFTER_SALES_LINK] || [],
    demoCompletedLookup: f[F_DEMO_BOOKING.DEMO_COMPLETED_LOOKUP] || [],
    demoScheduledLookup: f[F_DEMO_BOOKING.DEMO_SCHEDULED_LOOKUP] || [],
  };
}

export function useDemoBookings() {
  return useQuery({
    queryKey: ['demo-bookings-v2'],
    queryFn: async () => {
      if (supabaseReady()) {
        const rows = await selectAllChunked('at_demo_bookings');
        return rows.map(fromMirrorDemoBooking);
      }
      const recs = await fetchAll(TABLES.DEMO_BOOKING);
      return recs.map(normalizeDemoBooking);
    },
    staleTime: STALE,
  });
}

// ---------------- DEMO SCHEDULING ----------------

function fromMirrorDemoScheduling(r) {
  return {
    id: r.airtable_id,
    demoId: r.demo_id,
    studentLink: r.student_link || [],
    demoScheduled: r.demo_scheduled === true,
    demoCompleted: r.demo_completed,
    isCompleted: r.is_completed === true,
    finalDemoDate: r.final_demo_date,
    subject: r.subject || '—',
    teacherLink: r.teacher_link || [],
    scheduledBy: r.scheduled_by,
    waMailSent: r.wa_mail_sent === true,
    reasonNotScheduled: r.reason_not_scheduled,
    reasonNotCompleted: r.reason_not_completed,
    created: r.created,
    dsa: r.dsa,
  };
}

function normalizeDemoScheduling(rec) {
  const f = rec.fields;
  return {
    id: rec.id,
    demoId: f[F_DEMO_SCHEDULING.DEMO_ID],
    studentLink: f[F_DEMO_SCHEDULING.STUDENT_LINK] || [],
    demoScheduled: f[F_DEMO_SCHEDULING.DEMO_SCHEDULED] === true,
    demoCompleted: f[F_DEMO_SCHEDULING.DEMO_COMPLETED] || null,
    isCompleted: f[F_DEMO_SCHEDULING.DEMO_COMPLETED] === 'Yes' || f[F_DEMO_SCHEDULING.DEMO_COMPLETED] === 'Completed',
    finalDemoDate: f[F_DEMO_SCHEDULING.FINAL_DEMO_DATE] || null,
    subject: f[F_DEMO_SCHEDULING.DEMO_SUBJECT] || '—',
    teacherLink: f[F_DEMO_SCHEDULING.TEACHER_LINK] || [],
    scheduledBy: f[F_DEMO_SCHEDULING.SCHEDULED_BY] || null,
    waMailSent: f[F_DEMO_SCHEDULING.WA_MAIL_SENT] === true,
    reasonNotScheduled: f[F_DEMO_SCHEDULING.REASON_NOT_SCHEDULED] || null,
    reasonNotCompleted: f[F_DEMO_SCHEDULING.REASON_NOT_COMPLETED] || null,
    created: f[F_DEMO_SCHEDULING.CREATED] || null,
    dsa: f[F_DEMO_SCHEDULING.DSA_NAME] || null,
  };
}

export function useDemoScheduling() {
  return useQuery({
    queryKey: ['demo-scheduling-v2'],
    queryFn: async () => {
      if (supabaseReady()) {
        const rows = await selectAllChunked('at_demo_scheduling');
        return rows.map(fromMirrorDemoScheduling);
      }
      const recs = await fetchAll(TABLES.DEMO_SCHEDULING);
      return recs.map(normalizeDemoScheduling);
    },
    staleTime: STALE,
  });
}

// ---------------- EMPLOYEES ----------------

function fromMirrorEmployee(r) {
  return {
    id: r.airtable_id,
    employeeId: r.employee_id || null,
    fullName: r.full_name || '—',
    email: r.email || null,
    contact: r.contact || null,
    department: r.department || '—',
    designation: r.designation || null,
    joiningDate: r.joining_date || null,
    gender: r.gender || null,
    reportingManager: r.reporting_manager || [],
  };
}

function normalizeEmployee(rec) {
  const f = rec.fields;
  return {
    id: rec.id,
    employeeId: f[F_EMPLOYEE.ID] || null,
    fullName: f[F_EMPLOYEE.FULL_NAME] || '—',
    email: f[F_EMPLOYEE.EMAIL] || null,
    contact: f[F_EMPLOYEE.CONTACT] || null,
    department: f[F_EMPLOYEE.DEPARTMENT] || '—',
    designation: f[F_EMPLOYEE.DESIGNATION] || null,
    joiningDate: f[F_EMPLOYEE.JOINING_DATE] || null,
    gender: f[F_EMPLOYEE.GENDER] || null,
    reportingManager: f[F_EMPLOYEE.REPORTING_MANAGER] || [],
  };
}

export function useEmployees() {
  return useQuery({
    queryKey: ['employees-v2'],
    queryFn: async () => {
      if (supabaseReady()) {
        const rows = await selectAllChunked('at_employees');
        return rows.map(fromMirrorEmployee);
      }
      const recs = await fetchAll(TABLES.EMPLOYEES);
      return recs.map(normalizeEmployee);
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ---------------- OLD COLLECTION (renewals) ----------------

function fromMirrorOldCollection(r, rates) {
  const amount = Number(r.amount) || 0;
  const currency = r.currency || 'INR';
  const inrAmount = toInr(amount, currency, rates);
  return {
    id: r.airtable_id,
    classesSold: r.classes_sold || 0,
    classesMonthly: r.classes_monthly || 0,
    currencyLabel: r.currency_label,
    currency,
    amount,
    inrAmount,
    renewedBy: r.renewed_by || '—',
    department: r.department || '—',
    paymentDate: r.payment_date,
    paymentMode: r.payment_mode,
  };
}

function normalizeOldCollection(rec) {
  const f = rec.fields;
  return {
    id: rec.id,
    classesSold: Number(f[F_OLD_COLLECTION.CLASSES_SOLD]) || 0,
    classesMonthly: Number(f[F_OLD_COLLECTION.CLASSES_MONTHLY]) || 0,
    currencyLabel: f[F_OLD_COLLECTION.CURRENCY] || null,
    currency: currencyFromLabel(f[F_OLD_COLLECTION.CURRENCY]) || 'INR',
    amount: Number(f[F_OLD_COLLECTION.AMOUNT]) || 0,
    renewedBy: f[F_OLD_COLLECTION.RENEWED_BY] || '—',
    department: f[F_OLD_COLLECTION.DEPARTMENT] || '—',
    paymentDate: f[F_OLD_COLLECTION.PAYMENT_DATE] || null,
    paymentMode: f[F_OLD_COLLECTION.MODE_OF_PAYMENT] || null,
  };
}

export function useOldCollection() {
  return useQuery({
    queryKey: ['old-collection-v2'],
    queryFn: async () => {
      const rates = await fetchFxRates();
      if (supabaseReady()) {
        const rows = await selectAllChunked('at_old_collection');
        return rows.map(r => fromMirrorOldCollection(r, rates));
      }
      const recs = await fetchAll(TABLES.OLD_COLLECTION);
      return recs.map(normalizeOldCollection);
    },
    staleTime: STALE,
  });
}

// ---------------- Sync metadata ----------------

export function useLastSync() {
  return useQuery({
    queryKey: ['last-sync'],
    queryFn: async () => {
      if (!supabaseReady()) return null;
      const { data } = await supabase.from('v_last_sync').select('*').single();
      return data;
    },
    refetchInterval: 30 * 1000,
  });
}
