import type { CapacityDisposition, ProcessMetrics } from "../domain/types";
import { fmt, metric, pct, type Metric } from "./metric";
import { safeDiv } from "./units";

export type LaborBasis = "ACTIVITY" | "FTE_CALIBRATED";

/** Effective effort minutes per transaction = touch time + expected rework effort. */
export function effortMinutesPerTransaction(m: ProcessMetrics): number {
  return m.avgHandlingMinutes + m.reworkRate * m.reworkMinutes;
}

/** Activity-based labour hours for a given volume. */
export function activityHours(m: ProcessMetrics, volume = m.transactionsPerYear): number {
  return (volume * effortMinutesPerTransaction(m)) / 60;
}

export interface ReconciliationCheck {
  activityImpliedFte: number;
  reportedFte: number;
  ratio: number;
  status: "OK" | "WARN" | "FAIL";
  message: string;
}

/**
 * Compares FTE implied by volume × effort with reported FTE. Large gaps usually mean the
 * handling time includes waiting, FTE excludes shared/outsourced staff, or volume is mis-scoped.
 */
export function reconcileBaseline(m: ProcessMetrics, productiveHours: number): ReconciliationCheck {
  const implied = safeDiv(activityHours(m), productiveHours);
  const ratio = safeDiv(implied, m.fte, 0);
  let status: ReconciliationCheck["status"] = "OK";
  if (m.fte <= 0) status = "WARN";
  else if (ratio > 1.5 || ratio < 0.5) status = "FAIL";
  else if (ratio > 1.2 || ratio < 0.8) status = "WARN";
  const message =
    status === "OK"
      ? `Volume × effort implies ${fmt(implied, 1)} FTE vs ${fmt(m.fte, 1)} reported — consistent within ±20%.`
      : `Volume × effort implies ${fmt(implied, 1)} FTE but ${fmt(m.fte, 1)} FTE are reported (${fmt(ratio, 2)}×). ` +
        `Validate whether handling time includes waiting time, whether FTE excludes shared-service or outsourced effort, ` +
        `and whether volume is scoped to this process. FTE-calibrated labour basis is recommended until reconciled.`;
  return { activityImpliedFte: implied, reportedFte: m.fte, ratio, status, message };
}

export interface CapacityInput {
  baseline: ProcessMetrics;
  post: ProcessMetrics;
  productiveHoursPerFte: number;
  basis: LaborBasis;
  /** Loaded annual cost per FTE used to value hours (defaults to post snapshot value). */
  fteCost?: number;
}

export interface CapacityResult {
  calibrationFactor: number;
  hourlyCost: number;
  baselineLaborHours: Metric; // at post-AI volume (like-for-like)
  postLaborHours: Metric;
  hoursReleased: Metric;
  fteCapacityReleased: Metric;
  baselineRequiredFte: Metric;
  postRequiredFte: Metric;
  capacityValue: Metric;
  reconciliation: ReconciliationCheck;
}

/**
 * Labour-hour model.
 *
 * Hours are compared at the SAME (post-AI) volume so that volume growth or decline is not
 * credited to — or blamed on — AI. With the FTE-calibrated basis, activity hours are scaled so
 * that baseline hours equal reported FTE × productive hours.
 */
