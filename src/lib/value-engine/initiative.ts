import type {
  AppSettings,
  BenefitStatus,
  Confidence,
  FinancialClass,
  Initiative,
  ModelPrice,
  ProcessMetrics,
  ScenarioOverrides,
  ValueCategory,
} from "../domain/types";
import { computeAdoption, aiPathEffortReduction, realizedValueModel, type AdoptionSummary } from "./adoption";
import { computeAgentEconomics, type AgentEconomics } from "./agent-economics";
import { aggregateConfidence, dataConfidence, statusAtLeast, type DataConfidence } from "./attribution";
import { computeCapacity, effortMinutesPerTransaction, splitCapacity, type CapacityResult, type CapacitySplitLine } from "./capacity";
import {
  costPerTransaction,
  costReduction,
  countsInRoi,
  valueBenefit,
  weightedAttribution,
  type BenefitValuation,
} from "./financial";
import { computeLeakage, type LeakageResult } from "./leakage";
import { undefinedMetric, type Metric } from "./metric";
import {
  automationRate,
  cycleTimeImprovement,
  outputPerFte,
  productivityUplift,
  throughputCapacityIncrease,
  touchTimeReduction,
} from "./productivity";
import { ftrImprovement, qualityImprovement, reworkReduction, slaImprovement } from "./quality";
import { computeRoi, type RoiResult } from "./roi";
import { applyOverrides } from "./scenarios";
import { computeScorecard, type Scorecard } from "./scorecard";
import { computeTco, type TcoResult } from "./tco";
import { computeMonthlyValue, type MonthlyValuePoint } from "./timeseries";
import { clamp, safeDiv, sum } from "./units";

export interface EngineContext {
  settings: AppSettings;
  modelPrices: ModelPrice[];
}

export interface InitiativeValue {
  id: string;
  isForecast: boolean;
  scenarioNotes: string[];
  baseline: ProcessMetrics;
  post: ProcessMetrics;
  capacity: CapacityResult;
  splits: CapacitySplitLine[];
  productivity: {
    cycleTime: Metric;
    touchTime: Metric;
    uplift: Metric;
    throughput: Metric;
    outputPerFteBaseline: Metric;
    outputPerFtePost: Metric;
    automation: Metric;
  };
  quality: { errorReduction: Metric; reworkReduction: Metric; ftr: Metric; sla: Metric };
  cost: { perTxnBaseline: Metric; perTxnPost: Metric; reduction: Metric };
  benefits: BenefitValuation[];
  totals: {
    /** Attributed annual value counted under the ROI basis. */
    counted: number;
    byClass: Record<FinancialClass, number>;
    byCategory: Record<ValueCategory, number>;
    measured: number;
    estimated: number;
    intangibleCount: number;
    byStatusFloor: Record<BenefitStatus, number>;
    derivedAttribution: number;
  };
  tco: TcoResult;
  roi: RoiResult;
  roiByBasis: { cashableOnly: number | null; cashableAndAvoidance: number | null; allFinancial: number | null };
  leakage: LeakageResult;
  adoption: AdoptionSummary;
  agents: AgentEconomics[];
  realizedModel: Metric;
  performanceVsTarget: number;
  confidence: Confidence;
  benefitConfidence: Record<string, DataConfidence>;
  scorecard: Scorecard;
  monthly: MonthlyValuePoint[];
  target: {
    uplift: number;
    cycle: number;
    quality: number;
  };
}

const ZERO_CLASS = (): Record<FinancialClass, number> => ({
  CASHABLE: 0,
  COST_AVOIDANCE: 0,
  REVENUE: 0,
  WORKING_CAPITAL: 0,
  RISK_AVOIDANCE: 0,
  CAPACITY: 0,
  NON_FINANCIAL: 0,
});
const ZERO_CAT = (): Record<ValueCategory, number> => ({
  PRODUCTIVITY: 0,
  FINANCIAL: 0,
  QUALITY: 0,
  EXPERIENCE: 0,
  RISK_COMPLIANCE: 0,
  STRATEGIC: 0,
});

