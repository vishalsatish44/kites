import { useMemo, useState, useEffect } from 'react';
import {
  useAfterSales, useDemoBookings, useDemoScheduling, useOldCollection,
} from '../hooks/useAirtable';
import { Card, Loading, ErrorBox, PageHeader, Pill } from '../components/ui';
import { dayjs, isInMonth, isInWeek, isInDay } from '../lib/dates';
import { salesByAgentPeriod, presalesConversionPeriod, filterByPeriod } from '../lib/rollups';
import { formatMoney, getRates } from '../lib/currency';
import { computeSalesIncentive, computePresalesIncentive } from '../lib/incentive';
import { useIncentiveConfigs } from '../hooks/useIncentiveConfig';
import { Sparkles } from 'lucide-react';
import { useGemini } from '../hooks/useGemini';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const C = { green: '#70C041', blue: '#3B82F6', amber: '#F59E0B', red: '#EF4444', purple: '#8B5CF6', cyan: '#06B6D4' };

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
      boxShadow: '0 8px 24px rgba(0,0,0,.25)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}:{' '}
          {p.name === 'Conversion %' ? `${p.value}%`
            : p.name === 'Demos' ? p.value
            : '₹' + Number(p.value).toLocaleString()}
        </div>
      ))}
    </div>
  );
}

function ToggleGroup({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', borderRadius: 8, padding: 3 }}>
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding: '4px 12px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
          background: value === v ? '#70c041' : 'transparent',
          color: value === v ? '#fff' : 'var(--text-muted)',
          fontWeight: value === v ? 600 : 400,
          transition: 'all .15s',
        }}>{l}</button>
      ))}
    </div>
  );
}

const fmt = v => v >= 1_000_000 ? '₹' + (v / 1_000_000).toFixed(1) + 'M'
  : v >= 1_000 ? '₹' + (v / 1_000).toFixed(0) + 'K'
  : '₹' + v;

