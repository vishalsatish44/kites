import { useEffect, useMemo, useState } from 'react';
import { useAfterSales, useOldCollection } from '../hooks/useAirtable';
import { Card, Loading, ErrorBox, PageHeader, ProgressBar, Pill } from '../components/ui';
import { dayjs, isInMonth, quarterOf } from '../lib/dates';
import { sumBy } from '../lib/rollups';
import { formatMoney } from '../lib/currency';
import { useAppSettings, useUpdateSetting, useFxRates, toInr } from '../hooks/useAutoSync';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts';

const C = { green: '#70C041', blue: '#3B82F6', amber: '#F59E0B' };

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,.2)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: ₹{Number(p.value).toLocaleString()}
        </div>
      ))}
    </div>
  );
}

const fmtM = v => v >= 1_000_000 ? '₹' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '₹' + (v / 1_000).toFixed(0) + 'K' : '₹' + v;

export default function Goals() {
  const sales = useAfterSales();
  const oldCol = useOldCollection();
  const [year, setYear] = useState(dayjs().year());
  const [includeRenewals, setIncludeRenewals] = useState(false);

  const { data: appSettings } = useAppSettings();
  const updateSetting = useUpdateSetting();
  const { data: fxRates } = useFxRates();

  const [goalDrafts, setGoalDrafts] = useState({});

  const [goals, setGoals] = useState({ monthly: 1500000, quarterly: 4500000, yearly: 18000000 });

  useEffect(() => {
    if (!appSettings) return;
    setGoals({
      monthly:   parseInt(appSettings.goal_monthly   || '1500000'),
      quarterly: parseInt(appSettings.goal_quarterly || '4500000'),
      yearly:    parseInt(appSettings.goal_yearly    || '18000000'),
    });
  }, [appSettings]);

  const updateGoal = (key, value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    setGoals(g => ({ ...g, [key]: n }));
    updateSetting.mutate({ key: `goal_${key}`, value: String(n) });
  };

  const stats = useMemo(() => {
    if (!sales.data) return null;
    const now = dayjs();

    const revFn = (arr, filterFn) => sumBy((arr || []).filter(filterFn), 'inrAmount');
    const renewFn = (arr, filterFn) => (arr || []).filter(filterFn).reduce((s, r) => s + toInr(r.amount, r.currency, fxRates), 0);

    const monthRevenue = revFn(sales.data, s => isInMonth(s.enrollmentDate, now))
      + (includeRenewals ? renewFn(oldCol.data, r => isInMonth(r.paymentDate, now)) : 0);

    const currentQ = quarterOf(now);
    const qRevenue = revFn(sales.data, s => s.enrollmentDate && quarterOf(s.enrollmentDate) === currentQ)
      + (includeRenewals ? renewFn(oldCol.data, r => r.paymentDate && quarterOf(r.paymentDate) === currentQ) : 0);

    const yRevenue = revFn(sales.data, s => s.enrollmentDate && dayjs(s.enrollmentDate).year() === year)
      + (includeRenewals ? renewFn(oldCol.data, r => r.paymentDate && dayjs(r.paymentDate).year() === year) : 0);

    const months = Array.from({ length: 12 }, (_, i) => dayjs().year(year).month(i));
    const monthlyArr = months.map(m => {
      const rev = revFn(sales.data, s => isInMonth(s.enrollmentDate, m));
      const ren = includeRenewals ? renewFn(oldCol.data, r => isInMonth(r.paymentDate, m)) : 0;
      return rev + ren;
    });

    return { monthRevenue, qRevenue, yRevenue, monthlyArr, months };
  }, [sales.data, oldCol.data, year, includeRenewals, fxRates]);

  const chartData = useMemo(() => {
    if (!stats) return [];
    return stats.months.map((m, i) => ({
      month: m.format('MMM'),
      Revenue: Math.round(stats.monthlyArr[i]),
      Target: goals.monthly,
    }));
  }, [stats, goals.monthly]);

  // YTD cumulative
  const ytdChartData = useMemo(() => {
    if (!stats) return [];
    let cum = 0;
    let cumTarget = 0;
    return stats.months.map((m, i) => {
      const isPast = m.isBefore(dayjs(), 'month') || m.isSame(dayjs(), 'month');
      if (isPast) cum += stats.monthlyArr[i];
      cumTarget += goals.monthly;
      return {
        month: m.format('MMM'),
        Cumulative: isPast ? Math.round(cum) : null,
        'Cumul Target': Math.round(cumTarget),
      };
    });
  }, [stats, goals.monthly]);

  if (sales.isLoading) return <Loading />;
  if (sales.error) return <ErrorBox error={sales.error} />;
  if (!stats) return null;

  return (
    <>
      <PageHeader title="Monthly · Quarterly · Yearly Goals" subtitle="Company-wide progress against revenue targets">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={includeRenewals ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 12, padding: '4px 12px' }}
            onClick={() => setIncludeRenewals(r => !r)}
          >
            {includeRenewals ? '✓ Incl. Renewals' : 'Excl. Renewals'}
          </button>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="btn-secondary" style={{ width: 90 }} />
        </div>
      </PageHeader>

      <Card title="Set Targets" subtitle={updateSetting.isSuccess ? 'Saved ✓' : 'Changes auto-save to Supabase'}>
        <div className="filter-grid">
          {[['monthly', 'Monthly target (₹)'], ['quarterly', 'Quarterly target (₹)'], ['yearly', 'Yearly target (₹)']].map(([k, label]) => (
            <div className="filter-cell" key={k}>
              <label>{label}</label>
              <input
                type="number"
                value={goalDrafts[k] !== undefined ? goalDrafts[k] : goals[k]}
                onChange={e => setGoalDrafts(d => ({ ...d, [k]: e.target.value }))}
                onBlur={e => {
                  setGoalDrafts(d => { const n = { ...d }; delete n[k]; return n; });
                  updateGoal(k, e.target.value);
                }}
                className="btn-secondary"
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="kpi-grid">
        <GoalCard label="This Month" value={stats.monthRevenue} target={goals.monthly} />
        <GoalCard label={quarterOf(dayjs())} value={stats.qRevenue} target={goals.quarterly} />
        <GoalCard label={`Year ${year}`} value={stats.yRevenue} target={goals.yearly} />
        <Card title="Yearly Pace">
          <h2>{formatMoney(stats.monthRevenue * 12)}</h2>
          <p className="text-muted">projected at current month's rate</p>
          <Pill variant={stats.monthRevenue * 12 >= goals.yearly ? 'success' : 'warning'}>
            {((stats.monthRevenue * 12 / Math.max(goals.yearly, 1)) * 100).toFixed(0)}% of yearly target
          </Pill>
        </Card>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title={`Monthly Revenue vs Target — ${year}`}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="goalGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.green} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmtM} width={52} />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine y={goals.monthly} stroke={C.amber} strokeDasharray="4 4" label={{ value: 'Target', position: 'right', fontSize: 11, fill: C.amber }} />
              <Area type="monotone" dataKey="Revenue" stroke={C.green} fill="url(#goalGreen)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title={`YTD Cumulative Progress — ${year}`}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={ytdChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cumBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.blue} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={C.blue} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmtM} width={52} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="Cumulative" stroke={C.blue} fill="url(#cumBlue)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              <Area type="monotone" dataKey="Cumul Target" stroke={C.amber} fill="none" strokeDasharray="4 4" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title={`Monthly breakdown — ${year}`}>
        <table className="data-table">
          <thead><tr><th>Month</th><th>Revenue (₹)</th><th>Target (₹)</th><th>Achievement</th><th>vs Target</th></tr></thead>
          <tbody>
            {stats.months.map((m, i) => {
              const v = stats.monthlyArr[i];
              const pct = goals.monthly > 0 ? (v / goals.monthly) * 100 : 0;
              const isFuture = m.isAfter(dayjs(), 'month');
              return (
                <tr key={i} style={{ opacity: isFuture ? 0.4 : 1 }}>
                  <td><strong>{m.format('MMMM')}</strong></td>
                  <td>{formatMoney(v)}</td>
                  <td>{formatMoney(goals.monthly)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 4 }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 4, background: pct >= 100 ? C.green : pct >= 70 ? C.amber : '#ef4444', transition: 'width .3s' }} />
                      </div>
                      <span style={{ fontSize: 12, minWidth: 36 }}>{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td><Pill variant={pct >= 100 ? 'success' : pct >= 70 ? 'warning' : isFuture ? 'light' : 'danger'}>{pct >= 100 ? '✓ Hit' : isFuture ? '—' : `${(pct - 100).toFixed(0)}%`}</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function GoalCard({ label, value, target }) {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const color = pct >= 100 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <Card title={label}>
      <h2>{formatMoney(value)}</h2>
      <p className="text-muted" style={{ marginBottom: 8 }}>of {formatMoney(target)}</p>
      <ProgressBar value={value} max={target} color={color} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <Pill variant={pct >= 100 ? 'success' : pct >= 70 ? 'warning' : 'danger'}>{pct.toFixed(0)}%</Pill>
        <span className="text-muted" style={{ fontSize: 12 }}>{pct >= 100 ? `+${formatMoney(value - target)} over` : `${formatMoney(target - value)} to go`}</span>
      </div>
    </Card>
  );
}
