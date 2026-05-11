import { useState, useRef, useEffect, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Zap, LayoutDashboard, FileBarChart, Users, Calendar, ClipboardList,
  Sun, Moon, Bell, ChevronDown, Target, DollarSign, Globe, Award, BarChart3,
  CalendarDays, FileText, LogOut, Sliders, Shield, TrendingUp, RefreshCw, X,
  UserCheck, AlertCircle,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { APP_ROLES } from '../lib/schema';
import { useAfterSales } from '../hooks/useAirtable';
import { useAppSettings } from '../hooks/useAutoSync';
import { dayjs, isInDay } from '../lib/dates';
import { formatMoney } from '../lib/currency';
import '../Modern.css';
import AiChat from './AiChat';

const NAV = [
  { to: '/',                   label: 'Overview',           icon: LayoutDashboard, roles: '*' },
  { to: '/wbr',                label: 'WBR Management',     icon: FileBarChart,    roles: [APP_ROLES.MANAGEMENT] },
  { to: '/me',                 label: 'My Performance',     icon: Award,           roles: '*' },
  { to: '/day-wise',           label: 'Day-wise Sales',     icon: CalendarDays,    roles: [APP_ROLES.MANAGEMENT, APP_ROLES.SALES] },
  { to: '/sales-breakup',      label: 'Sales Breakup',      icon: BarChart3,       roles: [APP_ROLES.MANAGEMENT, APP_ROLES.SALES, APP_ROLES.AR] },
  { to: '/demos',              label: 'Demo Tracking',      icon: ClipboardList,   roles: '*' },
  { to: '/team-monthly',       label: 'Team Monthly',       icon: Users,           roles: [APP_ROLES.MANAGEMENT] },
  { to: '/goals',              label: 'M / Q / Y Goals',    icon: Target,          roles: [APP_ROLES.MANAGEMENT] },
  { to: '/currency',           label: 'Currency & Calc',    icon: DollarSign,      roles: '*' },
  { to: '/timezones',          label: 'World Timezones',    icon: Globe,           roles: '*' },
  { to: '/targets',            label: 'Target Mgmt',        icon: Target,          roles: [APP_ROLES.MANAGEMENT] },
  { to: '/attendance',         label: 'Attendance',         icon: Calendar,        roles: [APP_ROLES.MANAGEMENT, APP_ROLES.SALES] },
  { to: '/after-sales',        label: 'After Sales Data',   icon: FileText,        roles: [APP_ROLES.MANAGEMENT, APP_ROLES.SALES, APP_ROLES.AR] },
  { to: '/incentives',         label: 'Incentive Config',   icon: Sliders,         roles: [APP_ROLES.MANAGEMENT] },
  { to: '/admin',              label: 'Admin Panel',        icon: Shield,          roles: [APP_ROLES.MANAGEMENT] },
];

// ── Notification panel ────────────────────────────────────────────────────────

function NotificationPanel({ onClose }) {
  const sales = useAfterSales();
  const { data: settings } = useAppSettings();

  const items = useMemo(() => {
    const list = [];

    if (sales.data) {
      const todaySales = sales.data.filter(s => isInDay(s.enrollmentDate));
      const revenue = todaySales.reduce((s, x) => s + (x.inrAmount || 0), 0);
      list.push({
        id: 'today-sales',
        Icon: TrendingUp,
        color: '#70c041',
        title: todaySales.length
          ? `${todaySales.length} enrollment${todaySales.length !== 1 ? 's' : ''} today`
          : 'No enrollments yet today',
        sub: todaySales.length ? formatMoney(revenue) + ' revenue' : 'Check back later',
      });
    }

    if (settings?.last_sync_at) {
      list.push({
        id: 'last-sync',
        Icon: RefreshCw,
        color: '#3b82f6',
        title: 'Data last synced',
        sub: dayjs(settings.last_sync_at).fromNow(),
      });
    }

    if (sales.data) {
      const thisMonth = sales.data.filter(s => {
        if (!s.enrollmentDate) return false;
        const d = dayjs(s.enrollmentDate);
        return d.month() === dayjs().month() && d.year() === dayjs().year();
      });
      const agents = new Set(thisMonth.map(s => s.salesAgent).filter(Boolean));
      if (agents.size > 0) {
        list.push({
          id: 'team',
          Icon: UserCheck,
          color: '#f59e0b',
          title: `${agents.size} reps active this month`,
          sub: `${thisMonth.length} total enrollments`,
        });
      }
    }

    return list;
  }, [sales.data, settings]);

  const hasData = items.length > 0;

  return (
    <div className="notif-panel">
      <div className="notif-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={14} style={{ color: 'var(--accent)' }} />
          <span>Notifications</span>
        </div>
        <button className="notif-close" onClick={onClose}><X size={13} /></button>
      </div>
      <div className="notif-body">
        {!hasData ? (
          <div className="notif-empty">
            <AlertCircle size={28} style={{ opacity: 0.25 }} />
            <span>Loading…</span>
          </div>
        ) : (
          items.map(({ id, Icon, color, title, sub }) => (
            <div key={id} className="notif-item">
              <div className="notif-icon" style={{ background: color + '22', color }}>
                <Icon size={14} />
              </div>
              <div>
                <div className="notif-title">{title}</div>
                <div className="notif-sub">{sub}</div>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="notif-footer">
        {dayjs().format('ddd, D MMM YYYY · h:mm A')}
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export default function Shell() {
  const { isDarkMode, toggle } = useTheme();
  const { role, employeeName, devMode, setDev, signOut } = useAuth();
  const location = useLocation();

  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    if (!showNotifs) return;
    const handle = e => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showNotifs]);

  const visible = NAV.filter(n => n.roles === '*' || n.roles.includes(role));

  const currentPage = NAV.find(n =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)
  );
  const initials = (employeeName || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className={`shell ${isDarkMode ? 'dark' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Zap style={{ color: '#70C041', fill: '#70C041', flexShrink: 0 }} size={24} />
          <span>SuperSheldon CRM</span>
        </div>
        <nav className="sidebar-nav">
          {visible.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
              <n.icon size={16} style={{ flexShrink: 0 }} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-breadcrumb">
              <span className="topbar-brand">SuperSheldon</span>
              <span className="topbar-sep">/</span>
              <span className="topbar-page">{currentPage?.label ?? 'Dashboard'}</span>
            </div>
          </div>

          <div className="topbar-right">
            {devMode && (
              <select
                value={role}
                onChange={e => setDev(e.target.value)}
                className="role-switch"
                title="Dev mode role switch"
              >
                <option value={APP_ROLES.MANAGEMENT}>Management</option>
                <option value={APP_ROLES.SALES}>Sales rep</option>
                <option value={APP_ROLES.PRESALES}>Pre-sales rep</option>
                <option value={APP_ROLES.AR}>AR rep</option>
              </select>
            )}

            <button className="icon-btn" onClick={toggle} title="Toggle theme">
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Notification bell */}
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button
                className={`icon-btn${showNotifs ? ' icon-btn--active' : ''}`}
                title="Notifications"
                onClick={() => setShowNotifs(s => !s)}
              >
                <Bell size={16} />
                <span className="notification-dot" />
              </button>
              {showNotifs && <NotificationPanel onClose={() => setShowNotifs(false)} />}
            </div>

            <div className="user-chip">
              <div className="avatar-circle">{initials}</div>
              <div className="user-info">
                <div className="user-name">{employeeName || '—'}</div>
                <div className="user-role">{role}</div>
              </div>
              <ChevronDown size={12} />
            </div>

            <button className="icon-btn" onClick={signOut} title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
        <AiChat />
      </div>
    </div>
  );
}
