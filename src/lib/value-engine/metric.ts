import type { Confidence } from "../domain/types";

export type MetricUnit =
  | "currency"
  | "percent" // stored as fraction 0..1
  | "hours"
  | "minutes"
  | "days"
  | "fte"
  | "count"
  | "months"
  | "ratio"
  | "years"
  | "tokens"
  | "score";

export interface MetricInput {
  name: string;
  value: number | string;
  unit?: MetricUnit;
  source?: string;
}

/**
 * Every value the engine produces is a Metric: the number plus everything needed to explain it.
 * The UI's "Explain this calculation" dialog renders a Metric directly.
 */
export interface Metric {
  key: string;
  label: string;
  value: number;
  unit: MetricUnit;
  definition: string;
  formula: string;
  inputs: MetricInput[];
  assumptions: string[];
  confidence?: Confidence;
  /** Worked example with the actual numbers substituted. */
  example?: string;
  /** True when the metric cannot be computed meaningfully (e.g. divide by zero). */
  undefinedReason?: string;
}

export function metric(m: Metric): Metric {
  return { ...m, value: Number.isFinite(m.value) ? m.value : 0 };
}

export function undefinedMetric(
  base: Omit<Metric, "value" | "undefinedReason">,
  reason: string,
): Metric {
  return { ...base, value: 0, undefinedReason: reason };
}

/** Compact number formatting for worked examples inside formulas. */
export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "n/a";
  const abs = Math.abs(n);
  const d = abs >= 1000 ? 0 : digits;
  return n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}
