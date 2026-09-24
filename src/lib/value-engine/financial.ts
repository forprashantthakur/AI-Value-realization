import type { Benefit, BenefitNature, FinancialClass, ProcessMetrics, RoiBasis } from "../domain/types";
import type { CapacityResult, CapacitySplitLine } from "./capacity";
import { fmt, metric, pct, undefinedMetric, type Metric } from "./metric";
import { qualityCostAvoided } from "./quality";
import { reductionPct, safeDiv } from "./units";

export const ROI_BASIS_CLASSES: Record<RoiBasis, FinancialClass[]> = {
  CASHABLE_ONLY: ["CASHABLE"],
  CASHABLE_AND_AVOIDANCE: ["CASHABLE", "COST_AVOIDANCE"],
  ALL_FINANCIAL: ["CASHABLE", "COST_AVOIDANCE", "REVENUE", "WORKING_CAPITAL", "RISK_AVOIDANCE"],
};

export const ROI_BASIS_LABEL: Record<RoiBasis, string> = {
  CASHABLE_ONLY: "Cashable savings only",
  CASHABLE_AND_AVOIDANCE: "Cashable + cost avoidance",
  ALL_FINANCIAL: "All financial benefits (cashable, avoidance, revenue, working capital, risk)",
};

export function isFinancialClass(c: FinancialClass): boolean {
  return c !== "CAPACITY" && c !== "NON_FINANCIAL";
}

export function countsInRoi(c: FinancialClass, basis: RoiBasis): boolean {
  return ROI_BASIS_CLASSES[basis].includes(c);
}

export interface ValuationContext {
  baseline: ProcessMetrics;
  post: ProcessMetrics;
  capacity: CapacityResult;
  splits: CapacitySplitLine[];
  costPerError: number;
  /** True when `post` is the business-case target rather than a measured actual. */
  isForecast: boolean;
  /** Scenario override: force one attribution % on every line. */
  attributionOverride?: number;
}

export interface BenefitValuation {
  benefit: Benefit;
  gross: number;
  attributionPct: number;
  attributed: number;
  effectiveNature: BenefitNature;
  isFinancial: boolean;
  metric: Metric;
}

function splitValue(splits: CapacitySplitLine[], cls: CapacitySplitLine["cls"]): CapacitySplitLine {
  return splits.find((s) => s.cls === cls)!;
}

/**
 * Values one benefit line. Derived lines are computed from process metrics; declared lines use the
 * owner-declared annual value. Intangible lines never carry money. A line valued from forecast/target
 * metrics is always ESTIMATED, whatever was declared — estimated value is never shown as measured.
 */
