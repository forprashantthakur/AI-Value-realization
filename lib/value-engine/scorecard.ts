import type { ScorecardWeights } from "../domain/types";
import { clamp, safeDiv } from "./units";

export interface ScorecardDimension {
  key: keyof ScorecardWeights;
  label: string;
  score: number; // 0..100 (achievement vs plan, capped at 120 then scaled)
  actual: string;
  target: string;
  basis: string;
  weight: number;
  available: boolean;
}

export interface Scorecard {
  dimensions: ScorecardDimension[];
  composite: number | null;
  compositeExplanation: string;
}

export interface ScorecardInputs {
  benefitActual: number;
  benefitPlan: number;
  productivityActual: number;
  productivityPlan: number;
  cycleActual: number;
  cyclePlan: number;
  qualityActual: number;
  qualityPlan: number;
  adoptionActual: number;
  adoptionPlan: number;
  agentAutonomyActual: number | null;
  agentAutonomyPlan: number | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  dataConfidence: "HIGH" | "MEDIUM" | "LOW";
  strategicAlignment: number; // 1..5
  hasActuals: boolean;
}

const pctTxt = (v: number) => `${(v * 100).toFixed(0)}%`;

/** Achievement ratio capped at 120%, expressed on a 0-100 scale where 100 = plan met. */
function achievement(actual: number, plan: number): number {
  if (plan <= 0) return actual > 0 ? 100 : 0;
  return clamp(safeDiv(actual, plan) * 100, 0, 120);
}

/**
 * Transparent scorecard: every dimension is "actual vs business-case plan" with the
 * underlying numbers shown. The composite (if enabled) is a plain weighted average of available
 * dimensions with weights re-normalised to the dimensions that have data.
 */
export function computeScorecard(i: ScorecardInputs, weights: ScorecardWeights, compositeEnabled: boolean): Scorecard {
  const riskScore = { LOW: 100, MEDIUM: 65, HIGH: 30 }[i.riskLevel];
  const confAdj = { HIGH: 0, MEDIUM: -10, LOW: -20 }[i.dataConfidence];
  const dims: ScorecardDimension[] = [
    {
      key: "financial",
      label: "Financial value",
      score: achievement(i.benefitActual, i.benefitPlan),
      actual: `${(i.benefitActual / 1e6).toFixed(1)}M`,
      target: `${(i.benefitPlan / 1e6).toFixed(1)}M`,
      basis: "Attributed annual financial benefit ÷ business-case benefit",
      weight: weights.financial,
      available: i.hasActuals,
    },
    {
      key: "productivity",
      label: "Productivity",
      score: achievement(i.productivityActual, i.productivityPlan),
      actual: pctTxt(i.productivityActual),
      target: pctTxt(i.productivityPlan),
      basis: "Productivity uplift achieved ÷ target uplift",
      weight: weights.productivity,
      available: i.hasActuals,
    },
    {
      key: "processPerformance",
      label: "Process performance",
      score: achievement(i.cycleActual, i.cyclePlan),
      actual: pctTxt(i.cycleActual),
      target: pctTxt(i.cyclePlan),
      basis: "Cycle-time reduction achieved ÷ target reduction",
      weight: weights.processPerformance,
      available: i.hasActuals,
    },
    {
      key: "quality",
      label: "Quality",
      score: achievement(i.qualityActual, i.qualityPlan),
      actual: pctTxt(i.qualityActual),
      target: pctTxt(i.qualityPlan),
      basis: "Error-rate reduction achieved ÷ target reduction",
      weight: weights.quality,
      available: i.hasActuals,
    },
    {
      key: "adoption",
      label: "Adoption",
      score: achievement(i.adoptionActual, i.adoptionPlan),
      actual: pctTxt(i.adoptionActual),
      target: pctTxt(i.adoptionPlan),
      basis: "Actual transaction adoption ÷ planned adoption",
      weight: weights.adoption,
      available: i.hasActuals,
    },
    {
      key: "agentPerformance",
      label: "Agent performance",
      score: i.agentAutonomyActual !== null && i.agentAutonomyPlan ? achievement(i.agentAutonomyActual, i.agentAutonomyPlan) : 0,
      actual: i.agentAutonomyActual !== null ? pctTxt(i.agentAutonomyActual) : "—",
      target: i.agentAutonomyPlan !== null ? pctTxt(i.agentAutonomyPlan) : "—",
      basis: "Task-weighted autonomous completion ÷ designed automation %",
      weight: weights.agentPerformance,
      available: i.agentAutonomyActual !== null && i.hasActuals,
    },
    {
      key: "risk",
      label: "Risk & evidence",
      score: clamp(riskScore + confAdj, 0, 100),
      actual: `${i.riskLevel.toLowerCase()} risk · ${i.dataConfidence.toLowerCase()} confidence`,
      target: "low risk · high confidence",
      basis: "Risk level (low 100 / medium 65 / high 30) adjusted for data confidence (high 0 / medium −10 / low −20)",
      weight: weights.risk,
      available: true,
    },
    {
      key: "strategic",
      label: "Strategic value",
      score: (i.strategicAlignment / 5) * 100,
      actual: `${i.strategicAlignment}/5`,
      target: "5/5",
      basis: "Strategic alignment rating by AI Value Office (1–5) × 20",
      weight: weights.strategic,
      available: true,
    },
  ];

  if (!compositeEnabled) return { dimensions: dims, composite: null, compositeExplanation: "Composite score disabled in settings." };
  const avail = dims.filter((d) => d.available && d.weight > 0);
  const wSum = avail.reduce((a, d) => a + d.weight, 0);
  const composite = wSum > 0 ? avail.reduce((a, d) => a + Math.min(100, d.score) * d.weight, 0) / wSum : null;
  const explanation =
    `Composite = Σ(min(score,100) × weight) ÷ Σ weight over ${avail.length} dimensions with data. ` +
    avail.map((d) => `${d.label} ${Math.min(100, d.score).toFixed(0)}×${d.weight}`).join(" + ") +
    ` ÷ ${wSum}.`;
  return { dimensions: dims, composite, compositeExplanation: explanation };
}
