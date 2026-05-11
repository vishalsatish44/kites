import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEmployees as useAirtableEmployees, useLastSync } from '../hooks/useAirtable';
import { useRegions } from '../hooks/useSupabaseData';
import { Card, PageHeader, Pill, Loading, ErrorBox } from '../components/ui';
import { supabase, supabaseReady } from '../lib/supabase';
import { APP_ROLES, ROLE_FROM_DEPARTMENT, DEPARTMENTS, SALES_AGENTS } from '../lib/schema';
import { Save, Search, Wand2, RefreshCcw, UserPlus, Database, Clock } from 'lucide-react';
import { dayjs } from '../lib/dates';
import { matchAgent } from '../lib/nameMatch';

const ROLES = [
  APP_ROLES.MANAGEMENT, APP_ROLES.SALES,
  APP_ROLES.PRESALES, APP_ROLES.AR, APP_ROLES.STAFF,
];

// Country → region mapping. Used by the bulk-assign tool.
const COUNTRY_REGION = {
  USA: 'North America', Canada: 'North America',
  UK: 'UK & Europe', Ireland: 'UK & Europe', Germany: 'UK & Europe', France: 'UK & Europe',
  Spain: 'UK & Europe', Italy: 'UK & Europe', Netherlands: 'UK & Europe',
  Australia: 'Australia & NZ', 'New Zealand': 'Australia & NZ',
  UAE: 'MENA', 'Saudi Arabia': 'MENA', Qatar: 'MENA', Kuwait: 'MENA', Oman: 'MENA', Bahrain: 'MENA',
  Singapore: 'SEA', Malaysia: 'SEA', Indonesia: 'SEA', Philippines: 'SEA', Thailand: 'SEA', Vietnam: 'SEA',
  India: 'India',
};

function useSupabaseEmployees() {
  return useQuery({
    queryKey: ['sb', 'employees', 'admin'],
    queryFn: async () => {
      if (!supabaseReady()) return [];
      const { data, error } = await supabase.from('employees').select('*').order('full_name');
      if (error) throw error;
      return data || [];
    },
  });
}

function useUserProfiles() {
  return useQuery({
    queryKey: ['sb', 'user_profiles', 'admin'],
    queryFn: async () => {
      if (!supabaseReady()) return [];
      const { data, error } = await supabase.from('user_profiles').select('user_id, employee_id');
      if (error) throw error;
      return data || [];
    },
  });
}

