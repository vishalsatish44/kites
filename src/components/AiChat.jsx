import { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, X, Send, RotateCcw } from 'lucide-react';
import { useGeminiChat } from '../hooks/useGemini';
import { useAfterSales, useDemoBookings, useDemoScheduling, useOldCollection } from '../hooks/useAirtable';
import { useAppSettings, useFxRates, toInr } from '../hooks/useAutoSync';
import { useAuth } from '../contexts/AuthContext';
import { dayjs, isInMonth } from '../lib/dates';
import { groupBy, sumBy, PRESALES_STOPLIST } from '../lib/rollups';
import { formatMoney } from '../lib/currency';

const STATIC_CONTEXT = `You are an AI business assistant embedded in k-AI-tes — a sales dashboard for Super Sheldon, an online 1-on-1 tutoring company.

CRITICAL RULE: Only cite numbers that appear in the live data snapshot below. Never invent, estimate, or assume figures. If the snapshot doesn't contain the data needed to answer a question, say "I don't have that data available" instead of guessing.

Company context:
- Sales agents close enrollment deals (subjects: Maths, English, Science, Coding, Public Speaking, etc.)
- Pre-sales agents book and conduct free demo classes for prospective students
- AR team handles renewals and collections (tracked in Old Collection table)
- Students from: India, UK & Europe, Australia & NZ, North America, MENA, Southeast Asia
- Revenue tracked in INR, GBP, AUD, USD, CAD, NZD, EUR
- KPIs: revenue, enrollments, demo conversion %, AOV (avg order value), CPC (cost per class)
- Incentives: presales ₹300–₹500/sale based on conversion %, sales agents CPC-based payouts`;

function fmt(n) { return formatMoney(Math.round(n)); }

