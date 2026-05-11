import { useMemo, useState } from 'react';
import { useAfterSales, useDemoBookings, useEmployees, useOldCollection } from '../hooks/useAirtable';
import { useAttendance, useIndividualTargets } from '../hooks/useSupabaseData';
import { useFxRates, toInr } from '../hooks/useAutoSync';
import { Card, Loading, ErrorBox, PageHeader, Pill } from '../components/ui';
import { dayjs, isInMonth } from '../lib/dates';
import { salesByAgent, presalesConversion } from '../lib/rollups';
import { formatMoney } from '../lib/currency';
import { computeSalesIncentive, computePresalesIncentive } from '../lib/incentive';
import { useIncentiveConfigs } from '../hooks/useIncentiveConfig';
import { ROLE_FROM_DEPARTMENT, APP_ROLES } from '../lib/schema';
import { findAggForEmployee } from '../lib/nameMatch';
import { useQuery } from '@tanstack/react-query';
import { supabase, supabaseReady } from '../lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const C = { green: '#70C041', blue: '#3B82F6', amber: '#F59E0B', red: '#EF4444' };

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
          {p.name}: {typeof p.value === 'number' && p.name !== 'Conv%' ? '₹' + p.value.toLocaleString() : p.value + (p.name === 'Conv%' ? '%' : '')}
        </div>
      ))}
    </div>
  );
}

function fmtK(v) {
  return v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? (v / 1_000).toFixed(0) + 'K' : String(v);
}

