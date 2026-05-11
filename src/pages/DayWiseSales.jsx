import { useMemo, useState } from 'react';
import { useAfterSales, useDemoBookings, useDemoScheduling } from '../hooks/useAirtable';
import { Card, Loading, ErrorBox, PageHeader } from '../components/ui';
import { MiniBarChart } from '../components/charts/Charts';
import { dayjs, isInMonth } from '../lib/dates';
import { dayWiseSales } from '../lib/rollups';
import { formatMoney } from '../lib/currency';

export default function DayWiseSales() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const monthDate = dayjs(month + '-01');
  const sales = useAfterSales();
  const bookings = useDemoBookings();
  const scheduling = useDemoScheduling();

  const rows = useMemo(() => sales.data ? dayWiseSales(sales.data, monthDate) : [], [sales.data, monthDate]);

  const completedByDay = useMemo(() => {
    if (!scheduling.data) return {};
    const out = {};
    scheduling.data.filter(s => s.isCompleted && isInMonth(s.finalDemoDate, monthDate)).forEach(s => {
      const k = dayjs(s.finalDemoDate).format('YYYY-MM-DD');
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }, [scheduling.data, monthDate]);

  const bookedByDay = useMemo(() => {
    if (!bookings.data) return {};
    const out = {};
    bookings.data.forEach(b => {
      const d = b.formFillingDate || b.formFillingTime;
      if (d && dayjs(d).format('YYYY-MM') === monthDate.format('YYYY-MM')) {
        const k = dayjs(d).format('YYYY-MM-DD');
        out[k] = (out[k] || 0) + 1;
      }
    });
    return out;
  }, [bookings.data, monthDate]);

  const allDays = Array.from({ length: monthDate.daysInMonth() }, (_, i) =>
    monthDate.date(i + 1).format('YYYY-MM-DD'),
  );

  const enrichedRows = allDays.map(date => {
    const r = rows.find(x => x.date === date) || { date, count: 0, revenue: 0, classes: 0 };
    return { ...r, demosBooked: bookedByDay[date] || 0, demosCompleted: completedByDay[date] || 0 };
  });

  const revenueArr = enrichedRows.map(r => r.revenue);
  const labels = enrichedRows.map(r => dayjs(r.date).format('D'));

  if (sales.isLoading) return <Loading />;
  if (sales.error) return <ErrorBox error={sales.error} />;

  return (
    <>
      <PageHeader title="Day-wise Sales Report" subtitle="Daily enrollments, revenue and demo activity">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="btn-secondary" />
      </PageHeader>

      <Card title="Daily Revenue (₹)">
        <MiniBarChart data={revenueArr} labels={labels} height={220} />
      </Card>

      <Card title={`Detail — ${monthDate.format('MMMM YYYY')}`}>
        <table className="data-table">
          <thead><tr>
            <th>Date</th><th>Day</th><th>Enrollments</th><th>Revenue (₹)</th>
            <th>Classes Sold</th><th>Demos Booked</th><th>Demos Completed</th>
          </tr></thead>
          <tbody>
            {enrichedRows.map(r => (
              <tr key={r.date}>
                <td>{r.date}</td>
                <td>{dayjs(r.date).format('ddd')}</td>
                <td>{r.count}</td>
                <td>{formatMoney(r.revenue)}</td>
                <td>{r.classes}</td>
                <td>{r.demosBooked}</td>
                <td>{r.demosCompleted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
