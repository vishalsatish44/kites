import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  Zap, Mail, Lock, ArrowRight, AlertCircle, CheckCircle, Eye, EyeOff, UserPlus,
} from 'lucide-react';
import { supabase, supabaseReady } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const ALLOWED_DOMAIN = '@supersheldon.com';

export default function Login() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]       = useState('password');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState(null);
  const [busy, setBusy]       = useState(false);
  const [status, setStatus]   = useState('');  // "Creating account…" feedback

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

  // ── domain guard (runs before any Supabase call) ─────────────────────────
  const checkDomain = () => {
    if (!email.trim().toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      setError({ message: `Only ${ALLOWED_DOMAIN} accounts are allowed.` });
      return false;
    }
    return true;
  };

  // ── password sign-in with auto-register on first login ───────────────────
  const signInPassword = async e => {
    e.preventDefault();
    if (!checkDomain()) return;
    setBusy(true); setError(null); setStatus('');

    // 1. Try signing in (existing user path)
    const { data, error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (!signInErr) {
      if (data?.session) navigate('/', { replace: true });
      setBusy(false);
      return;
    }

    // 2. If credentials are wrong, try auto-registering (first-time user)
    const isNotFound = signInErr.message.toLowerCase().includes('invalid login credentials')
      || signInErr.message.toLowerCase().includes('user not found');

    if (!isNotFound) {
      // Some other error (rate limit, network…)
      setError(signInErr);
      setBusy(false);
      return;
    }

    setStatus('First time here — creating your account…');

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (signUpErr) {
      setError(signUpErr);
      setStatus('');
      setBusy(false);
      return;
    }

    // If Supabase returned a session immediately (email confirm disabled), use it.
    if (signUpData?.session) {
      navigate('/', { replace: true });
      setBusy(false);
      return;
    }

    // Email confirmation is still on — tell the user to disable it.
    setError({
      message: 'Account created but email confirmation is required.',
      hint: 'confirm-required',
    });
    setStatus('');
    setBusy(false);
  };

  // ── magic link ───────────────────────────────────────────────────────────
  const sendMagic = async e => {
    e.preventDefault();
    if (!checkDomain()) return;
    setBusy(true); setError(null); setStatus('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setError(error);
    else setSent(true);
  };

  const errMsg  = error?.message || '';
  const isBadCreds  = errMsg.toLowerCase().includes('invalid login credentials');
  const isRateLimit = errMsg.toLowerCase().includes('rate');
  const isConfirmRequired = error?.hint === 'confirm-required';

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

        <div className="login-title">Welcome</div>
        <div className="login-subtitle">Use your @supersheldon.com account · first visit auto-registers you</div>

        {/* Mode tabs */}
        <div className="login-tabs">
          <button
            className={`login-tab${mode === 'password' ? ' active' : ''}`}
            onClick={() => { setMode('password'); setSent(false); setError(null); setStatus(''); }}
          >
            <Lock size={13} /> Password
          </button>
          <button
            className={`login-tab${mode === 'magic' ? ' active' : ''}`}
            onClick={() => { setMode('magic'); setError(null); setStatus(''); }}
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

            {status && (
              <div className="login-status">
                <UserPlus size={14} />
                <span>{status}</span>
              </div>
            )}

            <button type="submit" className="login-btn" disabled={busy}>
              {busy
                ? (status ? 'Setting up account…' : 'Signing in…')
                : <><span>Continue</span><ArrowRight size={15} /></>}
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

        {/* Errors */}
        {error && (
          <div className="login-error">
            <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{errMsg}</div>
              {isConfirmRequired && (
                <div className="login-error-hint">
                  Go to <strong>Supabase → Authentication → Providers → Email</strong> and turn off <strong>"Confirm email"</strong>, then try again.
                </div>
              )}
              {isBadCreds && (
                <div className="login-error-hint">
                  Incorrect password for this account. Use Magic link to reset access.
                </div>
              )}
              {isRateLimit && (
                <div className="login-error-hint">
                  Too many attempts — wait a few minutes or use the Magic link tab.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="login-note">
          Access restricted to @supersheldon.com · all sign-ins are logged
        </div>
      </div>
    </div>
  );
}
