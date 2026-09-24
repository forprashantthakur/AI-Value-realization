import type { BenefitStatus, LeakageCause, LeakageNote, ProcessMetrics } from "../domain/types";
import { reblendAtAdoption } from "./adoption";

export type LadderRung =
  | "POTENTIAL"
  | "BUSINESS_CASE"
  | "CURRENT_RUN_RATE"
  | "MEASURED"
  | "BUSINESS_VALIDATED"
  | "FINANCE_VALIDATED"
  | "REALIZED"
  | "SUSTAINED";

export const LADDER_LABEL: Record<LadderRung, string> = {
  POTENTIAL: "Potential value",
  BUSINESS_CASE: "Approved business case",
  CURRENT_RUN_RATE: "Current run-rate (all lines)",
  MEASURED: "Measured value",
  BUSINESS_VALIDATED: "Business-validated",
  FINANCE_VALIDATED: "Finance-validated",
  REALIZED: "Realized value",
  SUSTAINED: "Sustained value",
};

export interface LeakageStep {
  key: string;
  label: string;
  cause: LeakageCause | "VOLUME_VARIANCE" | "DECLARED_VARIANCE" | "AWAITING_VALIDATION" | "ADOPTION_HEADROOM";
  amount: number; // negative = value lost, positive = value gained
  explanation: string;
}

export interface LeakageResult {
  ladder: Record<LadderRung, number>;
  steps: LeakageStep[];
  byCause: Partial<Record<LeakageStep["cause"], number>>;
  costVariance: number; // actual one-time − approved one-time (positive = overrun)
  qualitative: LeakageNote[];
}

export interface LeakageInputs {
  baseline: ProcessMetrics;
  target: ProcessMetrics;
  actual: ProcessMetrics | null;
  potentialAdoption: number;
  approvedDeclared: number;
  currentDeclared: number;
  /** Counted, attributed value of DERIVED lines for a metrics snapshot. */
  valueDerived: (m: ProcessMetrics, isForecast: boolean) => number;
  /** Counted, attributed current value of all lines with status ≥ floor. */
  valueAtStatus: (floor: BenefitStatus | null) => number;
  approvedInvestment: number;
  actualOneTime: number;
  notes: LeakageNote[];
}

/**
 * Value ladder and leakage decomposition by sequential substitution (fixed order):
 * volume → adoption → automation/effort → quality & cost rates → declared benefits → validation status.
 * The order is fixed so results are reproducible; interaction effects are absorbed by later steps.
 */
