// Currency helpers. Live FX from open.er-api.com (free, no auth).
// Falls back to hardcoded rates if the API is unreachable.

const FALLBACK_RATES_USD = {
  USD: 1, INR: 83, EUR: 0.92, GBP: 0.79, AUD: 1.52, CAD: 1.37, NZD: 1.65,
};

const FX_URL = import.meta.env.VITE_FX_API_URL || 'https://open.er-api.com/v6/latest/USD';

let cachedRates = null;
let cachedAt = 0;
const TTL = 60 * 60 * 1000; // 1 hour

export async function getRates() {
  if (cachedRates && Date.now() - cachedAt < TTL) return cachedRates;
  try {
    const res = await fetch(FX_URL);
    const json = await res.json();
    if (json && json.rates) {
      cachedRates = json.rates;
      cachedAt = Date.now();
      return cachedRates;
    }
  } catch {
    // fall through
  }
  cachedRates = FALLBACK_RATES_USD;
  cachedAt = Date.now();
  return cachedRates;
}

export async function convert(amount, from, to) {
  if (!amount) return 0;
  if (from === to) return Number(amount);
  const rates = await getRates();
  const usd = Number(amount) / (rates[from] ?? 1);
  return usd * (rates[to] ?? 1);
}

export function currencyFromLabel(label) {
  if (!label) return null;
  const m = label.match(/\(([A-Z]{3})\)/);
  return m ? m[1] : null;
}

export function formatMoney(amount, code = 'INR') {
  if (amount == null || isNaN(amount)) return '—';
  const n = Number(amount);
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${code} ${n.toLocaleString('en-IN')}`;
  }
}
