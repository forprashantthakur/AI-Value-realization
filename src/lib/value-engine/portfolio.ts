import type { AppSettings, BenefitStatus, Confidence, FinancialClass, Initiative } from "../domain/types";
import { aggregateConfidence } from "./attribution";
import type { InitiativeValue } from "./initiative";
import { LADDER_LABEL, type LadderRung, type LeakageStep } from "./leakage";
import { fmt, metric, pct, type Metric } from "./metric";
import { computeRoi, type RoiResult } from "./roi";
import { safeDiv, sum } from "./units";

export interface EvaluatedInitiative {
  init: Initiative;
  value: InitiativeValue;
}

export interface MonthlyPortfolioPoint {
  month: string;
  financialBenefit: number;
  aiRunCost: number;
  netBenefit: number;
  cumulativeNet: number;
  adoption: number;
  hoursReleased: number;
  plannedBenefit: number;
  volume: number;
}

export interface PortfolioSummary {
  count: number;
  liveCount: number;
  oneTimeInvestment: Metric;
  recurringCost: Metric;
  totalInvestment: Metric;
  grossBenefit: Metric;
  forecastBenefit: number;
  financeValidated: Metric;
  netBenefit: Metric;
  roi: RoiResult;
  fteReleased: Metric;
  hoursReleased: number;
  productivityUplift: Metric;
  cycleTimeReduction: Metric;
  adoption: Metric;
  agentCount: number;
  processesTransformed: number;
  ladder: Record<LadderRung, number>;
  leakageByCause: Partial<Record<LeakageStep["cause"], number>>;
  byClass: Record<FinancialClass, number>;
  byStatusFloor: Record<BenefitStatus, number>;
  measured: number;
  estimated: number;
  confidence: Confidence;
  monthly: MonthlyPortfolioPoint[];
  capacityOnlyValue: number;
}

const live = (e: EvaluatedInitiative) => !e.value.isForecast || !!e.init.actual;

