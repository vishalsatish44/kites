import { useMemo, useState } from 'react';
import { useAfterSales, useOldCollection } from '../hooks/useAirtable';
import { ModernCard, ModernLoading, ModernErrorBox, ModernPageHeader } from '../components/ModernUi';
import { dayjs, isInMonth } from '../lib/dates';
import { formatMoney } from '../lib/currency';
import { Download } from 'lucide-react';
import '../Modern.css';

export default function AfterSalesData() {
  const [tab, setTab] = useState('new');
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const monthDate = dayjs(month + '-01');

  const sales = useAfterSales();
  const renewals = useOldCollection();

  const newSales = useMemo(() => {
    if (!sales.data) return [];
    return sales.data
      .filter(s => isInMonth(s.enrollmentDate, monthDate))
      .sort((a, b) => (b.enrollmentDate || '').localeCompare(a.enrollmentDate || ''));
  }, [sales.data, monthDate]);

  const renewalRows = useMemo(() => {
    if (!renewals.data) return [];
    return renewals.data
      .filter(r => isInMonth(r.paymentDate, monthDate))
      .sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }, [renewals.data, monthDate]);

  const exportCSV = () => {
    const rows = tab === 'new' ? newSales : renewalRows;
    const headers = tab === 'new'
      ? ['Date', 'Batch', 'Country', 'Subject', 'Counselor', 'Currency', 'Amount', 'INR', 'Classes', 'Type', 'Mode']
      : ['Date', 'Renewed By', 'Department', 'Currency', 'Amount', 'Classes', 'Mode'];
    const data = tab === 'new'
      ? rows.map(s => [s.enrollmentDate, s.batchId, s.country, s.subject, s.agent, s.currency, s.amount, s.inrAmount, s.classesIncluded, s.enrollmentType, s.paymentMode])
      : rows.map(r => [r.paymentDate, r.renewedBy, r.department, r.currency, r.amount, r.classesSold, r.paymentMode]);
    const csv = [headers, ...data].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${tab}_${month}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (sales.isLoading || renewals.isLoading) return <ModernLoading label="Loading after sales data…" />;
  if (sales.error) return <ModernErrorBox error={sales.error} onRetry={() => sales.refetch()} />;

  return (
    <div className="modern-app" style={{ padding: 0 }}>
      <ModernPageHeader 
        title="After Sales Data" 
        subtitle="Live records from Airtable"
        actions={
          <div style={{ display: 'flex', gap: '10px' }}>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="modern-action-btn" style={{ width: 'auto', padding: '0 12px' }} />
            <button className="modern-action-btn" onClick={exportCSV} title="Export CSV"><Download size={18} /></button>
          </div>
        }
      />

      <div className="tabs" style={{ marginBottom: '20px' }}>
        <button className={tab === 'new' ? 'tab active' : 'tab'} onClick={() => setTab('new')}>
          New Sales ({newSales.length})
        </button>
        <button className={tab === 'renewal' ? 'tab active' : 'tab'} onClick={() => setTab('renewal')}>
          Renewals ({renewalRows.length})
        </button>
      </div>

      {tab === 'new' && (
        <ModernCard>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>Date</th><th>Batch ID</th><th>Country</th><th>Subject</th>
                <th>Counselor</th><th>Currency</th><th>Amount</th><th>₹</th>
                <th>Classes</th><th>Monthly</th><th>Type</th><th>Mode</th><th>Channel</th><th>Referral</th>
              </tr></thead>
              <tbody>
                {newSales.map(s => (
                  <tr key={s.id}>
                    <td>{s.enrollmentDate ? dayjs(s.enrollmentDate).format('YYYY-MM-DD') : '—'}</td>
                    <td>{s.batchId}</td>
                    <td>{s.country}</td>
                    <td>{s.subject}</td>
                    <td>{s.agent}</td>
                    <td>{s.currency}</td>
                    <td>{formatMoney(s.amount, s.currency)}</td>
                    <td>{formatMoney(s.inrAmount)}</td>
                    <td>{s.classesIncluded}</td>
                    <td>{s.classesMonthly}</td>
                    <td>
                      <div className={`modern-pill ${s.enrollmentType === 'New Sale' ? 'modern-pill-success' : 'modern-pill-light'}`}>
                        {s.enrollmentType}
                      </div>
                    </td>
                    <td>{s.paymentMode}</td>
                    <td>{s.leadChannel}</td>
                    <td>{s.isReferral ? <div className="modern-pill modern-pill-success">Yes</div> : '—'}</td>
                  </tr>
                ))}
                {!newSales.length && <tr><td colSpan={14}>No sales for this month.</td></tr>}
              </tbody>
            </table>
          </div>
        </ModernCard>
      )}

      {tab === 'renewal' && (
        <ModernCard title="Renewals — Old Collection">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr>
                <th>Date</th><th>Renewed By</th><th>Department</th>
                <th>Currency</th><th>Amount</th><th>Classes Sold</th><th>Monthly</th><th>Mode</th>
              </tr></thead>
              <tbody>
                {renewalRows.map(r => (
                  <tr key={r.id}>
                    <td>{r.paymentDate ? dayjs(r.paymentDate).format('YYYY-MM-DD') : '—'}</td>
                    <td>{r.renewedBy}</td>
                    <td>{r.department}</td>
                    <td>{r.currency}</td>
                    <td>{formatMoney(r.amount, r.currency)}</td>
                    <td>{r.classesSold}</td>
                    <td>{r.classesMonthly}</td>
                    <td>{r.paymentMode}</td>
                  </tr>
                ))}
                {!renewalRows.length && <tr><td colSpan={8}>No renewals for this month.</td></tr>}
              </tbody>
            </table>
          </div>
        </ModernCard>
      )}
    </div>
  );
}
