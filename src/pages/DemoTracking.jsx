import { useMemo, useState } from 'react';
import { useDemoBookings, useDemoScheduling, useAfterSales } from '../hooks/useAirtable';
import { Card, Loading, ErrorBox, PageHeader, Pill, Kpi } from '../components/ui';
import { dayjs, isInMonth } from '../lib/dates';
import { demosByPresalesAgent } from '../lib/rollups';
import { ClipboardList, CheckCircle2, XCircle, Clock, Sparkles, X } from 'lucide-react';
import { useGemini } from '../hooks/useGemini';

export default function DemoTracking() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const monthDate = dayjs(month + '-01');
  const { ask, loading: aiLoading } = useGemini();
  const [activeDraft, setActiveDraft] = useState(null); // { booking, text }
  const [draftingId, setDraftingId] = useState(null);

  const generateFollowUp = async (booking) => {
    setDraftingId(booking.id);
    setActiveDraft(null);
    const prompt = `Write a warm, professional WhatsApp follow-up message from a Super Sheldon sales counselor to a parent/student after a free demo class.

Student/Parent: ${booking.studentName || 'the student'}
Subject: ${booking.subject || 'the subject'}
Country: ${booking.country || 'their country'}
Counselor: ${booking.presalesAgent || 'our team'}
Demo date: ${booking.demoDateCx ? dayjs(booking.demoDateCx).format('DD MMM YYYY') : 'recently'}

The message should:
- Be concise (3–5 sentences)
- Reference the specific subject and demo
- Highlight 1 key Super Sheldon benefit (personalised 1-on-1 tutoring)
- End with a clear call to action to enroll
- Sound warm and human, not salesy
- Be ready to copy-paste into WhatsApp (no placeholders)`;
    const result = await ask(prompt);
    if (result) setActiveDraft({ booking, text: result });
    setDraftingId(null);
  };

  const bookings = useDemoBookings();
  const scheduling = useDemoScheduling();
  const sales = useAfterSales();

  const agg = useMemo(() => {
    if (!bookings.data || !scheduling.data) return [];
    return demosByPresalesAgent(bookings.data, scheduling.data, monthDate);
  }, [bookings.data, scheduling.data, monthDate]);

  const totals = useMemo(() => {
    const t = agg.reduce((acc, r) => ({
      booked: acc.booked + r.booked,
      scheduled: acc.scheduled + r.scheduled,
      completed: acc.completed + r.completed,
      cancelled: acc.cancelled + r.cancelled,
      pending: acc.pending + r.pending,
    }), { booked: 0, scheduled: 0, completed: 0, cancelled: 0, pending: 0 });
    return t;
  }, [agg]);

  // Sales linked back to demos = conversions via studentLinkIds → bookingById → presalesAgent
  const conversionsByAgent = useMemo(() => {
    if (!sales.data || !bookings.data) return {};
    const STOPLIST = new Set(['1on1', '1 on 1', 'No', 'no', '—', '']);
    const bookingById = {};
    bookings.data.forEach(b => { bookingById[b.id] = b; });
    const out = {};
    sales.data.filter(s => isInMonth(s.enrollmentDate, monthDate)).forEach(s => {
      const ids = s.studentLinkIds || [];
      for (const id of ids) {
        const agent = bookingById[id]?.presalesAgent;
        if (agent && !STOPLIST.has(agent)) {
          out[agent] = (out[agent] || 0) + 1;
          break;
        }
      }
    });
    return out;
  }, [sales.data, bookings.data, monthDate]);

  if (bookings.isLoading || scheduling.isLoading || sales.isLoading) return <Loading />;
  if (bookings.error || scheduling.error || sales.error) return <ErrorBox error={bookings.error || scheduling.error || sales.error} />;

  return (
    <>
      <PageHeader title="Demo Tracking" subtitle="Funnel: booked → scheduled → completed → converted">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="btn-secondary" />
      </PageHeader>

      <div className="kpi-grid">
        <Kpi label="Booked"    value={totals.booked}    icon={ClipboardList} />
        <Kpi label="Scheduled" value={totals.scheduled} icon={Clock} />
        <Kpi label="Completed" value={totals.completed} icon={CheckCircle2} accent="primary" />
        <Kpi label="Cancelled" value={totals.cancelled} icon={XCircle} />
      </div>

      <Card title="Counselor Performance" subtitle={`${monthDate.format('MMMM YYYY')}`}>
        <table className="data-table">
          <thead><tr>
            <th>Pre-sales Agent</th><th>Booked</th><th>Scheduled</th>
            <th>Completed</th><th>Cancelled</th><th>Pending</th>
            <th>Converted</th><th>Conversion %</th>
          </tr></thead>
          <tbody>
            {agg.map(r => {
              const converted = conversionsByAgent[r.agent] || 0;
              const pct = r.completed > 0 ? (converted / r.completed) * 100 : 0;
              return (
                <tr key={r.agent}>
                  <td>{r.agent}</td>
                  <td>{r.booked}</td>
                  <td>{r.scheduled}</td>
                  <td>{r.completed}</td>
                  <td>{r.cancelled}</td>
                  <td>{r.pending}</td>
                  <td>{converted}</td>
                  <td>
                    <Pill variant={pct >= 20 ? 'success' : pct > 0 ? 'warning' : 'danger'}>
                      {pct.toFixed(1)}%
                    </Pill>
                  </td>
                </tr>
              );
            })}
            {!agg.length && <tr><td colSpan={8}>No demo activity for this month.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title="Recent Demo Bookings" subtitle="Last 25 by form filling time — click ✦ to draft a follow-up message">
        <table className="data-table">
          <thead><tr>
            <th>Form Filled</th><th>Booking ID</th><th>Student</th><th>Country</th>
            <th>Subject</th><th>Pre-sales Agent</th><th>Demo Time (CX)</th><th></th>
          </tr></thead>
          <tbody>
            {[...(bookings.data || [])]
              .sort((a, b) => (b.formFillingTime || '').localeCompare(a.formFillingTime || ''))
              .slice(0, 25)
              .map(b => (
                <tr key={b.id}>
                  <td>{b.formFillingTime ? dayjs(b.formFillingTime).format('YYYY-MM-DD HH:mm') : '—'}</td>
                  <td>{b.bookingId || '—'}</td>
                  <td>{b.studentName}</td>
                  <td>{b.country}</td>
                  <td>{b.subject}</td>
                  <td>{b.presalesAgent}</td>
                  <td>{b.demoDateCx ? dayjs(b.demoDateCx).format('YYYY-MM-DD HH:mm') : '—'}</td>
                  <td>
                    <button
                      className="ai-btn-sm"
                      style={{ whiteSpace: 'nowrap' }}
                      onClick={() => generateFollowUp(b)}
                      disabled={draftingId === b.id || aiLoading}
                      title="Draft WhatsApp follow-up"
                    >
                      <Sparkles size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                      {draftingId === b.id ? '…' : 'Draft'}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>

      {activeDraft && (
        <Card title={`Follow-up Draft — ${activeDraft.booking.studentName || 'Student'}`} subtitle={`${activeDraft.booking.subject || ''} · ${activeDraft.booking.country || ''}`}>
          <div style={{ position: 'relative' }}>
            <button
              className="ai-icon-btn"
              style={{ position: 'absolute', top: 0, right: 0 }}
              onClick={() => setActiveDraft(null)}
              title="Close"
            >
              <X size={13} />
            </button>
            <div className="ai-result-card" style={{ marginTop: 0 }}>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7 }}>{activeDraft.text}</pre>
            </div>
            <button
              className="ai-btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => navigator.clipboard?.writeText(activeDraft.text)}
            >
              Copy to clipboard
            </button>
          </div>
        </Card>
      )}
    </>
  );
}
