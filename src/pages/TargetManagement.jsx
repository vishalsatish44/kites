import { useMemo, useState } from 'react';
import { useEmployees } from '../hooks/useAirtable';
import {
  useRegions, useRegionTargets, useIndividualTargets, useUpsert,
} from '../hooks/useSupabaseData';
import { Card, Loading, ErrorBox, PageHeader, Pill } from '../components/ui';
import { dayjs } from '../lib/dates';
import { formatMoney } from '../lib/currency';
import { ROLE_FROM_DEPARTMENT, APP_ROLES } from '../lib/schema';
import { supabaseReady } from '../lib/supabase';
import { Save, Layers, User } from 'lucide-react';

const TEAMS = [
  { id: 'sales', label: 'Sales' },
  { id: 'presales', label: 'Pre-sales' },
  { id: 'ar', label: 'AR' },
];

export default function TargetManagement() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const period = month + '-01';
  const [team, setTeam] = useState('sales');

  const employees = useEmployees();
  const regions = useRegions();
  const regionTargets = useRegionTargets(period);
  const indTargets = useIndividualTargets(period);

  const upsertRegion = useUpsert('region_targets', 'region_id,team,period_month');
  const upsertIndividual = useUpsert('individual_targets', 'employee_id,period_month');

  const [regionEdits, setRegionEdits] = useState({});
  const [indEdits, setIndEdits] = useState({});

  const teamRoleNeeded = team === 'sales' ? APP_ROLES.SALES : team === 'presales' ? APP_ROLES.PRESALES : APP_ROLES.AR;
  const teamEmployees = useMemo(() => {
    return (employees.data || []).filter(e => ROLE_FROM_DEPARTMENT[e.department] === teamRoleNeeded);
  }, [employees.data, teamRoleNeeded]);

  if (employees.isLoading) return <Loading />;
  if (employees.error) return <ErrorBox error={employees.error} />;

  const regionTargetMap = Object.fromEntries(
    (regionTargets.data || []).filter(t => t.team === team).map(t => [t.region_id, t]),
  );
  const indTargetMap = Object.fromEntries((indTargets.data || []).map(t => [t.employee_id, t]));

  const saveRegion = async (regionId, values) => {
    await upsertRegion.mutateAsync([{
      region_id: regionId, team, period_month: period,
      ...values,
    }]);
  };
  const saveIndividual = async (empId, values) => {
    await upsertIndividual.mutateAsync([{
      employee_id: empId, period_month: period,
      ...values,
    }]);
  };

  const distribute = () => {
    // Naive distribution: split region target equally across team members
    const updates = [];
    teamEmployees.forEach(emp => {
      // If employee has a region link in mirror, use that; otherwise default
      const empRegionId = emp.regionId || (regions.data?.[0]?.id);
      const rt = regionTargetMap[empRegionId];
      if (!rt) return;
      const share = rt.monthly_revenue_target / Math.max(teamEmployees.length, 1);
      updates.push({
        employee_id: emp.id,
        period_month: period,
        monthly_revenue_target: share,
        monthly_demo_target: rt.monthly_demo_target,
        daily_demo_target: rt.daily_demo_target,
        min_aov: rt.min_aov,
        min_cpc: rt.min_cpc,
      });
    });
    if (updates.length) upsertIndividual.mutate(updates);
  };

  return (
    <>
      <PageHeader title="Target Management" subtitle="Region → Team → Individual cascade">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="btn-secondary" />
        <select className="btn-secondary" value={team} onChange={e => setTeam(e.target.value)}>
          {TEAMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </PageHeader>

      {!supabaseReady() && (
        <Card>
          <p>⚠️ Supabase is not configured yet. Targets entered here will not persist.</p>
          <p className="text-muted">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code>, then run <code>supabase/migrations/0001_init.sql</code>.</p>
        </Card>
      )}

      <Card title="Step 1 — Region Targets" subtitle={`Set ${TEAMS.find(t => t.id === team).label} team monthly targets per region`}
        actions={<Pill variant="default"><Layers size={12} /> Region level</Pill>}>
        <table className="data-table">
          <thead><tr>
            <th>Region</th><th>Monthly Revenue Target (₹)</th><th>Monthly Demos</th>
            <th>Daily Demo Target</th><th>Min AOV</th><th>Min CPC</th><th></th>
          </tr></thead>
          <tbody>
            {(regions.data || []).map(r => {
              const t = regionTargetMap[r.id] || {};
              const e = regionEdits[r.id] || {};
              const get = (k, def) => e[k] ?? t[k] ?? def;
              return (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  {['monthly_revenue_target', 'monthly_demo_target', 'daily_demo_target', 'min_aov', 'min_cpc'].map(k => (
                    <td key={k}>
                      <input className="btn-secondary" type="number"
                        value={get(k, 0)}
                        onChange={ev => setRegionEdits(re => ({
                          ...re, [r.id]: { ...re[r.id], [k]: Number(ev.target.value) },
                        }))} />
                    </td>
                  ))}
                  <td>
                    <button className="btn-primary" onClick={() => saveRegion(r.id, regionEdits[r.id] || {})}>
                      <Save size={14} /> Save
                    </button>
                  </td>
                </tr>
              );
            })}
            {!regions.data?.length && <tr><td colSpan={7}>No regions defined yet. Run migrations to seed.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title="Step 2 — Distribute" subtitle="Auto-split region target across team members"
        actions={<button className="btn-primary" onClick={distribute}>Distribute equally</button>}
      />

      <Card title="Step 3 — Individual Targets"
        actions={<Pill variant="default"><User size={12} /> Individual level</Pill>}>
        <table className="data-table">
          <thead><tr>
            <th>Employee</th><th>Department</th>
            <th>Weekly</th><th>Monthly</th><th>Revenue (₹)</th>
            <th>Monthly Demos</th><th>Daily Demos</th><th>Min AOV</th><th>Min CPC</th><th></th>
          </tr></thead>
          <tbody>
            {teamEmployees.map(emp => {
              const t = indTargetMap[emp.id] || {};
              const e = indEdits[emp.id] || {};
              const get = (k, def) => e[k] ?? t[k] ?? def;
              return (
                <tr key={emp.id}>
                  <td>{emp.fullName}</td>
                  <td>{emp.department}</td>
                  {['weekly_target', 'monthly_target', 'monthly_revenue_target', 'monthly_demo_target', 'daily_demo_target', 'min_aov', 'min_cpc'].map(k => (
                    <td key={k}>
                      <input className="btn-secondary" type="number" style={{ width: 90 }}
                        value={get(k, 0)}
                        onChange={ev => setIndEdits(re => ({
                          ...re, [emp.id]: { ...re[emp.id], [k]: Number(ev.target.value) },
                        }))} />
                    </td>
                  ))}
                  <td>
                    <button className="btn-primary" onClick={() => saveIndividual(emp.id, indEdits[emp.id] || {})}>
                      <Save size={14} /> Save
                    </button>
                  </td>
                </tr>
              );
            })}
            {!teamEmployees.length && <tr><td colSpan={10}>No employees mapped to {TEAMS.find(t => t.id === team).label} in Airtable.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}
