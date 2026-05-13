import { useMemo, useState } from 'react';
import { DollarSign, Users, Target, ClipboardList, MoreHorizontal, Share2, Filter, Sparkles, AlertTriangle, X } from 'lucide-react';
import { useAfterSales, useDemoBookings, useDemoScheduling, useOldCollection } from '../hooks/useAirtable';
import { useGemini } from '../hooks/useGemini';
import { useFxRates, toInr } from '../hooks/useAutoSync';
import { ModernCard, ModernPageHeader, ModernBarChart, ModernGaugeChart, ProgressBar, ModernLoading, ModernErrorBox } from '../components/ModernUi';
import { dayjs, isInMonth } from '../lib/dates';
import { sumBy, filterByMonth, mergeSalesAndRenewals } from '../lib/rollups';
import { formatMoney } from '../lib/currency';
import { useTheme } from '../contexts/ThemeContext';
import '../Modern.css';

function renderTextWithBold(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export default function Overview() {
  const sales = useAfterSales();
  const bookings = useDemoBookings();
  const scheduling = useDemoScheduling();
  const oldCol = useOldCollection();
  const { data: rates } = useFxRates();

  const { isDarkMode } = useTheme();

  const { ask: askForecast, loading: forecastLoading } = useGemini();
  const { ask: askStandup, loading: standupLoading } = useGemini();
  const { ask: askAnomaly, loading: anomalyLoading } = useGemini();

  const [forecast, setForecast] = useState('');
  const [standup, setStandup] = useState('');
  const [anomalyAnalysis, setAnomalyAnalysis] = useState('');

  const generateForecast = async () => {
    if (!stats) return;
    const now = dayjs();
    const daysElapsed = now.date();
    const daysInMonth = now.daysInMonth();
    const pace = daysElapsed > 0 ? Math.round((stats.revenueThis / daysElapsed) * daysInMonth) : 0;
    const prompt = `You are a sales forecasting analyst for Super Sheldon, an online tutoring company.

Current Month: ${now.format('MMMM YYYY')} (Day ${daysElapsed} of ${daysInMonth})
Revenue so far: ₹${stats.revenueThis.toLocaleString()}
Enrollments so far: ${stats.enrollmentsThis}
Demo conversion rate: ${stats.conversionPct.toFixed(1)}%
Current pace projection (month-end): ₹${pace.toLocaleString()}

Historical monthly revenue (last 12 months):
${stats.monthLabels.map((m, i) => `${m}: ₹${stats.monthly[i].toLocaleString()}`).join(', ')}

Provide a concise month-end forecast in 3 short sections:
1. **Projected Revenue**: Give a realistic range and most-likely figure.
2. **Key Risks & Upside**: What could push above or below the projection?
3. **Recommended Action**: One high-impact action to maximise month-end revenue.`;
    const result = await askForecast(prompt);
    if (result) setForecast(result);
  };

  const generateStandup = async () => {
    if (!stats) return;
    const now = dayjs();
    const prompt = `Generate a concise daily sales standup update for the Super Sheldon team. Format it as a WhatsApp-ready message (no markdown, use plain text with emojis).

Data for ${now.format('MMMM YYYY')} (Day ${now.date()} of ${now.daysInMonth()}):
- Revenue this month: ₹${Math.round(stats.revenueThis).toLocaleString()}
- Month-on-month growth: ${stats.growth > 0 ? '+' : ''}${stats.growth.toFixed(1)}%
- Enrollments this month: ${stats.enrollmentsThis}
- Demos booked this month: ${stats.demosBooked}
- Demos completed: ${stats.demosCompleted}
- Demo → enrollment conversion: ${stats.conversionPct.toFixed(1)}%

Write a 5-line standup message that covers:
1. Revenue status vs pace
2. Enrollment count and growth
3. Demo funnel health (booked vs completed)
4. Conversion rate status
5. One action focus for today

Make it energetic and team-friendly. Ready to paste into WhatsApp.`;
    const result = await askStandup(prompt);
    if (result) setStandup(result);
  };

  const analyseAnomaly = async (flags) => {
    if (!stats) return;
    const now = dayjs();
    const flagDescriptions = flags.map(f => f.label).join('; ');
    const prompt = `You are a sales analyst for Super Sheldon, an online tutoring company. Investigate why the following anomalies are occurring and suggest corrective actions.

Anomalies detected: ${flagDescriptions}

Current month (${now.format('MMMM YYYY')}, Day ${now.date()}):
- Revenue: ₹${Math.round(stats.revenueThis).toLocaleString()} (${stats.growth > 0 ? '+' : ''}${stats.growth.toFixed(1)}% vs last month's ₹${Math.round(stats.revenuePrev).toLocaleString()})
- Enrollments: ${stats.enrollmentsThis}
- Demos booked: ${stats.demosBooked}
- Demos completed: ${stats.demosCompleted}
- Conversion rate: ${stats.conversionPct.toFixed(1)}%

Historical monthly revenues (last 12 months):
${stats.monthLabels.map((m, i) => `${m}: ₹${stats.monthly[i].toLocaleString()}`).join(', ')}

Provide:
**Root Cause Analysis:** (2-3 likely causes based on the data patterns)
**Immediate Actions:** (2-3 specific things to do this week)
**Watch Out For:** (1 risk if not addressed)

Keep it specific, not generic.`;
    const result = await askAnomaly(prompt);
    if (result) setAnomalyAnalysis(result);
  };

  const stats = useMemo(() => {
    if (!sales.data || !bookings.data || !scheduling.data || !oldCol.data) return null;
    const now = dayjs();
    const lastMonth = now.subtract(1, 'month');

    const totalData = mergeSalesAndRenewals(sales.data, oldCol.data, rates, toInr);

    const salesThis = filterByMonth(totalData, 'enrollmentDate', now);
    const salesPrev = filterByMonth(totalData, 'enrollmentDate', lastMonth);
    const revenueThis = sumBy(salesThis, 'inrAmount');
    const revenuePrev = sumBy(salesPrev, 'inrAmount');
    const growth = revenuePrev > 0 ? ((revenueThis - revenuePrev) / revenuePrev) * 100 : 0;

    // All bookings this month — no stoplist here, we want total funnel volume
    const demosThis = bookings.data.filter(b => isInMonth(b.formFillingDate || b.formFillingTime, now));
    // Count by when the demo actually happened (finalDemoDate) — authoritative completed count
    const completedThis = scheduling.data.filter(s => s.isCompleted && isInMonth(s.finalDemoDate, now));

    const months = Array.from({ length: 12 }, (_, i) => now.subtract(11 - i, 'month'));
    const monthly = months.map(m => sumBy(filterByMonth(totalData, 'enrollmentDate', m), 'inrAmount'));
    const monthLabels = months.map(m => m.format('MMM'));

    const conversionPct = demosThis.length > 0 ? (salesThis.length / demosThis.length) * 100 : 0;

    const enrollmentGrowth = salesPrev.length > 0
      ? ((salesThis.length - salesPrev.length) / salesPrev.length) * 100
      : 0;

    return {
      revenueThis, revenuePrev, growth,
      enrollmentsThis: salesThis.length,
      enrollmentGrowth,
      demosBooked: demosThis.length,
      demosCompleted: completedThis.length,
      conversionPct,
      monthly, monthLabels,
    };
  }, [sales.data, bookings.data, scheduling.data, oldCol.data, rates]);

  // Anomaly detection: revenue drop >20% OR very low conversion with meaningful volume
  const anomalyFlags = stats ? [
    stats.growth < -20 && {
      type: 'revenue_drop',
      label: `Revenue dropped ${Math.abs(stats.growth).toFixed(1)}% vs last month`,
      severity: 'high',
    },
    stats.conversionPct < 10 && stats.demosBooked > 5 && {
      type: 'low_conversion',
      label: `Demo conversion is only ${stats.conversionPct.toFixed(1)}% (${stats.demosBooked} demos, ${stats.enrollmentsThis} sales)`,
      severity: 'medium',
    },
  ].filter(Boolean) : [];

  const loading = sales.isLoading || bookings.isLoading || scheduling.isLoading;
  const err = sales.error || bookings.error || scheduling.error;

  return (
    <div className="modern-app" style={{ padding: 0 }}>
      <ModernPageHeader
        title="Sales Overview"
        subtitle="Live company-wide KPIs from Airtable"
        actions={
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="modern-action-btn" title="Export"><Share2 size={18} /></button>
            <button className="modern-action-btn" title="Filter"><Filter size={18} /></button>
          </div>
        }
      />

      {loading && <ModernLoading label="Loading dashboard…" />}
      {err && <ModernErrorBox error={err} onRetry={() => { sales.refetch(); bookings.refetch(); scheduling.refetch(); }} />}

      {stats && (
        <div className="modern-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <ModernCard
            title="Revenue"
            value={formatMoney(stats.revenueThis, 'INR')}
            trend={true}
            delta={`${Math.round(stats.growth)}% Than last month`}
            isAccent={true}
          />
          <ModernCard
            title="Enrollments"
            value={stats.enrollmentsThis}
            isAccent={false}
            delta={`${stats.enrollmentGrowth >= 0 ? '+' : ''}${Math.round(stats.enrollmentGrowth)}% Than last month`}
          />
          <ModernCard
            title="Conversion %"
            value={`${stats.conversionPct.toFixed(1)}%`}
            isAccent={false}
          >
            <div style={{ marginTop: '15px' }}>
              <ProgressBar value={stats.conversionPct} max={100} color="#8CE85C" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '12px', color: 'var(--modern-text-muted)' }}>
              <span>Demos Booked: {stats.demosBooked}</span>
              <span>Goal: 100%</span>
            </div>
          </ModernCard>
        </div>
      )}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginTop: '20px' }}>
          <ModernCard title="Demo Conversion" subtitle="Demos completed → sales closed" actions={<MoreHorizontal size={18} color="#94A3B8" />}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
              <ModernGaugeChart value={stats.conversionPct} max={50} />
              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <div style={{ fontSize: '24px', fontWeight: '700' }}>{stats.demosCompleted}</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>Demos completed</div>
              </div>
              <div className="modern-pill modern-pill-success" style={{ marginTop: '15px' }}>
                {stats.enrollmentsThis} Sales closed
              </div>
            </div>
          </ModernCard>

          <ModernCard title="Monthly Revenue" subtitle="Last 12 months (₹)" actions={<MoreHorizontal size={18} color="#94A3B8" />}>
            <ModernBarChart data={stats.monthly} labels={stats.monthLabels} />
          </ModernCard>
        </div>
      )}

      {/* Anomaly Explainer — auto-surfaced when anomalies detected */}
      {stats && anomalyFlags.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12, padding: '20px 24px', marginTop: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertTriangle size={16} color="#ef4444" />
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Anomaly Detected</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {anomalyFlags.map(f => (
                  <div key={f.type} style={{ fontSize: 13, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                    {f.label}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {anomalyAnalysis && <button className="ai-btn-sm" onClick={() => setAnomalyAnalysis('')}>Clear</button>}
              <button
                className="ai-btn"
                style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}
                onClick={() => analyseAnomaly(anomalyFlags)}
                disabled={anomalyLoading}
              >
                <Sparkles size={14} />
                {anomalyLoading ? 'Analysing…' : 'Explain with AI'}
              </button>
            </div>
          </div>
          {anomalyAnalysis && (
            <div style={{ position: 'relative', marginTop: 16 }}>
              <button className="ai-icon-btn" style={{ position: 'absolute', top: 0, right: 0 }} onClick={() => setAnomalyAnalysis('')} title="Close"><X size={13} /></button>
              <div className="ai-result-card" style={{ marginTop: 0, borderColor: 'rgba(239,68,68,0.2)' }}>
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7 }}>{renderTextWithBold(anomalyAnalysis)}</pre>
              </div>
              <button className="ai-btn-sm" style={{ marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(anomalyAnalysis)}>Copy</button>
            </div>
          )}
        </div>
      )}

      {/* Daily Standup Digest */}
      {stats && (
        <div style={{ background: 'var(--modern-card-bg, var(--card-bg))', border: '1px solid var(--modern-border, var(--border))', borderRadius: 12, padding: '20px 24px', marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: standup ? 16 : 0 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Daily Standup Digest</div>
              <div style={{ fontSize: 12, color: 'var(--modern-text-muted, var(--text-muted))', marginTop: 2 }}>5-line WhatsApp-ready team update from today's metrics</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {standup && <button className="ai-btn-sm" onClick={() => setStandup('')}>Clear</button>}
              <button className="ai-btn" onClick={generateStandup} disabled={standupLoading}>
                <Sparkles size={14} />
                {standupLoading ? 'Writing…' : 'Generate Standup'}
              </button>
            </div>
          </div>
          {standup && (
            <div style={{ position: 'relative' }}>
              <div className="ai-result-card">
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7 }}>{standup}</pre>
              </div>
              <button className="ai-btn-sm" style={{ marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(standup)}>Copy to clipboard</button>
            </div>
          )}
        </div>
      )}

      {/* AI Month-End Forecast */}
      {stats && (
        <div style={{ background: 'var(--modern-card-bg, var(--card-bg))', border: '1px solid var(--modern-border, var(--border))', borderRadius: 12, padding: '20px 24px', marginTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: forecast ? 16 : 0 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>AI Month-End Forecast</div>
              <div style={{ fontSize: 12, color: 'var(--modern-text-muted, var(--text-muted))', marginTop: 2 }}>Gemini projection based on current pace and historical data</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {forecast && <button className="ai-btn-sm" onClick={() => setForecast('')}>Clear</button>}
              <button className="ai-btn" onClick={generateForecast} disabled={forecastLoading}>
                <Sparkles size={14} />
                {forecastLoading ? 'Forecasting…' : 'Generate Forecast'}
              </button>
            </div>
          </div>
          {forecast && (
            <div className="ai-result-card">
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}>{renderTextWithBold(forecast)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