export function summarizePortfolio(
  items: EvaluatedInitiative[],
  settings: AppSettings,
  statusFloor: BenefitStatus = "PROPOSED",
): PortfolioSummary {
  const L = items.filter(live);
  const oneTime = sum(items.map((e) => e.value.tco.oneTime.value));
  const recurring = sum(items.map((e) => e.value.tco.recurring.value));
  const recurringLive = sum(L.map((e) => e.value.tco.recurring.value));
  const gross = sum(L.map((e) => e.value.totals.byStatusFloor[statusFloor]));
  const forecast = sum(items.filter((e) => !live(e)).map((e) => e.value.totals.counted));
  const finVal = sum(L.map((e) => e.value.totals.byStatusFloor.FINANCE_VALIDATED));
  const net = gross - recurringLive;

  const perInit = (fn: (e: EvaluatedInitiative) => number) => L.map((e) => ({ name: e.init.name, value: fn(e) }));

  const oneTimeM = metric({
    key: "portfolioOneTime",
    label: "One-time AI investment",
    value: oneTime,
    unit: "currency",
    definition: "Sum of one-time implementation costs across all initiatives in scope.",
    formula: "Σ initiative one-time investment",
    inputs: items.map((e) => ({ name: e.init.name, value: e.value.tco.oneTime.value, unit: "currency" as const })),
    assumptions: [],
  });
  const recurringM = metric({
    key: "portfolioRecurring",
    label: "Recurring AI cost (annual)",
    value: recurring,
    unit: "currency",
    definition: "Annual run cost (technology + operating + LLM consumption) of initiatives in scope.",
    formula: "Σ initiative recurring annual cost",
    inputs: items.map((e) => ({ name: e.init.name, value: e.value.tco.recurring.value, unit: "currency" as const })),
    assumptions: ["Includes derived LLM token cost where agent telemetry and model prices exist."],
  });
  const totalInv = metric({
    key: "portfolioInvestment",
    label: "Total AI investment",
    value: oneTime + recurring,
    unit: "currency",
    definition: "One-time investment plus one year of recurring AI cost for initiatives in scope.",
    formula: "Σ one-time investment + Σ annual recurring AI cost",
    inputs: [
      { name: "One-time investment", value: oneTime, unit: "currency" },
      { name: "Annual recurring cost", value: recurring, unit: "currency" },
    ],
    assumptions: ["A year-1 view. Multi-year TCO is shown in ROI schedules."],
    example: `${fmt(oneTime)} + ${fmt(recurring)} = ${fmt(oneTime + recurring)}`,
  });
  const grossM = metric({
    key: "portfolioGross",
    label: "Gross annual benefit",
    value: gross,
    unit: "currency",
    definition:
      "Annual run-rate of AI-attributed financial benefit on initiatives with post-AI measurements (all governance statuses). Forecast-only initiatives are excluded.",
    formula: "Σ live initiatives (benefit line gross × attribution %), counted financial classes only",
    inputs: perInit((e) => e.value.totals.byStatusFloor[statusFloor]).map((x) => ({ name: x.name, value: x.value, unit: "currency" as const })),
    assumptions: [
      ...(statusFloor !== "PROPOSED" ? [`Only benefit lines with governance status ≥ ${statusFloor.replaceAll("_", " ").toLowerCase()} are included.`] : []),
      `ROI basis: ${settings.roiBasis.replaceAll("_", " ").toLowerCase()}.`,
      "Redeployed capacity excluded (non-cash).",
      `Forecast-only initiatives (${fmt(forecast)}) excluded.`,
    ],
  });
  const finM = metric({
    key: "portfolioFinanceValidated",
    label: "Finance-validated benefit",
    value: finVal,
    unit: "currency",
    definition: "Annual attributed benefit on lines that Finance has validated (status Finance Validated, Realized or Sustained).",
    formula: "Σ attributed value where status ≥ FINANCE_VALIDATED",
    inputs: perInit((e) => e.value.totals.byStatusFloor.FINANCE_VALIDATED).map((x) => ({ name: x.name, value: x.value, unit: "currency" as const })),
    assumptions: ["Only finance-validated value should be quoted as P&L impact."],
  });
  const netM = metric({
    key: "portfolioNet",
    label: "Net annual benefit",
    value: net,
    unit: "currency",
    definition: "Gross annual benefit of live initiatives minus their recurring AI cost.",
    formula: "Gross annual benefit − Recurring AI cost (live initiatives)",
    inputs: [
      { name: "Gross annual benefit", value: gross, unit: "currency" },
      { name: "Recurring AI cost (live)", value: recurringLive, unit: "currency" },
    ],
    assumptions: ["One-time investment is reflected in ROI and payback, not in net annual benefit."],
    example: `${fmt(gross)} − ${fmt(recurringLive)} = ${fmt(net)}`,
  });

  const oneTimeLive = sum(L.map((e) => e.value.tco.oneTime.value));
  const roi = computeRoi({
    annualBenefit: gross,
    oneTimeInvestment: oneTimeLive,
    recurringAnnualCost: recurringLive,
    discountRate: settings.discountRate,
    horizonYears: settings.horizonYears,
    rampUp: settings.rampUp,
  });

  const hours = sum(L.map((e) => e.value.capacity.hoursReleased.value));
  const fte = sum(L.map((e) => e.value.capacity.fteCapacityReleased.value));
  const fteM = metric({
    key: "portfolioFte",
    label: "FTE capacity released",
    value: fte,
    unit: "fte",
    definition: "Capacity released across live initiatives, in FTE. Capacity is not cash — see disposition split.",
    formula: "Σ (hours released ÷ productive hours per FTE)",
    inputs: perInit((e) => e.value.capacity.fteCapacityReleased.value).map((x) => ({ name: x.name, value: x.value, unit: "fte" as const })),
    assumptions: ["Each initiative uses its own productive-hours assumption."],
  });

  const baseH = sum(L.map((e) => e.value.capacity.baselineLaborHours.value));
  const postH = sum(L.map((e) => e.value.capacity.postLaborHours.value));
  const upl = safeDiv(baseH, postH, 1) - 1;
  const uplM = metric({
    key: "portfolioProductivity",
    label: "Productivity uplift",
    value: upl,
    unit: "percent",
    definition: "Portfolio output per labour hour vs baseline, computed from hours so different transaction units can be combined.",
    formula: "Σ baseline labour hours (at current volume) ÷ Σ post-AI labour hours − 1",
    inputs: [
      { name: "Σ baseline hours", value: baseH, unit: "hours" },
      { name: "Σ post-AI hours", value: postH, unit: "hours" },
    ],
    assumptions: ["Equivalent to a labour-hour-weighted average of initiative productivity uplift."],
    example: `${fmt(baseH)} ÷ ${fmt(postH)} − 1 = ${pct(upl)}`,
  });

  const vol = sum(L.map((e) => e.value.post.transactionsPerYear));
  const cyc = safeDiv(sum(L.map((e) => e.value.productivity.cycleTime.value * e.value.post.transactionsPerYear)), vol);
  const cycM = metric({
    key: "portfolioCycle",
    label: "Cycle-time reduction",
    value: cyc,
    unit: "percent",
    definition: "Volume-weighted average cycle-time reduction across live initiatives.",
    formula: "Σ (cycle-time reduction × annual volume) ÷ Σ annual volume",
    inputs: perInit((e) => e.value.productivity.cycleTime.value).map((x) => ({ name: x.name, value: x.value, unit: "percent" as const })),
    assumptions: ["Volume weighting: high-volume processes influence the average more."],
  });
  const adopt = safeDiv(sum(L.map((e) => e.value.post.adoptionRate * e.value.post.transactionsPerYear)), vol);
  const adoptM = metric({
    key: "portfolioAdoption",
    label: "AI adoption",
    value: adopt,
    unit: "percent",
    definition: "Volume-weighted share of eligible transactions flowing through the AI path.",
    formula: "Σ (adoption × annual volume) ÷ Σ annual volume",
    inputs: perInit((e) => e.value.post.adoptionRate).map((x) => ({ name: x.name, value: x.value, unit: "percent" as const })),
    assumptions: [],
  });

  const ladder = {} as Record<LadderRung, number>;
  for (const k of Object.keys(LADDER_LABEL) as LadderRung[]) ladder[k] = sum(items.map((e) => e.value.leakage.ladder[k]));
  const leakageByCause: PortfolioSummary["leakageByCause"] = {};
  for (const e of items)
    for (const [k, v] of Object.entries(e.value.leakage.byCause))
      leakageByCause[k as LeakageStep["cause"]] = (leakageByCause[k as LeakageStep["cause"]] ?? 0) + (v ?? 0);

  const byClass = {} as Record<FinancialClass, number>;
  for (const e of L) for (const [k, v] of Object.entries(e.value.totals.byClass)) byClass[k as FinancialClass] = (byClass[k as FinancialClass] ?? 0) + v;
  const byStatusFloor = {} as Record<BenefitStatus, number>;
  for (const e of L)
    for (const [k, v] of Object.entries(e.value.totals.byStatusFloor)) byStatusFloor[k as BenefitStatus] = (byStatusFloor[k as BenefitStatus] ?? 0) + v;

  // Monthly roll-up
  const months = new Map<string, MonthlyPortfolioPoint>();
  const adoptW = new Map<string, number>();
  for (const e of items) {
    const planMonthly = e.value.leakage.ladder.BUSINESS_CASE / 12;
    const goLive = e.init.goLiveDate?.slice(0, 7) ?? null;
    for (const m of e.value.monthly) {
      const p = months.get(m.month) ?? {
        month: m.month,
        financialBenefit: 0,
        aiRunCost: 0,
        netBenefit: 0,
        cumulativeNet: 0,
        adoption: 0,
        hoursReleased: 0,
        plannedBenefit: 0,
        volume: 0,
      };
      p.financialBenefit += m.financialBenefit;
      p.aiRunCost += m.aiRunCost;
      p.netBenefit += m.netBenefit;
      p.hoursReleased += m.hoursReleased;
      p.volume += m.volume;
      if (goLive && m.month >= goLive) p.plannedBenefit += planMonthly;
      adoptW.set(m.month, (adoptW.get(m.month) ?? 0) + m.adoption * m.volume);
      months.set(m.month, p);
    }
  }
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  let cum = 0;
  for (const p of monthly) {
    cum += p.netBenefit;
    p.cumulativeNet = cum;
    p.adoption = safeDiv(adoptW.get(p.month) ?? 0, p.volume);
  }

  return {
    count: items.length,
    liveCount: L.length,
    oneTimeInvestment: oneTimeM,
    recurringCost: recurringM,
    totalInvestment: totalInv,
    grossBenefit: grossM,
    forecastBenefit: forecast,
    financeValidated: finM,
    netBenefit: netM,
    roi,
    fteReleased: fteM,
    hoursReleased: hours,
    productivityUplift: uplM,
    cycleTimeReduction: cycM,
    adoption: adoptM,
    agentCount: sum(items.map((e) => e.init.agents.length)),
    processesTransformed: new Set(L.map((e) => e.init.processId)).size,
    ladder,
    leakageByCause,
    byClass,
    byStatusFloor,
    measured: sum(L.map((e) => e.value.totals.measured)),
    estimated: sum(L.map((e) => e.value.totals.estimated)),
    confidence: aggregateConfidence(L.map((e) => ({ confidence: e.value.confidence, weight: e.value.totals.counted }))),
    monthly,
    capacityOnlyValue: (byClass.CAPACITY ?? 0),
  };
}

export function groupBenefits<K extends string>(items: EvaluatedInitiative[], keyFn: (e: EvaluatedInitiative) => K) {
  const map = new Map<K, { key: K; benefit: number; investment: number; recurring: number; count: number; financeValidated: number }>();
  for (const e of items) {
    const k = keyFn(e);
    const r = map.get(k) ?? { key: k, benefit: 0, investment: 0, recurring: 0, count: 0, financeValidated: 0 };
    if (live(e)) {
      r.benefit += e.value.totals.counted;
      r.financeValidated += e.value.totals.byStatusFloor.FINANCE_VALIDATED;
    }
    r.investment += e.value.tco.oneTime.value;
    r.recurring += e.value.tco.recurring.value;
    r.count += 1;
    map.set(k, r);
  }
  return [...map.values()].sort((a, b) => b.benefit - a.benefit);
}

export { live as isLive };