export function computeCapacity(input: CapacityInput): CapacityResult {
  const { baseline, post, productiveHoursPerFte: ph, basis } = input;
  const volume = post.transactionsPerYear;
  const fteCost = input.fteCost ?? post.fullyLoadedFteCost;
  const hourlyCost = safeDiv(fteCost, ph);

  const baseActivityFullVolume = activityHours(baseline);
  const k = basis === "FTE_CALIBRATED" ? safeDiv(baseline.fte * ph, baseActivityFullVolume, 1) : 1;

  const effB = effortMinutesPerTransaction(baseline);
  const effP = effortMinutesPerTransaction(post);
  const baseHours = (volume * effB * k) / 60;
  const postHours = (volume * effP * k) / 60;
  const released = baseHours - postHours;

  const basisNote =
    basis === "FTE_CALIBRATED"
      ? `FTE-calibrated: activity hours scaled by k = (baseline FTE × productive hours) ÷ (baseline volume × effort) = ${fmt(k, 3)}.`
      : "Activity-based: hours = volume × effort minutes ÷ 60 (no calibration).";

  const common = [
    basisNote,
    "Compared at post-AI volume (like-for-like) so volume changes are not attributed to AI.",
    "Effort per transaction = average handling time + rework rate × rework minutes.",
  ];

  const baselineLaborHours = metric({
    key: "baselineLaborHours",
    label: "Baseline labour hours (at current volume)",
    value: baseHours,
    unit: "hours",
    definition: "Annual labour hours the process would need at today's volume without AI.",
    formula: "Volume × (AHT₀ + Rework rate₀ × Rework min) ÷ 60 × k",
    inputs: [
      { name: "Volume (post-AI, annual)", value: volume, unit: "count" },
      { name: "Baseline effort / txn", value: effB, unit: "minutes" },
      { name: "Calibration factor k", value: k, unit: "ratio" },
    ],
    assumptions: common,
    example: `${fmt(volume)} × ${fmt(effB)} ÷ 60 × ${fmt(k, 3)} = ${fmt(baseHours)} h`,
  });

  const postLaborHours = metric({
    key: "postLaborHours",
    label: "Post-AI labour hours",
    value: postHours,
    unit: "hours",
    definition: "Annual labour hours measured after AI at the same volume.",
    formula: "Volume × (AHT₁ + Rework rate₁ × Rework min) ÷ 60 × k",
    inputs: [
      { name: "Volume (post-AI, annual)", value: volume, unit: "count" },
      { name: "Post-AI effort / txn", value: effP, unit: "minutes" },
      { name: "Calibration factor k", value: k, unit: "ratio" },
    ],
    assumptions: common,
    example: `${fmt(volume)} × ${fmt(effP)} ÷ 60 × ${fmt(k, 3)} = ${fmt(postHours)} h`,
  });

  const hoursReleased = metric({
    key: "hoursReleased",
    label: "Hours released",
    value: released,
    unit: "hours",
    definition:
      "Labour hours no longer required for the same output. This is CAPACITY, not cash — see capacity disposition.",
    formula: "Baseline labour hours − Post-AI labour hours",
    inputs: [
      { name: "Baseline labour hours", value: baseHours, unit: "hours" },
      { name: "Post-AI labour hours", value: postHours, unit: "hours" },
    ],
    assumptions: common,
    example: `${fmt(baseHours)} − ${fmt(postHours)} = ${fmt(released)} h`,
  });

  const fteReleased = safeDiv(released, ph);
  const fteCapacityReleased = metric({
    key: "fteCapacityReleased",
    label: "FTE capacity released",
    value: fteReleased,
    unit: "fte",
    definition:
      "Hours released expressed as full-time-equivalents. Capacity released does NOT equal headcount or cost removed.",
    formula: "Annual hours released ÷ productive hours per FTE",
    inputs: [
      { name: "Hours released", value: released, unit: "hours" },
      { name: "Productive hours / FTE / year", value: ph, unit: "hours" },
    ],
    assumptions: [...common, `Productive hours per FTE = ${fmt(ph)} (net of leave, training, meetings).`],
    example: `${fmt(released)} ÷ ${fmt(ph)} = ${fmt(fteReleased, 1)} FTE`,
  });

  const baseFte = safeDiv(baseHours, ph);
  const postFte = safeDiv(postHours, ph);
  const baselineRequiredFte = metric({
    key: "baselineRequiredFte",
    label: "Baseline FTE requirement",
    value: baseFte,
    unit: "fte",
    definition: "FTE needed at current volume under the baseline way of working.",
    formula: "Baseline labour hours ÷ productive hours per FTE",
    inputs: [
      { name: "Baseline labour hours", value: baseHours, unit: "hours" },
      { name: "Productive hours / FTE", value: ph, unit: "hours" },
    ],
    assumptions: common,
    example: `${fmt(baseHours)} ÷ ${fmt(ph)} = ${fmt(baseFte, 1)} FTE`,
  });
  const postRequiredFte = metric({
    key: "postRequiredFte",
    label: "Post-AI FTE requirement",
    value: postFte,
    unit: "fte",
    definition: "FTE capacity required after AI at current volume (not necessarily current headcount).",
    formula: "Post-AI labour hours ÷ productive hours per FTE",
    inputs: [
      { name: "Post-AI labour hours", value: postHours, unit: "hours" },
      { name: "Productive hours / FTE", value: ph, unit: "hours" },
    ],
    assumptions: common,
    example: `${fmt(postHours)} ÷ ${fmt(ph)} = ${fmt(postFte, 1)} FTE`,
  });

  const value = released * hourlyCost;
  const capacityValue = metric({
    key: "capacityValue",
    label: "Economic value of capacity released",
    value,
    unit: "currency",
    definition:
      "Hours released valued at loaded labour cost. An economic measure of capacity — only the share the business actually converts (cashable / cost avoidance) is financial benefit.",
    formula: "Hours released × (Fully loaded FTE cost ÷ productive hours)",
    inputs: [
      { name: "Hours released", value: released, unit: "hours" },
      { name: "Fully loaded FTE cost", value: fteCost, unit: "currency" },
      { name: "Productive hours / FTE", value: ph, unit: "hours" },
    ],
    assumptions: [...common, "Loaded cost includes salary, benefits, facilities and overhead allocation."],
    example: `${fmt(released)} × ${fmt(hourlyCost)} = ${fmt(value)}`,
  });

  return {
    calibrationFactor: k,
    hourlyCost,
    baselineLaborHours,
    postLaborHours,
    hoursReleased,
    fteCapacityReleased,
    baselineRequiredFte,
    postRequiredFte,
    capacityValue,
    reconciliation: reconcileBaseline(baseline, ph),
  };
}

