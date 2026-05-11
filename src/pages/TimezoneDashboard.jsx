import { useEffect, useState } from 'react';
import { Card, PageHeader } from '../components/ui';
import { ALL_TIMEZONES, DEFAULT_TIMEZONES, dayjs } from '../lib/dates';
import { X } from 'lucide-react';

const STORAGE_KEY = 'wbr_timezones_v2';

const TZ_GROUPS = [
  {
    label: 'Australia',
    tzs: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/ACT', 'Australia/Perth'],
  },
  {
    label: 'UK & Europe',
    tzs: ['Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid'],
  },
  {
    label: 'India & South Asia',
    tzs: ['Asia/Kolkata', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Colombo'],
  },
  {
    label: 'Middle East',
    tzs: ['Asia/Dubai', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Muscat'],
  },
  {
    label: 'South East Asia',
    tzs: ['Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Manila'],
  },
  {
    label: 'East Asia & Pacific',
    tzs: ['Asia/Tokyo', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Pacific/Auckland'],
  },
  {
    label: 'Americas',
    tzs: ['America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver'],
  },
  {
    label: 'Africa',
    tzs: ['Africa/Johannesburg'],
  },
];

const AU_PRESET = ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth'];
const UK_INDIA_PRESET = ['Europe/London', 'Asia/Kolkata', 'Asia/Dubai', 'America/New_York'];

export default function TimezoneDashboard() {
  const [selected, setSelected] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length >= 1) return arr;
      } catch { /* ignore */ }
    }
    return DEFAULT_TIMEZONES.map(t => t.tz);
  });
  const [now, setNow] = useState(dayjs());

  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
  }, [selected]);

  const tzInfo = tz => ALL_TIMEZONES.find(t => t.tz === tz) || { label: tz, code: '', tz };
  const remove = tz => setSelected(s => s.filter(x => x !== tz));
  const add = tz => {
    if (tz && !selected.includes(tz)) setSelected(s => [...s, tz]);
  };
  const applyPreset = tzs => setSelected([...new Set([...selected, ...tzs])]);

  const available = ALL_TIMEZONES.filter(t => !selected.includes(t.tz));

  return (
    <>
      <PageHeader title="World Timezone Dashboard" subtitle="Live clocks — updates every second" />

      <Card title="Active Timezones">
        <div className="timezone-grid">
          {selected.map(tz => {
            const info = tzInfo(tz);
            const time = now.tz(tz);
            const hour = time.hour();
            const isNight = hour < 7 || hour >= 21;
            return (
              <div className="timezone-card" key={tz} style={{ position: 'relative' }}>
                <button
                  className="tz-remove"
                  onClick={() => remove(tz)}
                  title="Remove"
                  style={{ position: 'absolute', top: 8, right: 8 }}
                >
                  <X size={13} />
                </button>
                <div style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
                  color: 'var(--text-muted)', marginBottom: 4,
                }}>
                  {info.code || tz.split('/')[1]}
                </div>
                <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700 }}>{info.label}</h3>
                <div style={{
                  fontSize: 28, fontWeight: 800, letterSpacing: '-.02em',
                  color: isNight ? 'var(--text-muted)' : 'var(--text)',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1.1, margin: '8px 0 2px',
                }}>
                  {time.format('hh:mm:ss')}
                  <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 4 }}>{time.format('A')}</span>
                </div>
                <div className="text-muted" style={{ fontSize: 12 }}>{time.format('ddd, MMM D')}</div>
                {isNight && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>🌙 night</div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Add Timezone">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 260px' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Select from list
            </label>
            <select
              className="btn-secondary"
              style={{ width: '100%' }}
              value=""
              onChange={e => { add(e.target.value); e.target.value = ''; }}
            >
              <option value="">— Add a timezone —</option>
              {TZ_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {group.tzs
                    .filter(tz => !selected.includes(tz))
                    .map(tz => {
                      const info = tzInfo(tz);
                      return (
                        <option key={tz} value={tz}>
                          {info.label} ({info.code || tz.split('/')[1]})
                        </option>
                      );
                    })}
                </optgroup>
              ))}
            </select>
          </div>

          <div style={{ flex: '1 1 auto' }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Quick presets
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn-secondary" onClick={() => applyPreset(AU_PRESET)}>
                🇦🇺 All Australia
              </button>
              <button className="btn-secondary" onClick={() => applyPreset(UK_INDIA_PRESET)}>
                🇬🇧 UK + India + Dubai + NY
              </button>
              <button className="btn-secondary" onClick={() => setSelected(DEFAULT_TIMEZONES.map(t => t.tz))}>
                Reset to default
              </button>
            </div>
          </div>
        </div>

        {selected.length > 0 && (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selected.map(tz => {
              const info = tzInfo(tz);
              return (
                <span key={tz} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'var(--border)', borderRadius: 20, padding: '3px 10px 3px 12px',
                  fontSize: 12, fontWeight: 500,
                }}>
                  {info.label}
                  <button
                    onClick={() => remove(tz)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-muted)' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