export default function TeamPerformance() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const monthDate = dayjs(month + '-01');

  const sales = useAfterSales();
  const bookings = useDemoBookings();
  const employees = useEmployees();
  const oldCol = useOldCollection();
  const targets = useIndividualTargets(month + '-01');
  const attendance = useAttendance(month);
  const { configs } = useIncentiveConfigs();
  const { data: fxRates } = useFxRates();

  const supEmps = useQuery({
    queryKey: ['sb', 'employees', 'with-override'],
    queryFn: async () => {
      if (!supabaseReady()) return [];
      const { data } = await supabase.from('employees').select('id, full_name, email, airtable_id, airtable_agent_name');
      return data || [];
    },
  });
  const overrideByAirId = useMemo(() => {
    const out = {};
    (supEmps.data || []).forEach(e => { if (e.airtable_id) out[e.airtable_id] = e; });
    return out;
  }, [supEmps.data]);

  const salesAgg = useMemo(() => sales.data ? salesByAgent(sales.data, monthDate) : [], [sales.data, monthDate]);
  const presalesAgg = useMemo(() => (sales.data && bookings.data) ? presalesConversion(bookings.data, sales.data, monthDate) : [], [bookings.data, sales.data, monthDate]);

  const renewalsByAgent = useMemo(() => {
    const g = {};
    (oldCol.data || []).filter(r => isInMonth(r.paymentDate, monthDate)).forEach(r => {
      if (!r.renewedBy || r.renewedBy === '—') return;
      if (!g[r.renewedBy]) g[r.renewedBy] = { count: 0, amount: 0 };
      g[r.renewedBy].count++;
      g[r.renewedBy].amount += toInr(r.amount, r.currency, fxRates);
    });
    return g;
  }, [oldCol.data, monthDate, fxRates]);

  const targetsByEmp = useMemo(() => {
    const map = {};
    (targets.data || []).forEach(t => { map[t.employee_id] = t; });
    return map;
  }, [targets.data]);

  const attendanceByEmp = useMemo(() => {
    const map = {};
    (attendance.data || []).forEach(a => {
      if (!map[a.employee_id]) map[a.employee_id] = { P: 0, A: 0, HALF: 0, LOP: 0, L: 0 };
      map[a.employee_id][a.status] = (map[a.employee_id][a.status] || 0) + 1;
    });
    return map;
  }, [attendance.data]);

  if (sales.isLoading || bookings.isLoading || employees.isLoading) return <Loading />;
  if (sales.error) return <ErrorBox error={sales.error} />;

  const days = monthDate.daysInMonth();

  const salesEmployees = (employees.data || []).filter(e => ROLE_FROM_DEPARTMENT[e.department] === APP_ROLES.SALES);
  const presalesEmployees = (employees.data || []).filter(e => ROLE_FROM_DEPARTMENT[e.department] === APP_ROLES.PRESALES);
  const registeredNames = new Set(presalesEmployees.map(e => e.fullName?.toLowerCase()));
  const extraPresalesRows = presalesAgg
    .filter(r => r.agent && r.agent !== '—' && !registeredNames.has(r.agent.toLowerCase()))
    .map(r => ({ id: `__stub_${r.agent}`, fullName: r.agent, department: 'Pre Sales', _stub: true }));

  const enrich = (emp, agg, kind) => {
    const supEmp = overrideByAirId[emp.id];
    const row = findAggForEmployee({ ...emp, airtable_agent_name: supEmp?.airtable_agent_name }, agg, 'agent');
    const t = targetsByEmp[emp.id];
    const att = attendanceByEmp[emp.id] || {};
    const presentPct = days > 0 ? ((att.P || 0) + 0.5 * (att.HALF || 0)) / days * 100 : 0;
    let inc = { finalIncentive: 0, achievementPct: 0 };
    if (kind === 'sales' && row) {
      inc = computeSalesIncentive({
        sales: row.sales.map(s => ({ cpcSold: s.cpc || (s.classesIncluded ? s.inrAmount / s.classesIncluded : 0), classesSold: s.classesIncluded, amount: s.inrAmount })),
        monthlyTargetInr: t?.monthly_revenue_target || 0,
        achievedRevenueInr: row.revenue,
        cpcSet: t?.min_cpc,
        config: configs.sales,
      });
    }
    if (kind === 'presales' && row) {
      inc = computePresalesIncentive({ demosBooked: row.demosBooked, demosCompleted: row.demosBooked, salesClosed: row.salesClosed, totalRevenueInr: row.revenue, config: configs.presales });
    }
    return { emp, row, t, att, presentPct, inc };
  };

  // Chart data
  const salesChartData = salesEmployees.map(emp => {
    const { row, t, inc } = enrich(emp, salesAgg, 'sales');
    return {
      name: emp.fullName?.split(' ')[0],
      Revenue: Math.round(row?.revenue || 0),
      Target: t?.monthly_revenue_target || 0,
      Incentive: Math.round(inc.finalIncentive),
    };
  }).filter(d => d.Revenue > 0 || d.Target > 0);

  const presalesChartData = [...presalesEmployees, ...extraPresalesRows].map(emp => {
    const { row } = enrich(emp, presalesAgg, 'presales');
    return {
      name: emp.fullName?.split(' ')[0],
      Demos: row?.demosBooked || 0,
      Closed: row?.salesClosed || 0,
      'Conv%': parseFloat((row?.conversionPct || 0).toFixed(1)),
    };
  }).filter(d => d.Demos > 0);

  const renewalsChartData = Object.entries(renewalsByAgent)
    .map(([name, d]) => ({ name: name.split(' ')[0], Renewals: d.count, Amount: Math.round(d.amount) }))
    .sort((a, b) => b.Renewals - a.Renewals).slice(0, 8);

  return (
    <>
      <PageHeader title="Team Performance — Monthly" subtitle="Targets · achievement · attendance · incentive · renewals">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="btn-secondary" />
      </PageHeader>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Card title="Sales — Revenue vs Target">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={salesChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={40} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Revenue" fill={C.green} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Target" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={22} opacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Pre-sales — Demos & Conversion">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={presalesChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="l" dataKey="Demos" fill={C.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar yAxisId="l" dataKey="Closed" fill={C.green} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Renewals by Agent">
          {renewalsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={renewalsChartData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={56} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="Renewals" fill={C.amber} radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted" style={{ padding: '40px 0', textAlign: 'center' }}>No renewals this month</p>
          )}
        </Card>
      </div>

      <Card title="Sales Team">
        <table className="data-table">
          <thead><tr>
            <th>Employee</th><th>Target (₹)</th><th>Revenue (₹)</th><th>Ach %</th>
            <th>Enrollments</th><th>Avg CPC</th><th>Renewals</th><th>Attendance</th><th>Incentive</th>
          </tr></thead>
          <tbody>
            {salesEmployees.map(emp => {
              const { row, t, presentPct, inc } = enrich(emp, salesAgg, 'sales');
              const nameKey = emp.fullName?.toLowerCase();
              const renewal = Object.entries(renewalsByAgent).find(([k]) => k.toLowerCase().includes(nameKey?.split(' ')[0] || ''));
              const renewalCount = renewal?.[1]?.count || 0;
              return (
                <tr key={emp.id}>
                  <td><strong>{emp.fullName}</strong></td>
                  <td>{formatMoney(t?.monthly_revenue_target || 0)}</td>
                  <td>{formatMoney(row?.revenue || 0)}</td>
                  <td><Pill variant={inc.achievementPct >= 80 ? 'success' : inc.achievementPct >= 70 ? 'warning' : 'danger'}>{inc.achievementPct}%</Pill></td>
                  <td>{row?.enrollments || 0}</td>
                  <td>{formatMoney(row?.avgCpc || 0)}</td>
                  <td>{renewalCount > 0 ? <Pill variant="default">{renewalCount}</Pill> : '—'}</td>
                  <td>{presentPct.toFixed(0)}%</td>
                  <td><strong>{formatMoney(inc.finalIncentive)}</strong></td>
                </tr>
              );
            })}
            {!salesEmployees.length && <tr><td colSpan={9}>No employees mapped to Sales department.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title="Pre-sales Team">
        <table className="data-table">
          <thead><tr>
            <th>Employee</th><th>Demos Booked</th><th>Sales Closed</th><th>Conversion %</th>
            <th>AOV</th><th>Attendance</th><th>Incentive</th>
          </tr></thead>
          <tbody>
            {[...presalesEmployees, ...extraPresalesRows].map(emp => {
              const { row, presentPct, inc } = enrich(emp, presalesAgg, 'presales');
              const conv = row?.conversionPct || 0;
              return (
                <tr key={emp.id}>
                  <td>
                    <strong>{emp.fullName}</strong>
                    {emp._stub && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>(unregistered)</span>}
                  </td>
                  <td>{row?.demosBooked || 0}</td>
                  <td>{row?.salesClosed || 0}</td>
                  <td><Pill variant={conv >= 26 ? 'success' : conv >= 20 ? 'warning' : 'danger'}>{conv.toFixed(1)}%</Pill></td>
                  <td>{formatMoney(row?.aov || 0)}</td>
                  <td>{presentPct.toFixed(0)}%</td>
                  <td><strong>{formatMoney(inc.finalIncentive)}</strong></td>
                </tr>
              );
            })}
            {!presalesEmployees.length && !extraPresalesRows.length && <tr><td colSpan={7}>No employees mapped to Pre Sales department.</td></tr>}
          </tbody>
        </table>
      </Card>

      {Object.keys(renewalsByAgent).length > 0 && (
        <Card title="Old Collection — Renewals This Month" subtitle={`${Object.values(renewalsByAgent).reduce((s, r) => s + r.count, 0)} renewal transactions`}>
          <table className="data-table">
            <thead><tr><th>Agent</th><th>Renewals</th><th>Total Amount</th></tr></thead>
            <tbody>
              {Object.entries(renewalsByAgent).sort((a, b) => b[1].count - a[1].count).map(([agent, d]) => (
                <tr key={agent}>
                  <td>{agent}</td>
                  <td>{d.count}</td>
                  <td>{formatMoney(d.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
