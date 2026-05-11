import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Zap, Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { supabase, supabaseReady } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Card, Pill } from '../components/ui';

export default function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // If we already have a session, bounce to the dashboard.
  useEffect(() => {
    if (!loading && session) navigate('/', { replace: true });
  }, [loading, session, navigate]);

  if (!supabaseReady()) {
    return (
      <div className="auth-shell">
        <Card title="Supabase not configured">
          <p className="text-muted">
            Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code> and restart the dev server.
          </p>
        </Card>
      </div>
    );
  }

  if (session) return <Navigate to="/" replace />;

  const signInPassword = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    if (data?.session) {
      navigate('/', { replace: true });
    }
  };

  const sendMagic = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error);
    else setSent(true);
  };

  const errMsg = error?.message || '';
  const isUnconfirmed = errMsg.toLowerCase().includes('confirm') || errMsg.toLowerCase().includes('not confirmed');
  const isBadCreds = errMsg.toLowerCase().includes('invalid login credentials');
  const isRateLimit = errMsg.toLowerCase().includes('rate');

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-logo">
          <Zap style={{ color: '#70C041', fill: '#70C041' }} size={32} />
          <span>SuperSheldon CRM</span>
        </div>
        <h2>Sign in</h2>

        <div className="tabs" style={{ marginTop: 16 }}>
          <button className={mode === 'password' ? 'tab active' : 'tab'} onClick={() => { setMode('password'); setSent(false); setError(null); }}>
            <Lock size={14} /> Password
          </button>
          <button className={mode === 'magic' ? 'tab active' : 'tab'} onClick={() => { setMode('magic'); setError(null); }}>
            <Mail size={14} /> Magic link
          </button>
        </div>

        {mode === 'password' && (
          <form onSubmit={signInPassword} className="auth-form">
            <label>
              Work email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@supersheldon.com" className="btn-secondary" required autoFocus />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" className="btn-secondary" required />
            </label>
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Signing in…' : (<>Sign in <ArrowRight size={14} /></>)}
            </button>
          </form>
        )}

        {mode === 'magic' && (
          sent ? (
            <Pill variant="success">✓ Check {email} for the sign-in link</Pill>
          ) : (
            <form onSubmit={sendMagic} className="auth-form">
              <label>
                Work email
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@supersheldon.com" className="btn-secondary" required />
              </label>
              <button className="btn-primary" disabled={busy}>
                {busy ? 'Sending…' : (<><Mail size={14} /> Send magic link</>)}
              </button>
            </form>
          )
        )}

        {error && (
          <div className="error-box" style={{ marginTop: 12 }}>
            <AlertCircle size={18} />
            <div>
              <strong>{errMsg}</strong>
              {isUnconfirmed && (
                <p className="text-muted">
                  Your auth user wasn't auto-confirmed. Fix in <strong>Supabase → Authentication → Users</strong>:
                  click your row → "Confirm email". Or recreate the user with the
                  <strong> Auto Confirm User</strong> checkbox ticked.
                </p>
              )}
              {isBadCreds && (
                <p className="text-muted">
                  Wrong email or password. Reset via <strong>Supabase → Authentication → Users → ⋯ → Reset password</strong>.
                </p>
              )}
              {isRateLimit && (
                <p className="text-muted">
                  Free-tier Supabase limits magic-link emails to ~3/hour. Use the <strong>Password</strong> tab instead.
                </p>
              )}
            </div>
          </div>
        )}

        <p className="text-muted" style={{ marginTop: 16 }}>
          Your email must match the <code>Personal Email ID</code> on your Airtable Employe row.
        </p>
      </div>
    </div>
  );
}
