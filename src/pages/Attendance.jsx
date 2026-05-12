import { useMemo, useState } from 'react';
import { useEmployees, useDemoBookings } from '../hooks/useAirtable';
import { useAttendance, useEmployeesMirror, useUpsert, useIndividualTargets } from '../hooks/useSupabaseData';
import { Card, Loading, ErrorBox, PageHeader, Pill } from '../components/ui';
import { dayjs } from '../lib/dates';
import { ROLE_FROM_DEPARTMENT, APP_ROLES } from '../lib/schema';
import { evaluateDailyDemoTarget } from '../lib/incentive';
import { useIncentiveConfigs } from '../hooks/useIncentiveConfig';
import { matchAgent } from '../lib/nameMatch';
import { supabaseReady } from '../lib/supabase';
import { Save, Wand2 } from 'lucide-react';

const STATUSES = ['P', 'HALF', 'A', 'L', 'LOP', 'WO', 'HOL'];

export default function Attendance() {
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const monthDate = dayjs(month + '-01');
  const days = monthDate.daysInMonth();

  const employees = useEmployees();
  const supEmployees = useEmployeesMirror();
  const bookings = useDemoBookings();
  const attendance = useAttendance(month);
  const targets = useIndividualTargets(month + '-01');
  const { configs } = useIncentiveConfigs();
  const upsertAttendance = useUpsert('attendance', 'employee_id,date');

  // Map Airtable record ID → Supabase employees.id (UUID)
  // attendance and individual_targets reference employees.id (UUID), not the Airtable ID
  const airIdToSupaId = useMemo(() => {
    const map = {};
    (supEmployees.data || []).forEach(e => {
      if (e.airtable_id) map[e.airtable_id] = e.id;
    });
    return map;
  }, [supEmployees.data]);

  const teamRoles = [APP_ROLES.SALES, APP_ROLES.PRESALES, APP_ROLES.AR];
  const teamEmployees = (employees.data || []).filter(e => teamRoles.includes(ROLE_FROM_DEPARTMENT[e.department]));

  // targets keyed by Supabase UUID — convert emp.id (Airtable) via airIdToSupaId
  const targetsByEmp = Object.fromEntries((targets.data || []).map(t => [t.employee_id, t]));
  const attendanceMap = useMemo(() => {
    const map = {};
    (attendance.data || []).forEach(a => {
      map[`${a.employee_id}|${a.date}`] = a;
    });
    return map;
  }, [attendance.data]);

  // Pre-sales: count demos booked per (agent_name_as_appearing_in_airtable, date)
  const demosByAirtableAgentDay = useMemo(() => {
    const out = {};
    (bookings.data || []).forEach(b => {
      const d = b.formFillingDate || b.formFillingTime;
      if (!d || dayjs(d).format('YYYY-MM') !== month) return;
      const key = `${b.presalesAgent || ''}|${dayjs(d).format('YYYY-MM-DD')}`;
      out[key] = (out[key] || 0) + 1;
    });
    return out;
  }, [bookings.data, month]);

  // For an employee on a date, sum demos across ALL agent names that match them.
  const countDemosFor = (emp, date) => {
    let total = 0;
    Object.entries(demosByAirtableAgentDay).forEach(([k, v]) => {
      const [agentName, d] = k.split('|');
      if (d !== date) return;
      if (matchAgent(emp.fullName, agentName)) total += v;
    });
    return total;
  };

  if (employees.isLoading) return <Loading />;
  if (employees.error) return <ErrorBox error={employees.error} />;

  const setStatus = (supaId, date, status, autoFlagged = false, reason = null) => {
    if (!supaId) return;
    upsertAttendance.mutate([{ employee_id: supaId, date, status, auto_flagged: autoFlagged, reason }]);
  };

  const autoFlagPresales = () => {
    const updates = [];
    teamEmployees.filter(e => ROLE_FROM_DEPARTMENT[e.department] === APP_ROLES.PRESALES).forEach(emp => {
      const supaId = airIdToSupaId[emp.id];
      if (!supaId) return;
      const t = targetsByEmp[supaId];
      const dailyTarget = t?.daily_demo_target || configs.presales.dailyDemoBookingTarget;
      for (let d = 1; d <= days; d++) {
        const date = monthDate.date(d).format('YYYY-MM-DD');
        if (dayjs(date).isAfter(dayjs(), 'day')) continue;
        const booked = countDemosFor(emp, date);
        const ev = evaluateDailyDemoTarget({ bookedToday: booked, config: { ...configs.presales, dailyDemoBookingTarget: dailyTarget } });
        if (ev.suggestedAttendance !== 'P') {
          updates.push({
            employee_id: supaId, date, status: ev.suggestedAttendance,
            auto_flagged: true, reason: `Booked ${booked}/${dailyTarget} demos`,
          });
        }
      }
    });
    if (updates.length) upsertAttendance.mutate(updates);
  };

  return (
    <>
      <PageHeader title="Attendance" subtitle="Daily attendance with LOP/half-day auto-flagging from missed demo targets">
        <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="btn-secondary" />
        <button className="btn-primary" onClick={autoFlagPresales}><Wand2 size={14} /> Auto-flag pre-sales</button>
      </PageHeader>

      {!supabaseReady() && (
        <Card>
          <p>⚠️ Supabase isn't configured. Attendance edits won't persist until credentials are added to <code>.env</code>.</p>
        </Card>
      )}

      <Card title={`${monthDate.format('MMMM YYYY')} — ${teamEmployees.length} employees`}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table attendance-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Dept</th>
                {Array.from({ length: days }, (_, i) => i + 1).map(d => (
                  <th key={d}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamEmployees.map(emp => {
                const supaId = airIdToSupaId[emp.id];
                return (
                  <tr key={emp.id}>
                    <td>
                      {emp.fullName}
                      {!supaId && <span style={{ color: 'var(--danger)', fontSize: 10, marginLeft: 4 }}>⚠ unlinked</span>}
                    </td>
                    <td>{emp.department}</td>
                    {Array.from({ length: days }, (_, i) => i + 1).map(d => {
                      const date = monthDate.date(d).format('YYYY-MM-DD');
                      const cell = supaId ? attendanceMap[`${supaId}|${date}`] : null;
                      const variant = cell ? variantOf(cell.status) : 'light';
                      return (
                        <td key={d} className="attendance-cell">
                          <select
                            value={cell?.status || ''}
                            onChange={e => setStatus(supaId, date, e.target.value)}
                            className={`attend-select ${variant}`}
                            title={cell?.reason || ''}
                            disabled={!supaId}
                          >
                            <option value="">—</option>
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!teamEmployees.length && <tr><td colSpan={days + 2}>No employees in Sales/Pre-sales/AR.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Legend">
        <p>
          <Pill variant="success">P</Pill> Present ·{' '}
          <Pill variant="warning">HALF</Pill> Half-day ·{' '}
          <Pill variant="danger">A</Pill> Absent ·{' '}
          <Pill variant="danger">LOP</Pill> Loss of Pay ·{' '}
          <Pill variant="default">L</Pill> Leave ·{' '}
          <Pill variant="light">WO</Pill> Week off ·{' '}
          <Pill variant="light">HOL</Pill> Holiday
        </p>
        <p className="text-muted">Auto-flag rule (Pre-sales): if day's demo bookings &lt; 50% of daily target → LOP candidate; 50–75% → HALF; ≥75% → P.</p>
      </Card>
    </>
  );
}

function variantOf(s) {
  switch (s) {
    case 'P': return 'success';
    case 'HALF': return 'warning';
    case 'A':
    case 'LOP': return 'danger';
    case 'L': return 'default';
    default: return 'light';
  }
}
