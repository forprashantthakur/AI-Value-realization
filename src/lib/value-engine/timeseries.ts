import type { CapacityDisposition, Measurement, ProcessMetrics } from "../domain/types";
import { effortMinutesPerTransaction } from "./capacity";
import { safeDiv } from "./units";

export interface MonthlyValuePoint {
  month: string;
  phase: Measurement["phase"];
  adoption: number;
  automation: number;
  volume: number;
  ahtMinutes: number;
  cycleTimeHours: number;
  errorRate: number;
  hoursReleased: number;
  fteReleased: number;
  financialBenefit: number; // attributed, cashable + cost avoidance + quality
  capacityValue: number; // economic value of all released hours (not financial)
  aiRunCost: number;
  netBenefit: number;
  cumulativeNet: number; // after one-time investment
  cumulativeRoi: number | null;
  productivityIndex: number; // baseline effort / current effort
}

/**
 * Monthly value from monthly measurements. Uses the same labour model as the annual engine:
 * hours = volume × (baseline effort − current effort) ÷ 60 × k; money only for disposition
 * classes that are financial; attributed with the initiative's weighted derived attribution.
 */
export function computeMonthlyValue(args: {
  series: Measurement[];
  baseline: ProcessMetrics;
  calibrationFactor: number;
  productiveHours: number;
  fteCost: number;
  costPerError: number;
  disposition: CapacityDisposition;
  derivedAttribution: number;
  oneTimeInvestment: number;
  goLiveMonth: string | null;
}): MonthlyValuePoint[] {
  const hourly = safeDiv(args.fteCost, args.productiveHours);
  const effB = effortMinutesPerTransaction(args.baseline);
  const finShare = args.disposition.cashable + args.disposition.costAvoidance;
  let cumNet = 0;
  let cumCost = 0;
  let investmentBooked = false;
  return args.series.map((m) => {
    const effM = m.avgHandlingMinutes + m.reworkRate * args.baseline.reworkMinutes;
    const hours = Math.max(0, (m.volume * (effB - effM) * args.calibrationFactor) / 60);
    const capacityValue = hours * hourly;
    const quality = Math.max(0, m.volume * (args.baseline.errorRate - m.errorRate) * args.costPerError);
    const fin = (capacityValue * finShare + quality) * args.derivedAttribution;
    const net = fin - m.aiRunCost;
    if (!investmentBooked && args.goLiveMonth && m.month >= args.goLiveMonth) {
      cumNet -= args.oneTimeInvestment;
      cumCost += args.oneTimeInvestment;
      investmentBooked = true;
    }
    cumNet += net;
    cumCost += m.aiRunCost;
    return {
      month: m.month,
      phase: m.phase,
      adoption: m.adoptionRate,
      automation: m.automationRate,
      volume: m.volume,
      ahtMinutes: m.avgHandlingMinutes,
      cycleTimeHours: m.cycleTimeHours,
      errorRate: m.errorRate,
      hoursReleased: hours,
      fteReleased: safeDiv(hours * 12, args.productiveHours),
      financialBenefit: fin,
      capacityValue,
      aiRunCost: m.aiRunCost,
      netBenefit: net,
      cumulativeNet: cumNet,
      cumulativeRoi: cumCost > 0 ? cumNet / cumCost : null,
      productivityIndex: safeDiv(effB, effM, 1),
    };
  });
}
