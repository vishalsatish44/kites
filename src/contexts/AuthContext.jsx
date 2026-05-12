import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, supabaseReady } from '../lib/supabase';
import { APP_ROLES } from '../lib/schema';

const AuthContext = createContext(null);

const ALLOWED_DOMAIN = '@supersheldon.com';
const isAllowedEmail = email => typeof email === 'string' && email.toLowerCase().endsWith(ALLOWED_DOMAIN);

const DEV_KEY = 'wbr_dev_role';
const DEV_NAME_KEY = 'wbr_dev_name';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [devRole, setDevRole] = useState(
    () => localStorage.getItem(DEV_KEY) || APP_ROLES.MANAGEMENT,
  );
  const [devName, setDevName] = useState(
    () => localStorage.getItem(DEV_NAME_KEY) || 'Demo Manager',
  );

  // Boot: pull existing session, then subscribe to changes.
  useEffect(() => {
    if (!supabaseReady()) {
      setLoading(false);
      return;
    }
    const handleSession = (s) => {
      if (s && !isAllowedEmail(s.user?.email)) {
        console.warn('[auth] blocked non-supersheldon.com email:', s.user?.email);
        supabase.auth.signOut();
        setSession(null);
        setLoading(false);
        return;
      }
      setSession(s);
      setLoading(false);
    };

    let mounted = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.warn('[auth] getSession error:', error);
      handleSession(data?.session || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      console.log('[auth]', event, s?.user?.email);
      handleSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Profile is best-effort. If it fails, we still let the user into the app
  // (they'll see whatever the dev-role switcher selected, or fall through to
  // session.user.email-derived defaults).
  useEffect(() => {
    if (!supabaseReady() || !session?.user) {
      setProfile(null);
      setProfileError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*, employee:employees(*), is_super_admin')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('[auth] profile fetch failed:', error.message);
        setProfileError(error);
        setProfile(null);
      } else {
        setProfile(data);
        setProfileError(null);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const setDev = useCallback((role, name) => {
    setDevRole(role);
    localStorage.setItem(DEV_KEY, role);
    if (name !== undefined) {
      setDevName(name);
      localStorage.setItem(DEV_NAME_KEY, name);
    }
  }, []);

  // Resolve effective identity. Priority:
  //   1. Real Supabase profile + employee (logged in + linked)
  //   2. Session email-derived default (logged in, profile not found yet)
  //   3. Dev-mode (no Supabase / no session)
  const role = profile?.employee?.app_role
    || (session ? APP_ROLES.MANAGEMENT : devRole); // assume mgmt for first login
  const employeeName = profile?.employee?.full_name
    || session?.user?.email?.split('@')[0]
    || devName;
  const employeeId = profile?.employee?.id || null;
  const departmentName = profile?.employee?.department || null;
  const isSuperAdmin = profile?.is_super_admin === true;

  const signOut = async () => {
    if (supabaseReady()) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const value = {
    session,
    profile,
    profileError,
    loading,
    role,
    employeeName,
    employeeId,
    departmentName,
    isSuperAdmin,
    devMode: !supabaseReady() || !session,
    setDev,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
