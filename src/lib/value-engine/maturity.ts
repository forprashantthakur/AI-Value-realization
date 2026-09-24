import type { MaturityAssessment, MaturityDimension } from "../domain/types";
import { MATURITY_DIMENSIONS } from "../domain/types";

export const MATURITY_LEVELS = [
  { level: 1, name: "Ad Hoc", description: "AI value is anecdotal; no baselines; costs not tracked per initiative." },
  { level: 2, name: "Measured", description: "Baselines exist for key initiatives; before/after measured inconsistently." },
  { level: 3, name: "Managed", description: "Standard value method, benefit owners, finance involvement, TCO tracked." },
  { level: 4, name: "Scaled", description: "Portfolio-wide value tracking, AI FinOps, AgentOps and governance at scale." },
  { level: 5, name: "Value Optimized", description: "Continuous optimisation; value data drives funding and design decisions." },
] as const;

export interface MaturityResult {
  average: number;
  level: (typeof MATURITY_LEVELS)[number];
  gaps: { dimension: MaturityDimension; score: number; target: number; gap: number }[];
  note: string;
}

/**
 * Maturity level = floor of the average dimension score, but capped at (lowest score + 1) so one
 * weak dimension cannot be hidden by strong ones. This is a capability indicator only — it never
 * substitutes for measured ROI.
 */
export function computeMaturity(a: MaturityAssessment): MaturityResult {
  const scores = MATURITY_DIMENSIONS.map((d) => a.scores[d] ?? 1);
  const avg = scores.reduce((x, y) => x + y, 0) / scores.length;
  const min = Math.min(...scores);
  const lvl = Math.max(1, Math.min(5, Math.floor(avg), min + 1));
  return {
    average: avg,
    level: MATURITY_LEVELS[lvl - 1],
    gaps: MATURITY_DIMENSIONS.map((d) => ({ dimension: d, score: a.scores[d], target: a.target[d], gap: a.target[d] - a.scores[d] }))
      .filter((g) => g.gap > 0)
      .sort((x, y) => y.gap - x.gap),
    note: "Level = floor(average score), capped at lowest dimension + 1. Capability indicator only — not a substitute for measured ROI.",
  };
}
