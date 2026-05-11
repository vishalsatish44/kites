import { TrendingUp, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';

export function Card({ title, subtitle, children, actions, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p className="text-muted">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="card-body">{children}</div>
    </div>
  );
}

export function Kpi({ label, value, delta, icon: Icon, accent }) {
  const positive = typeof delta === 'number' ? delta >= 0 : null;
  return (
    <div className={`kpi ${accent || ''}`}>
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {Icon && <Icon size={16} />}
      </div>
      <div className="kpi-value">{value}</div>
      {delta != null && (
        <div className={`pill ${positive ? 'pill-success' : 'pill-danger'}`}>
          {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {Math.abs(delta)}%
        </div>
      )}
    </div>
  );
}

export function ProgressBar({ value, max, color = 'var(--accent)' }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Pill({ children, variant = 'default' }) {
  return <span className={`pill pill-${variant}`}>{children}</span>;
}

export function Loading({ label = 'Loading...' }) {
  return <div className="loading"><Loader2 className="spin" size={20} /> {label}</div>;
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="error-box">
      <AlertCircle size={18} />
      <div>
        <strong>Failed to load</strong>
        <p className="text-muted">{error?.message || 'Unknown error'}</p>
      </div>
      {onRetry && <button className="btn-secondary" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export function Empty({ label = 'No data yet' }) {
  return <div className="empty"><span>{label}</span></div>;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div className="title-area">
        <h1>{title}</h1>
        {subtitle && <p className="text-muted">{subtitle}</p>}
      </div>
      {children && <div className="controls">{children}</div>}
    </div>
  );
}