export function computeLeakage(i: LeakageInputs): LeakageResult {
  const potentialMetrics = reblendAtAdoption(i.baseline, i.target, i.potentialAdoption);
  const potential = i.valueDerived(potentialMetrics, true) + i.approvedDeclared;
  const businessCase = i.valueDerived(i.target, true) + i.approvedDeclared;
  const steps: LeakageStep[] = [
    {
      key: "adoption-headroom",
      label: "Planned adoption below full potential",
      cause: "ADOPTION_HEADROOM",
      amount: businessCase - potential,
      explanation: "Business case assumes planned adoption rather than 100% of eligible volume.",
    },
  ];

  // No post-AI actuals yet → nothing is running, so current run-rate is zero (forecast stays forecast).
  let current = 0;
  if (i.actual) {
    const a = i.actual;
    const s0 = i.target;
    const s1: ProcessMetrics = { ...s0, transactionsPerYear: a.transactionsPerYear };
    const s2 = reblendAtAdoption(i.baseline, s1, a.adoptionRate);
    const s3: ProcessMetrics = {
      ...s2,
      avgHandlingMinutes: a.avgHandlingMinutes,
      reworkRate: a.reworkRate,
      reworkMinutes: a.reworkMinutes,
      automationRate: a.automationRate,
    };
    const v0 = i.valueDerived(s0, true);
    const v1 = i.valueDerived(s1, true);
    const v2 = i.valueDerived(s2, true);
    const v3 = i.valueDerived(s3, true);
    const v4 = i.valueDerived(a, false);
    steps.push(
      {
        key: "volume",
        label: "Volume variance",
        cause: "VOLUME_VARIANCE",
        amount: v1 - v0,
        explanation: `Actual volume ${a.transactionsPerYear.toLocaleString("en-IN")} vs plan ${s0.transactionsPerYear.toLocaleString("en-IN")}.`,
      },
      {
        key: "adoption",
        label: "Lower adoption than planned",
        cause: "LOW_ADOPTION",
        amount: v2 - v1,
        explanation: `Actual adoption ${(a.adoptionRate * 100).toFixed(0)}% vs planned ${(s0.adoptionRate * 100).toFixed(0)}%.`,
      },
      {
        key: "automation",
        label: "Lower automation / effort reduction",
        cause: "LOWER_AUTOMATION",
        amount: v3 - v2,
        explanation: `Handling time and rework on the AI path vs target (AHT ${a.avgHandlingMinutes.toFixed(1)} vs ${s2.avgHandlingMinutes.toFixed(1)} min at actual adoption).`,
      },
      {
        key: "quality-rates",
        label: "Exceptions, quality & cost-rate variance",
        cause: "EXCEPTION_RATES",
        amount: v4 - v3,
        explanation: "Error/exception rates, loaded FTE cost and legacy/outsourcing cost vs target.",
      },
      {
        key: "declared",
        label: "Declared benefit variance",
        cause: "DECLARED_VARIANCE",
        amount: i.currentDeclared - i.approvedDeclared,
        explanation: "Owner-declared benefits (revenue, working capital, risk) vs business case.",
      },
    );
    current = i.valueAtStatus(null);
  }

  const measured = i.valueAtStatus("MEASURED");
  const bizVal = i.valueAtStatus("BUSINESS_VALIDATED");
  const finVal = i.valueAtStatus("FINANCE_VALIDATED");
  const realized = i.valueAtStatus("REALIZED");
  const sustained = i.valueAtStatus("SUSTAINED");

  if (i.actual) {
    steps.push({
      key: "not-validated",
      label: "Not yet measured / validated",
      cause: "AWAITING_VALIDATION",
      amount: finVal - current,
      explanation: "Value on benefit lines not yet through measurement, business and finance validation.",
    });
  }

  const byCause: LeakageResult["byCause"] = {};
  for (const s of steps) byCause[s.cause] = (byCause[s.cause] ?? 0) + s.amount;

  return {
    ladder: {
      POTENTIAL: potential,
      BUSINESS_CASE: businessCase,
      CURRENT_RUN_RATE: current,
      MEASURED: measured,
      BUSINESS_VALIDATED: bizVal,
      FINANCE_VALIDATED: finVal,
      REALIZED: realized,
      SUSTAINED: sustained,
    },
    steps,
    byCause,
    costVariance: i.actualOneTime - i.approvedInvestment,
    qualitative: i.notes,
  };
}

export const LEAKAGE_CAUSE_LABEL: Record<LeakageStep["cause"], string> = {
  LOW_ADOPTION: "Low adoption",
  LOWER_AUTOMATION: "Lower automation",
  HIGHER_AI_COST: "Higher AI cost",
  EXCEPTION_RATES: "Exception & quality rates",
  HUMAN_REVIEW: "Human review",
  INTEGRATION_LIMITATIONS: "Integration limitations",
  DATA_QUALITY: "Data quality",
  PROCESS_VARIANCE: "Process variance",
  MODEL_PERFORMANCE: "Model performance",
  CHANGE_RESISTANCE: "Change resistance",
  VOLUME_VARIANCE: "Volume variance",
  DECLARED_VARIANCE: "Declared benefit variance",
  AWAITING_VALIDATION: "Awaiting validation",
  ADOPTION_HEADROOM: "Adoption headroom (plan < potential)",
};