export default function AdminPanel() {
  const air = useAirtableEmployees();
  const sup = useSupabaseEmployees();
  const regions = useRegions();
  const profiles = useUserProfiles();
  const lastSync = useLastSync();
  const qc = useQueryClient();

  const triggerSync = useMutation({
    mutationFn: async () => {
      if (!supabaseReady()) throw new Error('Supabase not configured');
      const { data, error } = await supabase.functions.invoke('sync-airtable', {
        method: 'POST',
        headers: { 'x-trigger': 'manual' },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['last-sync'] });
      qc.invalidateQueries({ queryKey: ['after-sales-v2'] });
      qc.invalidateQueries({ queryKey: ['demo-bookings-v2'] });
      qc.invalidateQueries({ queryKey: ['demo-scheduling-v2'] });
      qc.invalidateQueries({ queryKey: ['old-collection-v2'] });
    },
  });

  const [tab, setTab] = useState('employees');
  const [search, setSearch] = useState('');
  const [edits, setEdits] = useState({});

  const updateEmployee = useMutation({
    mutationFn: async ({ id, patch }) => {
      const { error } = await supabase.from('employees').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sb', 'employees'] }),
  });

  const importFromAirtable = useMutation({
    mutationFn: async () => {
      if (!supabaseReady()) throw new Error('Supabase not configured');
      const rows = (air.data || []).filter(e => e.fullName).map(e => {
        // Auto-populate airtable_agent_name when we can confidently match
        // a known agent single-select value to this employee.
        let inferredAgent = null;
        for (const candidate of SALES_AGENTS) {
          if (matchAgent(e.fullName, candidate)) { inferredAgent = candidate; break; }
        }
        return {
          airtable_id: e.id,
          full_name: e.fullName,
          email: (e.email || '').toLowerCase().trim() || null,
          department: e.department || null,
          app_role: ROLE_FROM_DEPARTMENT[e.department] || APP_ROLES.STAFF,
          designation: e.designation || null,
          airtable_agent_name: inferredAgent,
          active: true,
        };
      });
      const { error } = await supabase.from('employees').upsert(rows, { onConflict: 'airtable_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sb', 'employees'] }),
  });

  const merged = useMemo(() => {
    const supByAir = Object.fromEntries((sup.data || []).map(e => [e.airtable_id, e]));
    const profileByEmp = (profiles.data || []).reduce((acc, p) => {
      if (p.employee_id) acc[p.employee_id] = p.user_id;
      return acc;
    }, {});
    return (air.data || []).map(a => {
      const s = supByAir[a.id] || null;
      return {
        air: a,
        sup: s,
        linkedUserId: s ? profileByEmp[s.id] : null,
      };
    });
  }, [air.data, sup.data, profiles.data]);

  const filtered = useMemo(() => {
    if (!search) return merged;
    const q = search.toLowerCase();
    return merged.filter(r => {
      const hay = [r.air.fullName, r.air.email, r.air.department, r.air.designation].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [merged, search]);

  const bulkAssignRegions = () => {
    if (!supabaseReady() || !sup.data) return;
    const regionByName = Object.fromEntries((regions.data || []).map(r => [r.name, r.id]));
    const updates = [];
    sup.data.forEach(emp => {
      // Pull country from Airtable employee row matched by airtable_id
      const a = air.data?.find(x => x.id === emp.airtable_id);
      // We don't have country on employees in Airtable; default by department to India
      const country = a?.country || 'India';
      const regionName = COUNTRY_REGION[country] || 'India';
      const regionId = regionByName[regionName];
      if (regionId && emp.region_id !== regionId) {
        updates.push({ id: emp.id, region_id: regionId });
      }
    });
    Promise.all(updates.map(u => supabase.from('employees').update({ region_id: u.region_id }).eq('id', u.id)))
      .then(() => qc.invalidateQueries({ queryKey: ['sb', 'employees'] }));
  };

  const setEdit = (id, k, v) => setEdits(e => ({ ...e, [id]: { ...e[id], [k]: v } }));
  const saveEmp = (id) => {
    const patch = edits[id] || {};
    if (!Object.keys(patch).length) return;
    updateEmployee.mutate({ id, patch });
    setEdits(e => { const { [id]: _, ...rest } = e; return rest; });
  };

  const counts = useMemo(() => {
    const out = { airtable: air.data?.length || 0, supabase: sup.data?.length || 0 };
    out.linked = (profiles.data || []).filter(p => p.employee_id).length;
    out.unlinked = out.supabase - out.linked;
    out.byRole = (sup.data || []).reduce((acc, e) => ({ ...acc, [e.app_role]: (acc[e.app_role] || 0) + 1 }), {});
    return out;
  }, [air.data, sup.data, profiles.data]);

  const lastSuccess = lastSync.data?.last_success_at;
  const lastStarted = lastSync.data?.last_started_at;
  const lastStatus  = lastSync.data?.last_status;

  return (
    <>
      <PageHeader title="Admin Panel" subtitle="Employees · roles · regions · profiles · sync">
        <button className="btn-secondary" onClick={() => { air.refetch(); sup.refetch(); profiles.refetch(); lastSync.refetch(); }}>
          <RefreshCcw size={14} /> Reload
        </button>
        <button className="btn-primary" onClick={() => importFromAirtable.mutate()} disabled={!supabaseReady() || importFromAirtable.isPending}>
          <UserPlus size={14} /> {importFromAirtable.isPending ? 'Importing…' : 'Import employees'}
        </button>
        <button className="btn-primary" onClick={() => triggerSync.mutate()} disabled={!supabaseReady() || triggerSync.isPending}
          title="Pull latest sales / demos / renewals from Airtable into Supabase">
          <Database size={14} /> {triggerSync.isPending ? 'Syncing…' : 'Sync now'}
        </button>
      </PageHeader>

      {!supabaseReady() && <Card><p>⚠️ Supabase not configured — admin actions are disabled.</p></Card>}

      <Card title="Airtable → Supabase sync"
        subtitle="The dashboard reads from the Supabase mirror. A scheduled job (or this Sync Now button) refreshes it.">
        <div className="kpi-grid">
          <div className="kpi">
            <div className="kpi-top"><span className="kpi-label">Last successful sync</span><Clock size={14} /></div>
            <div className="kpi-value" style={{ fontSize: 18 }}>
              {lastSuccess ? dayjs(lastSuccess).format('MMM D, HH:mm:ss') : <span className="text-muted">never</span>}
            </div>
            {lastSuccess && <div className="text-muted">{dayjs(lastSuccess).fromNow ? '' : ''}{Math.round((Date.now() - new Date(lastSuccess).getTime()) / 60000)} min ago</div>}
          </div>
          <div className="kpi">
            <div className="kpi-top"><span className="kpi-label">Last attempt</span></div>
            <div className="kpi-value" style={{ fontSize: 18 }}>
              {lastStarted ? dayjs(lastStarted).format('MMM D, HH:mm:ss') : <span className="text-muted">never</span>}
            </div>
            <div><Pill variant={lastStatus === 'success' ? 'success' : lastStatus === 'partial' ? 'warning' : lastStatus === 'error' ? 'danger' : 'light'}>
              {lastStatus || '—'}
            </Pill></div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><span className="kpi-label">Source</span></div>
            <div className="kpi-value" style={{ fontSize: 18 }}>{counts.supabase ? 'Supabase mirror' : 'Live Airtable (fallback)'}</div>
            <div className="text-muted">{counts.supabase ? 'Reads are fast & rate-limit-free' : 'No mirror data yet — run Sync now'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-top"><span className="kpi-label">Result</span></div>
            <div className="kpi-value" style={{ fontSize: 14, fontWeight: 500 }}>
              {triggerSync.data
                ? <code style={{ wordBreak: 'break-all' }}>{JSON.stringify(triggerSync.data.counters || triggerSync.data)}</code>
                : <span className="text-muted">click "Sync now" to test</span>}
            </div>
            {triggerSync.data?.status && (
              <Pill variant={triggerSync.data.status === 'success' ? 'success' : 'warning'}>
                {triggerSync.data.status}
              </Pill>
            )}
            {triggerSync.data?.error && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)', wordBreak: 'break-all' }}>
                ✗ {triggerSync.data.error}
              </div>
            )}
            {triggerSync.error && <Pill variant="danger">{triggerSync.error.message}</Pill>}
          </div>
        </div>
      </Card>

<div className="kpi-grid">
        <Card title="In Airtable"><h2>{counts.airtable}</h2></Card>
        <Card title="In Supabase"><h2>{counts.supabase}</h2></Card>
        <Card title="Linked to Auth"><h2>{counts.linked}</h2><p className="text-muted">{counts.unlinked} unlinked</p></Card>
        <Card title="By Role">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(counts.byRole).map(([k, v]) => (
              <Pill key={k} variant="default">{k}: {v}</Pill>
            ))}
            {!Object.keys(counts.byRole).length && <span className="text-muted">—</span>}
          </div>
        </Card>
      </div>

      <div className="tabs">
        {[
          ['employees', 'Employees & roles'],
          ['regions', 'Regions'],
          ['linkage', 'Auth ↔ Employee linkage'],
          ['onboarding', 'Onboarding'],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? 'tab active' : 'tab'} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'employees' && (
        <>
          <Card title="Filter">
            <div className="search-wrap">
              <Search size={14} />
              <input className="btn-secondary" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, department, designation…" />
            </div>
          </Card>

          <Card title="Manage Employees" subtitle="Editing here writes to Supabase. Airtable is read-only.">
            {(air.isLoading || sup.isLoading) && <Loading />}
            {(air.error || sup.error) && <ErrorBox error={air.error || sup.error} />}
            <table className="data-table">
              <thead><tr>
                <th>Name</th><th>Email</th><th>Dept (Airtable)</th>
                <th>App Role</th><th>Region</th><th>Agent Name (Airtable)</th>
                <th>Active</th><th>Auth Linked</th><th></th>
              </tr></thead>
              <tbody>
                {filtered.map(({ air: a, sup: s, linkedUserId }) => {
                  const e = edits[s?.id] || {};
                  const role = e.app_role ?? s?.app_role ?? (ROLE_FROM_DEPARTMENT[a.department] || APP_ROLES.STAFF);
                  const regionId = e.region_id ?? s?.region_id ?? '';
                  const active = e.active ?? s?.active ?? true;
                  const agentName = e.airtable_agent_name ?? s?.airtable_agent_name ?? '';
                  // Suggest auto-match for visual feedback
                  let autoMatch = null;
                  if (s && !agentName) {
                    for (const c of SALES_AGENTS) {
                      if (matchAgent(a.fullName, c)) { autoMatch = c; break; }
                    }
                  }
                  return (
                    <tr key={a.id}>
                      <td>{a.fullName}</td>
                      <td>{a.email || <span className="text-muted">—</span>}</td>
                      <td>{a.department || '—'}</td>
                      <td>
                        {s ? (
                          <select className="btn-secondary" value={role}
                            onChange={ev => setEdit(s.id, 'app_role', ev.target.value)}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        ) : <Pill variant="warning">Not in Supabase</Pill>}
                      </td>
                      <td>
                        {s && (
                          <select className="btn-secondary" value={regionId || ''}
                            onChange={ev => setEdit(s.id, 'region_id', ev.target.value || null)}>
                            <option value="">—</option>
                            {(regions.data || []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        )}
                      </td>
                      <td>
                        {s ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <select className="btn-secondary" style={{ minWidth: 130 }}
                              value={agentName}
                              onChange={ev => setEdit(s.id, 'airtable_agent_name', ev.target.value || null)}>
                              <option value="">— none —</option>
                              {SALES_AGENTS.map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            {autoMatch && (
                              <button className="btn-secondary" title={`Auto-match: ${autoMatch}`}
                                onClick={() => setEdit(s.id, 'airtable_agent_name', autoMatch)}>
                                ↻ {autoMatch}
                              </button>
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {s && (
                          <input type="checkbox" checked={active}
                            onChange={ev => setEdit(s.id, 'active', ev.target.checked)} />
                        )}
                      </td>
                      <td>{linkedUserId ? <Pill variant="success">✓</Pill> : <Pill variant="light">—</Pill>}</td>
                      <td>
                        {s && Object.keys(edits[s.id] || {}).length > 0 && (
                          <button className="btn-primary" onClick={() => saveEmp(s.id)}><Save size={14} /> Save</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && <tr><td colSpan={9}>No employees match.</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'regions' && (
        <RegionsTab regions={regions} qc={qc}
          onBulkAssign={bulkAssignRegions} />
      )}

      {tab === 'linkage' && (
        <LinkageTab supabase={sup} profiles={profiles} qc={qc} />
      )}

      {tab === 'onboarding' && (
        <OnboardingTab employees={sup} profiles={profiles} />
      )}
    </>
  );
}

function RegionsTab({ regions, qc, onBulkAssign }) {
  const [name, setName] = useState('');
  const [countries, setCountries] = useState('');

  const addRegion = useMutation({
    mutationFn: async () => {
      if (!supabaseReady() || !name.trim()) return;
      const list = countries.split(',').map(c => c.trim()).filter(Boolean);
      const { error } = await supabase.from('regions').insert({ name: name.trim(), countries: list });
      if (error) throw error;
    },
    onSuccess: () => {
      setName(''); setCountries('');
      qc.invalidateQueries({ queryKey: ['sb', 'regions'] });
    },
  });
  const delRegion = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('regions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sb', 'regions'] }),
  });

  return (
    <>
      <Card title="Add Region">
        <div className="filter-grid">
          <div className="filter-cell">
            <label>Region name</label>
            <input className="btn-secondary" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Latin America" />
          </div>
          <div className="filter-cell" style={{ gridColumn: 'span 2' }}>
            <label>Countries (comma-separated)</label>
            <input className="btn-secondary" value={countries} onChange={e => setCountries(e.target.value)} placeholder="Brazil, Mexico, Argentina" />
          </div>
          <div className="filter-cell">
            <label>&nbsp;</label>
            <button className="btn-primary" onClick={() => addRegion.mutate()} disabled={!name.trim()}>Add</button>
          </div>
        </div>
      </Card>

      <Card title="Regions" actions={
        <button className="btn-secondary" onClick={onBulkAssign}><Wand2 size={14} /> Auto-assign region for all employees</button>
      }>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Countries</th><th></th></tr></thead>
          <tbody>
            {(regions.data || []).map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{(r.countries || []).join(', ') || <span className="text-muted">—</span>}</td>
                <td>
                  <button className="btn-secondary" onClick={() => delRegion.mutate(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {!regions.data?.length && <tr><td colSpan={3} className="text-muted">No regions yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function LinkageTab({ supabase: supEmps, profiles, qc }) {
  const profilesByEmp = useMemo(
    () => (profiles.data || []).reduce((acc, p) => (p.employee_id ? { ...acc, [p.employee_id]: p.user_id } : acc), {}),
    [profiles.data],
  );

  const linkProfile = useMutation({
    mutationFn: async ({ user_id, employee_id }) => {
      if (!supabaseReady()) return;
      const { error } = await supabase.from('user_profiles').upsert({ user_id, employee_id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sb', 'user_profiles'] }),
  });

  return (
    <Card title="Auth users ↔ Employee" subtitle="Magic-link sign-ins are auto-linked when emails match. Use this tool to override.">
      <p className="text-muted">
        New sign-ups are linked automatically by the <code>handle_new_user()</code> trigger (migration <code>0002</code>).
        If a user signs up with an email that doesn't match any employee, that user_profile row will exist but with <code>employee_id = NULL</code>.
        Use SQL editor → Authentication → Users to find their <code>user_id</code>, then paste below.
      </p>
      <ManualLink onSubmit={linkProfile.mutate} pending={linkProfile.isPending} />

      <h4 style={{ marginTop: 24 }}>Currently linked</h4>
      <table className="data-table">
        <thead><tr><th>Employee</th><th>Email</th><th>Role</th><th>Linked Auth user_id</th></tr></thead>
        <tbody>
          {(supEmps.data || []).map(e => (
            <tr key={e.id}>
              <td>{e.full_name}</td>
              <td>{e.email || '—'}</td>
              <td><Pill variant="default">{e.app_role}</Pill></td>
              <td>{profilesByEmp[e.id] ? <code>{profilesByEmp[e.id]}</code> : <Pill variant="light">unlinked</Pill>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ManualLink({ onSubmit, pending }) {
  const [userId, setUserId] = useState('');
  const [empId, setEmpId] = useState('');
  return (
    <div className="filter-grid">
      <div className="filter-cell">
        <label>auth.users.id (uuid)</label>
        <input className="btn-secondary" value={userId} onChange={e => setUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
      </div>
      <div className="filter-cell">
        <label>employees.id (uuid)</label>
        <input className="btn-secondary" value={empId} onChange={e => setEmpId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
      </div>
      <div className="filter-cell">
        <label>&nbsp;</label>
        <button className="btn-primary" disabled={pending || !userId || !empId}
          onClick={() => onSubmit({ user_id: userId, employee_id: empId })}>
          <Save size={14} /> Link
        </button>
      </div>
    </div>
  );
}

function OnboardingTab({ employees, profiles }) {
  const [copied, setCopied] = useState(null);
  const appUrl = window.location.origin;

  const profileByEmp = useMemo(
    () => (profiles.data || []).reduce((acc, p) => (p.employee_id ? { ...acc, [p.employee_id]: p.user_id } : acc), {}),
    [profiles.data],
  );

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const unlinked = (employees.data || []).filter(e => !profileByEmp[e.id] && e.email);

  return (
    <>
      <Card title="How team members sign in"
        subtitle="SuperSheldon CRM uses magic-link authentication — no passwords needed.">
        <ol style={{ paddingLeft: 20, lineHeight: 2, color: 'var(--text)' }}>
          <li>Share the app URL with the team member.</li>
          <li>They go to the URL and enter their <strong>work email</strong> (same email that's in Airtable).</li>
          <li>They receive a magic-link email — one click signs them in.</li>
          <li>Their account is automatically linked to their employee record (the <code>handle_new_user</code> trigger matches by email).</li>
          <li>If the email doesn't match, use the <strong>Auth ↔ Employee linkage</strong> tab to manually link them.</li>
        </ol>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <code style={{ background: 'var(--surface-2)', padding: '6px 12px', borderRadius: 6, fontSize: 13 }}>{appUrl}</code>
          <button className="btn-secondary" onClick={() => copy(appUrl, 'url')}>
            {copied === 'url' ? '✓ Copied' : 'Copy URL'}
          </button>
        </div>
      </Card>

      <Card title="Invite message templates" subtitle="Copy and send via WhatsApp or email">
        {[
          {
            key: 'wa',
            label: 'WhatsApp message',
            text: `Hi! 👋 You've been added to SuperSheldon CRM.\n\n🔗 App: ${appUrl}\n\nTo log in:\n1. Open the link above\n2. Enter your work email\n3. Click the magic link in your inbox\n\nYour account will be set up automatically. Let me know if you face any issues!`,
          },
          {
            key: 'email',
            label: 'Email subject + body',
            text: `Subject: Access to SuperSheldon CRM\n\nHi,\n\nYou now have access to the SuperSheldon CRM dashboard.\n\nApp URL: ${appUrl}\n\nTo sign in, visit the URL above and enter your work email address. You'll receive a sign-in link by email — no password required.\n\nIf your account isn't linked automatically, please contact the admin.\n\nThanks`,
          },
        ].map(({ key, label, text }) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>{label}</label>
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => copy(text, key)}>
                {copied === key ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
            <pre style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px', fontSize: 12,
              whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text)',
            }}>{text}</pre>
          </div>
        ))}
      </Card>

      {unlinked.length > 0 && (
        <Card title="Employees not yet signed in" subtitle="These employees have an email but no linked auth account yet">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Action</th></tr></thead>
            <tbody>
              {unlinked.map(e => (
                <tr key={e.id}>
                  <td>{e.full_name}</td>
                  <td>{e.email}</td>
                  <td><Pill variant="default">{e.app_role}</Pill></td>
                  <td>
                    <button className="btn-secondary" style={{ fontSize: 12 }}
                      onClick={() => copy(`Hi ${e.full_name?.split(' ')[0]}! Sign in to SuperSheldon CRM at ${appUrl} using your email: ${e.email}`, `emp-${e.id}`)}>
                      {copied === `emp-${e.id}` ? '✓ Copied' : 'Copy invite'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
