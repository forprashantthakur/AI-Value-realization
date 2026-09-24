import type { ProcessMetrics } from "../domain/types";
import { fmt, metric, pct, undefinedMetric, type Metric } from "./metric";
import { reductionPct } from "./units";

export function qualityImprovement(b: ProcessMetrics, p: ProcessMetrics): Metric {
  const base = {
    key: "qualityImprovement",
    label: "Error-rate reduction",
    unit: "percent" as const,
    definition: "Relative reduction in the share of transactions containing errors.",
    formula: "(Baseline error rate − Post-AI error rate) ÷ Baseline error rate × 100",
    inputs: [
      { name: "Baseline error rate", value: b.errorRate, unit: "percent" as const },
      { name: "Post-AI error rate", value: p.errorRate, unit: "percent" as const },
    ],
    assumptions: ["Error definition and sampling method unchanged between measurements."],
  };
  if (b.errorRate <= 0) return undefinedMetric(base, "Baseline error rate is zero.");
  const v = reductionPct(b.errorRate, p.errorRate);
  return metric({ ...base, value: v, example: `(${pct(b.errorRate)} − ${pct(p.errorRate)}) ÷ ${pct(b.errorRate)} = ${pct(v)}` });
}

export function reworkReduction(b: ProcessMetrics, p: ProcessMetrics): Metric {
  const base = {
    key: "reworkReduction",
    label: "Rework reduction",
    unit: "percent" as const,
    definition: "Relative reduction in the share of transactions that need rework.",
    formula: "(Baseline rework rate − Post-AI rework rate) ÷ Baseline rework rate × 100",
    inputs: [
      { name: "Baseline rework rate", value: b.reworkRate, unit: "percent" as const },
      { name: "Post-AI rework rate", value: p.reworkRate, unit: "percent" as const },
    ],
    assumptions: [],
  };
  if (b.reworkRate <= 0) return undefinedMetric(base, "Baseline rework rate is zero.");
  const v = reductionPct(b.reworkRate, p.reworkRate);
  return metric({ ...base, value: v, example: `(${pct(b.reworkRate)} − ${pct(p.reworkRate)}) ÷ ${pct(b.reworkRate)} = ${pct(v)}` });
}

export function ftrImprovement(b: ProcessMetrics, p: ProcessMetrics): Metric {
  const v = p.firstTimeRight - b.firstTimeRight;
  return metric({
    key: "ftrImprovement",
    label: "First-time-right improvement",
    value: v,
    unit: "percent",
    definition: "Change in percentage points of transactions right first time.",
    formula: "Post-AI FTR % − Baseline FTR %",
    inputs: [
      { name: "Baseline FTR", value: b.firstTimeRight, unit: "percent" },
      { name: "Post-AI FTR", value: p.firstTimeRight, unit: "percent" },
    ],
    assumptions: ["Reported as percentage-point change."],
    example: `${pct(p.firstTimeRight)} − ${pct(b.firstTimeRight)} = ${pct(v)} pts`,
  });
}

export function slaImprovement(b: ProcessMetrics, p: ProcessMetrics): Metric {
  const v = p.slaAchievement - b.slaAchievement;
  return metric({
    key: "slaImprovement",
    label: "SLA adherence improvement",
    value: v,
    unit: "percent",
    definition: "Change in percentage points of transactions meeting SLA.",
    formula: "Post-AI SLA % − Baseline SLA %",
    inputs: [
      { name: "Baseline SLA", value: b.slaAchievement, unit: "percent" },
      { name: "Post-AI SLA", value: p.slaAchievement, unit: "percent" },
    ],
    assumptions: ["Reported as percentage-point change."],
    example: `${pct(p.slaAchievement)} − ${pct(b.slaAchievement)} = ${pct(v)} pts`,
  });
}

/**
 * Cost of poor quality avoided: fewer errors × downstream cost per error. Rework LABOUR is already
 * inside the labour-hour model, so costPerError must exclude internal rework effort (no double count).
 */
export function qualityCostAvoided(b: ProcessMetrics, p: ProcessMetrics, costPerError: number): Metric {
  const volume = p.transactionsPerYear;
  const errorsAvoided = volume * (b.errorRate - p.errorRate);
  const v = errorsAvoided * costPerError;
  return metric({
    key: "qualityCostAvoided",
    label: "Cost of poor quality avoided",
    value: v,
    unit: "currency",
    definition: "Downstream cost of errors that no longer occur (write-offs, penalties, duplicate payments, customer remediation).",
    formula: "Post-AI volume × (Baseline error rate − Post-AI error rate) × Cost per error",
    inputs: [
      { name: "Post-AI volume", value: volume, unit: "count" },
      { name: "Baseline error rate", value: b.errorRate, unit: "percent" },
      { name: "Post-AI error rate", value: p.errorRate, unit: "percent" },
      { name: "Cost per error (downstream)", value: costPerError, unit: "currency" },
    ],
    assumptions: [
      "Cost per error excludes internal rework labour, which is already counted in hours released.",
      "Errors avoided are compared at current volume.",
    ],
    example: `${fmt(volume)} × (${pct(b.errorRate)} − ${pct(p.errorRate)}) × ${fmt(costPerError)} = ${fmt(v)}`,
  });
}
