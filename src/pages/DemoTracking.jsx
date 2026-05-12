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

  const { ask: askFollowUp, loading: followUpLoading } = useGemini();
  const { ask: askBriefing, loading: briefingLoading } = useGemini();

  const [activeDraft, setActiveDraft] = useState(null);
  const [draftingId, setDraftingId] = useState(null);
  const [leadBriefing, setLeadBriefing] = useState('');

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
    const result = await askFollowUp(prompt);
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

  const totals = useMemo(() => agg.reduce((acc, r) => ({
    booked: acc.booked + r.booked,
    scheduled: acc.scheduled + r.scheduled,
    completed: acc.completed + r.completed,
    cancelled: acc.cancelled + r.cancelled,
    pending: acc.pending + r.pending,
  }), { booked: 0, scheduled: 0, completed: 0, cancelled: 0, pending: 0 }), [agg]);

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
        if (agent && !STOPLIST.has(agent)) { out[agent] = (out[agent] || 0) + 1; break; }
      }
    });
    return out;
  }, [sales.data, bookings.data, monthDate]);

  // Priority = agent's conversion rate this month
  const agentConvRate = useMemo(() => {
    const out = {};
    agg.forEach(r => {
      const converted = conversionsByAgent[r.agent] || 0;
      out[r.agent] = r.completed > 0 ? (converted / r.completed) * 100 : 0;
    });
    return out;
  }, [agg, conversionsByAgent]);

  const analyseLeads = async () => {
    setLeadBriefing('');
    const recent = [...(bookings.data || [])]
      .sort((a, b) => (b.formFillingTime || '').localeCompare(a.formFillingTime || ''))
      .slice(0, 15);
    const prompt = `You are a lead prioritisation analyst for Super Sheldon, an online 1-on-1 tutoring company. Analyse these recent demo bookings and identify the top 5 highest-priority leads to follow up with today.

Counselor conversion rates this month:
${agg.length > 0
  ? agg.map(r => `${r.agent}: ${r.completed} demos, ${conversionsByAgent[r.agent] || 0} converted (${r.completed > 0 ? ((conversionsByAgent[r.agent] || 0) / r.completed * 100).toFixed(1) : '0'}% rate)`).join('\n')
  : 'No conversion data yet for this month'}

Recent bookings (last 15):
${recent.map((b, i) => `${i + 1}. ${b.studentName || 'Student'} | ${b.country || '?'} | Subject: ${b.subject || '?'} | Agent: ${b.presalesAgent || '?'} | Demo: ${b.demoDateCx ? dayjs(b.demoDateCx).format('DD MMM') : 'TBD'}`).join('\n')}

Respond in this format:
**Top 5 Priority Leads:**
1. [Name] — [1-line reason]
2. ...

**Pattern Insight:**
[1–2 lines on what's working or what to watch this month]

Be specific and actionable.`;
    const result = await askBriefing(prompt);
    if (result) setLeadBriefing(result);
  };

  if (bookings.isLoading || scheduling.isLoading || sales.isLoading) return <Loading />;
  if (bookings.error || scheduling.error || sales.error) return <ErrorBox error={bookings.error || scheduling.error || sales.error} />;

  const getPriority = (b) => {
    const rate = agentConvRate[b.presalesAgent] || 0;
    if (rate >= 30) return 'high';
    if (rate >= 15) return 'medium';
    return 'low';
  };
  const PILL_VARIANT = { high: 'success', medium: 'warning', low: 'danger' };

  return (
    <>
      <PageHeader title="Demo Tracking" subtitle="Funnel: booked → scheduled → completed → converted">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="btn-secondary" />
          <button className="ai-btn" onClick={analyseLeads} disabled={briefingLoading || followUpLoading}>
            <Sparkles size={13} />
            {briefingLoading ? 'Analysing…' : 'Prioritise Leads'}
          </button>
        </div>
      </PageHeader>

      {leadBriefing && (
        <Card title="AI Lead Priority Briefing" subtitle={`${monthDate.format('MMMM YYYY')} · Priority based on agent conversion rate`}>
          <div style={{ position: 'relative' }}>
            <button className="ai-icon-btn" style={{ position: 'absolute', top: 0, right: 0 }} onClick={() => setLeadBriefing('')} title="Close"><X size={13} /></button>
            <div className="ai-result-card" style={{ marginTop: 0 }}>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7 }}>{leadBriefing}</pre>
            </div>
            <button className="ai-btn-sm" style={{ marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(leadBriefing)}>Copy</button>
          </div>
        </Card>
      )}

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
                  <td>{r.booked}</td><td>{r.scheduled}</td>
                  <td>{r.completed}</td><td>{r.cancelled}</td><td>{r.pending}</td>
                  <td>{converted}</td>
                  <td><Pill variant={pct >= 20 ? 'success' : pct > 0 ? 'warning' : 'danger'}>{pct.toFixed(1)}%</Pill></td>
                </tr>
              );
            })}
            {!agg.length && <tr><td colSpan={8}>No demo activity for this month.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title="Recent Demo Bookings" subtitle="Last 25 · Priority = agent conv rate (High ≥30%, Mid ≥15%) · ✦ = WhatsApp follow-up">
        <table className="data-table">
          <thead><tr>
            <th>Form Filled</th><th>Booking ID</th><th>Student</th><th>Country</th>
            <th>Subject</th><th>Pre-sales Agent</th><th>Demo Time (CX)</th><th>Priority</th><th></th>
          </tr></thead>
          <tbody>
            {[...(bookings.data || [])]
              .sort((a, b) => (b.formFillingTime || '').localeCompare(a.formFillingTime || ''))
              .slice(0, 25)
              .map(b => {
                const p = getPriority(b);
                return (
                  <tr key={b.id}>
                    <td>{b.formFillingTime ? dayjs(b.formFillingTime).format('YYYY-MM-DD HH:mm') : '—'}</td>
                    <td>{b.bookingId || '—'}</td>
                    <td>{b.studentName}</td>
                    <td>{b.country}</td>
                    <td>{b.subject}</td>
                    <td>{b.presalesAgent}</td>
                    <td>{b.demoDateCx ? dayjs(b.demoDateCx).format('YYYY-MM-DD HH:mm') : '—'}</td>
                    <td><Pill variant={PILL_VARIANT[p]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Pill></td>
                    <td>
                      <button
                        className="ai-btn-sm"
                        style={{ whiteSpace: 'nowrap' }}
                        onClick={() => generateFollowUp(b)}
                        disabled={draftingId === b.id || followUpLoading}
                        title="Draft WhatsApp follow-up"
                      >
                        <Sparkles size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                        {draftingId === b.id ? '…' : 'Draft'}
                      </button>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </Card>

      {activeDraft && (
        <Card
          title={`Follow-up Draft — ${activeDraft.booking.studentName || 'Student'}`}
          subtitle={`${activeDraft.booking.subject || ''} · ${activeDraft.booking.country || ''}`}
        >
          <div style={{ position: 'relative' }}>
            <button className="ai-icon-btn" style={{ position: 'absolute', top: 0, right: 0 }} onClick={() => setActiveDraft(null)} title="Close"><X size={13} /></button>
            <div className="ai-result-card" style={{ marginTop: 0 }}>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.7 }}>{activeDraft.text}</pre>
            </div>
            <button className="ai-btn-sm" style={{ marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(activeDraft.text)}>Copy to clipboard</button>
          </div>
        </Card>
      )}
    </>
  );
}
