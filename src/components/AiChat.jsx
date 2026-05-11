import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, RotateCcw } from 'lucide-react';
import { useGeminiChat } from '../hooks/useGemini';

const SYSTEM_CONTEXT = `You are an AI business assistant embedded in FluxCRM — a sales dashboard for Super Sheldon, an online tutoring company.

Company context:
- Sales agents close enrollment deals (subjects: Maths, English, Science, Coding, Public Speaking, etc.)
- Pre-sales agents book and conduct free demo classes for prospective students
- AR team handles renewals and collections
- Students from: India, UK & Europe, Australia & NZ, North America, MENA, Southeast Asia
- Revenue tracked in INR, GBP, AUD, USD, CAD, NZD, EUR
- Incentive system: presales get ₹300–₹500/sale based on conversion %, sales agents get CPC-based payouts
- KPIs: revenue, enrollments, demo conversion %, AOV (average order value), CPC (cost per class)

Answer questions about sales strategy, team performance, metrics interpretation, and business decisions. Be concise and data-driven.`;

export default function AiChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { messages, send, reset, loading } = useGeminiChat();
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

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
    send(text, messages.length === 0 ? SYSTEM_CONTEXT : '');
  };

  return (
    <>
      <button
        className="ai-fab"
        onClick={() => setOpen(o => !o)}
        title="AI Assistant (Gemini)"
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
                <div>Ask me anything about your sales data, team performance, or business strategy.</div>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {['How is the team performing this month?', 'What drives conversion rates?', 'Which lead channel is best?'].map(q => (
                    <button key={q} className="ai-suggestion" onClick={() => send(q, SYSTEM_CONTEXT)}>
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
