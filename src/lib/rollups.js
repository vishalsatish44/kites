// Aggregation helpers used across pages. All take normalized records from useAirtable.

import { dayjs, isInMonth, isInWeek, isInDay } from './dates';

export const PRESALES_STOPLIST = new Set(['1on1', '1 on 1', 'No', 'no', '—', '']);

export function filterByMonth(rows, dateField, monthDate = dayjs()) {
  return rows.filter(r => isInMonth(r[dateField], monthDate));
}

export function filterByWeek(rows, dateField, weekDate = dayjs()) {
  return rows.filter(r => isInWeek(r[dateField], weekDate));
}

export function filterByDay(rows, dateField, date = dayjs()) {
  return rows.filter(r => isInDay(r[dateField], date));
}

export function filterByPeriod(rows, dateField, dateRef, mode) {
  if (mode === 'day') return filterByDay(rows, dateField, dateRef);
  if (mode === 'week') return filterByWeek(rows, dateField, dateRef);
  return filterByMonth(rows, dateField, dateRef);
}

export function salesByAgentPeriod(afterSales, dateRef, mode = 'month') {
  const inPeriod = filterByPeriod(afterSales, 'enrollmentDate', dateRef, mode);
  const groups = groupBy(inPeriod, 'agent');
  return Object.entries(groups).map(([agent, rows]) => {
    const revenue = sumBy(rows, 'inrAmount');
    const classes = sumBy(rows, 'classesIncluded');
    return {
      agent,
      enrollments: rows.length,
      revenue,
      classes,
      avgCpc: classes > 0 ? revenue / classes : 0,
      aov: rows.length > 0 ? revenue / rows.length : 0,
      sales: rows,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export function presalesConversionPeriod(bookings, afterSales, dateRef, mode = 'month') {
  const bookingById = Object.fromEntries(bookings.map(b => [b.id, b]));
  const demosByAgent = groupBy(
    bookings.filter(b =>
      filterByPeriod([b], 'formFillingDate', dateRef, mode).length > 0 ||
      filterByPeriod([b], 'formFillingTime', dateRef, mode).length > 0
    ).filter(b => !PRESALES_STOPLIST.has(b.presalesAgent)),
    'presalesAgent',
  );
  const salesByAgentMap = {};
  filterByPeriod(afterSales, 'enrollmentDate', dateRef, mode).forEach(s => {
    const ids = s.studentLinkIds || [];
    let agent = null;
    for (const id of ids) {
      const a = bookingById[id]?.presalesAgent;
      if (a && !PRESALES_STOPLIST.has(a)) { agent = a; break; }
    }
    if (!agent) return;
    if (!salesByAgentMap[agent]) salesByAgentMap[agent] = { count: 0, revenue: 0 };
    salesByAgentMap[agent].count++;
    salesByAgentMap[agent].revenue += s.inrAmount;
  });
  return Object.entries(demosByAgent).map(([agent, demos]) => {
    const s = salesByAgentMap[agent] || { count: 0, revenue: 0 };
    return {
      agent,
      demosBooked: demos.length,
      salesClosed: s.count,
      revenue: s.revenue,
      conversionPct: demos.length > 0 ? (s.count / demos.length) * 100 : 0,
      aov: s.count > 0 ? s.revenue / s.count : 0,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

export function sumBy(rows, key) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

export function countBy(rows, key) {
  const out = {};
  rows.forEach(r => {
    const k = r[key] ?? '—';
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

export function groupBy(rows, key) {
  const out = {};
  rows.forEach(r => {
    const k = r[key] ?? '—';
    if (!out[k]) out[k] = [];
    out[k].push(r);
  });
  return out;
}

// Aggregate sales per agent for a period
export function salesByAgent(afterSales, monthDate) {
  const inMonth = filterByMonth(afterSales, 'enrollmentDate', monthDate);
  const groups = groupBy(inMonth, 'agent');
  return Object.entries(groups).map(([agent, rows]) => {
    const revenue = sumBy(rows, 'inrAmount');
    const classes = sumBy(rows, 'classesIncluded');
    const avgCpc = classes > 0 ? revenue / classes : 0;
    const aov = rows.length > 0 ? revenue / rows.length : 0;
    return {
      agent,
      enrollments: rows.length,
      revenue,
      classes,
      avgCpc,
      aov,
      sales: rows,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}

// Demos completed per pre-sales agent (uses Demo Booking + Scheduling join)
// "completed" = of bookings filed this month, how many have a linked scheduling record marked done
export function demosByPresalesAgent(bookings, scheduling, monthDate) {
  const schedById = Object.fromEntries(scheduling.map(s => [s.id, s]));
  const inMonth = bookings.filter(b =>
    isInMonth(b.formFillingDate || b.formFillingTime, monthDate) &&
    !PRESALES_STOPLIST.has(b.presalesAgent),
  );
  const groups = groupBy(inMonth, 'presalesAgent');
  return Object.entries(groups).map(([agent, rows]) => {
    let scheduled = 0, completed = 0, cancelled = 0;
    rows.forEach(b => {
      const links = b.demoSchedulingLinks || [];
      const schedRows = links.map(id => schedById[id]).filter(Boolean);
      if (schedRows.some(s => s.demoScheduled)) scheduled++;
      if (schedRows.some(s => s.isCompleted)) completed++;
      if (schedRows.some(s => s.demoCompleted === 'No' || s.reasonNotCompleted)) cancelled++;
    });
    return {
      agent,
      booked: rows.length,
      scheduled,
      completed,
      cancelled,
      pending: rows.length - completed - cancelled,
    };
  }).sort((a, b) => b.booked - a.booked);
}

// Day-wise sales (groups by enrollment date)
export function dayWiseSales(afterSales, monthDate) {
  const inMonth = filterByMonth(afterSales, 'enrollmentDate', monthDate);
  const buckets = {};
  inMonth.forEach(r => {
    const k = dayjs(r.enrollmentDate).format('YYYY-MM-DD');
    if (!buckets[k]) buckets[k] = { date: k, count: 0, revenue: 0, classes: 0 };
    buckets[k].count++;
    buckets[k].revenue += r.inrAmount;
    buckets[k].classes += r.classesIncluded;
  });
  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
}

// Convert Pre-sales / Sales conversions: how many demos by an agent led to sales.
// Attribution: After Sales.studentLinkIds → Demo Booking record → presalesAgent
export function presalesConversion(bookings, afterSales, monthDate) {
  const bookingById = Object.fromEntries(bookings.map(b => [b.id, b]));
  const demosByAgent = groupBy(
    bookings.filter(b =>
      isInMonth(b.formFillingDate || b.formFillingTime, monthDate) &&
      !PRESALES_STOPLIST.has(b.presalesAgent),
    ),
    'presalesAgent',
  );

  const salesByAgentMap = {};
  afterSales
    .filter(s => isInMonth(s.enrollmentDate, monthDate))
    .forEach(s => {
      const ids = s.studentLinkIds || [];
      let agent = null;
      for (const id of ids) {
        const a = bookingById[id]?.presalesAgent;
        if (a && !PRESALES_STOPLIST.has(a)) { agent = a; break; }
      }
      if (!agent) return;
      if (!salesByAgentMap[agent]) salesByAgentMap[agent] = { count: 0, revenue: 0 };
      salesByAgentMap[agent].count++;
      salesByAgentMap[agent].revenue += s.inrAmount;
    });

  return Object.entries(demosByAgent).map(([agent, demos]) => {
    const s = salesByAgentMap[agent] || { count: 0, revenue: 0 };
    return {
      agent,
      demosBooked: demos.length,
      salesClosed: s.count,
      revenue: s.revenue,
      conversionPct: demos.length > 0 ? (s.count / demos.length) * 100 : 0,
      aov: s.count > 0 ? s.revenue / s.count : 0,
    };
  }).sort((a, b) => b.revenue - a.revenue);
}
