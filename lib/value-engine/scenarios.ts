import type { Benefit, Initiative, ProcessMetrics, ScenarioName, ScenarioOverrides } from "../domain/types";
import { reblendAtAdoption } from "./adoption";
import { safeDiv } from "./units";

export interface AppliedScenario {
  post: ProcessMetrics;
  isForecast: boolean;
  benefits: Benefit[];
  attributionOverride?: number;
  recurringMultiplier: number;
  oneTimeMultiplier: number;
  llmVolumeMultiplier: number;
  describe: string[];
}

/**
 * Translate scenario overrides into modified inputs for the SAME valuation code path used for
 * actuals. Nothing here computes money — it only adjusts drivers.
 */
export function applyOverrides(init: Initiative, o: ScenarioOverrides = {}): AppliedScenario {
  const source = init.actual?.metrics ?? init.target.metrics;
  const isForecast = !init.actual || Object.keys(o).length > 0;
  const describe: string[] = [];
  const adoption = o.adoptionPct ?? source.adoptionRate;
  if (o.adoptionPct !== undefined) describe.push(`Adoption set to ${(adoption * 100).toFixed(0)}%`);

  let automationScale = 1;
  if (o.automationPct !== undefined) {
    const aiPathAutomation = safeDiv(source.automationRate, source.adoptionRate, 0);
    automationScale = aiPathAutomation > 0 ? o.automationPct / aiPathAutomation : 1;
    describe.push(`AI-path automation set to ${(o.automationPct * 100).toFixed(0)}% (effort reduction ×${automationScale.toFixed(2)})`);
  }

  const post = reblendAtAdoption(init.baseline.metrics, source, adoption, {
    automationScale,
    cycleTimeReduction: o.cycleTimeReductionPct,
    errorReduction: o.errorReductionPct,
  });

  const volMult = 1 + (o.volumeChangePct ?? 0);
  post.transactionsPerYear = source.transactionsPerYear * volMult;
  post.fullyLoadedFteCost = source.fullyLoadedFteCost * (1 + (o.fteCostChangePct ?? 0));
  if (o.volumeChangePct) describe.push(`Volume ${o.volumeChangePct > 0 ? "+" : ""}${(o.volumeChangePct * 100).toFixed(0)}%`);
  if (o.fteCostChangePct) describe.push(`FTE cost ${o.fteCostChangePct > 0 ? "+" : ""}${(o.fteCostChangePct * 100).toFixed(0)}%`);
  if (o.aiCostChangePct) describe.push(`AI run cost ${o.aiCostChangePct > 0 ? "+" : ""}${(o.aiCostChangePct * 100).toFixed(0)}%`);
  if (o.implementationCostChangePct)
    describe.push(`Implementation cost ${o.implementationCostChangePct > 0 ? "+" : ""}${(o.implementationCostChangePct * 100).toFixed(0)}%`);

  let benefits = init.benefits;
  if (o.revenueUpliftAnnual !== undefined) {
    const revenueLines = benefits.filter((b) => b.financialClass === "REVENUE" && b.source.kind === "DECLARED");
    const current = revenueLines.reduce((a, b) => a + (b.source.kind === "DECLARED" ? b.source.annualValue : 0), 0);
    if (revenueLines.length && current > 0) {
      const f = o.revenueUpliftAnnual / current;
      benefits = benefits.map((b) =>
        b.financialClass === "REVENUE" && b.source.kind === "DECLARED"
          ? { ...b, source: { ...b.source, annualValue: b.source.annualValue * f } }
          : b,
      );
    } else if (o.revenueUpliftAnnual > 0) {
      benefits = [
        ...benefits,
        {
          id: `${init.id}-scenario-revenue`,
          initiativeId: init.id,
          name: "Scenario revenue uplift",
          category: "FINANCIAL",
          financialClass: "REVENUE",
          nature: "ESTIMATED",
          source: { kind: "DECLARED", annualValue: o.revenueUpliftAnnual, basis: "Scenario assumption" },
          attributionPct: 1,
          confidence: "LOW",
          status: "PROPOSED",
          owner: "Scenario",
          measurementFrequency: "ONE_OFF",
          evidence: [],
          history: [],
        },
      ];
    }
    describe.push(`Revenue uplift set to ${o.revenueUpliftAnnual.toLocaleString("en-IN")}`);
  }
  if (o.attributionPct !== undefined) describe.push(`Attribution set to ${(o.attributionPct * 100).toFixed(0)}% on all lines`);

  const llmVolumeMultiplier = safeDiv(post.transactionsPerYear * post.adoptionRate, source.transactionsPerYear * source.adoptionRate, 1);

  return {
    post,
    isForecast,
    benefits,
    attributionOverride: o.attributionPct,
    recurringMultiplier: 1 + (o.aiCostChangePct ?? 0),
    oneTimeMultiplier: 1 + (o.implementationCostChangePct ?? 0),
    llmVolumeMultiplier,
    describe,
  };
}

export const SCENARIO_ORDER: ScenarioName[] = ["CONSERVATIVE", "EXPECTED", "AGGRESSIVE"];

export const SCENARIO_LABEL: Record<ScenarioName, string> = {
  CONSERVATIVE: "Conservative",
  EXPECTED: "Expected",
  AGGRESSIVE: "Aggressive",
};

/** Default overrides when an initiative has no saved scenario (relative to current state). */
export function defaultScenario(init: Initiative, name: ScenarioName): ScenarioOverrides {
  const src = init.actual?.metrics ?? init.target.metrics;
  const ai = safeDiv(src.automationRate, src.adoptionRate, 0);
  switch (name) {
    case "CONSERVATIVE":
      return {
        adoptionPct: Math.max(0, src.adoptionRate - 0.15),
        automationPct: Math.max(0, ai * 0.85),
        aiCostChangePct: 0.25,
        attributionPct: undefined,
        implementationCostChangePct: 0.15,
      };
    case "AGGRESSIVE":
      return {
        adoptionPct: Math.min(1, src.adoptionRate + 0.1),
        automationPct: Math.min(1, ai * 1.1),
        volumeChangePct: 0.1,
        aiCostChangePct: -0.1,
      };
    default:
      return {};
  }
}