export function valueBenefit(b: Benefit, ctx: ValuationContext): BenefitValuation {
  const attributionPct = ctx.attributionOverride ?? b.attributionPct;
  let gross = 0;
  let formula = "";
  let definition = "";
  let inputs: Metric["inputs"] = [];
  let assumptions: string[] = [];
  let example: string | undefined;

  if (b.nature === "INTANGIBLE" || b.financialClass === "NON_FINANCIAL") {
    gross = 0;
    formula = "Not valued in currency";
    definition = "Intangible / non-financial benefit tracked through operational KPIs and evidence only.";
  } else if (b.source.kind === "DECLARED") {
    gross = b.source.annualValue;
    formula = "Declared annual value (owner-provided, evidence-backed)";
    definition = b.source.basis;
    inputs = [{ name: "Declared annual value", value: gross, unit: "currency", source: b.owner }];
  } else {
    const d = b.source.driver;
    const cap = ctx.capacity;
    const labour = (cls: CapacitySplitLine["cls"]) => {
      const s = splitValue(ctx.splits, cls);
      gross = s.value;
      formula = "Hours released × Disposition share × Loaded hourly cost";
      definition = `${s.label}: the share of released capacity that the business has declared as ${s.label.toLowerCase()}.`;
      inputs = [
        { name: "Hours released", value: cap.hoursReleased.value, unit: "hours" },
        { name: "Disposition share", value: s.share, unit: "percent" },
        { name: "Loaded hourly cost", value: cap.hourlyCost, unit: "currency" },
      ];
      assumptions = [...cap.hoursReleased.assumptions];
      example = `${fmt(cap.hoursReleased.value)} × ${pct(s.share)} × ${fmt(cap.hourlyCost)} = ${fmt(gross)}`;
    };
    switch (d) {
      case "LABOR_CASHABLE":
        labour("cashable");
        break;
      case "LABOR_COST_AVOIDANCE":
        labour("costAvoidance");
        break;
      case "LABOR_REDEPLOYED":
        labour("redeployed");
        break;
      case "LABOR_REVENUE_CAPACITY":
        labour("revenueProducing");
        break;
      case "QUALITY_COST": {
        const q = qualityCostAvoided(ctx.baseline, ctx.post, ctx.costPerError);
        gross = q.value;
        formula = q.formula;
        definition = q.definition;
        inputs = q.inputs;
        assumptions = q.assumptions;
        example = q.example;
        break;
      }
      case "OUTSOURCING":
        gross = ctx.baseline.outsourcingCostAnnual - ctx.post.outsourcingCostAnnual;
        formula = "Baseline outsourcing cost − Post-AI outsourcing cost";
        definition = "Reduction in third-party BPO/contractor spend on the process.";
        inputs = [
          { name: "Baseline outsourcing", value: ctx.baseline.outsourcingCostAnnual, unit: "currency" },
          { name: "Post-AI outsourcing", value: ctx.post.outsourcingCostAnnual, unit: "currency" },
        ];
        break;
      case "LEGACY_TECH":
        gross = ctx.baseline.technologyCostAnnual - ctx.post.technologyCostAnnual;
        formula = "Baseline process technology cost − Post-AI process technology cost";
        definition = "Legacy tooling or licences decommissioned because of the AI solution.";
        inputs = [
          { name: "Baseline technology cost", value: ctx.baseline.technologyCostAnnual, unit: "currency" },
          { name: "Post-AI technology cost", value: ctx.post.technologyCostAnnual, unit: "currency" },
        ];
        break;
    }
  }

  const attributed = gross * attributionPct;
  const effectiveNature: BenefitNature =
    b.nature === "INTANGIBLE" ? "INTANGIBLE" : ctx.isForecast ? "ESTIMATED" : b.nature;
  if (ctx.isForecast && b.nature === "MEASURED") {
    assumptions = [...assumptions, "Valued from business-case targets (no post-AI actuals yet) — treated as ESTIMATED."];
  }

  const m = metric({
    key: `benefit:${b.id}`,
    label: b.name,
    value: attributed,
    unit: "currency",
    definition,
    formula: `(${formula}) × AI attribution %`,
    inputs: [...inputs, { name: "AI attribution", value: attributionPct, unit: "percent" }],
    assumptions: [...assumptions, `Attribution confidence: ${b.confidence}. Status: ${b.status.replaceAll("_", " ").toLowerCase()}.`],
    confidence: b.confidence,
    example: example ? `${example} × ${pct(attributionPct, 0)} = ${fmt(attributed)}` : undefined,
  });

  return {
    benefit: b,
    gross,
    attributionPct,
    attributed,
    effectiveNature,
    isFinancial: isFinancialClass(b.financialClass) && effectiveNature !== "INTANGIBLE",
    metric: m,
  };
}

export function costPerTransaction(
  label: string,
  key: string,
  laborHours: number,
  hourlyCost: number,
  technologyCost: number,
  outsourcingCost: number,
  aiRecurringCost: number,
  volume: number,
): Metric {
  const total = laborHours * hourlyCost + technologyCost + outsourcingCost + aiRecurringCost;
  const base = {
    key,
    label,
    unit: "currency" as const,
    definition: "Fully loaded operating cost per transaction (labour + process technology + outsourcing + AI run cost).",
    formula: "(Labour hours × Hourly cost + Technology + Outsourcing + AI run cost) ÷ Annual volume",
    inputs: [
      { name: "Labour hours", value: laborHours, unit: "hours" as const },
      { name: "Loaded hourly cost", value: hourlyCost, unit: "currency" as const },
      { name: "Process technology cost", value: technologyCost, unit: "currency" as const },
      { name: "Outsourcing cost", value: outsourcingCost, unit: "currency" as const },
      { name: "AI recurring cost", value: aiRecurringCost, unit: "currency" as const },
      { name: "Annual volume", value: volume, unit: "count" as const },
    ],
    assumptions: ["Activity-based costing; AI run cost included in post-AI cost so the comparison is fair."],
  };
  if (volume <= 0) return undefinedMetric(base, "Volume is zero.");
  return metric({ ...base, value: total / volume, example: `${fmt(total)} ÷ ${fmt(volume)} = ${fmt(total / volume)}` });
}

export function costReduction(baselineCpt: number, postCpt: number): Metric {
  const v = reductionPct(baselineCpt, postCpt);
  return metric({
    key: "costReduction",
    label: "Cost-per-transaction reduction",
    value: v,
    unit: "percent",
    definition: "Relative reduction in fully loaded cost per transaction.",
    formula: "(Baseline cost − Post-AI cost) ÷ Baseline cost × 100",
    inputs: [
      { name: "Baseline cost / txn", value: baselineCpt, unit: "currency" },
      { name: "Post-AI cost / txn", value: postCpt, unit: "currency" },
    ],
    assumptions: ["Post-AI cost includes AI run cost."],
    example: `(${fmt(baselineCpt)} − ${fmt(postCpt)}) ÷ ${fmt(baselineCpt)} = ${pct(v)}`,
  });
}

export function weightedAttribution(vals: BenefitValuation[]): number {
  const g = vals.reduce((a, v) => a + Math.abs(v.gross), 0);
  return safeDiv(
    vals.reduce((a, v) => a + Math.abs(v.gross) * v.attributionPct, 0),
    g,
    0,
  );
}
