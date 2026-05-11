import { useEffect, useMemo, useState } from 'react';
import { Save, Plus, Trash2, RotateCcw, Beaker } from 'lucide-react';
import { Card, PageHeader, Pill, Loading, ErrorBox } from '../components/ui';
import { useIncentiveConfigs, useSaveIncentiveConfig } from '../hooks/useIncentiveConfig';
import {
  DEFAULT_PRESALES_CONFIG, DEFAULT_SALES_CONFIG, DEFAULT_AR_CONFIG,
  computePresalesIncentive, computeSalesIncentive,
} from '../lib/incentive';
import { formatMoney } from '../lib/currency';
import { supabaseReady } from '../lib/supabase';

const TEAMS = [
  { id: 'presales', label: 'Pre-sales', def: DEFAULT_PRESALES_CONFIG },
  { id: 'sales',    label: 'Sales',     def: DEFAULT_SALES_CONFIG },
  { id: 'ar',       label: 'AR',        def: DEFAULT_AR_CONFIG },
];

export default function IncentiveConfigPage() {
  const [team, setTeam] = useState('presales');
  const { configs, isLoading, error, raw } = useIncentiveConfigs();
  const save = useSaveIncentiveConfig();

  const teamMeta = TEAMS.find(t => t.id === team);
  const [draft, setDraft] = useState(configs[team]);

  useEffect(() => { setDraft(configs[team]); }, [team, configs]);

  const reset = () => setDraft(teamMeta.def);
  const saveCfg = () => save.mutate({ team, config: draft });

  const history = (raw || []).filter(r => r.team === team);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  return (
    <>
      <PageHeader title="Incentive Configuration" subtitle="Edit slabs, multipliers and thresholds. Saved versions are versioned by effective_from.">
        <select className="btn-secondary" value={team} onChange={e => setTeam(e.target.value)}>
          {TEAMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <button className="btn-secondary" onClick={reset}><RotateCcw size={14} /> Reset to defaults</button>
        <button className="btn-primary" disabled={save.isPending || !supabaseReady()} onClick={saveCfg}>
          <Save size={14} /> {save.isPending ? 'Saving…' : 'Save new version'}
        </button>
      </PageHeader>

      {!supabaseReady() && (
        <Card><p>⚠️ Supabase not configured. Edits won't persist.</p></Card>
      )}

      {team === 'presales' && draft && <PresalesEditor draft={draft} setDraft={setDraft} />}
      {(team === 'sales' || team === 'ar') && draft && <SalesEditor draft={draft} setDraft={setDraft} />}

      <SimulatorCard team={team} config={draft} />

      <Card title="History" subtitle="Saved configurations (most recent first)">
        <table className="data-table">
          <thead><tr><th>Effective From</th><th>Saved At</th><th>Snapshot</th></tr></thead>
          <tbody>
            {history.map(h => (
              <tr key={h.id}>
                <td>{h.effective_from}</td>
                <td>{new Date(h.created_at).toLocaleString()}</td>
                <td><code style={{ maxWidth: 600, display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {JSON.stringify(h.config).slice(0, 120)}…
                </code></td>
              </tr>
            ))}
            {!history.length && <tr><td colSpan={3} className="text-muted">No history yet — save your first version.</td></tr>}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function PresalesEditor({ draft, setDraft }) {
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setSlab = (i, k, v) => setDraft(d => ({
    ...d,
    conversionSlabs: d.conversionSlabs.map((s, idx) => idx === i ? { ...s, [k]: Number(v) } : s),
  }));
  const setAov = (i, k, v) => setDraft(d => ({
    ...d,
    aovMultipliers: d.aovMultipliers.map((s, idx) => idx === i ? { ...s, [k]: Number(v) } : s),
  }));
  const addSlab = () => setDraft(d => ({ ...d, conversionSlabs: [...d.conversionSlabs, { minPct: 0, maxPct: 100, perSale: 0 }] }));
  const addAov  = () => setDraft(d => ({ ...d, aovMultipliers: [...d.aovMultipliers, { minAov: 0, maxAov: 99999999, multiplier: 1 }] }));
  const delSlab = (i) => setDraft(d => ({ ...d, conversionSlabs: d.conversionSlabs.filter((_, idx) => idx !== i) }));
  const delAov  = (i) => setDraft(d => ({ ...d, aovMultipliers: d.aovMultipliers.filter((_, idx) => idx !== i) }));

  return (
    <>
      <Card title="Daily Demo Booking Target">
        <div className="filter-grid">
          <NumCell label="Daily target" value={draft.dailyDemoBookingTarget} onChange={v => set('dailyDemoBookingTarget', v)} />
          <NumCell label="Half-day threshold" value={draft.halfDayThreshold} step="0.05" onChange={v => set('halfDayThreshold', v)} />
          <NumCell label="Full-day threshold" value={draft.fullDayThreshold} step="0.05" onChange={v => set('fullDayThreshold', v)} />
        </div>
        <p className="text-muted">If <code>booked / target</code> &lt; half-day → LOP; between thresholds → HALF; ≥ full-day → P.</p>
      </Card>

      <Card title="Conversion % → Per-sale Incentive (₹)" subtitle="If conversion < 20% → ₹0. Slabs are inclusive of minPct, exclusive of maxPct."
        actions={<button className="btn-secondary" onClick={addSlab}><Plus size={14} /> Add slab</button>}>
        <table className="data-table">
          <thead><tr><th>Min %</th><th>Max %</th><th>Per Sale (₹)</th><th></th></tr></thead>
          <tbody>
            {draft.conversionSlabs.map((s, i) => (
              <tr key={i}>
                <td><InputNum value={s.minPct} onChange={v => setSlab(i, 'minPct', v)} /></td>
                <td><InputNum value={s.maxPct} onChange={v => setSlab(i, 'maxPct', v)} /></td>
                <td><InputNum value={s.perSale} onChange={v => setSlab(i, 'perSale', v)} /></td>
                <td><button className="btn-secondary" onClick={() => delSlab(i)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="AOV Multiplier" subtitle="Final incentive = base × multiplier. Tier picked by AOV (revenue / sales closed)."
        actions={<button className="btn-secondary" onClick={addAov}><Plus size={14} /> Add tier</button>}>
        <table className="data-table">
          <thead><tr><th>Min AOV (₹)</th><th>Max AOV (₹)</th><th>Multiplier</th><th></th></tr></thead>
          <tbody>
            {draft.aovMultipliers.map((s, i) => (
              <tr key={i}>
                <td><InputNum value={s.minAov} onChange={v => setAov(i, 'minAov', v)} /></td>
                <td><InputNum value={s.maxAov} onChange={v => setAov(i, 'maxAov', v)} /></td>
                <td><InputNum value={s.multiplier} step="0.05" onChange={v => setAov(i, 'multiplier', v)} /></td>
                <td><button className="btn-secondary" onClick={() => delAov(i)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function SalesEditor({ draft, setDraft }) {
  const set = (k, v) => setDraft(d => ({ ...d, [k]: Number(v) }));
  const setMul = (i, k, v) => setDraft(d => ({
    ...d,
    achievementMultipliers: d.achievementMultipliers.map((s, idx) => idx === i ? { ...s, [k]: Number(v) } : s),
  }));
  const add = () => setDraft(d => ({ ...d, achievementMultipliers: [...d.achievementMultipliers, { minPct: 0, maxPct: 100, multiplier: 0 }] }));
  const del = (i) => setDraft(d => ({ ...d, achievementMultipliers: d.achievementMultipliers.filter((_, idx) => idx !== i) }));

  return (
    <>
      <Card title="Eligibility Floors">
        <div className="filter-grid">
          <NumCell label="Minimum CPC (₹)" value={draft.minCpc} onChange={v => set('minCpc', v)} />
          <NumCell label="Minimum classes / sale" value={draft.minClassesPerSale} onChange={v => set('minClassesPerSale', v)} />
          <NumCell label="Incentive rate" value={draft.incentiveRate} step="0.05" onChange={v => set('incentiveRate', v)} />
        </div>
        <p className="text-muted">Sale earns ₹0 if either floor is breached. Per-sale formula: <code>(CPC_sold − CPC_set) × classes × rate</code>.</p>
      </Card>

      <Card title="Achievement Multiplier" subtitle="Multiplier applied on cumulative incentive based on % of monthly target hit."
        actions={<button className="btn-secondary" onClick={add}><Plus size={14} /> Add tier</button>}>
        <table className="data-table">
          <thead><tr><th>Min %</th><th>Max %</th><th>Multiplier</th><th></th></tr></thead>
          <tbody>
            {draft.achievementMultipliers.map((s, i) => (
              <tr key={i}>
                <td><InputNum value={s.minPct} onChange={v => setMul(i, 'minPct', v)} /></td>
                <td><InputNum value={s.maxPct} onChange={v => setMul(i, 'maxPct', v)} /></td>
                <td><InputNum value={s.multiplier} step="0.05" onChange={v => setMul(i, 'multiplier', v)} /></td>
                <td><button className="btn-secondary" onClick={() => del(i)}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function SimulatorCard({ team, config }) {
  const [s, setS] = useState({
    demosBooked: 60, demosCompleted: 50, salesClosed: 12, totalRevenueInr: 240000,
    monthlyTargetInr: 300000, sales: [
      { cpcSold: 1200, classesSold: 10, amount: 12000 },
      { cpcSold: 800,  classesSold: 8,  amount:  6400 },
      { cpcSold: 1500, classesSold: 12, amount: 18000 },
    ],
    achievedRevenueInr: 240000,
  });

  const result = useMemo(() => {
    if (team === 'presales') return computePresalesIncentive({ ...s, config });
    return computeSalesIncentive({ ...s, config });
  }, [s, team, config]);

  return (
    <Card title="Live Simulator" subtitle="Verify the slabs by trying scenarios"
      actions={<Pill variant="default"><Beaker size={12} /> Sandbox</Pill>}>
      {team === 'presales' ? (
        <div className="filter-grid">
          <NumCell label="Demos booked" value={s.demosBooked} onChange={v => setS({ ...s, demosBooked: v })} />
          <NumCell label="Demos completed" value={s.demosCompleted} onChange={v => setS({ ...s, demosCompleted: v })} />
          <NumCell label="Sales closed" value={s.salesClosed} onChange={v => setS({ ...s, salesClosed: v })} />
          <NumCell label="Total revenue (₹)" value={s.totalRevenueInr} onChange={v => setS({ ...s, totalRevenueInr: v, achievedRevenueInr: v })} />
        </div>
      ) : (
        <>
          <div className="filter-grid">
            <NumCell label="Monthly target (₹)" value={s.monthlyTargetInr} onChange={v => setS({ ...s, monthlyTargetInr: v })} />
            <NumCell label="Achieved revenue (₹)" value={s.achievedRevenueInr} onChange={v => setS({ ...s, achievedRevenueInr: v })} />
          </div>
          <p className="text-muted">Sample sales used: 3 records (CPC ₹1200/₹800/₹1500 with 10/8/12 classes). Edit defaults via JSON if needed.</p>
        </>
      )}

      <div className="kpi-grid" style={{ marginTop: 16 }}>
        {team === 'presales' ? (
          <>
            <Card title="Conversion %"><h2>{result.conversionPct}%</h2></Card>
            <Card title="AOV"><h2>{formatMoney(result.aov)}</h2></Card>
            <Card title="Per-sale slab"><h2>₹{result.slabPerSale}</h2></Card>
            <Card title="AOV ×"><h2>×{result.aovMultiplier}</h2></Card>
            <Card title="Final"><h2>{formatMoney(result.finalIncentive)}</h2></Card>
          </>
        ) : (
          <>
            <Card title="Achievement"><h2>{result.achievementPct}%</h2></Card>
            <Card title="Achievement ×"><h2>×{result.achievementMultiplier}</h2></Card>
            <Card title="Base"><h2>{formatMoney(result.baseIncentive)}</h2></Card>
            <Card title="Final"><h2>{formatMoney(result.finalIncentive)}</h2></Card>
          </>
        )}
      </div>
    </Card>
  );
}

function NumCell({ label, value, onChange, step = '1' }) {
  return (
    <div className="filter-cell">
      <label>{label}</label>
      <input type="number" step={step} className="btn-secondary"
        value={value ?? ''} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}
function InputNum({ value, onChange, step = '1' }) {
  return <input type="number" step={step} className="btn-secondary" style={{ width: 110 }}
    value={value ?? ''} onChange={e => onChange(Number(e.target.value))} />;
}
