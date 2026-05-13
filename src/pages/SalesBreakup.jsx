import { useMemo, useState } from 'react';
import { useAfterSales, useOldCollection } from '../hooks/useAirtable';
import { useFxRates, toInr } from '../hooks/useAutoSync';
import { Card, Loading, ErrorBox, PageHeader, Pill } from '../components/ui';
import { dayjs, isInMonth } from '../lib/dates';
import { formatMoney } from '../lib/currency';
import {
  CURRENCY_OPTIONS, SUBJECT_OPTIONS, SALES_AGENTS, ENROLLMENT_TYPES,
  PAYMENT_MODES, PAYMENT_OPTIONS, LEAD_CHANNELS,
} from '../lib/schema';
import { Search, TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';

const ALL = '__ALL__';
const C = { green: '#70C041', blue: '#3B82F6', amber: '#F59E0B' };

function ChartTip({ active, payload, label, prefix = '₹' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,.25)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {prefix}{Number(p.value).toLocaleString()}
        </div>
      ))}
    </div>
  );
}

const fmtK = v => v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M'
  : v >= 1_000 ? (v / 1_000).toFixed(0) + 'K'
  : String(v);


export default function SalesBreakup() {
  const sales = useAfterSales();
  const oldCol = useOldCollection();
  const { data: rates } = useFxRates();

  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const monthDate = dayjs(month + '-01');
  const [includeCollection, setIncludeCollection] = useState(false);

  const [filters, setFilters] = useState({
    country: ALL, currency: ALL, agent: ALL, subject: ALL, classType: ALL,
    enrollmentType: ALL, paymentMode: ALL, paymentOption: ALL, leadChannel: ALL,
    search: '',
  });
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const toLiveInr = (amount, currency) => {
    if (!rates || !amount) return 0;
    if (!currency || currency === 'INR') return amount;
    const inrPerUsd = rates.INR || 84;
    const xPerUsd = rates[currency] || 1;
    return (amount / xPerUsd) * inrPerUsd;
  };

  const filtered = useMemo(() => {
    if (!sales.data) return [];
    return sales.data.filter(s => {
      if (!isInMonth(s.enrollmentDate, monthDate)) return false;
      if (filters.country !== ALL && s.country !== filters.country) return false;
      if (filters.currency !== ALL && s.currency !== filters.currency) return false;
      if (filters.agent !== ALL && s.agent !== filters.agent) return false;
      if (filters.subject !== ALL && s.subject !== filters.subject) return false;
      if (filters.enrollmentType !== ALL && s.enrollmentType !== filters.enrollmentType) return false;
      if (filters.paymentMode !== ALL && s.paymentMode !== filters.paymentMode) return false;
      if (filters.paymentOption !== ALL && s.paymentOption !== filters.paymentOption) return false;
      if (filters.leadChannel !== ALL && s.leadChannel !== filters.leadChannel) return false;
      if (filters.classType === 'NoDemo' && !s.saleNoDemo) return false;
      if (filters.classType === 'WithDemo' && s.saleNoDemo) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = [s.batchId, s.country, s.subject, s.agent].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sales.data, filters, monthDate]);

  const countries = useMemo(() => {
    const s = new Set();
    (sales.data || []).forEach(r => r.country && s.add(r.country));
    return Array.from(s).sort();
  }, [sales.data]);

  const totalRevenue = filtered.reduce((s, r) => s + r.inrAmount, 0);
  const totalLive = filtered.reduce((s, r) => s + toLiveInr(r.amount, r.currency), 0);
  const totalClasses = filtered.reduce((s, r) => s + r.classesIncluded, 0);
  const liveDiff = totalLive - totalRevenue;

  // Collection (renewals) for the selected month
  const collectionRows = useMemo(() => (oldCol.data || [])
    .filter(r => isInMonth(r.paymentDate, monthDate) && r.renewedBy && r.renewedBy !== '—'),
  [oldCol.data, monthDate]);

  const collectionRevenue = useMemo(() =>
    collectionRows.reduce((s, r) => s + toInr(r.amount, r.currency, rates), 0),
  [collectionRows, rates]);

  const combinedData = useMemo(() => {
    if (!includeCollection) return filtered;
    const normalizedRenewals = collectionRows.map(r => ({
      ...r,
      agent: r.renewedBy,
      enrollmentDate: r.paymentDate,
      inrAmount: toInr(r.amount, r.currency, rates),
      enrollmentType: 'Renewal (Cross/Existing)',
      isCollection: true
    }));
    return [...filtered, ...normalizedRenewals];
  }, [filtered, collectionRows, includeCollection, rates]);

  // Chart data
  const leadSourceData = useMemo(() => {
    const g = {};
    combinedData.forEach(s => { const k = s.leadChannel || s.leadSource || (s.isCollection ? 'Renewal' : '—'); g[k] = (g[k] || 0) + s.inrAmount; });
    return Object.entries(g).map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [combinedData]);

  const exportCsv = () => {
    const headers = ['Date', 'Batch/Source', 'Country', 'Subject', 'Counselor', 'Currency', 'Amount', 'INR', 'Classes', 'Type'];
    const rows = combinedData.map(s => [
      s.enrollmentDate || '', s.batchId || (s.isCollection ? 'Old Collection' : ''), s.country || '', s.subject || '',
      s.agent || '', s.currency || '', s.amount || 0, Math.round(s.inrAmount || 0),
      s.classesIncluded || 0, s.enrollmentType || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `sales-combined-${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const agentData = useMemo(() => {
    const g = {};
    combinedData.forEach(s => { if (s.agent) g[s.agent] = (g[s.agent] || 0) + s.inrAmount; });
    return Object.entries(g)
      .map(([name, revenue]) => ({ name: name.split(' ')[0], revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [combinedData]);

  const countryData = useMemo(() => {
    const g = {};
    combinedData.forEach(s => { if (s.country) g[s.country] = (g[s.country] || 0) + s.inrAmount; });
    return Object.entries(g)
      .map(([name, revenue]) => ({ name, revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [combinedData]);

  const dayTrend = useMemo(() => {
    const g = {};
    combinedData.forEach(s => {
      if (!s.enrollmentDate) return;
      const d = dayjs(s.enrollmentDate).format('YYYY-MM-DD');
      g[d] = (g[d] || 0) + s.inrAmount;
    });
    return Object.entries(g)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ day: dayjs(date).format('D MMM'), revenue: Math.round(revenue) }));
  }, [combinedData]);

  if (sales.isLoading) return <Loading />;
  if (sales.error) return <ErrorBox error={sales.error} />;

  return (
    <>
      <PageHeader title="Sales Data Breakup" subtitle="Filter by any dimension">
        <button
          className={includeCollection ? 'btn-primary' : 'btn-secondary'}
          style={{ fontSize: 12, padding: '4px 12px' }}
          onClick={() => setIncludeCollection(v => !v)}
          title="Include old collection / renewal payments in revenue totals"
        >
          {includeCollection ? '✓ Incl. Collection' : 'Excl. Collection'}
        </button>
        <button className="btn-secondary" onClick={exportCsv} title="Export filtered rows to CSV">
          <Download size={14} /> Export CSV
        </button>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="btn-secondary" />
      </PageHeader>

      <Card title="Filters">
        <div className="filter-grid">
          <Filter label="Country" value={filters.country} onChange={v => set('country', v)}
            options={[{ v: ALL, l: 'All Countries' }, ...countries.map(c => ({ v: c, l: c }))]} />
          <Filter label="Currency" value={filters.currency} onChange={v => set('currency', v)}
            options={[{ v: ALL, l: 'All Currencies' }, ...CURRENCY_OPTIONS.map(c => ({ v: c.code, l: c.label }))]} />
          <Filter label="Counselor" value={filters.agent} onChange={v => set('agent', v)}
            options={[{ v: ALL, l: 'All Counselors' }, ...SALES_AGENTS.map(a => ({ v: a, l: a }))]} />
          <Filter label="Subject" value={filters.subject} onChange={v => set('subject', v)}
            options={[{ v: ALL, l: 'All Subjects' }, ...SUBJECT_OPTIONS.map(s => ({ v: s, l: s }))]} />
          <Filter label="Class Type" value={filters.classType} onChange={v => set('classType', v)}
            options={[{ v: ALL, l: 'All' }, { v: 'WithDemo', l: 'With Demo' }, { v: 'NoDemo', l: 'Sale w/o Demo' }]} />
          <Filter label="Enrollment Type" value={filters.enrollmentType} onChange={v => set('enrollmentType', v)}
            options={[{ v: ALL, l: 'All Types' }, ...ENROLLMENT_TYPES.map(t => ({ v: t, l: t }))]} />
          <Filter label="Payment Mode" value={filters.paymentMode} onChange={v => set('paymentMode', v)}
            options={[{ v: ALL, l: 'All Modes' }, ...PAYMENT_MODES.map(p => ({ v: p, l: p }))]} />
          <Filter label="Payment Option" value={filters.paymentOption} onChange={v => set('paymentOption', v)}
            options={[{ v: ALL, l: 'All Options' }, ...PAYMENT_OPTIONS.map(p => ({ v: p, l: p }))]} />
          <Filter label="Lead Channel" value={filters.leadChannel} onChange={v => set('leadChannel', v)}
            options={[{ v: ALL, l: 'All Channels' }, ...LEAD_CHANNELS.map(c => ({ v: c, l: c }))]} />
          <div className="filter-cell">
            <label>Search</label>
            <div className="search-wrap">
              <Search size={14} />
              <input value={filters.search} onChange={e => set('search', e.target.value)}
                placeholder="Batch ID, country, subject…" className="btn-secondary" />
            </div>
          </div>
        </div>
      </Card>

      <div className="kpi-grid">
        <Card title="New Sales Records"><h2>{filtered.length}</h2></Card>
        <Card title="New Sales ₹ (logged)">
          <h2>{formatMoney(totalRevenue)}</h2>
          <div className="text-muted" style={{ fontSize: 12 }}>at time-of-sale rate</div>
        </Card>
        <Card title="New Sales ₹ (live)">
          <h2 style={{ color: liveDiff >= 0 ? C.green : '#ef4444' }}>{formatMoney(totalLive)}</h2>
          <div style={{ fontSize: 12, color: liveDiff >= 0 ? C.green : '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}>
            {liveDiff >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {liveDiff >= 0 ? '+' : ''}{formatMoney(liveDiff)} vs logged
          </div>
        </Card>
        <Card title="Classes Sold"><h2>{totalClasses}</h2></Card>
        {includeCollection && (
          <Card title="Collection Revenue ₹">
            <h2 style={{ color: C.amber }}>{formatMoney(collectionRevenue)}</h2>
            <div className="text-muted" style={{ fontSize: 12 }}>{collectionRows.length} renewal payments</div>
          </Card>
        )}
        {includeCollection && (
          <Card title="Total Revenue ₹" style={{ borderColor: C.green }}>
            <h2 style={{ color: C.green }}>{formatMoney(totalLive + collectionRevenue)}</h2>
            <div className="text-muted" style={{ fontSize: 12 }}>New sales (live) + collection</div>
          </Card>
        )}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="Revenue by Day">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dayTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sbGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.green} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={40} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={C.green} fill="url(#sbGreen)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Revenue by Counselor">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={agentData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="revenue" name="Revenue" fill={C.blue} radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Revenue by Lead Source">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={leadSourceData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={80} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="revenue" name="Revenue" fill="#8B5CF6" radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Revenue by Country">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={countryData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={52} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="revenue" name="Revenue" fill={C.amber} radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {includeCollection && collectionByAgent.length > 0 && (
        <Card title={`Collection / Renewals — ${monthDate.format('MMMM YYYY')}`} subtitle={`${collectionRows.length} payments · ${formatMoney(collectionRevenue)} total`}>
          <table className="data-table">
            <thead><tr>
              <th>Agent</th><th>Renewals</th><th>Amount (₹)</th><th>% of Collection</th>
            </tr></thead>
            <tbody>
              {collectionByAgent.map(([agent, d]) => (
                <tr key={agent}>
                  <td>{agent}</td>
                  <td>{d.count}</td>
                  <td>{formatMoney(d.amount)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 4 }}>
                        <div style={{ width: `${collectionRevenue > 0 ? Math.min((d.amount / collectionRevenue) * 100, 100) : 0}%`, height: '100%', borderRadius: 4, background: C.amber }} />
                      </div>
                      <span style={{ fontSize: 12, minWidth: 36 }}>{collectionRevenue > 0 ? ((d.amount / collectionRevenue) * 100).toFixed(1) : 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title={`New Sales Records (${filtered.length})`} subtitle={rates ? `Live rate: 1 USD = ₹${(rates.INR || 0).toFixed(2)}` : 'Loading live rates…'}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th><th>Batch</th><th>Country</th><th>Subject</th><th>Counselor</th>
                <th>Currency</th><th>Amount</th>
                <th title="INR at time of sale">₹ Logged</th>
                <th title="INR at today's live rate">₹ Live</th>
                <th>Classes</th><th>Type</th><th>Channel</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const liveInr = toLiveInr(s.amount, s.currency);
                const diff = liveInr - s.inrAmount;
                const isNonInr = s.currency && s.currency !== 'INR';
                return (
                  <tr key={s.id}>
                    <td>{s.enrollmentDate ? dayjs(s.enrollmentDate).format('MMM D') : '—'}</td>
                    <td>{s.batchId}</td>
                    <td>{s.country}</td>
                    <td>{s.subject}</td>
                    <td>{s.agent}</td>
                    <td>{s.currency}</td>
                    <td>{formatMoney(s.amount, s.currency)}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{formatMoney(s.inrAmount)}</td>
                    <td>
                      {isNonInr ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            fontWeight: 600,
                            color: diff > 100 ? C.green : diff < -100 ? '#ef4444' : 'var(--text)',
                          }}>
                            {formatMoney(Math.round(liveInr))}
                          </span>
                          {diff > 100 && <TrendingUp size={12} color={C.green} />}
                          {diff < -100 && <TrendingDown size={12} color="#ef4444" />}
                          {Math.abs(diff) <= 100 && <Minus size={12} color="var(--text-muted)" />}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>{s.classesIncluded}</td>
                    <td><Pill variant={s.enrollmentType === 'New Sale' ? 'success' : 'light'}>{s.enrollmentType}</Pill></td>
                    <td>{s.leadChannel}</td>
                  </tr>
                );
              })}
              {!filtered.length && <tr><td colSpan={12} className="text-muted">No matching new-sale records.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Filter({ label, value, onChange, options }) {
  return (
    <div className="filter-cell">
      <label>{label}</label>
      <select className="btn-secondary" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
