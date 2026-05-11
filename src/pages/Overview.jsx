import { useMemo, useState } from 'react';
import { DollarSign, Users, Target, ClipboardList, MoreHorizontal, Share2, Filter, Sparkles } from 'lucide-react';
import { useAfterSales, useDemoBookings, useDemoScheduling } from '../hooks/useAirtable';
import { useGemini } from '../hooks/useGemini';
import { ModernCard, ModernPageHeader, ModernBarChart, ModernGaugeChart, ProgressBar, ModernLoading, ModernErrorBox } from '../components/ModernUi';
import { dayjs, isInMonth } from '../lib/dates';
import { sumBy, filterByMonth } from '../lib/rollups';
import { formatMoney } from '../lib/currency';
import { useTheme } from '../contexts/ThemeContext';
import '../Modern.css';

export default function Overview() {
  const sales = useAfterSales();
  const bookings = useDemoBookings();
  const scheduling = useDemoScheduling();
  const { isDarkMode } = useTheme();
  const { ask, loading: aiLoading } = useGemini();
  const [forecast, setForecast] = useState('');

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
    const result = await ask(prompt);
    if (result) setForecast(result);
  };

  const stats = useMemo(() => {
    if (!sales.data || !bookings.data || !scheduling.data) return null;
    const now = dayjs();
    const lastMonth = now.subtract(1, 'month');

    const salesThis = filterByMonth(sales.data, 'enrollmentDate', now);
    const salesPrev = filterByMonth(sales.data, 'enrollmentDate', lastMonth);
    const revenueThis = sumBy(salesThis, 'inrAmount');
    const revenuePrev = sumBy(salesPrev, 'inrAmount');
    const growth = revenuePrev > 0 ? ((revenueThis - revenuePrev) / revenuePrev) * 100 : 0;

    const demosThis = bookings.data.filter(b => isInMonth(b.formFillingDate || b.formFillingTime, now));
    const completedThis = scheduling.data.filter(s => s.isCompleted && isInMonth(s.finalDemoDate, now));

    // Per-month revenue for the last 12 months
    const months = Array.from({ length: 12 }, (_, i) => now.subtract(11 - i, 'month'));
    const monthly = months.map(m => sumBy(filterByMonth(sales.data, 'enrollmentDate', m), 'inrAmount'));
    const monthLabels = months.map(m => m.format('MMM'));

    return {
      revenueThis, revenuePrev, growth,
      enrollmentsThis: salesThis.length,
      demosBooked: demosThis.length,
      demosCompleted: completedThis.length,
      conversionPct: demosThis.length > 0 ? (salesThis.length / demosThis.length) * 100 : 0,
      monthly, monthLabels,
    };
  }, [sales.data, bookings.data, scheduling.data]);

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
            delta="+ 12% Than last month"
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

      {stats && (
        <div style={{ marginTop: 20 }}>
          <div style={{ background: 'var(--modern-card-bg, var(--card-bg))', border: '1px solid var(--modern-border, var(--border))', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: forecast ? 16 : 0 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>AI Month-End Forecast</div>
                <div style={{ fontSize: 12, color: 'var(--modern-text-muted, var(--text-muted))', marginTop: 2 }}>Gemini projection based on current pace and historical data</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {forecast && <button className="ai-btn-sm" onClick={() => setForecast('')}>Clear</button>}
                <button className="ai-btn" onClick={generateForecast} disabled={aiLoading}>
                  <Sparkles size={14} />
                  {aiLoading ? 'Forecasting…' : 'Generate Forecast'}
                </button>
              </div>
            </div>
            {forecast && (
              <div className="ai-result-card">
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }}>{forecast}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
