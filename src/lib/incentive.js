// Pure-JS incentive calculator. Tested deterministically — every input is a
// number/string, every output is a number/object, no I/O.
//
// All slabs are CONFIGURABLE (loaded from Supabase incentive_config). The
// defaults here come straight from the WBR requirements doc and the iteration
// notes the user shared on 2026-05-10.

export const DEFAULT_PRESALES_CONFIG = {
  // Daily demo booking target — if missed, attendance can be marked as LOP/half-day.
  dailyDemoBookingTarget: 4,
  halfDayThreshold: 0.5,   // <50% of daily target -> eligible for LOP
  fullDayThreshold: 0.75,  // 50%-75% -> half-day candidate

  // Conversion% slabs (demos -> sales) -> incentive AMOUNT per sale (INR)
  // Any conversion < 20% pays nothing.
  conversionSlabs: [
    { minPct: 0,  maxPct: 20, perSale: 0 },
    { minPct: 20, maxPct: 26, perSale: 300 },
    { minPct: 26, maxPct: 32, perSale: 500 },
    { minPct: 32, maxPct: 40, perSale: 700 },
    { minPct: 40, maxPct: 100, perSale: 1000 },
  ],

  // AOV multiplier — applied on top of base incentive.
  aovMultipliers: [
    { minAov: 0,     maxAov: 12000, multiplier: 0.30 },
    { minAov: 12000, maxAov: 18000, multiplier: 0.60 },
    { minAov: 18000, maxAov: 25000, multiplier: 0.85 },
    { minAov: 25000, maxAov: Infinity, multiplier: 1.00 },
  ],
};

export const DEFAULT_SALES_CONFIG = {
  // Below this CPC the sale earns ZERO regardless of amount.
  minCpc: 600,
  // Below this number of classes the sale earns ZERO.
  minClassesPerSale: 4,

  // Achievement multiplier on cumulative incentive.
  achievementMultipliers: [
    { minPct: 0,  maxPct: 70, multiplier: 0 },
    { minPct: 70, maxPct: 80, multiplier: 0.20 },
    { minPct: 80, maxPct: 90, multiplier: 0.50 },
    { minPct: 90, maxPct: 100, multiplier: 0.80 },
    { minPct: 100, maxPct: Infinity, multiplier: 1.0 },
  ],

  // (CPC_sold - CPC_set) * total_classes_sold * incentiveRate
  incentiveRate: 0.50,
};

// AR uses Sales-style logic by default — AR mgr can override per-row in Supabase.
export const DEFAULT_AR_CONFIG = { ...DEFAULT_SALES_CONFIG };

// ---------- Pre-sales ----------
export function computePresalesIncentive({
  demosBooked = 0,
  demosCompleted = 0,
  salesClosed = 0,
  totalRevenueInr = 0,
  config = DEFAULT_PRESALES_CONFIG,
}) {
  const conversionPct = demosCompleted > 0 ? (salesClosed / demosCompleted) * 100 : 0;
  const aov = salesClosed > 0 ? totalRevenueInr / salesClosed : 0;

  const slab = config.conversionSlabs.find(
    s => conversionPct >= s.minPct && conversionPct < s.maxPct,
  ) || config.conversionSlabs[config.conversionSlabs.length - 1];
  const baseIncentive = (slab?.perSale || 0) * salesClosed;

  const aovTier = config.aovMultipliers.find(
    m => aov >= m.minAov && aov < m.maxAov,
  ) || config.aovMultipliers[0];
  const finalIncentive = baseIncentive * (aovTier?.multiplier || 0);

  return {
    demosBooked,
    demosCompleted,
    salesClosed,
    totalRevenueInr,
    conversionPct: Number(conversionPct.toFixed(2)),
    aov: Number(aov.toFixed(2)),
    slabPerSale: slab?.perSale || 0,
    baseIncentive,
    aovMultiplier: aovTier?.multiplier || 0,
    finalIncentive: Math.round(finalIncentive),
  };
}

export function evaluateDailyDemoTarget({
  bookedToday = 0,
  config = DEFAULT_PRESALES_CONFIG,
}) {
  const target = config.dailyDemoBookingTarget;
  const ratio = target > 0 ? bookedToday / target : 1;
  if (ratio >= 1) return { suggestedAttendance: 'P', ratio, target, booked: bookedToday };
  if (ratio >= config.fullDayThreshold) return { suggestedAttendance: 'P', ratio, target, booked: bookedToday };
  if (ratio >= config.halfDayThreshold) return { suggestedAttendance: 'HALF', ratio, target, booked: bookedToday };
  return { suggestedAttendance: 'LOP', ratio, target, booked: bookedToday };
}

// ---------- Sales (and AR) ----------
// `sales` is an array of { cpcSold, classesSold, amount } records for a person/period.
// CPC is per-class charge in the customer's NORMALISED currency (INR).
export function computeSalesIncentive({
  sales = [],
  monthlyTargetInr = 0,
  cpcSet,
  achievedRevenueInr = null,
  config = DEFAULT_SALES_CONFIG,
}) {
  const cpcFloor = cpcSet ?? config.minCpc;

  const perSale = sales.map(s => {
    const cpc = Number(s.cpcSold || 0);
    const classes = Number(s.classesSold || 0);
    const eligible = cpc >= cpcFloor && classes >= config.minClassesPerSale;
    const incentive = eligible
      ? (cpc - cpcFloor) * classes * config.incentiveRate
      : 0;
    return {
      ...s,
      eligible,
      incentive: Math.max(0, Math.round(incentive)),
    };
  });

  const baseIncentive = perSale.reduce((sum, s) => sum + s.incentive, 0);
  const revenue = achievedRevenueInr ?? sales.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  const achievementPct = monthlyTargetInr > 0 ? (revenue / monthlyTargetInr) * 100 : 0;

  const tier = config.achievementMultipliers.find(
    m => achievementPct >= m.minPct && achievementPct < m.maxPct,
  ) || config.achievementMultipliers[config.achievementMultipliers.length - 1];

  const finalIncentive = baseIncentive * (tier?.multiplier || 0);

  return {
    perSale,
    monthlyTargetInr,
    revenue,
    achievementPct: Number(achievementPct.toFixed(2)),
    achievementMultiplier: tier?.multiplier || 0,
    baseIncentive: Math.round(baseIncentive),
    finalIncentive: Math.round(finalIncentive),
    cpcFloor,
  };
}

export function computeArIncentive(args) {
  return computeSalesIncentive({ ...args, config: { ...DEFAULT_AR_CONFIG, ...(args.config || {}) } });
}
