import React from 'react';
import { ArrowUpRight, Search, Bell, ChevronDown, MoreHorizontal, Loader2, AlertCircle } from 'lucide-react';
import '../Modern.css';

export function ModernCard({ title, value, subtitle, trend, delta, isAccent, children, actions, className = '' }) {
  return (
    <div className={`modern-card ${isAccent ? 'accent' : ''} ${className}`}>
      {actions && <div className="modern-card-actions">{actions}</div>}
      <div className="modern-card-header">
        <span className="modern-card-title">{title}</span>
        {trend && (
          <div className="modern-card-icon">
            <ArrowUpRight size={20} />
          </div>
        )}
      </div>
      {value && <div className="modern-card-value">{value}</div>}
      {delta && (
        <div className={`modern-pill ${isAccent ? '' : 'modern-pill-success'}`}>
          {delta}
        </div>
      )}
      {subtitle && <span className="modern-card-subtitle">{subtitle}</span>}
      {children}
    </div>
  );
}

export function ModernHeader({ user = { name: 'User' }, navItems = [] }) {
  return (
    <header className="modern-header">
      <div className="modern-logo">
        <div className="modern-logo-icon">⚡</div>
        <span>SuperSheldon CRM</span>
      </div>
      
      <nav className="modern-nav">
        {navItems.map((item, i) => (
          <a key={i} href="#" className={`modern-nav-item ${item.active ? 'active' : ''}`}>
            {item.icon && <item.icon size={16} />}
            {item.label}
          </a>
        ))}
      </nav>
      
      <div className="modern-actions">
        <button className="modern-action-btn" title="Search">
          <Search size={18} />
        </button>
        <button className="modern-action-btn" title="Notifications">
          <Bell size={18} />
          <span className="modern-badge"></span>
        </button>
        <div className="modern-user">
          <div className="modern-avatar">{user.name.charAt(0)}</div>
          <ChevronDown size={14} />
        </div>
      </div>
    </header>
  );
}

export function ModernPageHeader({ title, subtitle, actions }) {
  return (
    <div className="modern-page-header">
      <div className="modern-page-title">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="modern-page-actions">{actions}</div>}
    </div>
  );
}

export function ModernBarChart({ data = [], labels = [] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="modern-chart-container">
      {data.map((v, i) => (
        <div key={i} className="modern-bar" style={{ height: `${(v / max) * 100}%` }} title={`${labels[i]}: ${v}`} />
      ))}
    </div>
  );
}

export function ModernGaugeChart({ value = 0, max = 100 }) {
  const totalSegments = 12;
  const ratio = Math.max(0, Math.min(1, value / max));
  const activeSegments = Math.round(totalSegments * ratio);
  const radius = 80;
  const cx = 100;
  const cy = 110;

  const polarToCartesian = (centerX, centerY, r, angleInDegrees) => {
    const rad = angleInDegrees * Math.PI / 180;
    return { x: centerX + r * Math.cos(rad), y: centerY + r * Math.sin(rad) };
  };
  
  const arc = (start, end) => {
    const s = polarToCartesian(cx, cy, radius, end);
    const e = polarToCartesian(cx, cy, radius, start);
    const large = end - start <= 180 ? '0' : '1';
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 0 ${e.x} ${e.y}`;
  };

  const paths = [];
  for (let i = 0; i < totalSegments; i++) {
    const sa = 180 + (i * 180 / totalSegments);
    const ea = 180 + ((i + 1) * 180 / totalSegments) - 4; // 4 deg gap
    paths.push(
      <path key={i} d={arc(sa, ea)} fill="none"
        stroke={i < activeSegments ? '#008080' : '#E5E7EB'}
        strokeWidth="12" strokeLinecap="round" />
    );
  }

  return (
    <div className="modern-gauge">
      <svg viewBox="0 0 200 130" style={{ width: '100%' }}>
        {paths}
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize="24" fontWeight="700" fill="#0F172A">
          {Math.round(ratio * 100)}%
        </text>
      </svg>
    </div>
  );
}

export function ProgressBar({ value, max, color = '#1E4D40' }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div style={{ width: '100%', height: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ 
        width: `${pct}%`, 
        height: '100%', 
        background: `linear-gradient(135deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent), ${color}`,
        backgroundSize: '10px 10px',
        borderRadius: '8px', 
        transition: 'width 0.4s' 
      }} />
    </div>
  );
}

export function ModernLoading({ label = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: '#64748B', gap: '10px' }}>
      <Loader2 className="spin" size={20} />
      <span>{label}</span>
    </div>
  );
}

export function ModernErrorBox({ error, onRetry }) {
  return (
    <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '15px', margin: '20px 0' }}>
      <AlertCircle size={24} />
      <div style={{ flex: 1 }}>
        <strong style={{ display: 'block', marginBottom: '5px' }}>Failed to load</strong>
        <p style={{ margin: 0, fontSize: '14px', color: '#B91C1C' }}>{error?.message || 'Unknown error'}</p>
      </div>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry} style={{ background: 'white', color: '#991B1B', border: '1px solid #FECACA', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer' }}>
          Retry
        </button>
      )}
    </div>
  );
}
