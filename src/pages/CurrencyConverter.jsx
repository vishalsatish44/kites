import { useEffect, useState } from 'react';
import { Card, PageHeader, Pill, Loading, ProgressBar } from '../components/ui';
import { CURRENCY_OPTIONS } from '../lib/schema';
import { getRates, convert, formatMoney } from '../lib/currency';
import { computeSalesIncentive, computePresalesIncentive } from '../lib/incentive';

const COMMON = ['USD', 'AUD', 'GBP', 'INR', 'EUR', 'CAD', 'NZD'];

export default function CurrencyConverter() {
  const [rates, setRates] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState('INR');
  const [amount, setAmount] = useState(100);
  const [converted, setConverted] = useState(0);

  useEffect(() => {
    getRates().then(r => { setRates(r); setUpdatedAt(new Date()); });
  }, []);

  useEffect(() => {
    convert(amount, from, to).then(setConverted);
  }, [amount, from, to]);

  // Sales incentive calculator
  const [perClass, setPerClass] = useState(20);
  const [classes, setClasses] = useState(40);
  const [pcCurrency, setPcCurrency] = useState('USD');
  const [monthlyTarget, setMonthlyTarget] = useState(1500000);
  const [pcRevenueInr, setPcRevenueInr] = useState(0);
  useEffect(() => {
    convert(perClass * classes, pcCurrency, 'INR').then(setPcRevenueInr);
  }, [perClass, classes, pcCurrency]);

  const inc = computeSalesIncentive({
    sales: [{ cpcSold: pcRevenueInr / Math.max(classes, 1), classesSold: classes, amount: pcRevenueInr }],
    monthlyTargetInr: monthlyTarget,
    achievedRevenueInr: pcRevenueInr,
  });

  // Presales incentive calculator
  const [psdemos, setPsdemoes] = useState(30);
  const [psClosed, setPsClosed] = useState(8);
  const [psAov, setPsAov] = useState(20000);
  const psInc = computePresalesIncentive({
    demosBooked: psdemos,
    demosCompleted: psdemos,
    salesClosed: psClosed,
    totalRevenueInr: psClosed * psAov,
  });

  return (
    <>
      <PageHeader title="Currency Converter & Incentive Calculator" subtitle={updatedAt ? `Live FX, last updated ${updatedAt.toLocaleString()}` : 'Loading FX…'} />

      {!rates && <Loading />}

      {rates && (
        <>
          <div className="dual-grid">
            <Card title="Convert">
              <div className="filter-grid">
                <div className="filter-cell">
                  <label>Amount</label>
                  <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="btn-secondary" />
                </div>
                <div className="filter-cell">
                  <label>From</label>
                  <select className="btn-secondary" value={from} onChange={e => setFrom(e.target.value)}>
                    {COMMON.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="filter-cell">
                  <label>To</label>
                  <select className="btn-secondary" value={to} onChange={e => setTo(e.target.value)}>
                    {COMMON.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <h2 style={{ marginTop: 16 }}>{formatMoney(converted, to)}</h2>
              <p className="text-muted">
                {amount} {from} = {converted.toFixed(2)} {to} · 1 {from} = {(converted / (amount || 1)).toFixed(4)} {to}
              </p>
            </Card>

            <Card title="Reference Rates" subtitle="vs USD (live)">
              <table className="data-table">
                <thead><tr><th>Currency</th><th>Per 1 USD</th><th>Per 1 INR</th></tr></thead>
                <tbody>
                  {COMMON.map(c => (
                    <tr key={c}>
                      <td>{c}</td>
                      <td>{(rates[c] || 0).toFixed(4)}</td>
                      <td>{((rates[c] || 0) / (rates.INR || 1)).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>

          <Card title="Sales Incentive Calculator" subtitle="Enter one sale to see eligibility and incentive">
            <div className="filter-grid">
              <div className="filter-cell">
                <label>Per Class Charge</label>
                <input type="number" value={perClass} onChange={e => setPerClass(Number(e.target.value))} className="btn-secondary" />
              </div>
              <div className="filter-cell">
                <label>Currency</label>
                <select className="btn-secondary" value={pcCurrency} onChange={e => setPcCurrency(e.target.value)}>
                  {COMMON.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="filter-cell">
                <label>Sessions Sold</label>
                <input type="number" value={classes} onChange={e => setClasses(Number(e.target.value))} className="btn-secondary" />
              </div>
              <div className="filter-cell">
                <label>Monthly Target (₹)</label>
                <input type="number" value={monthlyTarget} onChange={e => setMonthlyTarget(Number(e.target.value))} className="btn-secondary" />
              </div>
            </div>
            <div className="kpi-grid" style={{ marginTop: 16 }}>
              <Card title={`Revenue (${pcCurrency})`}><h2>{formatMoney(perClass * classes, pcCurrency)}</h2></Card>
              <Card title="Revenue (INR)"><h2>{formatMoney(pcRevenueInr)}</h2></Card>
              <Card title="Achievement vs Target">
                <h2>{inc.achievementPct.toFixed(1)}%</h2>
                <ProgressBar value={pcRevenueInr} max={monthlyTarget}
                  color={inc.achievementPct >= 100 ? '#22c55e' : inc.achievementPct >= 70 ? '#f59e0b' : '#ef4444'} />
              </Card>
              <Card title="Eligible Incentive">
                <h2 style={{ color: inc.finalIncentive > 0 ? '#22c55e' : '#ef4444' }}>{formatMoney(inc.finalIncentive)}</h2>
                <Pill variant={inc.perSale[0]?.eligible ? 'success' : 'danger'}>
                  {inc.perSale[0]?.eligible ? 'Above CPC floor' : 'Below CPC floor'}
                </Pill>
              </Card>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>CPC floor: ₹{inc.cpcFloor}</span>
              <span>CPC sold: ₹{Math.round(pcRevenueInr / Math.max(classes, 1))}</span>
              <span>Base incentive: ₹{inc.baseIncentive.toLocaleString()}</span>
              <span>Achievement multiplier: {(inc.achievementMultiplier * 100).toFixed(0)}%</span>
            </div>
          </Card>

          <Card title="Pre-sales Incentive Calculator" subtitle="Conversion % × AOV → incentive slab">
            <div className="filter-grid">
              <div className="filter-cell">
                <label>Demos Booked</label>
                <input type="number" value={psdemos} onChange={e => setPsdemoes(Number(e.target.value))} className="btn-secondary" />
              </div>
              <div className="filter-cell">
                <label>Sales Closed</label>
                <input type="number" value={psClosed} onChange={e => setPsClosed(Number(e.target.value))} className="btn-secondary" />
              </div>
              <div className="filter-cell">
                <label>Avg Order Value (₹)</label>
                <input type="number" value={psAov} onChange={e => setPsAov(Number(e.target.value))} className="btn-secondary" />
              </div>
            </div>
            <div className="kpi-grid" style={{ marginTop: 16 }}>
              <Card title="Conversion %">
                <h2>{psInc.conversionPct.toFixed(1)}%</h2>
                <Pill variant={psInc.conversionPct >= 26 ? 'success' : psInc.conversionPct >= 20 ? 'warning' : 'danger'}>
                  {psInc.conversionPct >= 26 ? 'High' : psInc.conversionPct >= 20 ? 'Mid' : 'Low'}
                </Pill>
              </Card>
              <Card title="AOV">
                <h2>{formatMoney(psInc.aov)}</h2>
                <span className="text-muted" style={{ fontSize: 12 }}>AOV multiplier: {(psInc.aovMultiplier * 100).toFixed(0)}%</span>
              </Card>
              <Card title="Base Incentive">
                <h2>{formatMoney(psInc.baseIncentive)}</h2>
                <span className="text-muted" style={{ fontSize: 12 }}>₹{psInc.slabPerSale}/sale × {psClosed} closed</span>
              </Card>
              <Card title="Final Incentive">
                <h2 style={{ color: psInc.finalIncentive > 0 ? '#22c55e' : '#ef4444' }}>{formatMoney(psInc.finalIncentive)}</h2>
                <span className="text-muted" style={{ fontSize: 12 }}>after AOV multiplier</span>
              </Card>
            </div>
          </Card>

          <Card title="Sample Currency × Sessions Table">
            <table className="data-table">
              <thead><tr><th>Currency</th><th>Per Class</th><th>Sessions</th><th>Revenue (currency)</th><th>Revenue (INR)</th></tr></thead>
              <tbody>
                {[
                  { c: 'USD', pc: 20, n: 100 },
                  { c: 'AUD', pc: 28, n: 80 },
                  { c: 'GBP', pc: 18, n: 65 },
                  { c: 'INR', pc: 1500, n: 120 },
                ].map(row => {
                  const revLocal = row.pc * row.n;
                  const revInr = revLocal * ((rates.INR || 83) / (rates[row.c] || 1));
                  return (
                    <tr key={row.c}>
                      <td>{row.c}</td>
                      <td>{formatMoney(row.pc, row.c)}</td>
                      <td>{row.n}</td>
                      <td>{formatMoney(revLocal, row.c)}</td>
                      <td>{formatMoney(revInr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