export type CapacityClass = keyof Omit<CapacityDisposition, "rationale">;

export const CAPACITY_CLASS_LABELS: Record<CapacityClass, string> = {
  cashable: "Cashable savings",
  costAvoidance: "Cost avoidance",
  redeployed: "Redeployed capacity",
  revenueProducing: "Revenue-producing capacity",
  unallocated: "Capacity released (unallocated)",
};

export interface CapacitySplitLine {
  cls: CapacityClass;
  label: string;
  share: number;
  hours: number;
  fte: number;
  value: number;
  isFinancial: boolean;
}

export function dispositionTotal(d: CapacityDisposition): number {
  return d.cashable + d.costAvoidance + d.redeployed + d.revenueProducing + d.unallocated;
}

export function validateDisposition(d: CapacityDisposition): string | null {
  const t = dispositionTotal(d);
  if (Math.abs(t - 1) > 0.001) return `Capacity disposition shares must sum to 100% (currently ${pct(t)}).`;
  for (const [k, v] of Object.entries(d)) {
    if (k !== "rationale" && typeof v === "number" && (v < 0 || v > 1)) return `${k} share must be between 0% and 100%.`;
  }
  return null;
}

/**
 * Split released capacity by what actually happened to it. Only cashable and cost-avoidance shares
 * are financial. Revenue-producing capacity has no value here — revenue must be evidenced as its own
 * declared benefit line to avoid double counting.
 */
export function splitCapacity(
  hoursReleased: number,
  productiveHours: number,
  hourlyCost: number,
  d: CapacityDisposition,
): CapacitySplitLine[] {
  const classes: CapacityClass[] = ["cashable", "costAvoidance", "redeployed", "revenueProducing", "unallocated"];
  return classes.map((cls) => {
    const hours = hoursReleased * d[cls];
    return {
      cls,
      label: CAPACITY_CLASS_LABELS[cls],
      share: d[cls],
      hours,
      fte: safeDiv(hours, productiveHours),
      value: hours * hourlyCost,
      isFinancial: cls === "cashable" || cls === "costAvoidance",
    };
  });
}