export default function WBRManagement() {
  const [periodMode, setPeriodMode] = useState('month');
  const [dateStr, setDateStr] = useState(dayjs().format('YYYY-MM'));
  const [displayCurrency, setDisplayCurrency] = useState('INR');
  const [rates, setRates] = useState(null);

  useEffect(() => {
    getRates().then(setRates);
  }, []);
  const [segment, setSegment] = useState('all');
  const [country, setCountry] = useState('');
  const [wbrReport, setWbrReport] = useState('');
  const { ask, loading: aiLoading } = useGemini();

  const switchMode = (m) => {
    setPeriodMode(m);
    if (m === 'day') setDateStr(dayjs().format('YYYY-MM-DD'));
    else if (m === 'week') setDateStr(dayjs().format('GGGG-[W]WW'));
    else setDateStr(dayjs().format('YYYY-MM'));
  };

  const dateRef = useMemo(() => {
    if (periodMode === 'day') return dayjs(dateStr);
    if (periodMode === 'week') {
      const [year, week] = dateStr.replace('W', '-').split('-').filter(Boolean);
      return dayjs().isoWeekYear(parseInt(year)).isoWeek(parseInt(week)).startOf('isoWeek');
    }
    return dayjs(dateStr + '-01');
  }, [periodMode, dateStr]);

  const sales = useAfterSales();
  const bookings = useDemoBookings();
  const scheduling = useDemoScheduling();
  const oldCol = useOldCollection();
  const { configs } = useIncentiveConfigs();

  const countries = useMemo(() => {
    const fromSales = (sales.data || []).map(s => s.country).filter(Boolean);
    const fromBookings = (bookings.data || []).map(b => b.country).filter(Boolean);
    return [...new Set([...fromSales, ...fromBookings])].sort();
  }, [sales.data, bookings.data]);

  const filteredSales = useMemo(() =>
    !country ? (sales.data || []) : (sales.data || []).filter(s => s.country === country),
  [sales.data, country]);

  const filteredBookings = useMemo(() =>
    !country ? (bookings.data || []) : (bookings.data || []).filter(b => b.country === country),
  [bookings.data, country]);

  const salesAgg = useMemo(
    () => salesByAgentPeriod(filteredSales, dateRef, periodMode),
    [filteredSales, dateRef, periodMode],
  );
  const presalesAgg = useMemo(
    () => presalesConversionPeriod(filteredBookings, filteredSales, dateRef, periodMode),
    [filteredBookings, filteredSales, dateRef, periodMode],
  );

  const trendData = useMemo(() => {
    if (periodMode === 'day') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = dateRef.subtract(6 - i, 'day');
        const newSales = filteredSales.filter(s => isInDay(s.enrollmentDate, d)).reduce((sum, s) => sum + s.inrAmount, 0);
        const renewals = (oldCol.data || []).filter(r => isInDay(r.paymentDate, d)).reduce((sum, r) => sum + r.amount, 0);
        return { period: d.format('D MMM'), 'New Sales': Math.round(newSales), Renewals: Math.round(renewals) };
      });
    }
    if (periodMode === 'week') {
      return Array.from({ length: 6 }, (_, i) => {
        const w = dateRef.subtract(5 - i, 'week');
        const newSales = filteredSales.filter(s => isInWeek(s.enrollmentDate, w)).reduce((sum, s) => sum + s.inrAmount, 0);
        const renewals = (oldCol.data || []).filter(r => isInWeek(r.paymentDate, w)).reduce((sum, r) => sum + r.amount, 0);
        return { period: `W${w.isoWeek()}`, 'New Sales': Math.round(newSales), Renewals: Math.round(renewals) };
      });
    }
    return Array.from({ length: 6 }, (_, i) => {
      const m = dayjs().subtract(5 - i, 'month');
      const newSales = filteredSales.filter(s => isInMonth(s.enrollmentDate, m)).reduce((sum, s) => sum + s.inrAmount, 0);
      const renewals = (oldCol.data || []).filter(r => isInMonth(r.paymentDate, m)).reduce((sum, r) => sum + r.amount, 0);
      return { period: m.format("MMM 'YY"), 'New Sales': Math.round(newSales), Renewals: Math.round(renewals) };
    });
  }, [periodMode, dateRef, filteredSales, oldCol.data]);

  const agentChartData = useMemo(() =>
    salesAgg.slice(0, 8).map(a => ({
      name: a.agent.split(' ')[0],
      Revenue: Math.round(a.revenue),
      Enrollments: a.enrollments,
    })),
  [salesAgg]);

  const presalesChartData = useMemo(() =>
    presalesAgg.slice(0, 8).map(a => ({
      name: a.agent.split(' ')[0],
      'Conversion %': parseFloat(a.conversionPct.toFixed(1)),
      Demos: a.demosBooked,
    })),
  [presalesAgg]);

  const loading = sales.isLoading || bookings.isLoading || oldCol.isLoading;
  const err = sales.error || bookings.error;

  const thisMonthNew = salesAgg.reduce((s, a) => s + a.revenue, 0);
  const thisMonthNewCount = salesAgg.reduce((s, a) => s + a.enrollments, 0);
  const monthOldCol = useMemo(
    () => filterByPeriod(oldCol.data || [], 'paymentDate', dateRef, periodMode),
    [oldCol.data, dateRef, periodMode],
  );
  const thisMonthRenewals = monthOldCol.reduce((sum, r) => sum + r.amount, 0);

  const totalRevenue = segment === 'new' ? thisMonthNew
    : segment === 'renewal' ? thisMonthRenewals
    : thisMonthNew + thisMonthRenewals;
  const totalEnrollments = segment === 'renewal' ? monthOldCol.length : thisMonthNewCount;

  const generateReport = async () => {
    const periodLabel = periodMode === 'day' ? dateRef.format('D MMMM YYYY')
      : periodMode === 'week' ? `Week ${dateRef.isoWeek()}, ${dateRef.isoWeekYear()}`
      : dateRef.format('MMMM YYYY');
    const prompt = `You are writing a Weekly Business Review (WBR) narrative for Super Sheldon, an online tutoring company.

Period: ${periodLabel}
New Sales Revenue: ₹${thisMonthNew.toLocaleString()}
Renewals Revenue: ₹${thisMonthRenewals.toLocaleString()}
Total Enrollments: ${thisMonthNewCount}
Active Sales Reps: ${salesAgg.length}
Active Pre-sales: ${presalesAgg.length}

Sales Team:
${salesAgg.map(r => `- ${r.agent}: ${r.enrollments} enrollments, ₹${r.revenue.toLocaleString()} revenue, AOV ₹${Math.round(r.aov).toLocaleString()}, Avg CPC ₹${Math.round(r.avgCpc).toLocaleString()}`).join('\n')}

Pre-sales Team:
${presalesAgg.map(r => `- ${r.agent}: ${r.demosBooked} demos booked, ${r.salesClosed} closed, ${r.conversionPct.toFixed(1)}% conversion`).join('\n')}

Write a concise, professional WBR narrative (4–6 paragraphs) covering: overall performance summary, top performers, areas of concern, conversion trends, and 2–3 bullet-point recommendations for next week.`;
    const result = await ask(prompt);
    if (result) setWbrReport(result);
  };

  return (
    <>
      <PageHeader title="WBR Management Report" subtitle="Company-wide weekly business review">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <ToggleGroup
            value={segment} onChange={setSegment}
            options={[['all', 'All'], ['new', 'New Sales'], ['renewal', 'Renewals']]}
          />
          <select className="btn-secondary" value={country} onChange={e => setCountry(e.target.value)}>
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={displayCurrency} onChange={e => setDisplayCurrency(e.target.value)} className="btn-secondary" style={{ fontSize: 12, padding: '4px 8px' }}>
            <option value="INR">INR (₹)</option>
            <option value="AUD">AUD (A$)</option>
            <option value="GBP">GBP (£)</option>
            <option value="USD">USD ($)</option>
          </select>
          <ToggleGroup
            value={periodMode} onChange={switchMode}
            options={[['day', 'Day'], ['week', 'Week'], ['month', 'Month']]}
          />
          {periodMode === 'day' && (
            <input type="date" value={dateStr} onChange={e => setDateStr(e.target.value)} className="btn-secondary" />
          )}
          {periodMode === 'week' && (
            <input type="week" value={dateStr} onChange={e => setDateStr(e.target.value)} className="btn-secondary" />
          )}
          {periodMode === 'month' && (
            <input type="month" value={dateStr} onChange={e => setDateStr(e.target.value)} className="btn-secondary" />
          )}
        </div>
      </PageHeader>

      {loading && <Loading />}
      {err && <ErrorBox error={err} />}

      {!loading && (
        <>
          <div className="kpi-grid">
            <Card title={`Total Revenue (${displayCurrency})`}>
              <h2>{formatMoney(rates ? (totalRevenue / (rates['INR'] ?? 1) * (rates[displayCurrency] ?? 1)) : totalRevenue, displayCurrency)}</h2>
              {segment === 'all' && (
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  New: {formatMoney(thisMonthNew)} · Renewals: {formatMoney(thisMonthRenewals)}
                </div>
              )}
            </Card>
            <Card title="Enrollments"><h2>{totalEnrollments}</h2></Card>
            <Card title="Active Sales Reps"><h2>{salesAgg.length}</h2></Card>
            <Card title="Active Pre-sales"><h2>{presalesAgg.length}</h2></Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 16 }}>
            <Card title={periodMode === 'day' ? 'Revenue — Last 7 Days' : periodMode === 'week' ? 'Revenue — Last 6 Weeks' : 'Revenue Trend — Last 6 Months'}>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="wbrGreen" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.green} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="wbrBlue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.blue} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmt} width={56} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="New Sales" stroke={C.green} fill="url(#wbrGreen)" strokeWidth={2} dot={{ r: 3, fill: C.green }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="Renewals" stroke={C.blue} fill="url(#wbrBlue)" strokeWidth={2} dot={{ r: 3, fill: C.blue }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Sales — Revenue by Rep">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agentChartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={56} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="Revenue" fill={C.green} radius={[0, 4, 4, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Pre-sales — Demos & Conversion">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={presalesChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="Demos" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={20} />
                  <Bar yAxisId="right" dataKey="Conversion %" fill={C.green} radius={[4, 4, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {segment !== 'renewal' && (
            <Card title="Sales Team — Performance" subtitle="From After Sales Form">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rep</th><th>Enrollments</th><th>Revenue (₹)</th><th>Classes</th>
                    <th>Avg CPC</th><th>AOV</th><th>Eligible Incentive</th>
                  </tr>
                </thead>
                <tbody>
                  {salesAgg.map(row => {
                    const inc = computeSalesIncentive({
                      sales: row.sales.map(s => ({ cpcSold: s.cpc || (s.classesIncluded ? s.inrAmount / s.classesIncluded : 0), classesSold: s.classesIncluded, amount: s.inrAmount })),
                      monthlyTargetInr: 100000,
                      achievedRevenueInr: row.revenue,
                      config: configs.sales,
                    });
                    return (
                      <tr key={row.agent}>
                        <td><strong>{row.agent}</strong></td>
                        <td>{row.enrollments}</td>
                        <td>{formatMoney(rates ? (row.revenue / (rates['INR'] ?? 1) * (rates[displayCurrency] ?? 1)) : row.revenue, displayCurrency)}</td>
                        <td>{row.classes}</td>
                        <td>{formatMoney(row.avgCpc)}</td>
                        <td>{formatMoney(row.aov)}</td>
                        <td>
                          <Pill variant={inc.finalIncentive > 0 ? 'success' : 'light'}>
                            {formatMoney(inc.finalIncentive)}
                          </Pill>
                        </td>
                      </tr>
                    );
                  })}
                  {!salesAgg.length && <tr><td colSpan={7} className="text-muted">No sales recorded for this month.</td></tr>}
                </tbody>
              </table>
            </Card>
          )}

          {segment !== 'renewal' && (
            <Card title="Pre-sales Team — Conversion" subtitle="Demos booked → sales closed">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pre-sales Agent</th><th>Demos Booked</th><th>Sales Closed</th>
                    <th>Conversion %</th><th>AOV</th><th>Revenue (₹)</th><th>Eligible Incentive</th>
                  </tr>
                </thead>
                <tbody>
                  {presalesAgg.map(row => {
                    const inc = computePresalesIncentive({
                      demosBooked: row.demosBooked,
                      demosCompleted: row.demosBooked,
                      salesClosed: row.salesClosed,
                      totalRevenueInr: row.revenue,
                      config: configs.presales,
                    });
                    return (
                      <tr key={row.agent}>
                        <td><strong>{row.agent}</strong></td>
                        <td>{row.demosBooked}</td>
                        <td>{row.salesClosed}</td>
                        <td>
                          <Pill variant={row.conversionPct >= 20 ? 'success' : 'danger'}>
                            {row.conversionPct.toFixed(1)}%
                          </Pill>
                        </td>
                        <td>{formatMoney(row.aov)}</td>
                        <td>{formatMoney(rates ? (row.revenue / (rates['INR'] ?? 1) * (rates[displayCurrency] ?? 1)) : row.revenue, displayCurrency)}</td>
                        <td>
                          <Pill variant={inc.finalIncentive > 0 ? 'success' : 'light'}>
                            {formatMoney(inc.finalIncentive)}
                          </Pill>
                        </td>
                      </tr>
                    );
                  })}
                  {!presalesAgg.length && <tr><td colSpan={7} className="text-muted">No pre-sales activity for this month.</td></tr>}
                </tbody>
              </table>
            </Card>
          )}

          {segment !== 'new' && (
            <Card title="Old Collection — Renewals" subtitle={`${monthOldCol.length} renewals this month`}>
              {monthOldCol.length === 0
                ? <p className="text-muted">No renewals recorded for this month.</p>
                : (
                  <table className="data-table">
                    <thead>
                      <tr><th>Date</th><th>Renewed By</th><th>Department</th><th>Classes</th><th>Currency</th><th>Amount</th><th>Mode</th></tr>
                    </thead>
                    <tbody>
                      {monthOldCol.slice(0, 60).map((r, i) => (
                        <tr key={r.id || i}>
                          <td>{r.paymentDate ? dayjs(r.paymentDate).format('MMM D') : '—'}</td>
                          <td>{r.renewedBy}</td>
                          <td>{r.department}</td>
                          <td>{r.classesSold}</td>
                           <td>{displayCurrency}</td>
                          <td>{formatMoney(rates ? (r.amount / (rates[r.currency || 'INR'] ?? 1) * (rates[displayCurrency] ?? 1)) : r.amount, displayCurrency)}</td>
                          <td>{r.paymentMode || '—'}</td>
                        </tr>
                      ))}
                      {monthOldCol.length > 60 && (
                        <tr><td colSpan={7} className="text-muted">+ {monthOldCol.length - 60} more…</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
            </Card>
          )}

          <Card title="AI WBR Narrative" subtitle="Auto-generated business review report">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: wbrReport ? 16 : 0 }}>
              <button className="ai-btn" onClick={generateReport} disabled={aiLoading}>
                <Sparkles size={14} />
                {aiLoading ? 'Generating…' : 'Generate WBR Report'}
              </button>
              {wbrReport && <button className="ai-btn-sm" onClick={() => setWbrReport('')}>Clear</button>}
            </div>
            {wbrReport && (
              <div className="ai-result-card">
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}>{wbrReport}</pre>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
