import type { ProcessMetrics } from "../domain/types";
import { fmt, metric, pct, undefinedMetric, type Metric } from "./metric";
import { reductionPct, safeDiv } from "./units";

export function cycleTimeImprovement(b: ProcessMetrics, p: ProcessMetrics): Metric {
  const base = {
    key: "cycleTimeImprovement",
    label: "Cycle-time reduction",
    unit: "percent" as const,
    definition: "Reduction in end-to-end elapsed time from request to completion.",
    formula: "(Baseline cycle time − Current cycle time) ÷ Baseline cycle time × 100",
    inputs: [
      { name: "Baseline cycle time", value: b.cycleTimeHours, unit: "hours" as const },
      { name: "Current cycle time", value: p.cycleTimeHours, unit: "hours" as const },
    ],
    assumptions: ["Cycle time measured on the same process scope and start/end events before and after."],
  };
  if (b.cycleTimeHours <= 0) return undefinedMetric(base, "Baseline cycle time is zero.");
  const v = reductionPct(b.cycleTimeHours, p.cycleTimeHours);
  return metric({
    ...base,
    value: v,
    example: `(${fmt(b.cycleTimeHours)} − ${fmt(p.cycleTimeHours)}) ÷ ${fmt(b.cycleTimeHours)} = ${pct(v)}`,
  });
}

export function touchTimeReduction(b: ProcessMetrics, p: ProcessMetrics): Metric {
  const base = {
    key: "touchTimeReduction",
    label: "Touch-time reduction",
    unit: "percent" as const,
    definition: "Reduction in hands-on human handling time per transaction (blended across AI and non-AI volume).",
    formula: "(Baseline AHT − Post-AI AHT) ÷ Baseline AHT × 100",
    inputs: [
      { name: "Baseline AHT", value: b.avgHandlingMinutes, unit: "minutes" as const },
      { name: "Post-AI AHT", value: p.avgHandlingMinutes, unit: "minutes" as const },
    ],
    assumptions: ["Post-AI AHT is the blended average across all transactions at current adoption."],
  };
  if (b.avgHandlingMinutes <= 0) return undefinedMetric(base, "Baseline AHT is zero.");
  const v = reductionPct(b.avgHandlingMinutes, p.avgHandlingMinutes);
  return metric({
    ...base,
    value: v,
    example: `(${fmt(b.avgHandlingMinutes)} − ${fmt(p.avgHandlingMinutes)}) ÷ ${fmt(b.avgHandlingMinutes)} = ${pct(v)}`,
  });
}

/**
 * Productivity uplift = change in output per FTE. Uses REQUIRED FTE from the capacity model
 * (not headcount), so the metric reflects productivity rather than staffing decisions.
 */
export function productivityUplift(
  baselineVolume: number,
  baselineFte: number,
  postVolume: number,
  postRequiredFte: number,
): Metric {
  const outB = safeDiv(baselineVolume, baselineFte);
  const outP = safeDiv(postVolume, postRequiredFte);
  const base = {
    key: "productivityUplift",
    label: "Productivity uplift",
    unit: "percent" as const,
    definition: "Increase in transactions processed per FTE of required capacity.",
    formula: "(Post-AI output per FTE ÷ Baseline output per FTE − 1) × 100",
    inputs: [
      { name: "Baseline output / FTE", value: outB, unit: "count" as const },
      { name: "Post-AI output / FTE (required FTE)", value: outP, unit: "count" as const },
    ],
    assumptions: ["Post-AI FTE is the capacity requirement from the labour-hour model, not current headcount."],
  };
  if (outB <= 0) return undefinedMetric(base, "Baseline output per FTE is zero.");
  const v = outP / outB - 1;
  return metric({ ...base, value: v, example: `(${fmt(outP)} ÷ ${fmt(outB)} − 1) = ${pct(v)}` });
}

export function outputPerFte(volume: number, fte: number, label: string, key: string): Metric {
  const v = safeDiv(volume, fte);
  return metric({
    key,
    label,
    value: v,
    unit: "count",
    definition: "Annual transactions per FTE.",
    formula: "Annual transactions ÷ FTE",
    inputs: [
      { name: "Annual transactions", value: volume, unit: "count" },
      { name: "FTE", value: fte, unit: "fte" },
    ],
    assumptions: [],
    example: `${fmt(volume)} ÷ ${fmt(fte, 1)} = ${fmt(v)}`,
  });
}

export function automationRate(p: ProcessMetrics): Metric {
  return metric({
    key: "automationRate",
    label: "Automation rate",
    value: p.automationRate,
    unit: "percent",
    definition: "Share of transactions completed without human touch.",
    formula: "Touchless transactions ÷ Total transactions",
    inputs: [{ name: "Measured automation rate", value: p.automationRate, unit: "percent" }],
    assumptions: ["Taken from system telemetry of the post-AI snapshot."],
  });
}

/** Throughput change at constant capacity: how much more volume the baseline team could process. */
export function throughputCapacityIncrease(effBaseline: number, effPost: number): Metric {
  const base = {
    key: "throughputIncrease",
    label: "Throughput capacity increase",
    unit: "percent" as const,
    definition: "Additional volume the same capacity could process after AI.",
    formula: "Baseline effort per txn ÷ Post-AI effort per txn − 1",
    inputs: [
      { name: "Baseline effort / txn", value: effBaseline, unit: "minutes" as const },
      { name: "Post-AI effort / txn", value: effPost, unit: "minutes" as const },
    ],
    assumptions: ["Assumes demand exists and no other bottleneck constrains throughput."],
  };
  if (effPost <= 0) return undefinedMetric(base, "Post-AI effort is zero (fully touchless).");
  const v = effBaseline / effPost - 1;
  return metric({ ...base, value: v, example: `${fmt(effBaseline)} ÷ ${fmt(effPost)} − 1 = ${pct(v)}` });
}
