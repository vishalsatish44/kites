import React, { useMemo } from 'react';
import { DollarSign, Users, Target, ClipboardList, LayoutDashboard, BarChart3, Package, FileText, Calendar, Filter, Share2, MoreHorizontal } from 'lucide-react';
import { useAfterSales, useDemoBookings, useDemoScheduling } from '../hooks/useAirtable';
import { ModernCard, ModernHeader, ModernPageHeader, ModernBarChart, ModernGaugeChart, ProgressBar } from '../components/ModernUi';
import { dayjs, isInMonth } from '../lib/dates';
import { sumBy, filterByMonth } from '../lib/rollups';
import { formatMoney } from '../lib/currency';
import { useTheme } from '../contexts/ThemeContext';
import '../Modern.css';

export default function ModernDashboard() {
  const sales = useAfterSales();
  const bookings = useDemoBookings();
  const scheduling = useDemoScheduling();
  const { isDarkMode } = useTheme();

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

  const navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, active: true },
    { label: 'Analytics', icon: BarChart3 },
    { label: 'Products', icon: Package },
    { label: 'Invoices', icon: FileText },
    { label: 'Calendar', icon: Calendar },
  ];

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading modern experience...</div>;
  }

  return (
    <div className="modern-app">
      <ModernHeader navItems={navItems} user={{ name: 'Admin' }} />
      
      <main className="modern-content">
        <ModernPageHeader 
          title="Sales Overview" 
          subtitle="Analyze sales trends to make data-driven decisions"
          actions={
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-secondary" style={{ borderRadius: '999px' }}>Monthly</button>
              <button className="btn-secondary" style={{ borderRadius: '999px' }}><Share2 size={14} /> Export</button>
              <button className="btn-primary" style={{ borderRadius: '999px', background: '#1E4D40', color: 'white' }}><Filter size={14} /> Filter</button>
            </div>
          }
        />
        
        <div className="modern-grid">
          {/* Revenue Card (Accent) */}
          <ModernCard 
            title="Revenue"
            value={stats ? formatMoney(stats.revenueThis, 'INR') : '$120,873'}
            trend={true}
            delta={stats ? `+ ${Math.round(stats.growth)}% Than last month` : '+ 17% Than last month'}
            isAccent={true}
          />
          
          {/* Total Purchase Card */}
          <ModernCard 
            title="Total Purchase"
            value={stats ? stats.enrollmentsThis : '$89,203'}
            trend={true}
            delta={stats ? `+ ${stats.enrollmentsThis > 0 ? 12 : 0}% Than last month` : '+ 12% Than last month'}
            isAccent={false}
          />
          
          {/* Sales Target Card */}
          <ModernCard 
            title="Sales Target"
            value={stats ? `${Math.round(stats.conversionPct)}%` : '$50,901'}
            isAccent={false}
            actions={<MoreHorizontal size={18} color="#94A3B8" />}
          >
            <div style={{ marginTop: '15px' }}>
              <ProgressBar value={stats ? stats.conversionPct : 60} max={100} color="#1E4D40" />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', fontSize: '12px', color: '#64748B' }}>
                <span>Profit</span>
                <span>Total Earning</span>
              </div>
            </div>
          </ModernCard>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '25px' }}>
          {/* Customer Satisfaction */}
          <ModernCard title="Customer Satisfaction" subtitle="Top Positive Feedback" actions={<MoreHorizontal size={18} color="#94A3B8" />}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
              <ModernGaugeChart value={stats ? stats.conversionPct : 75} max={100} />
              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <div style={{ fontSize: '24px', fontWeight: '700' }}>250</div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>Responses this month</div>
              </div>
              <div className="modern-pill modern-pill-success" style={{ marginTop: '15px' }}>
                + 12% Customer Satisfaction (CSAT): 4.7/5
              </div>
            </div>
          </ModernCard>
          
          {/* Statistics */}
          <ModernCard title="Statistics" actions={<MoreHorizontal size={18} color="#94A3B8" />}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '14px', color: '#64748B' }}>Monthly</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#64748B' }}>• Profit</span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>• Loss</span>
              </div>
            </div>
            <ModernBarChart 
              data={stats ? stats.monthly : [30, 40, 45, 50, 49, 60, 70, 91, 125, 80, 70, 60]} 
              labels={stats ? stats.monthLabels : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']} 
            />
          </ModernCard>
        </div>
      </main>
    </div>
  );
}
