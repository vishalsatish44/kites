import { useMemo, useState } from 'react';
import { Award, Target, TrendingUp, DollarSign, Sparkles } from 'lucide-react';
import { useGemini } from '../hooks/useGemini';
import { useAfterSales, useDemoBookings, useDemoScheduling } from '../hooks/useAirtable';
import { useAuth } from '../contexts/AuthContext';
import { Card, Kpi, Loading, ErrorBox, PageHeader, Pill, ProgressBar } from '../components/ui';
import { MiniBarChart } from '../components/charts/Charts';
import { dayjs, isInMonth } from '../lib/dates';
import { sumBy, filterByMonth } from '../lib/rollups';
import { formatMoney } from '../lib/currency';
import { computeSalesIncentive, computePresalesIncentive, evaluateDailyDemoTarget } from '../lib/incentive';
import { useIncentiveConfigs } from '../hooks/useIncentiveConfig';
import { APP_ROLES, SALES_AGENTS } from '../lib/schema';
import { matchAgent } from '../lib/nameMatch';

export default function IndividualDashboard() {
  const { role, employeeName, devMode, setDev } = useAuth();
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const monthDate = dayjs(month + '-01');
  const { ask, loading: aiLoading } = useGemini();
  const [coaching, setCoaching] = useState('');

  // Dev tooling — pick which agent's data to scope to.
  const [agentName, setAgentName] = useState(employeeName);

  const sales = useAfterSales();
  const bookings = useDemoBookings();
  const scheduling = useDemoScheduling();
  const { configs } = useIncentiveConfigs();

  const data = useMemo(() => {
    if (!sales.data || !bookings.data || !scheduling.data) return null;
    const me = agentName || employeeName || '';

    const isMine = (rowAgent) => matchAgent(me, rowAgent);
    const bookingById = Object.fromEntries(bookings.data.map(b => [b.id, b]));

    const mySales = filterByMonth(sales.data, 'enrollmentDate', monthDate)
      .filter(s => {
        if (isMine(s.agent)) return true;
        // Presales attribution: After Sales → studentLinkIds → Demo Booking → presalesAgent
        return (s.studentLinkIds || []).some(id => isMine(bookingById[id]?.presalesAgent));
      });
    const myDemos = bookings.data.filter(b =>
      isInMonth(b.formFillingDate || b.formFillingTime, monthDate) &&
      isMine(b.presalesAgent),
    );
    const completedSchedIds = new Set(scheduling.data.filter(s => s.isCompleted).map(s => s.id));
    const myCompletedDemos = myDemos.filter(b =>
      (b.demoSchedulingLinks || []).some(id => completedSchedIds.has(id)),
    ).length;

    const today = dayjs();
    const bookedToday = bookings.data.filter(b => {
      if (!isMine(b.presalesAgent)) return false;
      const d = b.formFillingDate || b.formFillingTime;
      return d && dayjs(d).isSame(today, 'day');
    }).length;

    const days = Array.from({ length: monthDate.daysInMonth() }, (_, i) => i + 1);
    const dayLabels = days.map(d => String(d));
    const dayValues = days.map(d => {
      const target = monthDate.date(d);
      return mySales.filter(s => dayjs(s.enrollmentDate).isSame(target, 'day')).length;
    });

    const revenue = sumBy(mySales, 'inrAmount');
    const aov = mySales.length > 0 ? revenue / mySales.length : 0;
    const conversionPct = myDemos.length > 0 ? (mySales.length / myDemos.length) * 100 : 0;

    return {
      mySales, myDemos, myCompletedDemos, bookedToday,
      revenue, aov, conversionPct,
      dayLabels, dayValues,
    };
  }, [sales.data, bookings.data, scheduling.data, monthDate, agentName, employeeName]);

  if (sales.isLoading || bookings.isLoading || scheduling.isLoading) return <Loading />;
  if (sales.error) return <ErrorBox error={sales.error} />;
  if (!data) return null;

  const generateCoaching = async () => {
    const isPresales = role === APP_ROLES.PRESALES;
    const prompt = `You are a performance coach at Super Sheldon, an online tutoring company. Give personalised coaching feedback to a ${isPresales ? 'pre-sales (demo booking) agent' : 'sales (enrollment closing) agent'}.

Agent: ${employeeName}
Month: ${monthDate.format('MMMM YYYY')}
${isPresales ? `Demos booked: ${data.myDemos.length}
Demos completed: ${data.myCompletedDemos}
Sales conversions: ${data.mySales.length}
Conversion rate: ${data.conversionPct.toFixed(1)}%
Incentive earned: ₹${presalesIncentive.finalIncentive.toLocaleString()}` : `Revenue: ₹${data.revenue.toLocaleString()}
Enrollments: ${data.mySales.length}
AOV: ₹${Math.round(data.aov).toLocaleString()}
Target achievement: ${salesIncentive.achievementPct}%
Incentive earned: ₹${salesIncentive.finalIncentive.toLocaleString()}`}

Provide coaching in 3 sections:
1. **What's going well** (1–2 specific strengths based on the numbers)
2. **What to improve** (1–2 concrete areas with actionable advice)
3. **This week's focus** (one specific action to take in the next 5 days)

Be encouraging but honest. Keep it under 200 words.`;
    const result = await ask(prompt);
    if (result) setCoaching(result);
  };

  const targetDemos = 80;
  const targetRevenue = 500000;

  const salesIncentive = computeSalesIncentive({
    sales: data.mySales.map(s => ({
      cpcSold: s.cpc || (s.classesIncluded ? s.inrAmount / s.classesIncluded : 0),
      classesSold: s.classesIncluded,
      amount: s.inrAmount,
    })),
    monthlyTargetInr: targetRevenue,
    achievedRevenueInr: data.revenue,
    config: configs.sales,
  });
  const presalesIncentive = computePresalesIncentive({
    demosBooked: data.myDemos.length,
    demosCompleted: data.myCompletedDemos,
    salesClosed: data.mySales.length,
    totalRevenueInr: data.revenue,
    config: configs.presales,
  });
  const dailyEval = evaluateDailyDemoTarget({ bookedToday: data.bookedToday, config: configs.presales });

  const incentive = role === APP_ROLES.PRESALES ? presalesIncentive : salesIncentive;

  return (
    <>
      <PageHeader title={`My Performance — ${employeeName}`} subtitle="Personal targets, achievements and incentive">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="btn-secondary" />
        {devMode && (
          <select className="btn-secondary" value={agentName} onChange={(e) => { setAgentName(e.target.value); setDev(role, e.target.value); }}>
            <option value={employeeName}>— {employeeName} —</option>
            {SALES_AGENTS.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </PageHeader>

      <div className="kpi-grid">
        <Kpi label="Revenue (₹)" value={formatMoney(data.revenue)} icon={DollarSign} accent="primary" />
        <Kpi label="Sales Closed" value={data.mySales.length} icon={Award} />
        <Kpi label="Demos Booked" value={data.myDemos.length} icon={Target} />
        <Kpi label="Conversion %" value={`${data.conversionPct.toFixed(1)}%`} icon={TrendingUp} />
      </div>

      <div className="dual-grid">
        <Card title="Daily Sales (this month)">
          <MiniBarChart data={data.dayValues} labels={data.dayLabels} />
        </Card>

        <Card title="Incentive Forecast">
          <h2 style={{ margin: '8px 0 4px' }}>{formatMoney(incentive.finalIncentive)}</h2>
          <p className="text-muted">Final eligible incentive for {monthDate.format('MMMM YYYY')}</p>
          {role === APP_ROLES.PRESALES ? (
            <ul className="metric-list">
              <li>Conversion: <Pill variant={presalesIncentive.conversionPct >= 20 ? 'success' : 'danger'}>{presalesIncentive.conversionPct}%</Pill> → ₹{presalesIncentive.slabPerSale}/sale</li>
              <li>AOV: {formatMoney(presalesIncentive.aov)} → multiplier ×{presalesIncentive.aovMultiplier}</li>
              <li>Base incentive: {formatMoney(presalesIncentive.baseIncentive)}</li>
            </ul>
          ) : (
            <ul className="metric-list">
              <li>Achievement: <Pill variant={salesIncentive.achievementPct >= 70 ? 'success' : 'danger'}>{salesIncentive.achievementPct}%</Pill> → ×{salesIncentive.achievementMultiplier}</li>
              <li>Eligible sales: {salesIncentive.perSale.filter(s => s.eligible).length} / {salesIncentive.perSale.length}</li>
              <li>Base incentive: {formatMoney(salesIncentive.baseIncentive)}</li>
              <li>CPC floor: {formatMoney(salesIncentive.cpcFloor)}</li>
            </ul>
          )}
        </Card>
      </div>

      {role === APP_ROLES.PRESALES && (
        <Card title="Today's Demo Booking Target">
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2>{data.bookedToday} / {dailyEval.target}</h2>
              <p className="text-muted">Demos booked today</p>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <ProgressBar value={data.bookedToday} max={dailyEval.target} />
            </div>
            <Pill variant={dailyEval.suggestedAttendance === 'P' ? 'success' : dailyEval.suggestedAttendance === 'HALF' ? 'warning' : 'danger'}>
              Suggested attendance: {dailyEval.suggestedAttendance}
            </Pill>
          </div>
        </Card>
      )}

      <Card title="AI Performance Coach" subtitle="Personalised coaching based on your current month data">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: coaching ? 16 : 0 }}>
          <button className="ai-btn" onClick={generateCoaching} disabled={aiLoading}>
            <Sparkles size={14} />
            {aiLoading ? 'Analysing…' : 'Get Coaching Feedback'}
          </button>
          {coaching && <button className="ai-btn-sm" onClick={() => setCoaching('')}>Clear</button>}
        </div>
        {coaching && (
          <div className="ai-result-card">
            <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}>{coaching}</pre>
          </div>
        )}
      </Card>

      <Card title="My Sales — This Month">
        <table className="data-table">
          <thead><tr>
            <th>Date</th><th>Student</th><th>Subject</th><th>Country</th>
            <th>Currency</th><th>Amount</th><th>₹</th><th>Classes</th><th>CPC</th>
          </tr></thead>
          <tbody>
            {data.mySales.map(s => (
              <tr key={s.id}>
                <td>{s.enrollmentDate ? dayjs(s.enrollmentDate).format('YYYY-MM-DD') : '—'}</td>
                <td>{s.batchId}</td>
                <td>{s.subject}</td>
                <td>{s.country}</td>
                <td>{s.currency}</td>
                <td>{formatMoney(s.amount, s.currency)}</td>
                <td>{formatMoney(s.inrAmount)}</td>
                <td>{s.classesIncluded}</td>
                <td>{formatMoney(s.classesIncluded ? s.inrAmount / s.classesIncluded : 0)}</td>
              </tr>
            ))}
            {!data.mySales.length && <tr><td colSpan={9}>No sales recorded.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