function buildLiveContext(salesData, bookingsData, schedulingData, oldColData, appSettings, fxRates) {
  const now = dayjs();
  const monthLabel = now.format('MMMM YYYY');

  if (!salesData?.length) return '';

  // ── Current month sales ──────────────────────────────
  const thisMonth = salesData.filter(s => isInMonth(s.enrollmentDate, now));
  const totalRev = sumBy(thisMonth, 'inrAmount');
  const totalEnroll = thisMonth.length;
  const aov = totalEnroll > 0 ? totalRev / totalEnroll : 0;

  // ── Goals ────────────────────────────────────────────
  const goalMonthly   = parseInt(appSettings?.goal_monthly   || '0');
  const goalQuarterly = parseInt(appSettings?.goal_quarterly || '0');
  const goalYearly    = parseInt(appSettings?.goal_yearly    || '0');
  const goalPct = goalMonthly > 0 ? ((totalRev / goalMonthly) * 100).toFixed(1) : null;

  // ── Last 6 months trend ──────────────────────────────
  const trendLines = Array.from({ length: 6 }, (_, i) => {
    const m = now.subtract(5 - i, 'month');
    const rows = salesData.filter(s => isInMonth(s.enrollmentDate, m));
    const rev = sumBy(rows, 'inrAmount');
    const isCurrent = i === 5;
    return `  ${m.format('MMM YYYY')}: ${fmt(rev)} (${rows.length} deals)${isCurrent ? ' ← current (partial)' : ''}`;
  });

  // ── Sales by agent ───────────────────────────────────
  const byAgent = groupBy(thisMonth, 'agent');
  const agentRows = Object.entries(byAgent)
    .map(([a, rows]) => ({ a, n: rows.length, rev: sumBy(rows, 'inrAmount') }))
    .sort((x, y) => y.rev - x.rev)
    .slice(0, 8);

  // ── Lead channels ────────────────────────────────────
  const byChannel = groupBy(thisMonth, 'leadChannel');
  const channelRows = Object.entries(byChannel)
    .map(([ch, rows]) => ({ ch, n: rows.length, rev: sumBy(rows, 'inrAmount') }))
    .sort((x, y) => y.rev - x.rev);

  // ── Renewals / Old Collection ────────────────────────
  let renewalLines = [];
  if (oldColData?.length) {
    const renewals = oldColData.filter(r => isInMonth(r.paymentDate, now));
    const renewRev = renewals.reduce((s, r) => s + toInr(r.amount, r.currency, fxRates), 0);
    const byRenewer = {};
    renewals.forEach(r => { byRenewer[r.renewedBy] = (byRenewer[r.renewedBy] || 0) + 1; });
    const topRenewers = Object.entries(byRenewer).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([a, n]) => `${a} (${n})`).join(', ');
    renewalLines = [
      `  Count: ${renewals.length} | Revenue: ${fmt(renewRev)}`,
      topRenewers ? `  By agent: ${topRenewers}` : '',
    ].filter(Boolean);
  }

  // ── Demo funnel ──────────────────────────────────────
  let demoBooked = 0, demoCompleted = 0;
  if (bookingsData?.length) {
    demoBooked = bookingsData.filter(b => isInMonth(b.formFillingDate || b.formFillingTime, now)).length;
  }
  if (schedulingData?.length) {
    demoCompleted = schedulingData.filter(s => s.isCompleted && isInMonth(s.finalDemoDate, now)).length;
  }
  const demoConvPct = demoBooked > 0 ? ((totalEnroll / demoBooked) * 100).toFixed(1) : '—';
  const completionPct = demoBooked > 0 ? ((demoCompleted / demoBooked) * 100).toFixed(1) : '—';

  // ── Presales agents ──────────────────────────────────
  let presalesLines = [];
  if (bookingsData?.length) {
    const bookingById = Object.fromEntries(bookingsData.map(b => [b.id, b]));
    const presalesBookings = bookingsData.filter(b =>
      isInMonth(b.formFillingDate || b.formFillingTime, now) && !PRESALES_STOPLIST.has(b.presalesAgent)
    );
    const byPresales = groupBy(presalesBookings, 'presalesAgent');
    const salesMap = {};
    thisMonth.forEach(s => {
      const ids = s.studentLinkIds || [];
      for (const id of ids) {
        const agent = bookingById[id]?.presalesAgent;
        if (agent && !PRESALES_STOPLIST.has(agent)) { salesMap[agent] = (salesMap[agent] || 0) + 1; break; }
      }
    });
    presalesLines = Object.entries(byPresales)
      .map(([agent, demos]) => {
        const closed = salesMap[agent] || 0;
        const pct = demos.length > 0 ? ((closed / demos.length) * 100).toFixed(1) : '0';
        return `  - ${agent}: ${demos.length} demos, ${closed} converted (${pct}%)`;
      })
      .sort((a, b) => b.localeCompare(a));
  }

  // ── Subjects & countries ─────────────────────────────
  const subjectCounts = {};
  thisMonth.forEach(s => { subjectCounts[s.subject] = (subjectCounts[s.subject] || 0) + 1; });
  const topSubjects = Object.entries(subjectCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([s, n]) => `${s} (${n})`).join(', ');

  const countryCounts = {};
  thisMonth.forEach(s => { countryCounts[s.country] = (countryCounts[s.country] || 0) + 1; });
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([c, n]) => `${c} (${n})`).join(', ');

  // ── Day-wise current month (top 5 best days) ─────────
  const dayBuckets = {};
  thisMonth.forEach(s => {
    const k = dayjs(s.enrollmentDate).format('D MMM');
    if (!dayBuckets[k]) dayBuckets[k] = { rev: 0, n: 0 };
    dayBuckets[k].rev += s.inrAmount;
    dayBuckets[k].n++;
  });
  const topDays = Object.entries(dayBuckets).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5)
    .map(([d, v]) => `  ${d}: ${fmt(v.rev)} (${v.n} deals)`);

  // ── Enrollment types ─────────────────────────────────
  const typeCounts = {};
  thisMonth.forEach(s => { typeCounts[s.enrollmentType] = (typeCounts[s.enrollmentType] || 0) + 1; });
  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} (${n})`).join(', ');

  // ── Build output ─────────────────────────────────────
  const sections = [
    `=== LIVE DATA SNAPSHOT — ${monthLabel} (Day ${now.date()} of ${now.daysInMonth()}, as of ${now.format('h:mm A')}) ===`,
    '',
    `ENROLLMENTS THIS MONTH: ${totalEnroll} deals | Revenue: ${fmt(totalRev)} | AOV: ${fmt(aov)}`,
    goalMonthly ? `MONTHLY GOAL: ${fmt(goalMonthly)} | Achieved: ${goalPct}% | Gap: ${fmt(Math.max(0, goalMonthly - totalRev))}` : null,
    goalQuarterly ? `QUARTERLY GOAL: ${fmt(goalQuarterly)} | YEARLY GOAL: ${fmt(goalYearly)}` : null,
    '',
    'LAST 6 MONTHS TREND (new enrollments):',
    ...trendLines,
    '',
    'SALES AGENTS THIS MONTH:',
    ...agentRows.map(({ a, n, rev }) => `  - ${a}: ${n} deals | ${fmt(rev)} | AOV ${fmt(n > 0 ? rev / n : 0)}`),
    '',
    'LEAD CHANNELS:',
    ...channelRows.map(({ ch, n, rev }) =>
      `  - ${ch}: ${n} deals | ${fmt(rev)} | ${totalRev > 0 ? ((rev / totalRev) * 100).toFixed(1) : 0}% of revenue`
    ),
    '',
    renewalLines.length ? 'RENEWALS / COLLECTIONS THIS MONTH:' : null,
    ...renewalLines,
    renewalLines.length ? '' : null,
    `DEMO FUNNEL: ${demoBooked} booked → ${demoCompleted} completed (${completionPct}%) → ${totalEnroll} enrolled (${demoConvPct}% booked→enrolled)`,
    presalesLines.length ? '\nPRE-SALES AGENTS:' : null,
    ...presalesLines,
    '',
    `TOP SUBJECTS: ${topSubjects}`,
    `TOP COUNTRIES: ${topCountries}`,
    topTypes ? `ENROLLMENT TYPES: ${topTypes}` : null,
    topDays.length ? '\nBEST DAYS THIS MONTH (by revenue):' : null,
    ...topDays,
    '',
    '===',
  ];

  return sections.filter(l => l !== null).join('\n');
}

export default function AiChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, send, reset, loading } = useGeminiChat();
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const { employeeName, role } = useAuth();

  const sales       = useAfterSales();
  const bookings    = useDemoBookings();
  const scheduling  = useDemoScheduling();
  const oldCol      = useOldCollection();
  const { data: appSettings } = useAppSettings();
  const { data: fxRates }     = useFxRates();

  const dataReady = !!(sales.data && bookings.data && scheduling.data);

  const liveContext = useMemo(() =>
    buildLiveContext(sales.data, bookings.data, scheduling.data, oldCol.data, appSettings, fxRates),
    [sales.data, bookings.data, scheduling.data, oldCol.data, appSettings, fxRates]
  );

  const userLine = employeeName
    ? `\nCURRENT USER: ${employeeName} (role: ${role}). When they say "I", "me", "my performance", "my demos" etc., look up their name in the data snapshot above.`
    : '';

  const fullContext = liveContext
    ? `${STATIC_CONTEXT}\n\n${liveContext}${userLine}`
    : `${STATIC_CONTEXT}${userLine}`;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    send(text, fullContext);
  };

  return (
    <>
      <button
        className="ai-fab"
        onClick={() => setOpen(o => !o)}
        title="AI Assistant"
        aria-label="Open AI chat"
      >
        <Sparkles size={22} />
      </button>

      {open && (
        <div className="ai-chat-panel">
          <div className="ai-chat-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={15} style={{ color: 'var(--accent)' }} />
              <span>AI Assistant</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>Gemini</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="ai-icon-btn" onClick={reset} title="Clear conversation">
                <RotateCcw size={13} />
              </button>
              <button className="ai-icon-btn" onClick={() => setOpen(false)} title="Close">
                <X size={13} />
              </button>
            </div>
          </div>

          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <div className="ai-chat-empty">
                <Sparkles size={28} style={{ color: 'var(--accent)', marginBottom: 10, opacity: 0.6 }} />
                <div>Ask me anything about your sales data, team, goals, or strategy.</div>
                {!dataReady && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    Loading live data…
                  </div>
                )}
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    'How are we tracking against our monthly goal?',
                    'Which lead channel is generating the most revenue?',
                    'Who are the top performing agents this month?',
                    'How does this month compare to last month?',
                  ].map(q => (
                    <button
                      key={q}
                      className="ai-suggestion"
                      onClick={() => send(q, fullContext)}
                      disabled={!dataReady}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`ai-bubble ${m.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-ai'}${m.error ? ' ai-bubble-error' : ''}`}
              >
                {m.text}
              </div>
            ))}

            {loading && (
              <div className="ai-bubble ai-bubble-ai ai-typing">
                <span>●</span><span>●</span><span>●</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="ai-chat-input">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ask about your data…"
              disabled={loading}
            />
            <button className="ai-send-btn" onClick={handleSend} disabled={!input.trim() || loading}>
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