interface ValuationPass {
  capacity: CapacityResult;
  splits: CapacitySplitLine[];
  valuations: BenefitValuation[];
}

function valuationPass(
  init: Initiative,
  post: ProcessMetrics,
  isForecast: boolean,
  benefits: Initiative["benefits"],
  attributionOverride: number | undefined,
): ValuationPass {
  const capacity = computeCapacity({
    baseline: init.baseline.metrics,
    post,
    productiveHoursPerFte: init.productiveHoursPerFte,
    basis: init.laborBasis,
  });
  const splits = splitCapacity(capacity.hoursReleased.value, init.productiveHoursPerFte, capacity.hourlyCost, init.disposition);
  const ctx = {
    baseline: init.baseline.metrics,
    post,
    capacity,
    splits,
    costPerError: init.costPerError,
    isForecast,
    attributionOverride,
  };
  return { capacity, splits, valuations: benefits.map((b) => valueBenefit(b, ctx)) };
}

/** The single entry point that turns an initiative into explainable value metrics. */
export function evaluateInitiative(init: Initiative, ctx: EngineContext, overrides?: ScenarioOverrides): InitiativeValue {
  const { settings } = ctx;
  const basis = settings.roiBasis;
  const applied = applyOverrides(init, overrides);
  const post = applied.post;
  const isForecast = applied.isForecast;
  const b = init.baseline.metrics;

  const pass = valuationPass(init, post, isForecast, applied.benefits, applied.attributionOverride);
  const { capacity, splits, valuations } = pass;

  // Totals
  const byClass = ZERO_CLASS();
  const byCategory = ZERO_CAT();
  const byStatusFloor = {} as Record<BenefitStatus, number>;
  let counted = 0;
  let measured = 0;
  let estimated = 0;
  for (const v of valuations) {
    byClass[v.benefit.financialClass] += v.attributed;
    if (!countsInRoi(v.benefit.financialClass, basis)) continue;
    counted += v.attributed;
    byCategory[v.benefit.category] += v.attributed;
    if (v.effectiveNature === "MEASURED") measured += v.attributed;
    else if (v.effectiveNature === "ESTIMATED") estimated += v.attributed;
  }
  const valueAtStatus = (floor: BenefitStatus | null) =>
    sum(
      valuations
        .filter((v) => countsInRoi(v.benefit.financialClass, basis))
        .filter((v) => (floor ? !isForecast && statusAtLeast(v.benefit.status, floor) : true))
        .map((v) => v.attributed),
    );
  for (const s of ["PROPOSED", "MEASURED", "BUSINESS_VALIDATED", "FINANCE_VALIDATED", "REALIZED", "SUSTAINED"] as BenefitStatus[]) {
    byStatusFloor[s] = s === "PROPOSED" ? counted : valueAtStatus(s);
  }
  const derived = valuations.filter((v) => v.benefit.source.kind === "DERIVED" && v.isFinancial);
  const derivedAttribution = weightedAttribution(derived.length ? derived : valuations);

  // Costs
  const tco = computeTco(init.costs, init.agents, ctx.modelPrices, {
    recurringMultiplier: applied.recurringMultiplier,
    oneTimeMultiplier: applied.oneTimeMultiplier,
    llmVolumeMultiplier: applied.llmVolumeMultiplier,
  });

  const roiInput = (annualBenefit: number) => ({
    annualBenefit,
    oneTimeInvestment: tco.oneTime.value,
    recurringAnnualCost: tco.recurring.value,
    discountRate: settings.discountRate,
    horizonYears: init.businessCase.horizonYears || settings.horizonYears,
    rampUp: settings.rampUp,
  });
  const roi = computeRoi(roiInput(counted));
  const roiFor = (classes: FinancialClass[]) => {
    const v = sum(valuations.filter((x) => classes.includes(x.benefit.financialClass)).map((x) => x.attributed));
    const r = computeRoi(roiInput(v)).roi;
    return r.undefinedReason ? null : r.value;
  };

  // Productivity & quality
  const baselineReqFte = b.fte > 0 ? b.fte : capacity.baselineRequiredFte.value;
  const productivity = {
    cycleTime: cycleTimeImprovement(b, post),
    touchTime: touchTimeReduction(b, post),
    uplift: productivityUplift(b.transactionsPerYear, baselineReqFte, post.transactionsPerYear, capacity.postRequiredFte.value),
    throughput: throughputCapacityIncrease(effortMinutesPerTransaction(b), effortMinutesPerTransaction(post)),
    outputPerFteBaseline: outputPerFte(b.transactionsPerYear, baselineReqFte, "Transactions / FTE (baseline)", "outputPerFteBaseline"),
    outputPerFtePost: outputPerFte(post.transactionsPerYear, capacity.postRequiredFte.value, "Transactions / FTE (post-AI)", "outputPerFtePost"),
    automation: automationRate(post),
  };
  const quality = {
    errorReduction: qualityImprovement(b, post),
    reworkReduction: reworkReduction(b, post),
    ftr: ftrImprovement(b, post),
    sla: slaImprovement(b, post),
  };

  // Cost per transaction (baseline at baseline volume; post includes AI run cost)
  const baseCap = computeCapacity({ baseline: b, post: b, productiveHoursPerFte: init.productiveHoursPerFte, basis: init.laborBasis, fteCost: b.fullyLoadedFteCost });
  const cptB = costPerTransaction(
    "Cost per transaction (baseline)",
    "costPerTxnBaseline",
    baseCap.baselineLaborHours.value,
    baseCap.hourlyCost,
    b.technologyCostAnnual,
    b.outsourcingCostAnnual,
    0,
    b.transactionsPerYear,
  );
  const cptP = costPerTransaction(
    "Cost per transaction (post-AI)",
    "costPerTxnPost",
    capacity.postLaborHours.value,
    capacity.hourlyCost,
    post.technologyCostAnnual,
    post.outsourcingCostAnnual,
    tco.recurring.value,
    post.transactionsPerYear,
  );

  // Leakage & ladder (always on un-overridden declared values for business case)
  const declaredCounted = (vals: BenefitValuation[]) =>
    sum(vals.filter((v) => v.benefit.source.kind === "DECLARED" && countsInRoi(v.benefit.financialClass, basis)).map((v) => v.attributed));
  const derivedCountedFor = (m: ProcessMetrics, forecast: boolean) => {
    const p = valuationPass(init, m, forecast, applied.benefits.filter((x) => x.source.kind === "DERIVED"), applied.attributionOverride);
    return sum(p.valuations.filter((v) => countsInRoi(v.benefit.financialClass, basis)).map((v) => v.attributed));
  };
  const leakage = computeLeakage({
    baseline: b,
    target: init.target.metrics,
    actual: isForecast && !init.actual ? null : post,
    potentialAdoption: init.businessCase.potentialAdoption,
    approvedDeclared: init.businessCase.approvedDeclaredBenefits,
    currentDeclared: declaredCounted(valuations),
    valueDerived: derivedCountedFor,
    valueAtStatus,
    approvedInvestment: init.businessCase.approvedInvestment,
    actualOneTime: tco.oneTime.value,
    notes: init.leakageNotes,
  });

  // Adoption & agents
  const latest = init.series.length ? init.series[init.series.length - 1] : undefined;
  const adoption = computeAdoption(post, latest, init.agents);
  const agents = init.agents.map((a) =>
    computeAgentEconomics(a, ctx.modelPrices.find((m) => m.id === a.modelPriceId), capacity.hourlyCost),
  );

  const targetReduction = aiPathEffortReduction(b, init.target.metrics);
  const actualReduction = aiPathEffortReduction(b, post);
  const performanceVsTarget = clamp(safeDiv(actualReduction, targetReduction, 0), 0, 1.2);
  const attributionAvg = weightedAttribution(valuations.filter((v) => countsInRoi(v.benefit.financialClass, basis)));
  const realizedModelRaw = realizedValueModel({
    potential: leakage.ladder.POTENTIAL,
    adoption: post.adoptionRate,
    performance: performanceVsTarget,
    attribution: attributionAvg,
    use: settings.realizedValueModel,
  });
  // Nothing is realized before post-AI measurement exists.
  const realizedModel = init.actual ? realizedModelRaw : undefinedMetric({ ...realizedModelRaw }, "No post-AI measurement yet — realized value cannot be computed.");

  const benefitConfidence: Record<string, DataConfidence> = {};
  for (const bn of applied.benefits) benefitConfidence[bn.id] = dataConfidence(bn);
  const confidence = aggregateConfidence(
    valuations.filter((v) => v.isFinancial).map((v) => ({ confidence: benefitConfidence[v.benefit.id]?.level ?? v.benefit.confidence, weight: v.attributed })),
  );

  // Targets for scorecard
  const tCap = computeCapacity({ baseline: b, post: init.target.metrics, productiveHoursPerFte: init.productiveHoursPerFte, basis: init.laborBasis });
  const targetUplift = productivityUplift(b.transactionsPerYear, baselineReqFte, init.target.metrics.transactionsPerYear, tCap.postRequiredFte.value).value;
  const targetCycle = cycleTimeImprovement(b, init.target.metrics).value;
  const targetQuality = qualityImprovement(b, init.target.metrics).value;
  const planBenefit = leakage.ladder.BUSINESS_CASE;
  const agentTasks = sum(init.agents.map((a) => a.performance.tasksPerMonth));
  const autonomy = agentTasks ? sum(init.agents.map((a) => a.performance.autonomousCompletionRate * a.performance.tasksPerMonth)) / agentTasks : null;
  const autonomyPlan = agentTasks ? sum(init.agents.map((a) => a.automationPct * a.performance.tasksPerMonth)) / agentTasks : null;
  const scorecard = computeScorecard(
    {
      benefitActual: counted,
      benefitPlan: planBenefit,
      productivityActual: productivity.uplift.value,
      productivityPlan: targetUplift,
      cycleActual: productivity.cycleTime.value,
      cyclePlan: targetCycle,
      qualityActual: quality.errorReduction.value,
      qualityPlan: targetQuality,
      adoptionActual: post.adoptionRate,
      adoptionPlan: init.target.metrics.adoptionRate,
      agentAutonomyActual: autonomy,
      agentAutonomyPlan: autonomyPlan,
      riskLevel: init.riskLevel,
      dataConfidence: confidence,
      strategicAlignment: init.strategicAlignment,
      hasActuals: !!init.actual,
    },
    settings.scorecardWeights,
    settings.compositeScoreEnabled,
  );

  const monthly = computeMonthlyValue({
    series: init.series,
    baseline: b,
    calibrationFactor: capacity.calibrationFactor,
    productiveHours: init.productiveHoursPerFte,
    fteCost: post.fullyLoadedFteCost,
    costPerError: init.costPerError,
    disposition: init.disposition,
    derivedAttribution,
    oneTimeInvestment: tco.oneTime.value,
    goLiveMonth: init.goLiveDate ? init.goLiveDate.slice(0, 7) : null,
  });

  return {
    id: init.id,
    isForecast,
    scenarioNotes: applied.describe,
    baseline: b,
    post,
    capacity,
    splits,
    productivity,
    quality,
    cost: { perTxnBaseline: cptB, perTxnPost: cptP, reduction: costReduction(cptB.value, cptP.value) },
    benefits: valuations,
    totals: {
      counted,
      byClass,
      byCategory,
      measured,
      estimated,
      intangibleCount: valuations.filter((v) => v.effectiveNature === "INTANGIBLE").length,
      byStatusFloor,
      derivedAttribution,
    },
    tco,
    roi,
    roiByBasis: {
      cashableOnly: roiFor(["CASHABLE"]),
      cashableAndAvoidance: roiFor(["CASHABLE", "COST_AVOIDANCE"]),
      allFinancial: roiFor(["CASHABLE", "COST_AVOIDANCE", "REVENUE", "WORKING_CAPITAL", "RISK_AVOIDANCE"]),
    },
    leakage,
    adoption,
    agents,
    realizedModel,
    performanceVsTarget,
    confidence,
    benefitConfidence,
    scorecard,
    monthly,
    target: { uplift: targetUplift, cycle: targetCycle, quality: targetQuality },
  };
}
