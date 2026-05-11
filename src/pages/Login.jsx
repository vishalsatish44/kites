import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Zap, Mail, Lock, ArrowRight, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { supabase, supabaseReady } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const ALLOWED_DOMAIN = '@supersheldon.com';

export default function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate('/', { replace: true });
  }, [loading, session, navigate]);

  if (session) return <Navigate to="/" replace />;

  if (!supabaseReady()) {
    return (
      <div className="login-bg">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-logo-ring"><Zap size={22} style={{ fill: '#70c041', color: '#70c041' }} /></div>
            <div>
              <div className="login-app-name">SuperSheldon</div>
              <div className="login-app-sub">CRM & Analytics</div>
            </div>
          </div>
          <div className="login-title" style={{ marginTop: 24 }}>Not configured</div>
          <div className="login-subtitle" style={{ marginTop: 6 }}>
            Add <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>VITE_SUPABASE_URL</code> and{' '}
            <code style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 6px', borderRadius: 4 }}>VITE_SUPABASE_ANON_KEY</code> to .env and restart.
          </div>
        </div>
      </div>
    );
  }

  const checkDomain = () => {
    if (!email.trim().toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setError({ message: `Only ${ALLOWED_DOMAIN} accounts are allowed.` });
      return false;
    }
    return true;
  };

  const signInPassword = async e => {
    e.preventDefault();
    if (!checkDomain()) return;
    setBusy(true); setError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError(error); return; }
    if (data?.session) navigate('/', { replace: true });
  };

  const sendMagic = async e => {
    e.preventDefault();
    if (!checkDomain()) return;
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
    <div className="login-bg">
      <div className="login-blob login-blob-1" />
      <div className="login-blob login-blob-2" />

      <div className="login-card">
        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo-ring">
            <Zap size={22} style={{ fill: '#70c041', color: '#70c041' }} />
          </div>
          <div>
            <div className="login-app-name">SuperSheldon</div>
            <div className="login-app-sub">CRM & Analytics</div>
          </div>
        </div>

        <div className="login-title">Welcome back</div>
        <div className="login-subtitle">Sign in with your @supersheldon.com account</div>

        {/* Mode tabs */}
        <div className="login-tabs">
          <button
            className={`login-tab${mode === 'password' ? ' active' : ''}`}
            onClick={() => { setMode('password'); setSent(false); setError(null); }}
          >
            <Lock size={13} /> Password
          </button>
          <button
            className={`login-tab${mode === 'magic' ? ' active' : ''}`}
            onClick={() => { setMode('magic'); setError(null); }}
          >
            <Mail size={13} /> Magic link
          </button>
        </div>

        {/* Password form */}
        {mode === 'password' && (
          <form onSubmit={signInPassword} className="login-form">
            <div className="login-field">
              <label>Work email</label>
              <div className="login-input-wrap">
                <Mail size={14} className="login-input-icon" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={`you${ALLOWED_DOMAIN}`}
                  required autoFocus autoComplete="email"
                />
              </div>
            </div>
            <div className="login-field">
              <label>Password</label>
              <div className="login-input-wrap">
                <Lock size={14} className="login-input-icon" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required autoComplete="current-password"
                />
                <button type="button" className="login-pw-toggle" onClick={() => setShowPw(s => !s)}>
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={busy}>
              {busy ? 'Signing in…' : <><span>Sign in</span><ArrowRight size={15} /></>}
            </button>
          </form>
        )}

        {/* Magic link form */}
        {mode === 'magic' && (
          sent ? (
            <div className="login-success">
              <CheckCircle size={16} />
              <span>Link sent to <strong>{email}</strong> — check your inbox</span>
            </div>
          ) : (
            <form onSubmit={sendMagic} className="login-form">
              <div className="login-field">
                <label>Work email</label>
                <div className="login-input-wrap">
                  <Mail size={14} className="login-input-icon" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder={`you${ALLOWED_DOMAIN}`}
                    required autoFocus autoComplete="email"
                  />
                </div>
              </div>
              <button type="submit" className="login-btn" disabled={busy}>
                {busy ? 'Sending…' : <><Mail size={14} /><span>Send magic link</span></>}
              </button>
            </form>
          )
        )}

        {/* Error */}
        {error && (
          <div className="login-error">
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{errMsg}</div>
              {isUnconfirmed && <div className="login-error-hint">Go to Supabase → Authentication → Users → click your row → "Confirm email".</div>}
              {isBadCreds && <div className="login-error-hint">Wrong email or password. Contact your admin to reset.</div>}
              {isRateLimit && <div className="login-error-hint">Too many attempts. Switch to the Password tab or wait a few minutes.</div>}
            </div>
          </div>
        )}

        <div className="login-note">
          Access restricted to authorised @supersheldon.com accounts only.
        </div>
      </div>
    </div>
  );
}
