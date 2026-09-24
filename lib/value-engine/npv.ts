/**
 * Discounted cash-flow helpers. Cash flows are indexed by year: index 0 = today (undiscounted),
 * index t = end of year t.
 */

export function discountFactor(rate: number, year: number): number {
  return 1 / (1 + rate) ** year;
}

export function npv(rate: number, cashFlows: number[]): number {
  return cashFlows.reduce((acc, cf, t) => acc + cf * discountFactor(rate, t), 0);
}

export function presentValue(rate: number, cashFlows: number[]): number[] {
  return cashFlows.map((cf, t) => cf * discountFactor(rate, t));
}

/**
 * Internal rate of return by bisection. Returns null when IRR is undefined (no sign change,
 * e.g. all flows positive or all negative) or does not converge in [-99.9%, 1000%].
 */
export function irr(cashFlows: number[], tolerance = 1e-7, maxIterations = 500): number | null {
  const hasPos = cashFlows.some((c) => c > 0);
  const hasNeg = cashFlows.some((c) => c < 0);
  if (!hasPos || !hasNeg) return null;

  let lo = -0.999;
  let hi = 10;
  let fLo = npv(lo, cashFlows);
  const fHi = npv(hi, cashFlows);
  if (fLo * fHi > 0) return null;

  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, cashFlows);
    if (Math.abs(fMid) < tolerance || (hi - lo) / 2 < tolerance) return mid;
    if (fMid * fLo < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}
